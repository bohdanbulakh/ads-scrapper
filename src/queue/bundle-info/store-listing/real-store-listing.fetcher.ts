import gplay from 'google-play-scraper';

import {
  StoreListing,
  StoreListingFetcher,
} from '@/queue/bundle-info/store-listing/store-listing.fetcher';
import { BundleSource } from '@/database/schema/enums/bundle-source';

const FETCH_TIMEOUT_MS = 10_000;

const USER_AGENT = 'ads-scrapper/1.0 (ads.txt crawler)';

const ITUNES_LOOKUP_URL = 'https://itunes.apple.com/lookup';

interface ItunesLookupResponse {
  results?: { artistName?: string; sellerUrl?: string }[];
}

export class RealStoreListingFetcher implements StoreListingFetcher {
  fetch(bundleId: string, source: BundleSource): Promise<StoreListing | null> {
    return source === BundleSource.APP_STORE
      ? this.fetchFromAppStore(bundleId)
      : this.fetchFromPlayMarket(bundleId);
  }

  private async fetchFromAppStore(
    bundleId: string,
  ): Promise<StoreListing | null> {
    const url = `${ITUNES_LOOKUP_URL}?bundleId=${encodeURIComponent(bundleId)}&country=US`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`itunes.apple.com responded ${response.status}`);
    }

    const payload = (await response.json()) as ItunesLookupResponse;
    const result = payload.results?.[0];
    if (!result) return null;

    return {
      publisherName: result.artistName ?? null,
      website: result.sellerUrl ?? null,
    };
  }

  private async fetchFromPlayMarket(
    bundleId: string,
  ): Promise<StoreListing | null> {
    try {
      const listing = await gplay.app({
        appId: bundleId,
        lang: 'en',
        country: 'us',
        requestOptions: {
          headers: { 'user-agent': USER_AGENT },
          timeout: { request: FETCH_TIMEOUT_MS },
        },
      });

      return {
        publisherName: listing.developer ?? null,
        website: listing.developerWebsite ?? null,
      };
    } catch (error) {
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }

      return null;
    }
  }
}
