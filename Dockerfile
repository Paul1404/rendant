# syntax=docker/dockerfile:1

# 1. builder -- install all deps and build the Nitro server output (.output/)
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# 2. prod-deps -- production-only node_modules for the runtime image. These are
# needed by the preDeploy migrator (drizzle-orm, pg, better-auth); Bun
# auto-install in the container does not resolve peer deps reliably, so we copy
# a real install.
FROM oven/bun:1 AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# 3. runner -- standalone Nitro output plus what the migrator needs.
FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
