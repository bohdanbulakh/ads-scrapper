import { pgEnum } from 'drizzle-orm/pg-core';

export enum AdsFileFetchStatus {
  STORED = 'STORED',
  NOT_FOUND = 'NOT_FOUND',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export const adsFileFetchStatus = pgEnum('ads_file_fetch_status', [
  AdsFileFetchStatus.FAILED,
  AdsFileFetchStatus.NOT_FOUND,
  AdsFileFetchStatus.REJECTED,
  AdsFileFetchStatus.STORED,
]);
