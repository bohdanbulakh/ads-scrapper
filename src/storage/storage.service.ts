import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';

import { ExtendedConfigService } from '@/common/config/extended-config.service';
import { S3_CLIENT, StoredObject } from '@/storage/storage.constants';

@Injectable()
export class StorageService {
  private readonly bucket: string;

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    config: ExtendedConfigService,
  ) {
    this.bucket = config.get('storage.bucket');
  }

  async put(
    key: string,
    body: Buffer | string,
    contentType = 'application/octet-stream',
  ): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Returns `null` when the object does not exist. */
  async get(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      return {
        key,
        // Buffering is fine for ads.txt-sized files; stream instead if this
        // ever handles large objects.
        body: Buffer.from(await res.Body!.transformToByteArray()),
        contentType: res.ContentType,
        contentLength: res.ContentLength,
      };
    } catch (error) {
      if (this.isMissing(error)) return null;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (this.isMissing(error)) return false;
      throw error;
    }
  }

  /** Deleting a missing key is a no-op on S3, so this is idempotent. */
  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /**
   * Time-limited download URL, so callers can hand out access without
   * proxying the bytes through this service.
   */
  presignedUrl(key: string, expiresInSeconds = 3_600): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  /**
   * `GetObject` reports a missing key as `NoSuchKey`, but `HeadObject` has no
   * body to carry the code and surfaces a bare 404 instead.
   */
  private isMissing(error: unknown): boolean {
    return (
      error instanceof NoSuchKey ||
      error instanceof NotFound ||
      (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode === 404
    );
  }
}
