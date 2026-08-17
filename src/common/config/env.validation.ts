import * as Joi from 'joi';

import { appEnvSchema } from '@/common/config/schemas/app-config';
import { databaseEnvSchema } from '@/common/config/schemas/database-config';
import { redisEnvSchema } from '@/common/config/schemas/redis-config';

export const validationSchema = Joi.object({
  ...appEnvSchema,
  ...databaseEnvSchema,
  ...redisEnvSchema,
}).unknown(true);
