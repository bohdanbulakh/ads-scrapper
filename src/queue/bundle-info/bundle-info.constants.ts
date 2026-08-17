export const BUNDLE_INFO_QUEUE = 'bundle-info-queue';

export const BUNDLE_INFO_JOB = 'bundle-id';

export interface BundleInfoJobData {
  appId: string;
  bundleId: string;
}

export interface BundleInfoJobResult {
  domain: string;
  publisherName: string;
}
