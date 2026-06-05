import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInput } from './dto/client.input';
import { ClientType } from './client.entity';
import { UserType } from '../users/user.entity';
import { AppLogger } from '../../common/logger/logger.service';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { Role } from '@prisma/client';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async findAll(user: UserType, take = 20, skip = 0): Promise<ClientType[]> {
    // Managers see all clients, reps see only their own
    const isManager =
      user.role === Role.SALES_MANAGER || user.role === Role.ADMIN;
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
        take: Math.min(take, 100),
        skip,
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
      const client = await this.prisma.client.findFirst({ where: { id } });
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

  async findOwner(id: string): Promise<{ createdById: string } | null> {
    this.logger.info(`Fetching owner for client id:${id}`, ClientsService.name);
    try {
      return await this.prisma.client.findFirst({
        where: { id },
        select: { createdById: true },
      });
    } catch (error) {
      this.logger.error(
        `Failed to fetch owner for client id:${id}`,
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
        data: {
          name: input.name,
          company: input.company,
          email: input.email,
          phone: input.phone,
          city: input.city,
          country: input.country,
          createdById: user.id,
        },
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
      return await this.prisma.client.update({
        where: { id },
        data: {
          name: input.name,
          company: input.company,
          email: input.email,
          phone: input.phone,
          city: input.city,
          country: input.country,
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Client ${id} not found`);
      }
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
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Client ${id} not found`);
      }
      this.logger.error(
        `Failed to delete client: ${id}`,
        error instanceof Error ? error.stack : String(error),
        ClientsService.name,
      );
      throw error;
    }
  }
}
