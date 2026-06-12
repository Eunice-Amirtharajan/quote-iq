import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateQuotationInput,
  QuotationFilterInput,
  UpdateQuotationInput,
} from './dto/quotation.input';
import { QuotationStatus, Role } from '@prisma/client';
import { AppLogger } from '../../common/logger/logger.service';
import { QuotationType } from './quotation.entity';
import { StatusHistoryType } from './status-history.entity';
import { UserType } from '../users/user.entity';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
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
                clientName: {
                  contains: rawSearch,
                  mode: 'insensitive' as const,
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
        include: { items: true, createdBy: true },
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
        include: { items: true, createdBy: true },
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

  private static stripTags(v: string): string {
    // [^>]* is a negated class with no backtracking ambiguity; callers enforce length limits before this runs. NOSONAR
    return v.replace(/<[^>]*>/g, '').trim();
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

    const clientName = QuotationsService.stripTags(input.clientName);
    if (!clientName || clientName.length > 200) {
      throw new BadRequestException(
        'clientName must be between 1 and 200 characters',
      );
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
      `Creating quotation — title: "${title}" clientName: "${clientName}" userId: ${user.id}`,
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

      return await this.prisma.quotation.create({
        data: {
          quotationNumber: quoteNumber,
          title,
          clientName,
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
        include: { items: true, createdBy: true },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create quotation — title: "${title}" clientName: "${clientName}" userId: ${user.id}`,
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
        include: { items: true, createdBy: true },
      });
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

  async update(
    id: string,
    input: UpdateQuotationInput,
    userId: string,
  ): Promise<QuotationType> {
    this.logger.info(
      `Updating quotation: ${id} userId: ${userId}`,
      QuotationsService.name,
    );

    const existing = await this.prisma.quotation.findFirst({
      where: { id },
      select: { status: true, createdById: true },
    });
    if (!existing) throw new NotFoundException(`Quotation ${id} not found`);
    if (existing.status !== QuotationStatus.DRAFT)
      throw new BadRequestException('Only DRAFT quotations can be edited');
    if (existing.createdById !== userId)
      throw new ForbiddenException('You can only edit your own quotations');

    const title =
      input.title != null
        ? QuotationsService.stripTags(input.title)
        : undefined;
    if (title !== undefined && (title.length === 0 || title.length > 100))
      throw new BadRequestException(
        'title must be between 1 and 100 characters',
      );

    const clientName =
      input.clientName != null
        ? QuotationsService.stripTags(input.clientName)
        : undefined;
    if (
      clientName !== undefined &&
      (clientName.length === 0 || clientName.length > 200)
    )
      throw new BadRequestException(
        'clientName must be between 1 and 200 characters',
      );

    const rawNotes =
      input.notes != null
        ? QuotationsService.stripTags(input.notes).slice(0, 500)
        : undefined;
    const notes =
      rawNotes !== undefined
        ? rawNotes.length > 0
          ? rawNotes
          : null
        : undefined;

    const taxRate = input.taxRate;
    if (taxRate !== undefined && (taxRate < 0 || taxRate > 100))
      throw new BadRequestException('taxRate must be between 0 and 100');

    let totalsData:
      | ReturnType<QuotationsService['calculateTotals']>
      | undefined;
    let sanitizedItems:
      | { description: string; quantity: number; unitPrice: number }[]
      | undefined;

    if (input.items) {
      sanitizedItems = input.items.map((item) => this.sanitizeItem(item));
      totalsData = this.calculateTotals(
        sanitizedItems,
        taxRate ??
          (await this.prisma.quotation.findFirst({
            where: { id },
            select: { taxRate: true },
          }))!.taxRate,
      );
    } else if (taxRate !== undefined) {
      // Only taxRate changed — recalculate totals from existing items
      const existingItems = await this.prisma.quotationItem.findMany({
        where: { quotationId: id },
      });
      totalsData = this.calculateTotals(existingItems, taxRate);
    }

    const data: Parameters<typeof this.prisma.quotation.update>[0]['data'] = {
      ...(title !== undefined ? { title } : {}),
      ...(clientName !== undefined ? { clientName } : {}),
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

    const updated = await this.prisma.quotation.update({
      where: { id },
      data,
      include: { items: true, createdBy: true },
    });

    // Invalidate stale AI insight cache — quotation content changed
    await this.prisma.aIInsight.deleteMany({
      where: { quotationId: id },
    });

    const changed: string[] = [];
    if (title !== undefined) changed.push('title');
    if (clientName !== undefined) changed.push('client name');
    if (notes !== undefined) changed.push('notes');
    if (taxRate !== undefined) changed.push('tax rate');
    if (sanitizedItems !== undefined) changed.push('line items');
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
