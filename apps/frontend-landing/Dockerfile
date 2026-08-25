# syntax=docker/dockerfile:1
# Contexto de build é a raiz do monorepo: os workspaces Bun exigem o package.json de todas as apps.
FROM oven/bun:1.3.14-alpine AS manifests
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api-transportada/package.json apps/api-transportada/package.json
COPY apps/cron-transportada/package.json apps/cron-transportada/package.json
COPY apps/frontend-transportada/package.json apps/frontend-transportada/package.json
COPY apps/frontend-landing/package.json apps/frontend-landing/package.json
COPY apps/worker-transportada/package.json apps/worker-transportada/package.json

FROM manifests AS build
RUN bun install --frozen-lockfile
COPY apps/frontend-landing apps/frontend-landing
# VITE_* é inlinado no bundle: precisa existir no build, não no runtime. Nada secreto entra aqui.
ARG VITE_API_URL
ARG VITE_APP_ENV
ARG VITE_APP_URL
RUN bun run --cwd apps/frontend-landing build

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app/apps/frontend-landing
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 landing \
  && adduser --system --uid 1001 --ingroup landing landing

COPY --from=build /app/apps/frontend-landing/dist dist
COPY apps/frontend-landing/server.ts server.ts

USER landing
CMD ["bun", "./server.ts"]
