import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateQuotationInput,
  QuotationFilterInput,
  UpdateQuotationInput,
} from './dto/quotation.input';
import { QuotationStatus, Role } from '@prisma/client';
import { AppLogger } from '../../common/logger/logger.service';
import { PublicQuotationType, QuotationType } from './quotation.entity';
import { StatusHistoryType } from './status-history.entity';
import { UserType } from '../users/user.entity';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { MailService } from '../../common/mail/mail.service';
import { quoteSubmittedTemplate } from '../../common/mail/templates/quote-submitted';
import { quoteApprovedTemplate } from '../../common/mail/templates/quote-approved';
import { quoteRejectedTemplate } from '../../common/mail/templates/quote-rejected';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, ROUTING_KEY } from '../events/events.module';
import { AIService } from '../ai/ai.service';
import { getCorrelationId } from '../../common/correlation/correlation.store';
import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { tracer } from '../../common/tracing/tracer';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const allowed: Record<QuotationStatus, QuotationStatus[]> = {
  [QuotationStatus.DRAFT]: [QuotationStatus.SENT],
  [QuotationStatus.SENT]: [QuotationStatus.APPROVED, QuotationStatus.REJECTED],
  [QuotationStatus.APPROVED]: [],
  [QuotationStatus.REJECTED]: [],
};

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly mailService: MailService,
    private readonly amqp: AmqpConnection,
    private readonly aiService: AIService,
  ) {}

  // Calculate totals — stored at write time for consistency
  private calculateTotals(
    items: { description: string; quantity: number; unitPrice: number }[],
    taxRate: number,
  ) {
    this.logger.info(`Calculating totals`, QuotationsService.name);
    const itemsWithTotal = items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
    }));
    const subtotal =
      Math.round(
        itemsWithTotal.reduce((sum, i) => sum + i.lineTotal, 0) * 100,
      ) / 100;
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    this.logger.info(
      `Totals calculation is successful`,
      QuotationsService.name,
    );
    return { itemsWithTotal, subtotal, taxAmount, total };
  }

  async findAll(
    user: UserType,
    take = 20,
    skip = 0,
    filter?: QuotationFilterInput,
  ): Promise<QuotationType[]> {
    try {
      QuotationFilterInput.validateRepId(filter?.repId);
      const userId = user.id;
      const role = user.role;
      this.logger.info(
        `Fetching quotations — userId: ${userId} role: ${role}`,
        QuotationsService.name,
      );
      const isManager = role === Role.SALES_MANAGER;
      let ownerWhere: Record<string, string> = {};
      if (!isManager) ownerWhere = { createdById: userId };
      else if (filter?.repId) ownerWhere = { createdById: filter.repId };
      const statusWhere = filter?.status ? { status: filter.status } : {};
      const rawSearch = filter?.search?.trim().slice(0, 100) ?? '';
      const searchWhere = rawSearch
        ? {
            OR: [
              {
                title: {
                  contains: rawSearch,
                  mode: 'insensitive' as const,
                },
              },
              {
                quotationNumber: {
                  contains: rawSearch,
                  mode: 'insensitive' as const,
                },
              },
              {
                client: {
                  name: {
                    contains: rawSearch,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {};
      // createdBy is always eager-loaded because every list row shows the rep's
      // name. A DataLoader would eliminate the per-row join at the cost of
      // added complexity; acceptable trade-off for this portfolio scope.
      return await this.prisma.quotation.findMany({
        where: { ...ownerWhere, ...statusWhere, ...searchWhere },
        include: { items: true, createdBy: true, client: true },
        take: Math.min(take, 100),
        skip,
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed while retrieving all quotations for:${user.id}`,
        error instanceof Error ? error.stack : String(error),
        QuotationsService.name,
      );
      throw error;
    }
  }

  async findOwner(id: string): Promise<{ createdById: string } | null> {
    this.logger.info(
      `Fetching owner for quotation id:${id}`,
      QuotationsService.name,
    );
    try {
      return await this.prisma.quotation.findFirst({
        where: { id },
        select: { createdById: true },
      });
    } catch (error) {
      this.logger.error(
        `Failed to fetch owner for quotation id:${id}`,
        error instanceof Error ? error.stack : String(error),
        QuotationsService.name,
      );
      throw error;
    }
  }

  async findOne(id: string): Promise<QuotationType | null> {
    this.logger.info(`Finding quotation with id:${id}`, QuotationsService.name);
    try {
      return await this.prisma.quotation.findFirst({
        where: { id },
        include: { items: true, createdBy: true, client: true },
      });
    } catch (error) {
      this.logger.error(
        `Failed to retrieve quotation with id:${id}`,
        error instanceof Error ? error.stack : String(error),
        QuotationsService.name,
      );
      throw error;
    }
  }

  async findByToken(token: string): Promise<PublicQuotationType | null> {
    this.logger.info(
      `Finding quotation with token:${token}`,
      QuotationsService.name,
    );
    try {
      const raw = await this.prisma.quotation.findFirst({
        where: { publicToken: token },
        select: {
          quotationNumber: true,
          title: true,
          status: true,
          notes: true,
          taxRate: true,
          subtotal: true,
          taxAmount: true,
          total: true,
          client: { select: { name: true } },
          createdBy: { select: { name: true } },
          items: {
            select: {
              quotationId: true,
              id: true,
              description: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
              sortOrder: true,
            },
          },
        },
      });
      if (!raw) return null;
      return { ...raw, clientName: raw.client.name, repName: raw.createdBy?.name ?? '' };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve quotation with token:${token}`,
        error instanceof Error ? error.stack : String(error),
        QuotationsService.name,
      );
      throw error;
    }
  }

  private static stripTags(v: string): string {
    // [^>]* is a negated class with no backtracking ambiguity; callers enforce length limits before this runs.
    return v.replace(/<[^>]*>/g, '').trim(); // NOSONAR
  }

  async create(
    input: CreateQuotationInput,
    user: UserType,
  ): Promise<QuotationType> {
    const title = QuotationsService.stripTags(input.title);
    if (!title || title.length > 100) {
      throw new BadRequestException(
        'title must be between 1 and 100 characters',
      );
    }

    const clientId = input.clientId;
    if (!clientId || !UUID_RE.test(clientId)) {
      throw new BadRequestException('clientId must be a valid UUID');
    }

    const notes =
      input.notes == null
        ? undefined
        : QuotationsService.stripTags(input.notes).slice(0, 500) || undefined;

    const taxRate = input.taxRate ?? 0;
    if (taxRate < 0 || taxRate > 100) {
      throw new BadRequestException('taxRate must be between 0 and 100');
    }

    const sanitizedItems = input.items.map((item) => {
      const description = QuotationsService.stripTags(item.description);
      if (!description || description.length > 200) {
        throw new BadRequestException(
          'Each item description must be between 1 and 200 characters',
        );
      }
      if (item.quantity <= 0) {
        throw new BadRequestException('Item quantity must be greater than 0');
      }
      if (item.unitPrice <= 0) {
        throw new BadRequestException('Item unit price must be greater than 0');
      }
      return { ...item, description };
    });

    this.logger.info(
      `Creating quotation — title: "${title}" clientId: "${clientId}" userId: ${user.id}`,
      QuotationsService.name,
    );
    try {
      const { itemsWithTotal, subtotal, taxAmount, total } =
        this.calculateTotals(sanitizedItems, taxRate);

      const seqResult = await this.prisma.$queryRaw<
        [{ nextval: bigint }]
      >`SELECT nextval('quote_number_seq')`;
      const seq = Number(seqResult[0].nextval);
      const quoteNumber = `QT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

      const quotation = await this.prisma.quotation.create({
        data: {
          quotationNumber: quoteNumber,
          title,
          clientId,
          notes,
          taxRate,
          subtotal,
          taxAmount,
          total,
          createdById: user.id,
          items: {
            create: itemsWithTotal.map((item, i) => ({
              ...item,
              sortOrder: i,
            })),
          },
          statusHistory: {
            create: {
              fromStatus: QuotationStatus.DRAFT,
              toStatus: QuotationStatus.DRAFT,
              changedById: user.id,
            },
          },
        },
        include: { items: true, createdBy: true, client: true },
      });

      const correlationId = getCorrelationId();
      const publishStart = Date.now();
      const span = tracer.startSpan('amqp.publish quote.created');
      const carrier: Record<string, string> = {};
      const spanContext = context.with(trace.setSpan(context.active(), span), () => context.active());
      propagation.inject(spanContext, carrier);
      void this.amqp
        .publish(
          EXCHANGE,
          ROUTING_KEY,
          { quotationId: quotation.id, createdById: user.id },
          {
            headers: {
              'x-correlation-id': correlationId ?? '',
              ...carrier,
              'x-published-at': publishStart,
            },
          },
        )
        .then(() => {
          span.setStatus({ code: SpanStatusCode.OK });
          this.logger.info(
            `Published quote.created — quotationId:${quotation.id} publishMs:${Date.now() - publishStart}`,
            QuotationsService.name,
          );
        })
        .catch((err: unknown) => {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
          this.logger.error(
            `Failed to publish quote.created for quotationId:${quotation.id}`,
            err instanceof Error ? err.stack : String(err),
            QuotationsService.name,
          );
        })
        .finally(() => span.end());

      return quotation;
    } catch (error) {
      this.logger.error(
        `Failed to create quotation — title: "${title}" clientId: "${clientId}" userId: ${user.id}`,
        error instanceof Error ? error.stack : String(error),
        QuotationsService.name,
      );
      throw error;
    }
  }

  async updateStatus(
    id: string,
    status: QuotationStatus,
    note: string | undefined,
    userId: string,
    userRole: Role,
  ): Promise<QuotationType> {
    this.logger.info(
      `Status update — quotationId: ${id} newStatus: ${status} userId: ${userId}`,
      QuotationsService.name,
    );

    try {
      // $transaction not supported by Neon HTTP driver — sequential calls used.
      // Guards (state machine + role check) run before any write so a failed
      // validation never leaves partial state.
      const current = await this.prisma.quotation.findFirst({ where: { id } });
      if (!current) {
        this.logger.warn(
          `Status update failed — quotation not found: ${id}`,
          QuotationsService.name,
        );
        throw new NotFoundException(`Quotation ${id} not found`);
      }
      if (!allowed[current.status].includes(status)) {
        throw new BadRequestException(
          `cannot transition from ${current.status} to ${status}`,
        );
      }
      const managerOnlyTargets: QuotationStatus[] = [
        QuotationStatus.APPROVED,
        QuotationStatus.REJECTED,
      ];
      if (managerOnlyTargets.includes(status) && userRole === Role.SALES_REP) {
        throw new ForbiddenException(
          'Only managers can approve or reject quotations',
        );
      }
      this.logger.info(
        `Status transition — ${current.status} -> ${status} on quotation: ${id}`,
        QuotationsService.name,
      );
      await this.prisma.statusHistory.create({
        data: {
          quotationId: id,
          fromStatus: current.status,
          toStatus: status,
          note,
          changedById: userId,
        },
      });
      const quotation = await this.prisma.quotation.update({
        where: { id },
        data: { status },
        include: { items: true, createdBy: true, client: true },
      });

      // Mail sends run after the DB write succeeds. Kept outside the catch so
      // a user.findMany failure never produces an error response after the
      // status transition is already committed.
      void this.sendStatusEmail(quotation, status, note);
      await this.prisma.aIInsight.deleteMany({ where: { quotationId: id } });

      // Regenerate embedding — outcome field in corpus text has changed
      void this.aiService.generateQuotationEmbedding(id).catch((err: unknown) =>
        this.logger.error(
          `Failed to regenerate embedding on status change for quotationId:${id}`,
          err instanceof Error ? err.stack : String(err),
          QuotationsService.name,
        ),
      );

      return quotation;
    } catch (error) {
      if (!(error instanceof HttpException)) {
        this.logger.error(
          `Unexpected error while updating the quotation: "${id}"`,
          error instanceof Error ? error.stack : String(error),
          QuotationsService.name,
        );
      }
      throw error;
    }
  }

  private async sendStatusEmail(
    quotation: Awaited<ReturnType<typeof this.prisma.quotation.update>> & {
      createdBy: { name: string; email: string } | null;
    },
    status: QuotationStatus,
    note: string | undefined,
  ): Promise<void> {
    if (!quotation.createdBy) {
      this.logger.warn(
        `Cannot send status email — createdBy missing on quotation ${quotation.id}`,
        QuotationsService.name,
      );
      return;
    }
    if (status === QuotationStatus.SENT) {
      const managers = await this.prisma.user.findMany({
        where: { role: Role.SALES_MANAGER },
        select: { email: true },
      });
      managers.forEach(({ email }) => {
        this.mailService.sendMail(
          email,
          `[QuoteIQ] Quotation ${quotation.quotationNumber} awaiting approval`,
          quoteSubmittedTemplate(
            quotation.quotationNumber,
            quotation.createdBy!.name,
            (quotation as unknown as { client?: { name: string } }).client?.name ?? '',
          ),
        );
      });
    } else if (status === QuotationStatus.APPROVED) {
      this.mailService.sendMail(
        quotation.createdBy.email,
        `[QuoteIQ] Quotation ${quotation.quotationNumber} approved`,
        quoteApprovedTemplate(
          quotation.quotationNumber,
          (quotation as unknown as { client?: { name: string } }).client?.name ?? '',
        ),
      );
    } else if (status === QuotationStatus.REJECTED) {
      this.mailService.sendMail(
        quotation.createdBy.email,
        `[QuoteIQ] Quotation ${quotation.quotationNumber} rejected`,
        quoteRejectedTemplate(
          quotation.quotationNumber,
          (quotation as unknown as { client?: { name: string } }).client?.name ?? '',
          note,
        ),
      );
    }
  }

  async delete(id: string, userId: string): Promise<boolean> {
    this.logger.info(`Deleting quotation: ${id}`, QuotationsService.name);
    try {
      const quotation = await this.prisma.quotation.findFirst({
        where: { id },
        select: { status: true, createdById: true },
      });
      if (!quotation) throw new NotFoundException(`Quotation ${id} not found`);
      if (quotation.status !== QuotationStatus.DRAFT)
        throw new BadRequestException('Only DRAFT quotations can be deleted');
      if (quotation.createdById !== userId)
        throw new ForbiddenException('You can only delete your own quotations');
      await this.prisma.quotation.delete({ where: { id } });
      return true;
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Quotation ${id} not found`);
      }
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Unexpected error while deleting the quotation: "${id}"`,
        error instanceof Error ? error.stack : String(error),
        QuotationsService.name,
      );
      throw error;
    }
  }

  private async validateUpdatePermissions(id: string, userId: string) {
    const existing = await this.prisma.quotation.findFirst({
      where: { id },
      select: { status: true, createdById: true },
    });
    if (!existing) throw new NotFoundException(`Quotation ${id} not found`);
    if (existing.status !== QuotationStatus.DRAFT)
      throw new BadRequestException('Only DRAFT quotations can be edited');
    if (existing.createdById !== userId)
      throw new ForbiddenException('You can only edit your own quotations');
  }

  private validateTitle(title: string | undefined): string | undefined {
    if (title !== undefined && (title.length === 0 || title.length > 100))
      throw new BadRequestException(
        'title must be between 1 and 100 characters',
      );
    return title;
  }

  private validateClientId(
    clientId: string | undefined,
  ): string | undefined {
    if (clientId !== undefined && !UUID_RE.test(clientId))
      throw new BadRequestException('clientId must be a valid UUID');
    return clientId;
  }

  private validateTaxRate(taxRate: number | undefined): number | undefined {
    if (taxRate !== undefined && (taxRate < 0 || taxRate > 100))
      throw new BadRequestException('taxRate must be between 0 and 100');
    return taxRate;
  }

  private normalizeTitle(input: string | null | undefined): string | undefined {
    return input != null
      ? this.validateTitle(QuotationsService.stripTags(input))
      : undefined;
  }

  private normalizeClientId(input: string | null | undefined): string | undefined {
    return input != null ? this.validateClientId(input) : undefined;
  }

  private normalizeNotes(
    input: string | null | undefined,
  ): string | null | undefined {
    if (input == null) return undefined;
    const rawNotes = QuotationsService.stripTags(input).slice(0, 500);
    return rawNotes.length > 0 ? rawNotes : null;
  }

  private async prepareTotalsData(
    input: UpdateQuotationInput,
    taxRate: number | undefined,
    id: string,
  ) {
    let totalsData:
      | ReturnType<QuotationsService['calculateTotals']>
      | undefined;
    let sanitizedItems:
      | { description: string; quantity: number; unitPrice: number }[]
      | undefined;

    if (input.items) {
      sanitizedItems = input.items.map((item) => this.sanitizeItem(item));
      const effectiveTaxRate =
        taxRate ??
        (await this.prisma.quotation.findFirst({
          where: { id },
          select: { taxRate: true },
        }))!.taxRate;
      totalsData = this.calculateTotals(sanitizedItems, effectiveTaxRate);
    } else if (taxRate !== undefined) {
      const existingItems = await this.prisma.quotationItem.findMany({
        where: { quotationId: id },
      });
      totalsData = this.calculateTotals(existingItems, taxRate);
    }

    return { totalsData, sanitizedItems };
  }

  private buildUpdateData(
    title: string | undefined,
    clientId: string | undefined,
    notes: string | null | undefined,
    taxRate: number | undefined,
    totalsData: ReturnType<QuotationsService['calculateTotals']> | undefined,
    sanitizedItems:
      | { description: string; quantity: number; unitPrice: number }[]
      | undefined,
  ): Parameters<typeof this.prisma.quotation.update>[0]['data'] {
    return {
      ...(title !== undefined ? { title } : {}),
      ...(clientId !== undefined ? { client: { connect: { id: clientId } } } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(taxRate !== undefined ? { taxRate } : {}),
      ...(totalsData
        ? {
            subtotal: totalsData.subtotal,
            taxAmount: totalsData.taxAmount,
            total: totalsData.total,
          }
        : {}),
      ...(sanitizedItems
        ? {
            items: {
              deleteMany: {},
              create: totalsData!.itemsWithTotal.map((item, i) => ({
                ...item,
                sortOrder: i,
              })),
            },
          }
        : {}),
    };
  }

  private getChangedFields(
    title: string | undefined,
    clientId: string | undefined,
    notes: string | null | undefined,
    taxRate: number | undefined,
    sanitizedItems:
      | { description: string; quantity: number; unitPrice: number }[]
      | undefined,
  ): string[] {
    const changed: string[] = [];
    if (title !== undefined) changed.push('title');
    if (clientId !== undefined) changed.push('client');
    if (notes !== undefined) changed.push('notes');
    if (taxRate !== undefined) changed.push('tax rate');
    if (sanitizedItems !== undefined) changed.push('line items');
    return changed;
  }

  async update(
    id: string,
    input: UpdateQuotationInput,
    userId: string,
  ): Promise<QuotationType> {
    this.logger.info(
      `Updating quotation: ${id} userId: ${userId}`,
      QuotationsService.name,
    );

    await this.validateUpdatePermissions(id, userId);

    const title = this.normalizeTitle(input.title);
    const clientId = this.normalizeClientId(input.clientId);
    const notes = this.normalizeNotes(input.notes);
    const taxRate = this.validateTaxRate(input.taxRate);

    const { totalsData, sanitizedItems } = await this.prepareTotalsData(
      input,
      taxRate,
      id,
    );

    const data = this.buildUpdateData(
      title,
      clientId,
      notes,
      taxRate,
      totalsData,
      sanitizedItems,
    );
    const currentVersion = await this.prisma.quotation.findFirst({
      where: { id },
      select: { version: true, title: true, clientId: true, notes: true, taxRate: true },
    });
    if (currentVersion?.version !== input.version) {
      throw new ConflictException(
        'Version mismatch. The quotation has been modified by someone else — please refresh and try again.',
      );
    }

    // Snapshot current state before overwriting (Neon HTTP driver has no $transaction support)
    const currentItems = await this.prisma.quotationItem.findMany({
      where: { quotationId: id },
      select: { description: true, quantity: true, unitPrice: true, lineTotal: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.prisma as any).quotationSnapshot.create({
      data: {
        quotationId: id,
        content: {
          version: currentVersion!.version,
          title: currentVersion!.title,
          clientId: currentVersion!.clientId,
          notes: currentVersion!.notes ?? null,
          taxRate: currentVersion!.taxRate,
          items: currentItems,
        },
      },
    });

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: {
        ...data,
        version: { increment: 1 },
      },
      include: { items: true, createdBy: true, client: true },
    });

    if (!updated) {
      throw new NotFoundException(`Quotation ${id} not found`);
    }

    await this.prisma.aIInsight.deleteMany({
      where: { quotationId: id },
    });

    const changed = this.getChangedFields(
      title,
      clientId,
      notes,
      taxRate,
      sanitizedItems,
    );
    await this.prisma.statusHistory.create({
      data: {
        quotationId: id,
        fromStatus: QuotationStatus.DRAFT,
        toStatus: QuotationStatus.DRAFT,
        note: `Edited: ${changed.join(', ')}`,
        changedById: userId,
      },
    });

    return updated;
  }

  async findSnapshots(
    quotationId: string,
    userId: string,
    role: Role,
  ): Promise<{ id: string; quotationId: string; content: string; createdAt: string }[]> {
    this.logger.info(
      `Fetching snapshots for quotation: ${quotationId}`,
      QuotationsService.name,
    );
    const isManager = role === Role.SALES_MANAGER;
    if (!isManager) {
      const owner = await this.prisma.quotation.findFirst({
        where: { id: quotationId },
        select: { createdById: true },
      });
      if (!owner) throw new NotFoundException(`Quotation ${quotationId} not found`);
      if (owner.createdById !== userId) throw new ForbiddenException();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await (this.prisma as any).quotationSnapshot.findMany({
      where: { quotationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      quotationId: r.quotationId,
      content: JSON.stringify(r.content),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async findStatusHistory(
    quotationId: string,
    userId: string,
    role: Role,
  ): Promise<StatusHistoryType[]> {
    this.logger.info(
      `Fetching status history for quotation: ${quotationId}`,
      QuotationsService.name,
    );
    const isManager = role === Role.SALES_MANAGER;
    if (!isManager) {
      const owner = await this.prisma.quotation.findFirst({
        where: { id: quotationId },
        select: { createdById: true },
      });
      if (!owner)
        throw new NotFoundException(`Quotation ${quotationId} not found`);
      if (owner.createdById !== userId) throw new ForbiddenException();
    }
    return this.prisma.statusHistory.findMany({
      where: { quotationId },
      include: { changedBy: true },
      orderBy: { changedAt: 'asc' },
    });
  }

  private sanitizeItem(item: {
    description: string;
    quantity: number;
    unitPrice: number;
  }): { description: string; quantity: number; unitPrice: number } {
    const description = QuotationsService.stripTags(item.description);
    if (description.length === 0 || description.length > 200)
      throw new BadRequestException(
        'Each item description must be between 1 and 200 characters',
      );
    if (item.quantity <= 0)
      throw new BadRequestException('Item quantity must be greater than 0');
    if (item.unitPrice <= 0)
      throw new BadRequestException('Item unit price must be greater than 0');
    return { ...item, description };
  }
}
