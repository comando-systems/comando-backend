# Composition root and configuration boundary

This document describes how Comandô wires dependencies and where environment configuration is read.

## Configuration boundary

Environment variables are read and validated in exactly one place: `src/app/config/index.ts` (`loadConfig`).

- `loadConfig(environment = process.env)` parses and validates all environment variables with Zod and returns a frozen `AppConfig`.
- `process.env` is read only by `src/app/config`. The entry point calls `loadConfig()` and `workerEnvironment()`, both of which read `process.env` through their default argument inside the config module.
- Routes, use cases, repositories, and middleware never read `process.env` or build their own configuration. They receive validated values through the container.

## Composition root

`src/app/container/index.ts` is the single composition root. `createContainer(environment?: EnvironmentSource): AppContainer` validates configuration with `loadConfig` and is the only place that constructs:

1. Validated configuration (`AppConfig`)
2. Database connections (`createDatabaseConnections`)
3. Repositories (`createRepositories`)
4. Unit of work (`DatabaseUnitOfWork`)
5. Clock, ID generators
6. Password hasher, token service, refresh-token codec
7. All application use cases
8. The HTTP app (via `createApp(container)`)

Callers pass an environment source only when they intentionally construct configuration, such as tests and scripts. Invalid configuration fails before any database connection is opened.

Routes and middleware receive the container through dependency injection and never instantiate repositories or use cases themselves.

```
src/index.ts (entry point)
  └─ loadConfig()              reads env, validates, returns AppConfig
  └─ createContainer()         validates env and builds the full object graph
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

Tests share `tests/support/container.ts`: `testEnvironment` provides the common defaults and `createTestContainer` builds a container-shaped double over fake infrastructure. The e2e harness uses `testEnvironment` with the real test database. No test constructs repositories or infrastructure ad hoc.
