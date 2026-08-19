import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ExtendedConfigService } from './common/config/extended-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableShutdownHooks();

  const config = app.get<ExtendedConfigService>(ExtendedConfigService);
  app.useLogger(config.get('app.logLevels'));

  await app.listen(config.get('app.port'));
}

bootstrap().catch((error: unknown) => {
  const { message, stack } =
    error instanceof Error
      ? error
      : { message: String(error), stack: undefined };

  Logger.error(`Application failed to start: ${message}`, stack, 'Bootstrap');
  // Exit explicitly: a half-initialised app can be left holding open handles
  // (pg pool, redis sockets) that would otherwise keep the process alive.
  process.exit(1);
});
