import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  ADS_FILE_QUEUE,
  AdsFileJobData,
  AdsFileJobResult,
} from '@/queue/ads-file/ads-file.constants';
import { ADS_FILE_FETCHER } from '@/queue/ads-file/ads-file-fetcher/ads-file.fetcher';
import type { AdsFileFetcher } from '@/queue/ads-file/ads-file-fetcher/ads-file.fetcher';
import { AdsFileService } from '@/queue/ads-file/ads-file.service';
import { ExtendedWorkerHost } from '@/queue/extended-worker.host';
import { workerConcurrency } from '@/queue/worker-concurrency';
import { StorageService } from '@/storage/storage.service';
import { PublisherDao } from '@/dao/publisher.dao';
import { AdsFileFetchStatus } from '@/database/schema/ads-file-fetch-status';

/** ads.txt is plain text; anything this big is not a real one. */
const MAX_BYTES = 5 * 1024 * 1024;

@Processor(ADS_FILE_QUEUE, { concurrency: workerConcurrency() })
export class AdsFileProcessor extends ExtendedWorkerHost {
  constructor(
    private readonly adsFileService: AdsFileService,
    private readonly storage: StorageService,
    private readonly publisherDao: PublisherDao,
    @Inject(ADS_FILE_FETCHER)
    private readonly adsFiles: AdsFileFetcher,
  ) {
    super();
  }

  private readonly logger = new Logger(AdsFileProcessor.name);

  async process(job: Job<AdsFileJobData>): Promise<AdsFileJobResult> {
    const { domain, publisherId } = job.data;
    this.logger.log(`Processing job ${job.id} for domain "${domain}"`);

    // 1. fetch file
    const response = await this.adsFiles.fetch(domain);
    await job.updateProgress(50);

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`${domain} responded ${response.status}`);
      }

      await response.body?.cancel();
      this.logger.warn(`No ads.txt for "${domain}" (HTTP ${response.status})`);

      // update status
      await this.publisherDao.markFileFetched(
        publisherId,
        AdsFileFetchStatus.NOT_FOUND,
      );

      return { success: false, status: AdsFileFetchStatus.NOT_FOUND };
    }

    // Reject if file size > 5MB
    const chunks: Buffer[] = [];
    let bytes = 0;

    for await (const chunk of response.body ?? []) {
      bytes += chunk.byteLength;

      if (bytes > MAX_BYTES) {
        this.logger.warn(`ads.txt for "${domain}" exceeds ${MAX_BYTES} bytes`);

        // update status
        await this.publisherDao.markFileFetched(
          publisherId,
          AdsFileFetchStatus.REJECTED,
        );

        return { success: false, status: AdsFileFetchStatus.REJECTED };
      }

      chunks.push(Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks);

    // Plenty of sites answer 200 with an HTML "not found" page instead of a
    // real 404 — storing that would poison the data.
    if (this.looksLikeHtml(response, body)) {
      this.logger.warn(`ads.txt for "${domain}" looks like HTML, skipping`);

      // update status
      await this.publisherDao.markFileFetched(
        publisherId,
        AdsFileFetchStatus.NOT_FOUND,
      );

      return { success: false, status: AdsFileFetchStatus.NOT_FOUND };
    }

    // 2. save to s3
    const key = this.storageKey(domain);
    await this.storage.put(key, body, 'text/plain; charset=utf-8');
    await job.updateProgress(100);

    this.logger.log(
      `Stored ${body.byteLength} bytes for "${domain}" at ${key}`,
    );

    // update status
    await this.publisherDao.markFileFetched(
      publisherId,
      AdsFileFetchStatus.STORED,
    );

    return {
      success: true,
      status: AdsFileFetchStatus.STORED,
    };
  }

  private looksLikeHtml(response: Response, body: Buffer): boolean {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) return true;

    return /^\s*<(?:!doctype|html)\b/i.test(body.subarray(0, 200).toString());
  }

  private storageKey(domain: string): string {
    const safe = domain.trim().toLowerCase().replace(/\.+$/, '');

    return `publishers/${safe}/ads.txt`;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<AdsFileJobData, AdsFileJobResult>): void {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('drained')
  async onDrained(): Promise<void> {
    if (this.isShuttingDown) return;

    await this.adsFileService.enqueue();
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<AdsFileJobData>, error: Error): Promise<void> {
    this.logger.error(`Job ${job?.id} failed: ${error.message}`, error.stack);

    const isFinal = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (isFinal) {
      await this.publisherDao.markFileFetched(
        job.data.publisherId,
        AdsFileFetchStatus.FAILED,
      );
    }
  }
}
