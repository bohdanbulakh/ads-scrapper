import * as Joi from 'joi';

import { appEnvSchema } from './schemas/app-config';
import { databaseEnvSchema } from './schemas/database-config';
import { fakeFetchEnvSchema } from './schemas/fake-fetch-config';
import { queueEnvSchema } from './schemas/queue-config';
import { redisEnvSchema } from './schemas/redis-config';
import { storageEnvSchema } from './schemas/storage-config';

export const validationSchema = Joi.object({
  ...appEnvSchema,
  ...databaseEnvSchema,
  ...fakeFetchEnvSchema,
  ...queueEnvSchema,
  ...redisEnvSchema,
  ...storageEnvSchema,
}).unknown(true);
