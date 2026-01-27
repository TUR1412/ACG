export async function mapWithConcurrency<T, R>(params: {
  items: T[];
  concurrency: number;
  fn: (item: T, index: number) => Promise<R>;
}): Promise<R[]> {
  const { items, fn } = params;
  const concurrency = Math.max(1, Math.floor(params.concurrency || 1));
  if (items.length === 0) return [];

  if (concurrency <= 1 || items.length <= 1) {
    const out: R[] = [];
    for (let i = 0; i < items.length; i += 1) out.push(await fn(items[i], i));
    return out;
  }

  const out: R[] = new Array(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = nextIndex;
      if (i >= items.length) return;
      nextIndex += 1;
      out[i] = await fn(items[i], i);
    }
  });

  await Promise.all(workers);
  return out;
}

export async function pool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const max = Math.max(1, Math.min(concurrency, items.length));
  let index = 0;
  const runners = Array.from({ length: max }, async () => {
    while (true) {
      const i = index;
      index += 1;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}
