import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';

import { ExtendedConfigService } from '../common/config/extended-config.service';
import { S3_CLIENT } from './storage.constants';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ExtendedConfigService],
      useFactory: (config: ExtendedConfigService) =>
        new S3Client({
          endpoint: config.get('storage.endpoint'),
          region: config.get('storage.region'),
          // MinIO serves buckets as `host/bucket`, not `bucket.host`.
          forcePathStyle: config.get('storage.forcePathStyle'),
          credentials: {
            accessKeyId: config.get('storage.accessKeyId'),
            secretAccessKey: config.get('storage.secretAccessKey'),
          },
        }),
    },
    StorageService,
  ],
  exports: [StorageService, S3_CLIENT],
})
export class StorageModule implements OnApplicationShutdown, OnModuleInit {
  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly config: ExtendedConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const bucket = this.config.get('storage.bucket');
    const endpoint = this.config.get('storage.endpoint');

    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;

      throw new Error(
        `Cannot reach bucket "${bucket}" at ${endpoint}` +
          (status ? ` (HTTP ${status})` : '') +
          `. Check S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY, ` +
          `and that the bucket exists — "docker compose up" runs minio-init to create it.`,
        { cause: error },
      );
    }

    new Logger(StorageModule.name).log(`Connected to bucket "${bucket}"`);
  }

  onApplicationShutdown(): void {
    this.s3.destroy();
  }
}
