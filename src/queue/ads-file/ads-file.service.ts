import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  ADS_FILE_QUEUE,
  ADS_FILE_JOB,
  AdsFileJobData,
  AdsFileJobResult,
} from './ads-file.constants';
import { ExtendedConfigService } from '../../common/config/extended-config.service';
import { PublisherDao } from '../../dao/publisher.dao';

@Injectable()
export class AdsFileService {
  private readonly targetDepth: number;

  constructor(
    private readonly publisherDao: PublisherDao,
    config: ExtendedConfigService,
    @InjectQueue(ADS_FILE_QUEUE)
    private readonly adsFileQueue: Queue<AdsFileJobData, AdsFileJobResult>,
  ) {
    this.targetDepth = config.get('queue.targetDepth');
  }

  async enqueue(): Promise<void> {
    const { waiting, delayed } = await this.adsFileQueue.getJobCounts(
      'waiting',
      'delayed',
    );
    const deficit = this.targetDepth - (waiting + delayed);
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
