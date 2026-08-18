import * as Joi from 'joi';

import { appEnvSchema } from '@/common/config/schemas/app-config';
import { databaseEnvSchema } from '@/common/config/schemas/database-config';
import { fakeFetchEnvSchema } from '@/common/config/schemas/fake-fetch-config';
import { queueEnvSchema } from '@/common/config/schemas/queue-config';
import { redisEnvSchema } from '@/common/config/schemas/redis-config';
import { storageEnvSchema } from '@/common/config/schemas/storage-config';

export const validationSchema = Joi.object({
  ...appEnvSchema,
  ...databaseEnvSchema,
  ...fakeFetchEnvSchema,
  ...queueEnvSchema,
  ...redisEnvSchema,
  ...storageEnvSchema,
}).unknown(true);
