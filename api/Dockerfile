FROM oven/bun:1-alpine AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY ./api ./api
COPY ./scripts ./scripts
COPY ./drizzle ./drizzle

RUN bun install --frozen-lockfile && \
    bun build api/index.ts --target=bun --outdir ./out && \
    bun build scripts/migrate.ts --target=bun --outdir ./out && \
    bun build scripts/seed.ts --target=bun --outdir ./out

FROM base AS release
ENV NODE_ENV=production
COPY --from=base /app/out ./out
COPY --from=base /app/drizzle ./drizzle

USER bun

EXPOSE 8080
CMD ["bun", "run", "out/index.js"]
