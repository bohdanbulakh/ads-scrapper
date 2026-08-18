/**
 * FNV-1a. Small, fast, and stable across processes, which is the point: the
 * same bundle id or domain has to keep resolving to the same outcome so a
 * seeded run is reproducible and a retry does not land somewhere else.
 */
export function hash32(value: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    // The FNV prime, as the shift/add form that stays inside 32 bits.
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return hash >>> 0;
}

/**
 * One independent draw from `value`. FNV's low bits stay correlated between
 * derivations of a single hash, which showed up as one branch firing an order
 * of magnitude below its share; salting the input instead gives each decision
 * its own stream.
 */
export function draw(value: string, salt: number): number {
  return hash32(`${salt}:${value}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateLatency(baseMs: number): Promise<void> {
  if (baseMs <= 0) return;

  await sleep(Math.round(baseMs * (0.5 + Math.random())));
}
