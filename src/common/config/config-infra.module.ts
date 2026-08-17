import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { configuration } from '@/common/config/configuration';
import { validationSchema } from '@/common/config/env.validation';
import { ExtendedConfigService } from '@/common/config/extended-config.service';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
  ],
  providers: [ExtendedConfigService],
  exports: [ExtendedConfigService],
})
export class ConfigInfraModule {}
