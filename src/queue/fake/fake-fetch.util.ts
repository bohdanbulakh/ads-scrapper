import { createHash } from 'node:crypto';

export function applyHash(value: string, salt: number): number {
  return createHash('sha256')
    .update(`${salt}:${value}`)
    .digest()
    .readUInt32BE(0);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateLatency(baseMs: number): Promise<void> {
  if (baseMs <= 0) return;

  await sleep(Math.round(baseMs * (0.5 + Math.random())));
}
