import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

export function applyHash(value: string, salt: number): number {
  return createHash('sha256')
    .update(`${salt}:${value}`)
    .digest()
    .readUInt32BE(0);
}

export async function simulateLatency(baseMs: number): Promise<void> {
  if (baseMs <= 0) return;

  await setTimeout(Math.round(baseMs * (0.5 + Math.random())));
}
