/**
 * Remembers list totals for a few seconds. `COUNT(*)` over a table that only grows (orders) costs
 * more with every sale and runs on every page request, while a total that is a moment old does no
 * harm to a pager. Concurrent requests for the same total share one query.
 */
export class CountCache {
  private readonly entries = new Map<
    string,
    { readonly value: Promise<number>; expiresAt: number }
  >();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 500,
  ) {}

  async get(key: string, load: () => Promise<number>): Promise<number> {
    if (this.ttlMs <= 0) {
      return load();
    }

    const cached = this.entries.get(key);
    if (cached !== undefined && cached.expiresAt > this.now()) {
      return cached.value;
    }

    // Keys include user-supplied filters, so the map cannot be allowed to grow without bound.
    if (this.entries.size >= this.maxEntries) {
      this.entries.clear();
    }

    const value = load();
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    // A failed load must not be served again until it expires.
    value.catch(() => this.entries.delete(key));
    return value;
  }
}
