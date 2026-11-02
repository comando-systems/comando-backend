import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Repositories } from '@/domain/repository';
import type { DatabaseConnections } from '@/infrastructure/database/connections';

export class DatabaseUnitOfWork implements UnitOfWork<Repositories> {
  constructor(
    private readonly database: DatabaseConnections,
    private readonly repositories: () => Repositories,
  ) {}

  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
    return this.database.transaction(() => work(this.repositories()));
  }

  read<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
    return this.database.readOnly(() => work(this.repositories()));
  }
}
