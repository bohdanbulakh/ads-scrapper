import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  ADS_FILE_QUEUE,
  ADS_FILE_JOB,
  AdsFileJobData,
  AdsFileJobResult,
} from '@/queue/ads-file/ads-file.constants';
import { PublisherDao } from '@/dao/publisher.dao';

@Injectable()
export class AdsFileService {
  constructor(
    private readonly publisherDao: PublisherDao,
    @InjectQueue(ADS_FILE_QUEUE)
    private readonly adsFileQueue: Queue<AdsFileJobData, AdsFileJobResult>,
  ) {}

  async enqueue(): Promise<void> {
    const TARGET_DEPTH = 500;

    const { waiting, delayed } = await this.adsFileQueue.getJobCounts(
      'waiting',
      'delayed',
    );
    const deficit = TARGET_DEPTH - (waiting + delayed);
    if (deficit <= 0) return;

    const expiredAppInfos =
      await this.publisherDao.getExpiredPublisherDomains(deficit);
    if (expiredAppInfos.length === 0) return;

    await this.adsFileQueue.addBulk(
      expiredAppInfos.map(({ id: publisherId, domain }) => ({
        name: ADS_FILE_JOB,
        data: { publisherId, domain },
      })),
    );
  }
}
