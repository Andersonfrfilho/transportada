# Spec 137 — Evidência

Postgres de desenvolvimento (porta 55432), Bun 1.3.14, macOS arm64. Scripts de medição no scratchpad
da sessão; nenhuma escrita no banco (só `select`, `pg_sleep` e `show`).

## Reprodução (pool padrão do Bun: `max` 10, `prepare: true`)

| Carga                                                                              | Resultado                                                                                                                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 prévia, 345 notas                                                                | 51 ms, pool saudável                                                                                                                                     |
| 5 ondas × 30 prévias (`readCargoPreviewContext`), metade abandonada, 100 ms de CPU | onda 1 em diante: lote pendurado 30 s; `healthCheck` sem resposta a partir da onda 2; 8 conexões **ociosas** no servidor; `ERR_POSTGRES_INVALID_MESSAGE` |
| 30 prévias, sem CPU, sem abandono                                                  | lote pendurado 30 s (a concorrência sozinha basta)                                                                                                       |
| cada leitura sozinha × 30                                                          | `occupancy`, `weight`, `addresses`, `numbers`: todas terminam (56–286 ms)                                                                                |
| cada leitura sozinha × 150                                                         | só `occupancy` pendura; as outras terminam (198–357 ms)                                                                                                  |
| `occupancy` × 35 / 40 / 50 / 80                                                    | pendura / termina / pendura / pendura — corrida, não limiar                                                                                              |
| Bun SQL cru, 150 × 2000 linhas, pool 10 e 50                                       | termina (366 / 765 ms)                                                                                                                                   |

## A causa: instruções preparadas

| `occupancy`            | `prepare: true` | `prepare: false`             |
| ---------------------- | --------------- | ---------------------------- |
| × 35                   | pendurou 3 de 3 | terminou 3 de 3 (197–232 ms) |
| × 50                   | —               | terminou 3 de 3 (232–250 ms) |
| × 150                  | pendurou        | terminou 3 de 3 (618–745 ms) |
| 4 leituras juntas × 30 | pendurou        | terminou 3 de 3 (240–269 ms) |

Pelo provider novo (`createDatabaseProvider`): `occupancy` × 35 em 181–199 ms e × 150 em 701–812 ms,
3 de 3 cada, zero rejeição, `healthCheck` ok depois.

## O Bun, medido

- `idleTimeout: 1` com pool de 1 ocupado: a consulta que espera é recusada em 1003 ms
  (`ERR_POSTGRES_IDLE_TIMEOUT`) — **mas** uma consulta que já tinha conexão e rodava 2,5 s também foi
  recusada, em 2577 ms. Não serve de prazo de espera; fica no padrão.
- `cancel()` na consulta da fila: recusa na hora (`ERR_POSTGRES_QUERY_CANCELLED`), pool ok.
- `cancel()` na consulta em execução: **não** interrompe — ela terminou normalmente 4,8 s depois.
- `connection: { statement_timeout: '700' }`: `pg_sleep(3)` cortado em 704 ms (SQLSTATE 57014), a
  conexão responde a seguinte.
- Abortos com pool de 1 (vinte `pg_sleep(0.2)`): com nada rodando e `cancel()`, a próxima responde em
  18 ms; com uma já rodando, as da fila já tinham ido para o servidor e rodam mesmo assim — a conexão
  volta aos ~5,8 s, com e sem `cancel()`. Não é conexão presa: é fila, limitada pelo prazo por consulta.
- Transação que consulta o pool de fora (pool de 3, três transações): deadlock para sempre. Nenhuma
  transação do código faz isso (varredura por `this.database` dentro de `.transaction(`).
- `pg_terminate_backend` numa conexão ociosa derruba o processo do Bun SQL cru com
  `ERR_POSTGRES_CONNECTION_CLOSED` não tratado — fora de escopo, registrado na spec.

## Instâncias próprias da API (do worktree)

- `APP_PORT=53091`, banco de desenvolvimento: `/health/live` 200 em 7,6 ms, `/health/ready` 200 em 80 ms.
- `APP_PORT=53092`, `DATABASE_URL` numa porta fechada: `/health/live` 200 em 4 ms, `/health/ready` **503
  em 64 ms e 9 ms**, com `database: down`. Ambas encerradas.

## Contratos

- `bun test ./test/database-availability.contract.test.ts` — 4 pass (porta silenciosa → `query_timeout`
  dentro do prazo; porta fechada → falha de banco classificada; rota autenticada → 503
  `DATABASE_UNAVAILABLE` + log `database_unavailable`; `/health/ready` → 503 dentro da janela).
- `API_TEST_DATABASE_URL=… bun test ./test/integration/database-availability.integration.ts` — 4 pass,
  3 de 3 rodadas (prazo cortado pelo servidor e conexão reaproveitada; pool preso responde no prazo;
  vinte pedidos que já tinham ido embora não chegam ao banco; vinte abortos com uma rodando e a
  conexão volta).
- `bunx tsc --noEmit -p apps/api-transportada` — limpo.

## Gate

`make check` na raiz do worktree, em primeiro plano — **exit 0** (format:check, lint, typecheck, test,
build). Testes: API 5064 (5041 pass, 0 fail), worker 974 pass, cron 94 pass, frontend 3309 pass,
portal do contratante 18 pass, landing 107 pass. A integração nova roda na lista `test:integration`
(fora do `make check`); contra o Postgres de desenvolvimento, 4 pass em 3 de 3 rodadas.
