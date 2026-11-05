import { requireActor } from '@/app/authorization';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { requirePage, requirePageSize } from '@/app/validation';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface ListUsersInput {
  readonly actorUserId: UserID;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListUsersResult {
  readonly users: readonly User[];
  readonly total: number;
}

export class ListUsersUseCase {
  constructor(private readonly unitOfWork: UnitOfWork<Repositories>) {}

  async execute(input: ListUsersInput): Promise<ListUsersResult> {
    const page = requirePage(input.page);
    const pageSize = requirePageSize(input.pageSize);

    return this.unitOfWork.read(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'users:manage');
      return repositories.users.list({ page, pageSize });
    });
  }
}
