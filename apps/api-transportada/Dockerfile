# syntax=docker/dockerfile:1
# Contexto de build é a raiz do monorepo: os workspaces Bun exigem o package.json de todas as apps.
FROM oven/bun:1.3.14-alpine AS manifests
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api-transportada/package.json apps/api-transportada/package.json
COPY apps/cron-transportada/package.json apps/cron-transportada/package.json
COPY apps/frontend-client/package.json apps/frontend-client/package.json
COPY apps/frontend-driver/package.json apps/frontend-driver/package.json
COPY apps/frontend-landing/package.json apps/frontend-landing/package.json
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
# spec 162, RF08: CLI de importação do catálogo coletado — já bundlada por `bun run build`
# (dist/cli/import-package-box-catalog.js, entrypoint próprio em src/cli). Nunca roda no CMD da
# imagem; entra por `railway ssh --service api -- bun apps/api-transportada/dist/cli/import-package-box-catalog.js`.
# As migrations e o runner ficam na imagem: o release do Railway roda `db:migrate` antes do start.
COPY apps/api-transportada/drizzle apps/api-transportada/drizzle
COPY apps/api-transportada/src/database apps/api-transportada/src/database
COPY apps/api-transportada/src/config apps/api-transportada/src/config
# Fechamento transitivo dos schemas Drizzle: company-fiscal-profile.schema.ts (cte-retry.policy e
# nfse-retry.policy), environment-provisioning.repository.ts (authorization.policy) e erros base
# compartilhados.
COPY apps/api-transportada/src/companies/domain apps/api-transportada/src/companies/domain
COPY apps/api-transportada/src/cte-issuance/domain apps/api-transportada/src/cte-issuance/domain
COPY apps/api-transportada/src/nfse-invoices/domain apps/api-transportada/src/nfse-invoices/domain
COPY apps/api-transportada/src/identity/domain apps/api-transportada/src/identity/domain
# environment.schema.ts lê os padrões do teto das rotas anônimas de identidade (spec 191 RF12).
COPY apps/api-transportada/src/identity/shared apps/api-transportada/src/identity/shared
COPY apps/api-transportada/src/whatsapp-commands/domain apps/api-transportada/src/whatsapp-commands/domain
COPY apps/api-transportada/src/cte-profiles/domain apps/api-transportada/src/cte-profiles/domain
# contractor-mail.schema.ts lê o catálogo de tipos de modelo de e-mail (spec 150 T402).
COPY apps/api-transportada/src/contractor-mail/domain apps/api-transportada/src/contractor-mail/domain
COPY apps/api-transportada/src/shared apps/api-transportada/src/shared
# O pre-deploy semeia os templates de notificação: o texto do aviso vem do catálogo em código.
COPY apps/api-transportada/src/notification apps/api-transportada/src/notification
# Spec 286: o script de publicação dos modelos de e-mail (`railway ssh`, ação do operador) roda de dentro da imagem.
COPY apps/api-transportada/src/address-correction/domain apps/api-transportada/src/address-correction/domain
COPY apps/api-transportada/src/address-correction/address-correction-mail-templates apps/api-transportada/src/address-correction/address-correction-mail-templates
COPY apps/api-transportada/src/occurrence-conversation/application apps/api-transportada/src/occurrence-conversation/application
COPY apps/api-transportada/src/occurrence-conversation/domain apps/api-transportada/src/occurrence-conversation/domain
COPY apps/api-transportada/src/occurrence-conversation/occurrence-mail-templates apps/api-transportada/src/occurrence-conversation/occurrence-mail-templates
COPY apps/api-transportada/scripts/occurrence-mail-templates-publish.ts apps/api-transportada/scripts/occurrence-mail-templates-publish.ts
# Spec 286 T8: republicação do grafo raiz do WhatsApp (falas `fala_*` do bot), também via `railway ssh`.
COPY apps/api-transportada/scripts/whatsapp-flow-publish.ts apps/api-transportada/scripts/whatsapp-flow-publish.ts
COPY apps/api-transportada/src/whatsapp-commands/application/publish-whatsapp-flow-graph.use-case.ts apps/api-transportada/src/whatsapp-commands/application/publish-whatsapp-flow-graph.use-case.ts
COPY apps/api-transportada/src/whatsapp-commands/application/whatsapp-flow-graph-publisher.port.ts apps/api-transportada/src/whatsapp-commands/application/whatsapp-flow-graph-publisher.port.ts
COPY apps/api-transportada/src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.ts apps/api-transportada/src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.ts
COPY apps/api-transportada/src/whatsapp-commands/infrastructure/whatsapp-flow-graph-publisher.factory.ts apps/api-transportada/src/whatsapp-commands/infrastructure/whatsapp-flow-graph-publisher.factory.ts
COPY apps/api-transportada/src/whatsapp-commands/infrastructure/drizzle-whatsapp-flow-graph-history.repository.ts apps/api-transportada/src/whatsapp-commands/infrastructure/drizzle-whatsapp-flow-graph-history.repository.ts
# Fechamento transitivo de imports do whatsapp-flow-graph.constant.ts (motivos de devolução do motorista).
COPY apps/api-transportada/src/trips/application/dispatch-trip.use-case.ts apps/api-transportada/src/trips/application/dispatch-trip.use-case.ts
COPY apps/api-transportada/src/trips/application/try-auto-dispatch-trip.use-case.ts apps/api-transportada/src/trips/application/try-auto-dispatch-trip.use-case.ts
COPY apps/api-transportada/src/trips/domain/dispatch-readiness.policy.ts apps/api-transportada/src/trips/domain/dispatch-readiness.policy.ts
COPY apps/api-transportada/src/trips/domain/driver-return-reason.policy.ts apps/api-transportada/src/trips/domain/driver-return-reason.policy.ts
COPY apps/api-transportada/src/trips/domain/event-location-stamp.types.ts apps/api-transportada/src/trips/domain/event-location-stamp.types.ts
COPY apps/api-transportada/src/trips/domain/occurrence-case-state.policy.ts apps/api-transportada/src/trips/domain/occurrence-case-state.policy.ts
COPY apps/api-transportada/src/trips/domain/trip-field-channel.constant.ts apps/api-transportada/src/trips/domain/trip-field-channel.constant.ts
COPY apps/api-transportada/src/trips/domain/trip-report.constant.ts apps/api-transportada/src/trips/domain/trip-report.constant.ts
COPY apps/api-transportada/src/trips/domain/trip-state.policy.ts apps/api-transportada/src/trips/domain/trip-state.policy.ts
COPY apps/api-transportada/src/trips/domain/trip.error.ts apps/api-transportada/src/trips/domain/trip.error.ts

USER transportada
WORKDIR /app/apps/api-transportada
CMD ["bun", "./dist/main.js"]
