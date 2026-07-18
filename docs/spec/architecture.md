# Arquitetura recomendada

## Decisão

Monólito modular em monorepo, implantado como três serviços. Evita o custo
operacional de microsserviços no MVP sem misturar processos HTTP, jobs e UI.

```mermaid
flowchart LR
  U[Usuário] --> W[Next.js web]
  W --> A[NestJS API]
  A --> P[(PostgreSQL)]
  A --> R[(Redis / BullMQ)]
  R --> K[NestJS worker]
  K --> P
  A --> S[(S3 storage)]
  K --> S
  K --> F[Ada fiscal gateway]
  F --> X[SEFAZ]
  A --> E[SSE de progresso]
  E --> W
```

## Tecnologias

| Área | Escolha | Motivo | Alternativa/risco |
| --- | --- | --- | --- |
| Runtime | Node.js LTS + TypeScript | ecossistema do pacote Ada | Bun após compatibilidade comprovada |
| Monorepo | pnpm + Turborepo | cache e workspaces simples | Nx, mais governança |
| API/worker | NestJS | módulos, DI, OpenAPI e workers | Fastify puro, menos estrutura |
| Web | Next.js + React | painel produtivo e SSR opcional | Vite SPA |
| UI | Tailwind + shadcn/ui | acessível e customizável | MUI |
| Banco | PostgreSQL | transações, constraints, JSONB | nenhum substituto recomendado |
| ORM | Prisma | migrations e tipos | Drizzle |
| Fila | BullMQ + Redis | retry, backoff e concorrência | pg-boss |
| Storage | S3 interface | Railway bucket e MinIO local | volume, não recomendado |
| Auth | Keycloak/OIDC via adapter | RBAC e multiempresa | Auth.js + IdP |
| Validação | Zod nos contratos; DTO pipes | contratos compartilháveis | class-validator |
| API docs | OpenAPI 3.1 | contrato e geração de cliente | tRPC, acoplamento maior |
| Logs/traces | Pino + OpenTelemetry | correlação e baixo overhead | Winston |
| Testes | Vitest, Testcontainers, Playwright | pirâmide completa | Jest |
| Deploy | Railway | ambientes e serviços gerenciados | Kubernetes, prematuro |

## Limites modulares

`identity`, `companies`, `nfe-imports`, `nfe-documents`, `freight`,
`cte-batches`, `cte-documents`, `billing`, `processing`, `storage`, `audit`.
Módulos comunicam por casos de uso e eventos internos, nunca acessando tabelas
alheias diretamente.

## Fluxos principais

```mermaid
sequenceDiagram
  actor U
  participant API
  participant Q as Queue
  participant W as Worker
  participant DB
  participant S as Storage
  U->>API: upload XML/ZIP
  API->>S: armazena arquivo original
  API->>DB: cria import + items
  API->>Q: nfe-import(importId)
  API-->>U: 202 + processingJobId
  Q->>W: item
  W->>W: valida XML/CNPJ/hash
  W->>DB: upsert UNIQUE(companyId, accessKey)
  W->>DB: resultado isolado por item
```

```mermaid
sequenceDiagram
  actor U
  participant API
  participant DB
  participant Q
  participant W
  participant F as Fiscal gateway
  U->>API: aprovar e emitir lote
  API->>DB: lock + snapshot + idempotency keys
  API->>Q: um job por item
  API-->>U: 202
  Q->>W: emitir CT-e
  W->>DB: reserva número transacional
  W->>F: issue(adapter input)
  F-->>W: resultado tipado
  W->>DB: tentativa + XML/protocolo/status
```

```mermaid
flowchart LR
  A[CT-e AUTHORIZED e não faturado] --> B[seleção]
  B --> C{transação}
  C --> D[cria fatura]
  C --> E[vincula itens com constraint]
  D --> F[gera PDF assíncrono]
  E --> F
```

SSE será usado para progresso, com polling controlado como fallback.
