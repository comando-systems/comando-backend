# comando-backend

To install dependencies:

```bash
bun install
```

To run locally:

```bash
bun run dev
```

## Infra (Docker)

Serviços: `nginx` (única porta publicada), `app` (API Bun) e `postgres`
(volume nomeado `postgres-data`). API e banco ficam acessíveis apenas na rede
interna `backend`.

```bash
cp .env.example .env   # preencha DB_USER, DB_PASS, etc.
docker compose up -d --build
```

O `Dockerfile` compila a API com `bun build` (target `bun`) e a imagem final
roda apenas o bundle gerado em `out/`.

Por padrão o nginx responde na porta 80 do host. Para usar outra porta, defina
`HTTP_PORT` no `.env` (ex.: `HTTP_PORT=8080`).

To type check:

```bash
bun check
```

Run `bun fmt` to format the code.

This project was created using `bun init` in bun v1.4.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
