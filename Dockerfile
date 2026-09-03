# syntax=docker/dockerfile:1

# 1. builder -- install all deps and build the Nitro server output (.output/)
# The patch release is pinned for reproducibility and visible to Dependabot.
FROM oven/bun:1.4.0-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# 2. prod-deps -- production-only node_modules for the runtime image. These are
# needed by the preDeploy migrator (drizzle-orm, pg, better-auth); Bun
# auto-install in the container does not resolve peer deps reliably, so we copy
# a real install.
FROM oven/bun:1.4.0-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# 3. runner -- standalone Nitro output plus what the migrator needs.
FROM oven/bun:1.4.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000

COPY --chown=bun:bun --from=prod-deps /app/node_modules ./node_modules
COPY --chown=bun:bun --from=builder /app/.output ./.output
COPY --chown=bun:bun --from=builder /app/drizzle ./drizzle
COPY --chown=bun:bun --from=builder /app/src ./src
COPY --chown=bun:bun --from=builder /app/package.json ./package.json
COPY --chown=bun:bun --from=builder /app/tsconfig.json ./tsconfig.json

USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
