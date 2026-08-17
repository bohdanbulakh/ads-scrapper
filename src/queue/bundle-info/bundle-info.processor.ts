import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  BUNDLE_INFO_QUEUE,
  BundleInfoJobData,
  BundleInfoJobResult,
} from '@/queue/bundle-info/bundle-info.constants';
import { BundleInfoService } from '@/queue/bundle-info/bundle-info.service';
import { ExtendedWorkerHost } from '@/queue/extended-worker.host';

@Processor(BUNDLE_INFO_QUEUE)
export class BundleInfoProcessor extends ExtendedWorkerHost {
  constructor(private readonly bundleInfoService: BundleInfoService) {
    super();
  }
  private readonly logger = new Logger(BundleInfoProcessor.name);

  async process(job: Job<BundleInfoJobData>): Promise<BundleInfoJobResult> {
    this.logger.log(`Processing job ${job.id} for source "${job.data.appId}"`);

    // 1. fetch info
    // 2. extract domain and name
    // 3. save to db

    await job.updateProgress(100);

    return { publisherName: '', domain: '' };
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
