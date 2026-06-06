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
} from './dto/quotation.input';
import { QuotationStatus, Role } from '@prisma/client';
import { AppLogger } from '../../common/logger/logger.service';
import { QuotationType } from './quotation.entity';
import { UserType } from '../users/user.entity';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
const allowed: Record<QuotationStatus, QuotationStatus[]> = {
  [QuotationStatus.DRAFT]: [QuotationStatus.SENT],
  [QuotationStatus.SENT]: [QuotationStatus.APPROVED, QuotationStatus.REJECTED],
  [QuotationStatus.APPROVED]: [],
  [QuotationStatus.REJECTED]: [],
  [QuotationStatus.EXPIRED]: [],
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
      description: item.description, // explicitly carry through
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
      const userId = user.id;
      const role = user.role;
      this.logger.info(
        `Fetching quotations — userId: ${userId} role: ${role}`,
        QuotationsService.name,
      );
      const ownerWhere =
        role === Role.SALES_MANAGER || role === Role.ADMIN
          ? {}
          : { createdById: userId };
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
      return await this.prisma.quotation.findMany({
        where: { ...ownerWhere, ...statusWhere, ...searchWhere },
        include: { items: true, client: true, createdBy: true },
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
        include: { items: true, client: true, createdBy: true },
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

  async create(
    input: CreateQuotationInput,
    user: UserType,
  ): Promise<QuotationType> {
    this.logger.info(
      `Creating quotation — title: "${input.title}" clientId: ${input.clientId} userId: ${user.id}`,
      QuotationsService.name,
    );
    try {
      const taxRate = input.taxRate ?? 0;
      const { itemsWithTotal, subtotal, taxAmount, total } =
        this.calculateTotals(input.items, taxRate);

      const seqResult = await this.prisma.$queryRaw<
        [{ nextval: bigint }]
      >`SELECT nextval('quote_number_seq')`;
      const seq = Number(seqResult[0].nextval);
      const quoteNumber = `QT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

      return await this.prisma.quotation.create({
        data: {
          quotationNumber: quoteNumber,
          title: input.title,
          clientId: input.clientId,
          notes: input.notes,
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
        },
        include: { items: true, client: true, createdBy: true },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create quotation — title: "${input.title}" clientId: ${input.clientId} userId: ${user.id}`,
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
        include: { items: true, client: true, createdBy: true },
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
}
