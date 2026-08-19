import { BundleSource } from '@/database/schema/enums/bundle-source';
import { PublisherFetchStatus } from '@/database/schema/enums/publisher-fetch-status';

export const BUNDLE_INFO_QUEUE = 'bundle-info-queue';

export const BUNDLE_INFO_JOB = 'bundle-id';

export interface BundleInfoJobData {
  appId: string;
  bundleId: string;
  source: BundleSource;
}

export interface BundleInfoJobResult {
  success: boolean;
  status: PublisherFetchStatus;
  publisherName?: string;
  domain?: string;
}
