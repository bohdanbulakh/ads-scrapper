import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BundleInfoService } from './bundle-info/bundle-info.service';
import { AdsFileService } from './ads-file/ads-file.service';

@Injectable()
export class TasksDispatcherService {
  constructor(
    private readonly adsFileService: AdsFileService,
    private readonly bundleInfoService: BundleInfoService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async adsFileDispatcher(): Promise<void> {
    await this.adsFileService.enqueue();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async appInfoDispatcher(): Promise<void> {
    await this.bundleInfoService.enqueue();
  }
}
