import type { Item } from '@/domain/entity/item';
import type { ItemID } from '@/domain/value-objects/ids';

export interface ItemPageOptions {
  readonly page: number;
  readonly pageSize: number;
  readonly includeRemoved?: boolean;
  // Only items that can be put on an order: not removed and enabled.
  readonly sellableOnly?: boolean;
}

export interface ItemPage {
  readonly items: readonly Item[];
  readonly total: number;
}

export interface CreateItemRecord {
  readonly name: string;
  readonly description: string | null;
  readonly category?: string;
  readonly priceCents: number;
  readonly imageUrl: string | null;
  readonly active?: boolean;
  readonly now: Date;
}

export interface ItemRepository {
  findById(id: ItemID): Promise<Item | null>;
  findSellableByIds(ids: readonly ItemID[]): Promise<readonly Item[]>;
  create(record: CreateItemRecord): Promise<Item>;
  update(item: Item): Promise<void>;
  list(options: ItemPageOptions): Promise<ItemPage>;
}
