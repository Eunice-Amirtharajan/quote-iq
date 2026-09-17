import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
/// <reference types="multer" />
import { Throttle } from '@nestjs/throttler';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GqlThrottlerGuard } from '../../common/guards/gql-throttler.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

// 5 uploads per IP per minute — much stricter than the global 120/min limit
@Throttle({ global: { ttl: 60_000, limit: 5 } })
@Controller('documents')
@UseGuards(GqlThrottlerGuard, JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined, // use memory storage — buffer available in file.buffer
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    if (process.env['ALLOW_UPLOAD'] !== 'true') {
      throw new ForbiddenException(
        'Document uploads are disabled in this deployment. This is a read-only demo.',
      );
    }
    return this.documentsService.uploadDocument(file, user);
  }
}
