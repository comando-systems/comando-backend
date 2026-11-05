import type { LoginUseCase } from '@/app/use-cases/auth';
import type {
  CreateUserUseCase,
  DeactivateUserUseCase,
  GetUserUseCase,
  ListUsersUseCase,
  UpdateUserUseCase,
} from '@/app/use-cases/users';

export { type LoginInput, type LoginResult, LoginUseCase } from '@/app/use-cases/auth';
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
}
