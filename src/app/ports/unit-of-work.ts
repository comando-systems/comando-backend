/**
 * Explicit transaction boundary. Repositories are stable singletons resolved
 * from the container; the active transaction is scoped to the callback.
 */
export interface UnitOfWork<TRepositories> {
  run<T>(work: (repositories: TRepositories) => Promise<T>): Promise<T>;
  read<T>(work: (repositories: TRepositories) => Promise<T>): Promise<T>;
}
