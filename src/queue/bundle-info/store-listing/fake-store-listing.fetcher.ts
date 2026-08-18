import { Logger } from '@nestjs/common';

import { ExtendedConfigService } from '@/common/config/extended-config.service';
import {
  StoreListing,
  StoreListingFetcher,
} from '@/queue/bundle-info/store-listing/store-listing.fetcher';
import { draw, simulateLatency } from '@/queue/fake/fake-fetch.util';

const NOT_FOUND_SHARE = 8;
const NO_WEBSITE_SHARE = 12;

const UNUSABLE_WEBSITE_SHARE = 5;

export class FakeStoreListingFetcher implements StoreListingFetcher {
  private readonly logger = new Logger(FakeStoreListingFetcher.name);

  private readonly latencyMs: number;
  private readonly failureRate: number;
  private readonly poolSize: number;

  constructor(config: ExtendedConfigService) {
    this.latencyMs = config.get('fakeFetch.latencyMs');
    this.failureRate = config.get('fakeFetch.failureRate');
    this.poolSize = config.get('fakeFetch.publisherPoolSize');

    this.logger.warn(
      `FAKE_FETCH is on — store listings are generated, not fetched ` +
        `(pool: ${this.poolSize} publisher domains)`,
    );
  }

  async fetch(bundleId: string): Promise<StoreListing | null> {
    await simulateLatency(this.latencyMs);

    if (Math.random() < this.failureRate) {
      throw new Error(`fake store lookup failed for "${bundleId}"`);
    }

    const outcome = draw(bundleId, 0) % 100;

    if (outcome < NOT_FOUND_SHARE) return null;

    const publisherIndex = draw(bundleId, 1) % this.poolSize;
    const domain = `seed-${publisherIndex}.example`;
    const publisherName = `Seed Publisher ${publisherIndex}`;

    if (outcome < NOT_FOUND_SHARE + NO_WEBSITE_SHARE) {
      return { publisherName, website: null };
    }

    return { publisherName, website: this.website(domain, bundleId) };
  }

  private website(domain: string, bundleId: string): string {
    const variant = draw(bundleId, 2) % 100;

    // Values `toDomain()` genuinely has to reject: a non-http scheme, a
    // placeholder that is not a URL, and a host with no domain in it. Note that
    // `mailto:dev@host` does *not* belong here — with no `://` of its own it is
    // read as `https://mailto:dev@host`, and the host comes through intact.
    if (variant < UNUSABLE_WEBSITE_SHARE) {
      switch (variant % 3) {
        case 0:
          return `ftp://${domain}`;
        case 1:
          return 'N/A';
        default:
          return 'localhost';
      }
    }

    switch (variant % 4) {
      case 0:
        return `https://${domain}`;
      case 1:
        return `https://www.${domain}/`;
      case 2:
        return `http://${domain}/support/contact`;
      default:
        return domain;
    }
  }
}
