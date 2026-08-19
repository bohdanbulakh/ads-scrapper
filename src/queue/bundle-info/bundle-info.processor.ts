import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  BUNDLE_INFO_QUEUE,
  BundleInfoJobData,
  BundleInfoJobResult,
} from '@/queue/bundle-info/bundle-info.constants';
import { BundleInfoService } from '@/queue/bundle-info/bundle-info.service';
import { STORE_LISTING_FETCHER } from '@/queue/bundle-info/store-listing/store-listing.fetcher';
import type { StoreListingFetcher } from '@/queue/bundle-info/store-listing/store-listing.fetcher';
import { ExtendedWorkerHost } from '@/queue/extended-worker.host';
import { workerConcurrency } from '@/queue/worker-concurrency';
import { AppDao } from '@/dao/app.dao';
import { PublisherDao } from '@/dao/publisher.dao';
import { PublisherFetchStatus } from '@/database/schema/publisher-fetch-status';

@Processor(BUNDLE_INFO_QUEUE, { concurrency: workerConcurrency() })
export class BundleInfoProcessor extends ExtendedWorkerHost {
  constructor(
    private readonly bundleInfoService: BundleInfoService,
    private readonly appDao: AppDao,
    private readonly publisherDao: PublisherDao,
    @Inject(STORE_LISTING_FETCHER)
    private readonly storeListings: StoreListingFetcher,
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
    const listing = await this.storeListings.fetch(bundleId, source);
    await job.updateProgress(100 / 3);

    if (!listing) {
      this.logger.warn(`No ${source} listing for "${bundleId}"`);

      // update status
      await this.appDao.markPublisherFetched(
        appId,
        PublisherFetchStatus.NOT_FOUND,
      );

      return { success: false, status: PublisherFetchStatus.NOT_FOUND };
    }

    // 2. extract domain and name
    const domain = this.toDomain(listing.website);

    // Plenty of listings ship no developer website at all, and without one
    // there is nothing for the ads-file queue to crawl.
    if (!domain) {
      this.logger.warn(`No publisher domain for "${bundleId}"`);

      // update status
      await this.appDao.markPublisherFetched(
        appId,
        PublisherFetchStatus.NO_DOMAIN,
      );

      return { success: false, status: PublisherFetchStatus.NO_DOMAIN };
    }

    await job.updateProgress(100 * (2 / 3));

    // The name is cosmetic and the column is NOT NULL, so a nameless listing
    // falls back to its domain rather than losing the row.
    const publisherName = listing.publisherName ?? domain;

    // 3. save to db
    const publisherId = await this.publisherDao.upsertByDomain({
      name: publisherName,
      domain,
    });

    await this.appDao.markPublisherFetched(
      appId,
      PublisherFetchStatus.RESOLVED,
      publisherId,
    );
    await job.updateProgress(100);

    this.logger.log(`Resolved "${bundleId}" to "${publisherName}" (${domain})`);

    return {
      success: true,
      status: PublisherFetchStatus.RESOLVED,
      publisherName,
      domain,
    };
  }

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
  async onFailed(job: Job<BundleInfoJobData>, error: Error): Promise<void> {
    this.logger.error(`Job ${job?.id} failed: ${error.message}`, error.stack);

    const isFinal = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (isFinal) {
      await this.appDao.markPublisherFetched(
        job.data.appId,
        PublisherFetchStatus.FAILED,
      );
    }
  }
}
