import * as Joi from 'joi';

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /**
   * MinIO addresses buckets as `host/bucket`, real S3 as `bucket.host`.
   * Keep `true` for MinIO, `false` when pointing at AWS.
   */
  forcePathStyle: boolean;
}

export const storageConfig = (): StorageConfig => ({
  endpoint: String(process.env.S3_ENDPOINT),
  region: String(process.env.S3_REGION),
  accessKeyId: String(process.env.S3_ACCESS_KEY),
  secretAccessKey: String(process.env.S3_SECRET_KEY),
  bucket: String(process.env.S3_BUCKET),
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

export const storageEnvSchema = {
  S3_ENDPOINT: Joi.string().uri().default('http://localhost:9000'),
  // MinIO ignores the region, but the AWS SDK refuses to build a client
  // without one.
  S3_REGION: Joi.string().default('us-east-1'),
  // Required: these are also what docker-compose feeds the minio container.
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  S3_BUCKET: Joi.string().required(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),
};
