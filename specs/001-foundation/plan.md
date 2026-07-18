# Plano técnico — Fundação

## Estrutura

```text
apps/api
apps/worker
apps/web
packages/config
packages/database
packages/observability
packages/queue
packages/shared
```

NestJS alimenta API e worker; Next.js alimenta web. Prisma pertence a
`packages/database`. Configuração usa Zod. BullMQ é conectado, mas nenhuma fila
fiscal é criada nesta feature.

## Segurança e dados

Sem dados de produção. Docker usa credenciais locais. Health não retorna URLs,
tokens ou detalhes de exceções.

## Testes

- unidade para parsing de env e correlation ID;
- integração para readiness com Postgres/Redis;
- smoke dos três apps;
- build de produção.

## Rollback

Não há migration de domínio. Remover a fundação equivale a reverter os arquivos
da feature.
