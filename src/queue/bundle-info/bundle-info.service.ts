import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  BUNDLE_INFO_JOB,
  BUNDLE_INFO_QUEUE,
  BundleInfoJobData,
  BundleInfoJobResult,
} from './bundle-info.constants';
import { ExtendedConfigService } from '../../common/config/extended-config.service';
import { AppDao } from '../../dao/app.dao';

@Injectable()
export class BundleInfoService {
  private readonly targetDepth: number;

  constructor(
    private readonly appDao: AppDao,
    config: ExtendedConfigService,
    @InjectQueue(BUNDLE_INFO_QUEUE)
    private readonly bundleInfoQueue: Queue<
      BundleInfoJobData,
      BundleInfoJobResult
    >,
  ) {
    this.targetDepth = config.get('queue.targetDepth');
  }

  async enqueue(): Promise<void> {
    const { waiting, delayed } = await this.bundleInfoQueue.getJobCounts(
      'waiting',
      'delayed',
    );
    const deficit = this.targetDepth - (waiting + delayed);
    if (deficit <= 0) return;

    const expiredAppInfos = await this.appDao.getExpiredBundleIds(deficit);
    if (expiredAppInfos.length === 0) return;

    await this.bundleInfoQueue.addBulk(
      expiredAppInfos.map(({ id: appId, bundleId, source }) => ({
        name: BUNDLE_INFO_JOB,
        data: { appId, bundleId, source },
      })),
    );
  }
}
