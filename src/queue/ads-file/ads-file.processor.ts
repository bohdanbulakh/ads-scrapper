import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  ADS_FILE_QUEUE,
  AdsFileJobData,
  AdsFileJobResult,
} from '@/queue/ads-file/ads-file.constants';
import { AdsFileService } from '@/queue/ads-file/ads-file.service';
import { ExtendedWorkerHost } from '@/queue/extended-worker.host';

@Processor(ADS_FILE_QUEUE)
export class AdsFileProcessor extends ExtendedWorkerHost {
  constructor(private readonly adsFileService: AdsFileService) {
    super();
  }

  private readonly logger = new Logger(AdsFileProcessor.name);

  async process(job: Job<AdsFileJobData>): Promise<AdsFileJobResult> {
    this.logger.log(`Processing job ${job.id} for domain "${job.data.domain}"`);

    // 1. fetch file
    // 2. save to s3
    // 3. create new/update existing db record

    await job.updateProgress(100);
    return { success: true };
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
  onFailed(job: Job<AdsFileJobData> | undefined, error: Error): void {
    this.logger.error(`Job ${job?.id} failed: ${error.message}`, error.stack);
  }
}
