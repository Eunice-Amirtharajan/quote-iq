import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInput } from './dto/client.input';
import { Client } from '@prisma/client';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string, role: string): Promise<Client[]> {
    // Managers see all clients, reps see only their own
    if (role === 'SALES_MANAGER' || role === 'ADMIN') {
      return this.prisma.client.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.client.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<Client | null> {
    return this.prisma.client.findUnique({ where: { id } });
  }

  create(input: ClientInput, userId: string): Promise<Client> {
    return this.prisma.client.create({
      data: { ...input, createdById: userId },
    });
  }

  update(id: string, input: ClientInput): Promise<Client> {
    return this.prisma.client.update({
      where: { id },
      data: input,
    });
  }

  async delete(id: string): Promise<boolean> {
    await this.prisma.client.delete({ where: { id } });
    return true;
  }
}
