FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY src ./src
RUN bun build src/index.ts --target=bun --outdir=dist \
    && bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.4.4-alpine AS runtime
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY scripts ./scripts
COPY src ./src

USER bun
EXPOSE 3000

CMD ["bun", "dist/index.js"]
