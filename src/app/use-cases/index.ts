import type { LoginUseCase } from '@/app/use-cases/auth';
import type { ItemsUseCases } from '@/app/use-cases/items';
import type { OrdersUseCases } from '@/app/use-cases/orders';
import type { SettingsUseCases } from '@/app/use-cases/settings';
import type {
  CreateUserUseCase,
  DeactivateUserUseCase,
  GetUserUseCase,
  ListUsersUseCase,
  UpdateUserUseCase,
} from '@/app/use-cases/users';

export { type LoginInput, type LoginResult, LoginUseCase } from '@/app/use-cases/auth';
export {
  type CreateItemInput,
  CreateItemUseCase,
  type GetItemInput,
  GetItemUseCase,
  type ItemsUseCases,
  type ListItemsInput,
  type ListItemsResult,
  ListItemsUseCase,
  type RemoveItemInput,
  RemoveItemUseCase,
  type UpdateItemInput,
  UpdateItemUseCase,
} from '@/app/use-cases/items';
export {
  type AddOrderItemsInput,
  AddOrderItemsUseCase,
  type CancelOrderInput,
  CancelOrderUseCase,
  type ChangeOrderItemQuantityInput,
  ChangeOrderItemQuantityUseCase,
  type CloseOrderInput,
  CloseOrderUseCase,
  type CreateCounterOrderInput,
  CreateCounterOrderUseCase,
  type GetOrderInput,
  GetOrderUseCase,
  type ListOrdersInput,
  type ListOrdersResult,
  ListOrdersUseCase,
  type OpenTableOrderInput,
  OpenTableOrderUseCase,
  type OrdersUseCases,
  type RemoveOrderItemInput,
  RemoveOrderItemUseCase,
  type ReopenOrderInput,
  ReopenOrderUseCase,
  type RequestOrderPaymentInput,
  RequestOrderPaymentUseCase,
  type SetOrderPricingInput,
  SetOrderPricingUseCase,
} from '@/app/use-cases/orders';
export {
  type GetSettingsInput,
  GetSettingsUseCase,
  type SettingsUseCases,
  type UpdateSettingsInput,
  UpdateSettingsUseCase,
} from '@/app/use-cases/settings';
export {
  type CreateUserInput,
  CreateUserUseCase,
  type DeactivateUserInput,
  DeactivateUserUseCase,
  type GetUserInput,
  GetUserUseCase,
  type ListUsersInput,
  type ListUsersResult,
  ListUsersUseCase,
  type UpdateUserInput,
  UpdateUserUseCase,
} from '@/app/use-cases/users';

export interface UsersUseCases {
  readonly create: CreateUserUseCase;
  readonly update: UpdateUserUseCase;
  readonly deactivate: DeactivateUserUseCase;
  readonly list: ListUsersUseCase;
  readonly get: GetUserUseCase;
}

export interface UseCases {
  readonly login: LoginUseCase;
  readonly users: UsersUseCases;
  readonly items: ItemsUseCases;
  readonly orders: OrdersUseCases;
  readonly settings: SettingsUseCases;
}
