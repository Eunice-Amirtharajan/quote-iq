import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQuotationInput } from './dto/quotation.input';
import { QuotationStatus } from '@prisma/client';
import { AppLogger } from '../../common/logger/logger.service';
import { QuotationType } from './quotation.entity';
import { UserType } from '../users/user.entity';

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

  async findAll(user: UserType): Promise<QuotationType[]> {
    try {
      const userId = user.id;
      const role = user.role;
      this.logger.info(
        `Fetching quotations — userId: ${userId} role: ${role}`,
        QuotationsService.name,
      );
      const where =
        role === 'SALES_MANAGER' || role === 'ADMIN'
          ? {}
          : { createdById: userId };
      return await this.prisma.quotation.findMany({
        where,
        include: { items: true, client: true, createdBy: true },
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

  async findOne(id: string): Promise<QuotationType | null> {
    this.logger.info(`Finding quotation with id:${id}`, QuotationsService.name);
    try {
      return await this.prisma.quotation.findUnique({
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

      // Auto-generate quotation number
      const count = await this.prisma.quotation.count();
      const quoteNumber = `QT-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

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
          validUntil: input.validUntil,
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
    status: string,
    note: string | undefined,
    userId: string,
  ): Promise<QuotationType> {
    this.logger.info(
      `Status update — quotationId: ${id} newStatus: ${status} userId: ${userId}`,
      QuotationsService.name,
    );
    const current = await this.prisma.quotation.findUnique({ where: { id } });
    if (!current) {
      this.logger.warn(
        `Status update failed — quotation not found: ${id}`,
        QuotationsService.name,
      );
      throw new NotFoundException(`Quotation ${id} not found`);
    }
    this.logger.info(
      `Status transition — ${current.status} -> ${status} on quotation: ${id}`,
      QuotationsService.name,
    );
    try {
      // Record status change in history
      await this.prisma.statusHistory.create({
        data: {
          quotationId: id,
          fromStatus: current.status,
          toStatus: status as QuotationStatus,
          note,
          changedById: userId,
        },
      });

      return await this.prisma.quotation.update({
        where: { id },
        data: { status: status as QuotationStatus },
        include: { items: true, client: true, createdBy: true },
      });
    } catch (error) {
      this.logger.error(
        `Unexpected error while updating the quotation: "${id}"`,
        error instanceof Error ? error.stack : String(error),
        QuotationsService.name,
      );
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    this.logger.info(`Deleting quotation: ${id}`, QuotationsService.name);
    try {
      await this.prisma.quotation.delete({ where: { id } });
      return true;
    } catch (error) {
      this.logger.error(
        `Unexpected error while deleting the quotation: "${id}"`,
        error instanceof Error ? error.stack : String(error),
        QuotationsService.name,
      );
      throw error;
    }
  }
}
