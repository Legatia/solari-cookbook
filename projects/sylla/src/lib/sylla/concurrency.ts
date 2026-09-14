/**
 * Doing several things at once, but never everything at once.
 *
 * The sweep shares a provider's concurrency limit with the people actually
 * using Sylla. Running a whole batch in parallel would spend the entire
 * allowance on background work and hand a live participant a 503 while their
 * agent tried to open a browser in front of them — so background work takes a
 * fraction of the pool and leaves the rest for whoever is awake.
 */
export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  run: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const bounded = Math.max(1, Math.floor(limit));
  if (items.length <= 1 || bounded === 1) {
    const results: Result[] = [];
    for (const item of items) results.push(await run(item));
    return results;
  }

  const results = new Array<Result>(items.length);
  let next = 0;
  // Each worker pulls the next index rather than taking a fixed slice, so one
  // slow item cannot leave the other workers idle behind it.
  const workers = Array.from({ length: Math.min(bounded, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * How much of the provider's concurrency background work may take.
 *
 * Deliberately a setting rather than a constant tied to a plan: the number that
 * is right here changes the day the plan does, and a value baked into the code
 * is one nobody remembers to revisit.
 */
export function sweepConcurrency(variable: string, fallback: number) {
  const configured = Number.parseInt(process.env[variable] ?? "", 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(16, configured)
    : fallback;
}
