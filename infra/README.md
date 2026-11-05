# Infrastructure

Everything Docker-related lives here. Run the commands from the repository root.

```text
infra/
  docker-compose.yml          postgres, migrate, api, nginx
  api/
    Dockerfile                multi-stage Bun image
    Dockerfile.dockerignore   build-context filter (BuildKit reads it next to the Dockerfile)
  database/
    Dockerfile                PostgreSQL image
  nginx/
    nginx.conf                reverse proxy in front of the API
```

## Commands

Copy `.env.example` to `.env` first: Compose reads it with `--env-file .env`.

| Script | What it does |
|---|---|
| `bun run docker:db` | Start only PostgreSQL |
| `bun run docker:migrate` | Apply all pending migrations |
| `bun run docker:up` | Build and start everything (postgres, migrate, api, nginx) |
| `bun run docker:down` | Stop and remove the containers (data volume is kept) |
| `bun run docker:logs` | Follow the logs |
| `bun run docker:build` | Build the API image only |

The scripts wrap `docker compose -f infra/docker-compose.yml --env-file .env`.

## Notes

- The Compose project is named `comando`, so containers and the `postgres_data` volume are the same wherever the file lives.
- The build context is the repository root, so `Dockerfile` paths such as `COPY src` stay unchanged. `infra/api/Dockerfile.dockerignore` decides what is sent to the daemon; keep it small.
- Migrations are applied by the `migrate` service and are never run by the API at startup.
- Run an isolated copy of the stack for checks with `docker compose -p comando-check -f infra/docker-compose.yml --env-file .env up -d`, then `down -v`.
