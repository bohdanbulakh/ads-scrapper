import { pgEnum } from 'drizzle-orm/pg-core';

export enum PublisherFetchStatus {
  RESOLVED = 'RESOLVED',
  NOT_FOUND = 'NOT_FOUND',
  NO_DOMAIN = 'NO_DOMAIN',
  FAILED = 'FAILED',
}

export const publisherFetchStatus = pgEnum('publisher_fetch_status', [
  PublisherFetchStatus.FAILED,
  PublisherFetchStatus.NOT_FOUND,
  PublisherFetchStatus.NO_DOMAIN,
  PublisherFetchStatus.RESOLVED,
]);
