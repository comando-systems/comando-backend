FROM oven/bun:1-alpine AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY src ./src
RUN bun install --frozen-lockfile && \
    bun build src/index.ts --target=bun --outdir ./out

FROM base AS release
ENV NODE_ENV=production
COPY --from=base /app/out ./out

USER bun

EXPOSE 8080
CMD ["bun", "run", "out/index.js"]
