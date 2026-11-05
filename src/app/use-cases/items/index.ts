import type { CreateItemUseCase } from '@/app/use-cases/items/create-item';
import type { GetItemUseCase } from '@/app/use-cases/items/get-item';
import type { ListItemsUseCase } from '@/app/use-cases/items/list-items';
import type { RemoveItemUseCase } from '@/app/use-cases/items/remove-item';
import type { UpdateItemUseCase } from '@/app/use-cases/items/update-item';

export {
  type CreateItemInput,
  CreateItemUseCase,
} from '@/app/use-cases/items/create-item';
export { type GetItemInput, GetItemUseCase } from '@/app/use-cases/items/get-item';
export {
  type ListItemsInput,
  type ListItemsResult,
  ListItemsUseCase,
} from '@/app/use-cases/items/list-items';
export { type RemoveItemInput, RemoveItemUseCase } from '@/app/use-cases/items/remove-item';
export { type UpdateItemInput, UpdateItemUseCase } from '@/app/use-cases/items/update-item';

export interface ItemsUseCases {
  readonly create: CreateItemUseCase;
  readonly update: UpdateItemUseCase;
  readonly remove: RemoveItemUseCase;
  readonly list: ListItemsUseCase;
  readonly get: GetItemUseCase;
}
