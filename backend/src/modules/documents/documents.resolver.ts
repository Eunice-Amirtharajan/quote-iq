import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentType } from './document.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';

@Resolver(() => DocumentType)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsResolver {
  constructor(private readonly documentsService: DocumentsService) {}

  @Query(() => [DocumentType], { description: 'List all uploaded documents (managers only)' })
  @Roles(Role.SALES_MANAGER)
  async documents(@CurrentUser() user: User): Promise<DocumentType[]> {
    return this.documentsService.findAll(user) as Promise<DocumentType[]>;
  }

  @Query(() => Boolean, { description: 'Returns true when at least one READY document exists — used to gate the Playbook feature' })
  @Roles(Role.SALES_REP, Role.SALES_MANAGER)
  async hasReadyDocuments(): Promise<boolean> {
    return this.documentsService.hasReadyDocuments();
  }

  @Mutation(() => DocumentType, { description: 'Approve a document for RAG use' })
  @Roles(Role.SALES_MANAGER)
  async approveDocument(
    @Args('id') id: string,
    @CurrentUser() user: User,
  ): Promise<DocumentType> {
    return this.documentsService.approveDocument(id, user) as Promise<DocumentType>;
  }

  @Mutation(() => DocumentType, { description: 'Reject a document and record the reason' })
  @Roles(Role.SALES_MANAGER)
  async rejectDocument(
    @Args('id') id: string,
    @Args('reason') reason: string,
    @CurrentUser() user: User,
  ): Promise<DocumentType> {
    return this.documentsService.rejectDocument(id, reason, user) as Promise<DocumentType>;
  }

  @Mutation(() => Boolean, { description: 'Delete a document and its chunks.' })
  @Roles(Role.SALES_MANAGER)
  async deleteDocument(
    @Args('id') id: string,
    @CurrentUser() user: User,
  ): Promise<boolean> {
    await this.documentsService.deleteDocument(id, user);
    return true;
  }
}
