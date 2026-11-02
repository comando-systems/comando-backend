FROM oven/bun:1.4.4-alpine AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile
COPY src ./src
RUN bun build src/index.ts --target=bun --outdir=dist

FROM oven/bun:1.4.4-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER bun
EXPOSE 3000
CMD ["bun", "dist/index.js"]
