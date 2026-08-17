import { AppConfig, appConfig } from '@/common/config/schemas/app-config';
import {
  DatabaseConfig,
  databaseConfig,
} from '@/common/config/schemas/database-config';
import { RedisConfig, redisConfig } from '@/common/config/schemas/redis-config';
import {
  StorageConfig,
  storageConfig,
} from '@/common/config/schemas/storage-config';

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  storage: StorageConfig;
}

export const configuration = (): RootConfig => ({
  app: appConfig(),
  database: databaseConfig(),
  redis: redisConfig(),
  storage: storageConfig(),
});
