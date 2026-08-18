import { pgEnum } from 'drizzle-orm/pg-core';

export enum PublisherFetchStatus {
  RESOLVED = 'RESOLVED',
  NOT_FOUND = 'NOT_FOUND',
  NO_DOMAIN = 'NO_DOMAIN',
}

export const publisherFetchStatus = pgEnum('publisher_fetch_status', [
  PublisherFetchStatus.NOT_FOUND,
  PublisherFetchStatus.NO_DOMAIN,
  PublisherFetchStatus.RESOLVED,
]);
