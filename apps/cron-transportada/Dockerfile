# syntax=docker/dockerfile:1
# Contexto de build é a raiz do monorepo: os workspaces Bun exigem o package.json de todas as apps.
FROM oven/bun:1.3.14-alpine AS manifests
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api-transportada/package.json apps/api-transportada/package.json
COPY apps/cron-transportada/package.json apps/cron-transportada/package.json
COPY apps/frontend-transportada/package.json apps/frontend-transportada/package.json
COPY apps/worker-transportada/package.json apps/worker-transportada/package.json

FROM manifests AS build
RUN bun install --frozen-lockfile
COPY apps/cron-transportada apps/cron-transportada
RUN bun run --cwd apps/cron-transportada build

FROM manifests AS production-dependencies
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 transportada \
  && adduser --system --uid 1001 --ingroup transportada transportada

COPY --from=production-dependencies /app/node_modules node_modules
COPY --from=build /app/apps/cron-transportada/dist apps/cron-transportada/dist
COPY apps/cron-transportada/package.json apps/cron-transportada/package.json

USER transportada
WORKDIR /app/apps/cron-transportada
CMD ["bun", "./dist/main.js"]
