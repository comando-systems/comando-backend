# Composition root and configuration boundary

This document describes how Comandô wires dependencies and where environment configuration is read.

## Configuration boundary

Environment variables are read and validated in exactly one place: `src/app/config/index.ts` (`loadConfig`).

- `loadConfig(environment = process.env)` parses and validates all environment variables with Zod and returns a frozen `AppConfig`.
- `process.env` is read only by `src/app/config` (via the default argument of `loadConfig`) and by the entry point `src/index.ts` (to forward variables to worker processes and to detect the worker marker).
- Routes, use cases, repositories, and middleware never read `process.env` or build their own configuration. They receive validated values through the container.

## Composition root

`src/app/container/index.ts` is the single composition root. `createContainer(config: AppConfig): AppContainer` is the only place that constructs:

1. Validated configuration (`AppConfig`, from `loadConfig`)
2. Database connections (`createDatabaseConnections`)
3. Repositories (`createRepositories`)
4. Unit of work (`DatabaseUnitOfWork`)
5. Clock, ID generators
6. Password hasher, token service, refresh-token codec
7. All application use cases
8. The HTTP app (via `createApp(container)`)

Routes and middleware receive the container through dependency injection and never instantiate repositories or use cases themselves.

```
src/index.ts (entry point)
  └─ loadConfig()              reads env, validates, returns AppConfig
  └─ createContainer(config)   builds the full object graph
       ├─ config
       ├─ logger (JsonLogger)
       ├─ database (DatabaseConnections)
       ├─ repositories (Repositories)
       ├─ unitOfWork (DatabaseUnitOfWork)
       ├─ clock (systemClock)
       ├─ ids (SequenceIdGenerator)
       ├─ passwordHasher (BunPasswordHasher)
       ├─ tokenService (JwtTokenService)
       ├─ refreshTokenCodec (RandomRefreshTokenCodec)
       └─ useCases (all use cases)
  └─ createApp(container)      wires HTTP routes over the container
```

## Ports

Abstractions live in `src/app/ports/` (`Clock`, `IdGenerator`, `Logger`, `PasswordHasher`, `RefreshTokenCodec`, `TokenService`, `UnitOfWork`) so the container can swap implementations (for example, in tests) without changing the use cases.

## Container type

The `AppContainer` and `IdGenerators` interfaces are defined in `src/app/container/types.ts` and re-exported from `src/app/container/index.ts`. `AppEnv` (Hono request variables) stays in `src/app/http/types.ts` because it is HTTP-specific.

## Shutdown

The container owns resource cleanup through `container.close()`, which closes the database connections. The entry point calls it on `SIGINT`/`SIGTERM` after stopping the HTTP server.

## Tests

Tests use the shared test container helper (`tests/unit/support/container.ts` and `tests/e2e/support/harness.ts`) which builds a container against an isolated test database. No test constructs repositories or infrastructure ad hoc.
