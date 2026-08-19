import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';

import { ExtendedConfigService } from '@/common/config/extended-config.service';
import { S3_CLIENT } from '@/storage/storage.constants';

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
}
