import type { Item } from '@/domain/entity/item';
import type { ItemID } from '@/domain/value-objects/ids';

export interface ItemPageOptions {
  readonly page: number;
  readonly pageSize: number;
  readonly includeRemoved?: boolean;
}

export interface ItemPage {
  readonly items: readonly Item[];
  readonly total: number;
}

export interface ItemRepository {
  findById(id: ItemID): Promise<Item | null>;
  findActiveByIds(ids: readonly ItemID[]): Promise<readonly Item[]>;
  create(item: Item): Promise<void>;
  update(item: Item): Promise<void>;
  list(options: ItemPageOptions): Promise<ItemPage>;
}
