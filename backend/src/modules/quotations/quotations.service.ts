import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQuotationInput } from './dto/quotation.input';
import { Quotation, QuotationStatus } from '@prisma/client';

@Injectable()
export class QuotationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Calculate totals — stored at write time for consistency
  private calculateTotals(
    items: { description: string; quantity: number; unitPrice: number }[],
    taxRate: number,
  ) {
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
    return { itemsWithTotal, subtotal, taxAmount, total };
  }

  findAll(userId: string, role: string): Promise<Quotation[]> {
    const where =
      role === 'SALES_MANAGER' || role === 'ADMIN'
        ? {}
        : { createdById: userId };

    return this.prisma.quotation.findMany({
      where,
      include: { items: true, client: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<Quotation | null> {
    return this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true, client: true, createdBy: true },
    });
  }

  async create(
    input: CreateQuotationInput,
    userId: string,
  ): Promise<Quotation> {
    const taxRate = input.taxRate ?? 0;
    const { itemsWithTotal, subtotal, taxAmount, total } = this.calculateTotals(
      input.items,
      taxRate,
    );

    // Auto-generate quotation number
    const count = await this.prisma.quotation.count();
    const number = `QT-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    return this.prisma.quotation.create({
      data: {
        quotationNumber: number,
        title: input.title,
        clientId: input.clientId,
        notes: input.notes,
        taxRate,
        subtotal,
        taxAmount,
        total,
        validUntil: input.validUntil,
        createdById: userId,
        items: {
          create: itemsWithTotal.map((item, i) => ({
            ...item,
            sortOrder: i,
          })),
        },
      },
      include: { items: true, client: true, createdBy: true },
    });
  }

  async updateStatus(
    id: string,
    status: string,
    note: string | undefined,
    userId: string,
  ): Promise<Quotation> {
    const current = await this.prisma.quotation.findUnique({ where: { id } });

    // Record status change in history
    await this.prisma.statusHistory.create({
      data: {
        quotationId: id,
        fromStatus: current!.status,
        toStatus: status as QuotationStatus,
        note,
        changedById: userId,
      },
    });

    return this.prisma.quotation.update({
      where: { id },
      data: { status: status as QuotationStatus },
      include: { items: true, client: true, createdBy: true },
    });
  }

  async delete(id: string): Promise<boolean> {
    await this.prisma.quotation.delete({ where: { id } });
    return true;
  }
}
