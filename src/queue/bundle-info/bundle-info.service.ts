import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  BUNDLE_INFO_JOB,
  BUNDLE_INFO_QUEUE,
  BundleInfoJobData,
  BundleInfoJobResult,
} from '@/queue/bundle-info/bundle-info.constants';
import { AppDao } from '@/dao/app.dao';

@Injectable()
export class BundleInfoService {
  constructor(
    private readonly appDao: AppDao,
    @InjectQueue(BUNDLE_INFO_QUEUE)
    private readonly bundleInfoQueue: Queue<
      BundleInfoJobData,
      BundleInfoJobResult
    >,
  ) {}

  async enqueue(): Promise<void> {
    const TARGET_DEPTH = 500;

    const { waiting, delayed } = await this.bundleInfoQueue.getJobCounts(
      'waiting',
      'delayed',
    );
    const deficit = TARGET_DEPTH - (waiting + delayed);
    if (deficit <= 0) return;

    const expiredAppInfos = await this.appDao.getExpiredBundleIds(deficit);
    if (expiredAppInfos.length === 0) return;

    await this.bundleInfoQueue.addBulk(
      expiredAppInfos.map(({ id: appId, bundleId }) => ({
        name: BUNDLE_INFO_JOB,
        data: { appId, bundleId },
      })),
    );
  }
}
