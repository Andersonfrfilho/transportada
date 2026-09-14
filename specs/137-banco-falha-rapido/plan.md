# Spec 137 — Plano

## Desenho

- `src/database/database-client.service.ts` — `createDatabaseProvider({ pool, url })`, com a mesma
  forma do provider (`db`, `healthCheck`, `close`). Monta o `SQL` do Bun com `max`,
  `connectionTimeout`, `prepare: false` e `connection.statement_timeout`, e entrega ao drizzle um
  **cliente guardado**: um `Proxy` que cobre os quatro jeitos com que o drizzle chama o Bun
  (`client(strings, ...params)`, `client.unsafe()`, `.values()`, `begin`/`savepoint` com o cliente
  da transação). Toda consulta corre contra um prazo; estourou, quem espera recebe
  `DatabaseUnavailableError('query_timeout')` e a consulta é cancelada.
- Erro do driver é traduzido: `ERR_POSTGRES_IDLE_TIMEOUT` → `pool_exhausted`, SQLSTATE `57014` →
  `query_timeout`, `ERR_POSTGRES_CONNECTION*`/`ECONNREFUSED` → `connection_failed`.
- `src/shared/request-scope.service.ts` — `AsyncLocalStorage` com o `AbortSignal` do pedido; o
  `request-handler` roda o roteador dentro dele, e o guarda solta a consulta do pedido que foi embora
  (`DatabaseQueryAbortedError` → 499).
- `src/http/response.service.ts` — procura a falha de banco pela cadeia de `cause` (o drizzle embrulha
  em `DrizzleQueryError`) e responde 503 `DATABASE_UNAVAILABLE` com log `database_unavailable`.
- `HealthService` — cada dependência da prontidão tem janela de 2 s (`READINESS_CHECK_TIMEOUT_MS`);
  estourou é `down`, e a rota já transformava `degraded` em 503.

## Env (schema + `.env.example`)

| Variável                           | Padrão | Faixa                                    |
| ---------------------------------- | ------ | ---------------------------------------- |
| `DATABASE_POOL_MAX`                | 10     | 1–100                                    |
| `DATABASE_CONNECT_TIMEOUT_SECONDS` | 5      | 1–30                                     |
| `DATABASE_QUERY_TIMEOUT_MS`        | 8000   | 100–9000 (abaixo dos 10 s da requisição) |

⚠️ Não há variável de "espera por conexão": o `idleTimeout` do Bun, que a documentação descreve
assim, **recusou uma consulta que já tinha conexão e rodava 2,5 s** (medido). A espera por conexão
conta dentro do prazo da consulta.

## Decisões recusadas

- **Prazo único na borda da requisição** (correr o roteador contra um relógio): daria 503 sem saber
  se era banco, e não soltaria nada no pool.
- **Não cancelar nada** ao abortar: medido, deixava a fila de consultas abandonadas rodar inteira;
  com `cancel()` a fila que ainda não saiu é descartada na hora.
