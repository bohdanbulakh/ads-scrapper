export const S3_CLIENT = 'S3_CLIENT';

export interface StoredObject {
  key: string;
  body: Buffer;
  contentType?: string;
  contentLength?: number;
}
