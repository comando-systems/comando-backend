/**
 * Explicit transaction boundary. Repositories are created for the duration of
 * the callback and must not be retained after it resolves.
 */
export interface UnitOfWork<TRepositories> {
  run<T>(work: (repositories: TRepositories) => Promise<T>): Promise<T>;
}
