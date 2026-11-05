import type { LoginUseCase } from '@/app/use-cases/auth';
import type { ItemsUseCases } from '@/app/use-cases/items';
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
}
