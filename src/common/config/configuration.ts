import { AppConfig, appConfig } from '@/common/config/schemas/app-config';
import {
  DatabaseConfig,
  databaseConfig,
} from '@/common/config/schemas/database-config';
import {
  FakeFetchConfig,
  fakeFetchConfig,
} from '@/common/config/schemas/fake-fetch-config';
import { QueueConfig, queueConfig } from '@/common/config/schemas/queue-config';
import { RedisConfig, redisConfig } from '@/common/config/schemas/redis-config';
import {
  StorageConfig,
  storageConfig,
} from '@/common/config/schemas/storage-config';

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
