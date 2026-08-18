import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import gplay from 'google-play-scraper';

import {
  BUNDLE_INFO_QUEUE,
  BundleInfoJobData,
  BundleInfoJobResult,
} from '@/queue/bundle-info/bundle-info.constants';
import { BundleInfoService } from '@/queue/bundle-info/bundle-info.service';
import { ExtendedWorkerHost } from '@/queue/extended-worker.host';
import { AppDao } from '@/dao/app.dao';
import { PublisherDao } from '@/dao/publisher.dao';
import { BundleSource } from '@/database/schema/bundle-source';
import { PublisherFetchStatus } from '@/database/schema/publisher-fetch-status';

const FETCH_TIMEOUT_MS = 10_000;

const USER_AGENT = 'ads-scrapper/1.0 (ads.txt crawler)';

const ITUNES_LOOKUP_URL = 'https://itunes.apple.com/lookup';

/** What a store tells us about the developer behind a bundle. */
interface StoreListing {
  publisherName: string | null;
  website: string | null;
}

interface ItunesLookupResponse {
  results?: { artistName?: string; sellerUrl?: string }[];
}

@Processor(BUNDLE_INFO_QUEUE)
export class BundleInfoProcessor extends ExtendedWorkerHost {
  constructor(
    private readonly bundleInfoService: BundleInfoService,
    private readonly appDao: AppDao,
    private readonly publisherDao: PublisherDao,
  ) {
    super();
  }
  private readonly logger = new Logger(BundleInfoProcessor.name);

  async process(job: Job<BundleInfoJobData>): Promise<BundleInfoJobResult> {
    const { appId, bundleId, source } = job.data;
    this.logger.log(
      `Processing job ${job.id} for source "${bundleId}" (${source})`,
    );

    // 1. fetch info
    const listing =
      source === BundleSource.APP_STORE
        ? await this.fetchFromAppStore(bundleId)
        : await this.fetchFromPlayMarket(bundleId);
    await job.updateProgress(50);

    if (!listing) {
      this.logger.warn(`No ${source} listing for "${bundleId}"`);

      // update status
      await this.appDao.updateById(appId, {
        lastFetchedPublisher: new Date(),
        publisherFetchStatus: PublisherFetchStatus.NOT_FOUND,
      });

      return { success: false, status: PublisherFetchStatus.NOT_FOUND };
    }

    // 2. extract domain and name
    const domain = this.toDomain(listing.website);

    // Plenty of listings ship no developer website at all, and without one
    // there is nothing for the ads-file queue to crawl.
    if (!domain) {
      this.logger.warn(`No publisher domain for "${bundleId}"`);

      // update status
      await this.appDao.updateById(appId, {
        lastFetchedPublisher: new Date(),
        publisherFetchStatus: PublisherFetchStatus.NO_DOMAIN,
      });

      return { success: false, status: PublisherFetchStatus.NO_DOMAIN };
    }

    // The name is cosmetic and the column is NOT NULL, so a nameless listing
    // falls back to its domain rather than losing the row.
    const publisherName = listing.publisherName ?? domain;

    // 3. save to db
    const publisherId = await this.publisherDao.upsertByDomain({
      name: publisherName,
      domain,
    });

    await this.appDao.updateById(appId, {
      publisherId,
      lastFetchedPublisher: new Date(),
      publisherFetchStatus: PublisherFetchStatus.RESOLVED,
    });
    await job.updateProgress(100);

    this.logger.log(`Resolved "${bundleId}" to "${publisherName}" (${domain})`);

    return {
      success: true,
      status: PublisherFetchStatus.RESOLVED,
      publisherName,
      domain,
    };
  }

  /**
   * The iTunes lookup API keys on either the numeric track id or the bundle id,
   * depending on which one the bundle column happens to hold.
   */
  private async fetchFromAppStore(
    bundleId: string,
  ): Promise<StoreListing | null> {
    const key = /^\d+$/.test(bundleId) ? 'id' : 'bundleId';
    const url = `${ITUNES_LOOKUP_URL}?${key}=${encodeURIComponent(bundleId)}&country=US`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });

    // An unknown bundle still answers 200 with an empty result list, so a bad
    // status means upstream trouble — throwing retries with the queue backoff.
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

  /**
   * Play has no public API, so the listing has to be read off the page. The
   * scraper owns that mapping — it is positional and Google reshuffles it,
   * which is not a thing worth re-deriving here.
   */
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
      // A bundle that was never published, or has been pulled, answers 404.
      // Everything else (5xx, timeouts) is transient and retried by the queue.
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }

      return null;
    }
  }

  /**
   * app-ads.txt is served from the developer's own site, so only the host is
   * kept. A leading `www.` is dropped; deeper subdomains are left alone, since
   * reducing them to the registrable domain needs a public suffix list.
   */
  private toDomain(website: string | null): string | null {
    if (!website) return null;

    const trimmed = website.trim();
    if (!trimmed) return null;

    let url: URL;
    try {
      url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    } catch {
      return null;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname
      .toLowerCase()
      .replace(/\.+$/, '')
      .replace(/^www\./, '');

    // Bare hosts (`localhost`, an IP) never serve a publisher's app-ads.txt.
    return host.includes('.') ? host : null;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<BundleInfoJobData, BundleInfoJobResult>): void {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('drained')
  async onDrained(): Promise<void> {
    if (this.isShuttingDown) return;

    await this.bundleInfoService.enqueue();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<BundleInfoJobData> | undefined, error: Error): void {
    this.logger.error(`Job ${job?.id} failed: ${error.message}`, error.stack);
  }
}
