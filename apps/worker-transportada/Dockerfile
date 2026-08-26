# syntax=docker/dockerfile:1
# Contexto de build é a raiz do monorepo: os workspaces Bun exigem o package.json de todas as apps.
FROM oven/bun:1.3.14-alpine AS manifests
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api-transportada/package.json apps/api-transportada/package.json
COPY apps/cron-transportada/package.json apps/cron-transportada/package.json
COPY apps/frontend-landing/package.json apps/frontend-landing/package.json
COPY apps/frontend-transportada/package.json apps/frontend-transportada/package.json
COPY apps/worker-transportada/package.json apps/worker-transportada/package.json

FROM manifests AS build
RUN bun install --frozen-lockfile
COPY apps/worker-transportada apps/worker-transportada
RUN bun run --cwd apps/worker-transportada build

FROM manifests AS production-dependencies
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 transportada \
  && adduser --system --uid 1001 --ingroup transportada transportada

# O Bun instala por workspace: as dependências da app ficam no node_modules dela, não na raiz.
COPY --from=production-dependencies /app/node_modules node_modules
COPY --from=production-dependencies /app/apps/worker-transportada/node_modules apps/worker-transportada/node_modules
COPY --from=build /app/apps/worker-transportada/dist apps/worker-transportada/dist
COPY apps/worker-transportada/package.json apps/worker-transportada/package.json

USER transportada
WORKDIR /app/apps/worker-transportada
# O worker fecha canais e conexão no SIGTERM; o processo precisa ser PID 1 para receber o sinal.
CMD ["bun", "./dist/main.js"]
