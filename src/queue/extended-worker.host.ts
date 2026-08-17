import { WorkerHost } from '@nestjs/bullmq';
import { OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';

export abstract class ExtendedWorkerHost
  extends WorkerHost
  implements OnModuleDestroy
{
  private shuttingDown = false;

  protected get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    const worker = (this as unknown as { _worker?: Worker })._worker;
    await worker?.close();
  }
}
