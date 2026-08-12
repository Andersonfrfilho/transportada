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
COPY apps/api-transportada apps/api-transportada
RUN bun run --cwd apps/api-transportada build

FROM manifests AS production-dependencies
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 transportada \
  && adduser --system --uid 1001 --ingroup transportada transportada

# O Bun instala por workspace: as dependências da app ficam no node_modules dela, não na raiz.
COPY --from=production-dependencies /app/node_modules node_modules
COPY --from=production-dependencies /app/apps/api-transportada/node_modules apps/api-transportada/node_modules
COPY --from=build /app/apps/api-transportada/dist apps/api-transportada/dist
COPY apps/api-transportada/package.json apps/api-transportada/package.json
# As migrations e o runner ficam na imagem: o release do Railway roda `db:migrate` antes do start.
COPY apps/api-transportada/drizzle apps/api-transportada/drizzle
COPY apps/api-transportada/src/database apps/api-transportada/src/database
COPY apps/api-transportada/src/config apps/api-transportada/src/config
# Fechamento transitivo dos schemas Drizzle: company-fiscal-profile.schema.ts (cte-retry.policy e
# nfse-retry.policy), environment-provisioning.repository.ts (authorization.policy),
# environment.schema.ts (scheduled-distribution-window.policy) e erros base compartilhados.
COPY apps/api-transportada/src/companies/domain apps/api-transportada/src/companies/domain
COPY apps/api-transportada/src/cte-issuance/domain apps/api-transportada/src/cte-issuance/domain
COPY apps/api-transportada/src/nfse-invoices/domain apps/api-transportada/src/nfse-invoices/domain
COPY apps/api-transportada/src/identity/domain apps/api-transportada/src/identity/domain
COPY apps/api-transportada/src/shared apps/api-transportada/src/shared

USER transportada
WORKDIR /app/apps/api-transportada
CMD ["bun", "./dist/main.js"]
