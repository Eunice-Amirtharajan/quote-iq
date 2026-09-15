/// <reference types="multer" />
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const BUCKET = 'documents';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private _supabase: ReturnType<typeof createClient> | null = null;

  private get supabase(): ReturnType<typeof createClient> {
    if (!this._supabase) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new InternalServerErrorException(
          'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
        );
      }
      this._supabase = createClient(url, key);
    }
    return this._supabase;
  }

  async upload(file: Express.Multer.File): Promise<{ key: string; url: string }> {
    const key = `${randomUUID()}/${file.originalname}`;
    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(key, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) {
      this.logger.error({ key, error }, 'Supabase upload failed');
      throw new InternalServerErrorException('File storage failed');
    }

    // Private bucket — generate a signed URL valid for 1 hour
    // storageKey is the durable reference; signed URL is regenerated on demand
    const { data, error: signError } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(key, 3600);

    if (signError || !data) {
      this.logger.error({ key, signError }, 'Failed to generate signed URL');
      throw new InternalServerErrorException('File storage failed');
    }

    return { key, url: data.signedUrl };
  }

  // Generates a fresh signed URL for an existing file (call when serving to frontend)
  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(key, expiresInSeconds);

    if (error || !data) {
      this.logger.error({ key, error }, 'Failed to generate signed URL');
      throw new InternalServerErrorException('Could not generate download URL');
    }

    return data.signedUrl;
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.supabase.storage.from(BUCKET).remove([key]);
    if (error) {
      this.logger.warn({ key, error }, 'Supabase delete failed');
    }
  }
}
