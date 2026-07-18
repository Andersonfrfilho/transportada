# Plano técnico — Migração da fundação Bun

## Contexto e premissas

A feature 001 é baseline histórico. A migração preserva comportamento de
health/smoke, substitui a stack e só remove legado após paridade.

## Arquitetura e arquivos afetados

- raiz: Bun workspaces, `bun.lock`, Makefile e CI;
- `apps/api` → `apps/api-transportada`;
- `apps/worker` → `apps/worker-transportada`;
- `apps/web` → `apps/frontend-transportada`;
- `packages/` local removido após substituição por packages Ada versionados;
- Compose recebe RabbitMQ e deixa Redis fora até existir caso concreto.

Cada app possui `package.json`, `tsconfig`, scripts e configuração próprios.
A raiz não fornece dependência runtime escondida.

## Contratos/API/eventos

- health: `/health/live` e `/health/ready`;
- erro HTTP com código, mensagem segura, correlation ID e detalhes permitidos;
- OpenAPI gerado de schemas Zod;
- envelopes RabbitMQ possuem `eventId`, `type`, `version`, `occurredAt`,
  `companyId`, `correlationId` e payload tipado;
- API usa outbox; publicação e consumo são idempotentes.

## Dados, migration e rollback

Drizzle usa `drizzle-orm/bun-sql`. Drizzle Kit gera SQL versionado e um comando
dedicado aplica migrations; startup não migra. O schema atual é vazio, logo o
baseline não transforma dados. Rollback ocorre por commit e, para packages
Ada, por pin da versão anterior.

## Segurança e tenant

Não há entidade multiempresa nesta feature, mas contratos já reservam contexto
autenticado. `companyId` nunca será aceito livremente quando os módulos forem
criados. Logs mascaram authorization, cookies, PFX, senhas e payload fiscal.

## Idempotência e concorrência

RabbitMQ usa manual ack após commit, prefetch explícito, retries com backoff via
TTL/DLX e DLQ. O worker drena no shutdown. Dois consumidores de versões
incompatíveis não compartilham routing key.

## Observabilidade

Reusar `@adatechnology/logger`. Liveness não consulta dependências; readiness
verifica apenas dependências necessárias ao processo. Métricas de fila e DLQ
entram antes de produção.

## Estratégia de testes

- testes de contrato primeiro;
- `bun test` unitário por app/package;
- integração com PostgreSQL e RabbitMQ reais do Compose;
- smoke HTTP e PWA;
- Playwright nos três breakpoints;
- contract test fiscal no Bun sem emissão real;
- revisão independente OpenCode gratuita e gate Sol.

## Riscos

- compatibilidade Bun do fiscal provider além do import básico;
- TLS permissivo e stdout/stderr no provider fiscal;
- packages Drizzle/RabbitMQ ainda inexistentes no Ada;
- migração big-bang se legado for removido antes da paridade;
- fallback do OpenCode para modelo pago quando o modelo free não é fixado.
