import { BundleSource } from '@/database/schema/enums/bundle-source';

/** Injection token for {@link StoreListingFetcher}. */
export const STORE_LISTING_FETCHER = 'STORE_LISTING_FETCHER';

export interface StoreListing {
  publisherName: string | null;
  website: string | null;
}

export interface StoreListingFetcher {
  fetch(bundleId: string, source: BundleSource): Promise<StoreListing | null>;
}
