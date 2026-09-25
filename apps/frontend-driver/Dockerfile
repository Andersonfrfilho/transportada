# syntax=docker/dockerfile:1
# Contexto de build é a raiz do monorepo: os workspaces Bun exigem o package.json de todas as apps.
FROM oven/bun:1.3.14-alpine AS manifests
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api-transportada/package.json apps/api-transportada/package.json
COPY apps/cron-transportada/package.json apps/cron-transportada/package.json
COPY apps/frontend-transportada/package.json apps/frontend-transportada/package.json
COPY apps/frontend-client/package.json apps/frontend-client/package.json
COPY apps/frontend-driver/package.json apps/frontend-driver/package.json
COPY apps/frontend-landing/package.json apps/frontend-landing/package.json
COPY apps/worker-transportada/package.json apps/worker-transportada/package.json

FROM manifests AS build
RUN bun install --frozen-lockfile
COPY apps/frontend-driver apps/frontend-driver
# VITE_* é inlinado no bundle: precisa existir no build, não no runtime. Nada secreto entra aqui, e o
# bypass de fumaça nunca (ADR-0075 §7).
ARG VITE_API_URL
ARG VITE_APP_ENV
ARG VITE_DRIVER_APP_URL
ARG VITE_IDENTIFIER_FIRST_LOGIN
ARG VITE_KEYCLOAK_CLIENT_ID
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_URL
ARG VITE_OBJECT_STORAGE_URL
# O `build` roda o `vite build` e o `dist.contract.test.ts`: o orçamento de precache reprova a imagem.
RUN bun run --cwd apps/frontend-driver build

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app/apps/frontend-driver
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 transportada \
  && adduser --system --uid 1001 --ingroup transportada transportada

COPY --from=build /app/apps/frontend-driver/dist dist
COPY apps/frontend-driver/server.ts server.ts

USER transportada
CMD ["bun", "./server.ts"]
