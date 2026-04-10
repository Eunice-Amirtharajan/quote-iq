import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInput } from './dto/client.input';
import { ClientType } from './client.entity';
import { UserType } from '../users/user.entity';
import { AppLogger } from '../../common/logger/logger.service';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async findAll(user: UserType): Promise<ClientType[]> {
    // Managers see all clients, reps see only their own
    const isManager = user.role === 'SALES_MANAGER' || user.role === 'ADMIN';
    this.logger.info(
      isManager
        ? `Fetching all clients — userId: ${user.id}`
        : `Fetching own clients — userId: ${user.id}`,
      ClientsService.name,
    );

    try {
      const where = isManager ? {} : { createdById: user.id };
      return await this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to fetch clients — userId: ${user.id} role: ${user.role}`,
        error instanceof Error ? error.stack : String(error),
        ClientsService.name,
      );
      throw error;
    }
  }

  async findOne(id: string): Promise<ClientType | null> {
    this.logger.info(`Fetching client: ${id}`, ClientsService.name);
    try {
      const client = await this.prisma.client.findUnique({ where: { id } });
      if (!client) {
        this.logger.warn(`Client not found: ${id}`, ClientsService.name);
      }
      return client;
    } catch (error) {
      this.logger.error(
        `Failed to find client: ${id}`,
        error instanceof Error ? error.stack : String(error),
        ClientsService.name,
      );
      throw error;
    }
  }

  async create(input: ClientInput, user: UserType): Promise<ClientType> {
    this.logger.info(`Creating client: ${input.name}`, ClientsService.name);
    try {
      return await this.prisma.client.create({
        data: { ...input, createdById: user.id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create client: ${input.name}`,
        error instanceof Error ? error.stack : String(error),
        ClientsService.name,
      );
      throw error;
    }
  }

  async update(id: string, input: ClientInput): Promise<ClientType> {
    this.logger.info(`Updating client: ${id}`, ClientsService.name);
    try {
      return await this.prisma.client.update({ where: { id }, data: input });
    } catch (error) {
      this.logger.error(
        `Failed to update client: ${id}`,
        error instanceof Error ? error.stack : String(error),
        ClientsService.name,
      );
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    this.logger.info(`Deleting client: ${id}`, ClientsService.name);
    try {
      await this.prisma.client.delete({ where: { id } });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to delete client: ${id}`,
        error instanceof Error ? error.stack : String(error),
        ClientsService.name,
      );
      throw error;
    }
  }
}
