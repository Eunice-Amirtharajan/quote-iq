import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientType } from './client.entity';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(search?: string, skip = 0, take = 50): Promise<ClientType[]> {
    return this.prisma.client.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: { name: 'asc' },
      skip,
      take,
    });
  }

  async countAll(search?: string): Promise<number> {
    return this.prisma.client.count({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  async findOne(id: string): Promise<ClientType> {
    const client = await this.prisma.client.findFirst({ where: { id } });
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    return client;
  }

  async delete(id: string): Promise<boolean> {
    const client = await this.prisma.client.findFirst({ where: { id } });
    if (!client) throw new NotFoundException(`Client ${id} not found`);

    const quotationCount = await this.prisma.quotation.count({ where: { clientId: id } });
    if (quotationCount > 0) {
      throw new BadRequestException(
        `Cannot delete "${client.name}" — ${quotationCount} quotation${quotationCount === 1 ? ' is' : 's are'} linked to this client`,
      );
    }

    await this.prisma.client.delete({ where: { id } });
    return true;
  }

  async findOrCreate(name: string, email?: string | null): Promise<ClientType> {
    const normalised = name.trim();
    return this.prisma.client.upsert({
      where: { name: normalised },
      update: email != null ? { email } : {},
      create: { name: normalised, email: email ?? null },
    });
  }
}
