import { pgEnum } from 'drizzle-orm/pg-core';

export enum BundleSource {
  PLAY_MARKET = 'PLAY_MARKET',
  APP_STORE = 'APP_STORE',
}

export const bundleSource = pgEnum('bundle_source', [
  BundleSource.APP_STORE,
  BundleSource.PLAY_MARKET,
]);
