import { AppConfig, appConfig } from './schemas/app-config';
import { DatabaseConfig, databaseConfig } from './schemas/database-config';
import { FakeFetchConfig, fakeFetchConfig } from './schemas/fake-fetch-config';
import { QueueConfig, queueConfig } from './schemas/queue-config';
import { RedisConfig, redisConfig } from './schemas/redis-config';
import { StorageConfig, storageConfig } from './schemas/storage-config';

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
  fakeFetch: FakeFetchConfig;
  queue: QueueConfig;
  redis: RedisConfig;
  storage: StorageConfig;
}

export const configuration = (): RootConfig => ({
  app: appConfig(),
  database: databaseConfig(),
  fakeFetch: fakeFetchConfig(),
  queue: queueConfig(),
  redis: redisConfig(),
  storage: storageConfig(),
});
