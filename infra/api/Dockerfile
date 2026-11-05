FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY src ./src
RUN bun build src/index.ts --target=bun --outdir=dist \
    && bun install --frozen-lockfile --production

FROM oven/bun:1.4.4-alpine AS runtime
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

USER bun
EXPOSE 3000

CMD ["bun", "dist/index.js"]
