import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsResolver } from './documents.resolver';
import { DocumentsController } from './documents.controller';
import { StorageService } from './storage.service';
import { ScanService } from './scan.service';
import { ExtractionService } from './extraction.service';
import { ModerationService } from './moderation.service';

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentsResolver,
    StorageService,
    ScanService,
    ExtractionService,
    ModerationService,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
