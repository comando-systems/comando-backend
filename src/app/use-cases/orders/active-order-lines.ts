import { NotFoundError } from '@/app/errors';
import type { CounterOrderLine } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import { ItemID } from '@/domain/value-objects/ids';

export interface OrderLineInput {
  readonly itemId: ItemID;
  readonly quantity: number;
}

/**
 * Resolves every requested line against the active catalog so removed items
 * cannot enter a new or updated order.
 */
export async function resolveActiveOrderLines(
  repositories: Repositories,
  lines: readonly OrderLineInput[],
): Promise<readonly CounterOrderLine[]> {
  const uniqueIds = [...new Set(lines.map((line) => line.itemId.value))].map(
    (value) => new ItemID(value),
  );
  const items = await repositories.items.findActiveByIds(uniqueIds);
  const itemsById = new Map(items.map((item) => [item.id.value, item]));

  return lines.map((line) => {
    const item = itemsById.get(line.itemId.value);

    if (item === undefined) {
      throw new NotFoundError(`Item ${line.itemId.value} is not available`);
    }

    return { item, quantity: line.quantity };
  });
}
