# Evidências — 239

> Vazio até a primeira task. Cada task registra aqui o comando, o resultado (contagem de pass/fail), a
> mutação que provou o teste e o SHA do commit isolado.

## T1.1 — Política da carência e limites do prazo

**Arquivos:** `apps/api-transportada/src/companies/domain/location-retention.policy.ts` (função pura
`resolvePurgeEffectiveAt`, `isValidRetentionDays`; relógio por parâmetro `now`),
`apps/api-transportada/test/companies/location-retention-policy.contract.ts` (importado por
`test/companies.contract.test.ts`, que já está na lista do `package.json`).

**Regra implementada (`resolvePurgeEffectiveAt({ previous, next, now })`):**

| Caso                                                | `purge_effective_at`                               |
| --------------------------------------------------- | -------------------------------------------------- |
| `next.purgeEnabled = false` (qualquer anterior)     | `now` (sem carência; desligado não lê o campo)     |
| ligar sem linha ou de desligado                     | `now + 24 h`                                       |
| ligado e `next.retentionDays < previous` (encurtar) | `now + 24 h` (reabre, mesmo com carência em curso) |
| ligado e prazo maior ou igual (alongar / igual)     | mantém `previous.purgeEffectiveAt`                 |

Desvio consciente da letra do D5 ("alongar grava sem carência"): gravar `now` ao alongar durante uma
carência em curso (ligar e alongar em seguida) anularia os 24 h do ligar. Manter o valor anterior é
idêntico ao `now` quando a carência já passou (o worker compara `<= now`) e preserva a que ainda corre.
**Decisão a confirmar com o usuário.** Limites: `isValidRetentionDays` aceita só número inteiro 30..90.

**Execução:** `bun --env-file=../../.env.test test ./test/companies.contract.test.ts --test-name-pattern retention`
-> 33 pass / 0 fail (14 linhas da tabela de carência + 16 de limites + 3 de guarda: tabela não vazia x2 e
relógio). 33 = 1+14+1+1+16: todas as linhas rodam.

**Mutações** (edita, roda, reprova, restaura regravando):

| Mutação                                        | Resultado                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| M1 desligar abre carência                      | 4 fail                                                                                |
| M2 ligar sem linha sem carência                | 2 fail                                                                                |
| M3 ligar de desligado sem carência             | 2 fail                                                                                |
| M4 encurtar sem carência                       | 3 fail                                                                                |
| M5 igual abre carência (`<=`)                  | 2 fail                                                                                |
| M6 alongar abre carência (`!==`)               | 2 fail                                                                                |
| M7 alongar devolve `now`                       | 4 fail                                                                                |
| M8 carência de 23 h                            | 7 fail                                                                                |
| M9 piso 29 / M10 teto 91                       | 1 fail cada                                                                           |
| M11 piso exclusivo / M12 teto exclusivo        | 1 fail cada                                                                           |
| M13 aceita decimal (remove `Number.isInteger`) | 2 fail                                                                                |
| M14 aceita `string` no `typeof`                | 0 fail (equivalente: `Number.isInteger('60')` já recusa; M13+M14 juntas não testadas) |

**Gates (apps/api-transportada):** `bun run typecheck` sem saída de erro; `bun run lint` sem saída de
erro; `bun --env-file=../../.env.test test --timeout 120000` -> 9213 pass / 24 skip / 0 fail, 195 arquivos.

## T1.2 — Tabela da configuração e índices por empresa (migration aditiva)

**Autorização:** usuário, em chat, 2026-10-03 — migration aditiva com a tabela nova e os cinco índices;
não vai a staging sem outro ok.

**Pasta:** `apps/api-transportada/drizzle/20261003190847_location_retention_settings/` (gerada por
`db:generate`, depois comentada à mão). `snapshot.json` id `1c4bf6ed-1a95-4bc3-a000-023d9dd56cea`,
`prevIds = ["eb960c28-e0b7-4bec-b4b7-ebd5278db0af"]` = id do snapshot de
`20261003010806_event_location_whatsapp_coordinate`, a última de `origin/staging` (branch 0 atrás no
`git fetch` desta task). Sem bifurcação.

**Tabela** `company_location_retention_settings` (`src/database/company-location-retention-settings.schema.ts`,
molde da diária): `company_id` PK + FK `companies` restrict/cascade com nome explícito
`company_location_retention_settings_company_id_companies_id_fk` (o gerado passava de 63 caracteres
e o drizzle o trocava por hash); `purge_enabled boolean not null default false`;
`retention_days integer not null default 90` com `CHECK (retention_days between 30 and 90)` (limites
vindos de `location-retention.policy.ts`); `purge_effective_at timestamptz` anulável sem default;
`updated_by_user_id uuid not null` sem FK (D1); `created_at`/`updated_at` timestamptz not null default
now(). Sem ENUM.

Acréscimo ao D1: `CHECK (not purge_enabled or purge_effective_at is not null)` — ligado sem data seria a
tela dizendo "ligado" com o worker ignorando a empresa para sempre (`<= $now` com NULL é falso). É
compatível com a regra da T1.1: ligar e encurtar gravam `now + 24 h`, alongar/repetir mantém o
`previous.purgeEffectiveAt` de uma linha já ligada (portanto não nulo), desligar grava `now`.

**Índices:** os cinco **novos**, todos parciais `WHERE latitude is not null`, com a coluna de tempo
que o worker usa em cada tabela (`drizzle-trip-location.repository.ts`):

| Tabela                      | Índice novo                                                | Colunas                     |
| --------------------------- | ---------------------------------------------------------- | --------------------------- |
| `trip_stop_events`          | `trip_stop_events_company_located_created_at_idx`          | `(company_id, created_at)`  |
| `trip_delivery_proofs`      | `trip_delivery_proofs_company_located_created_at_idx`      | `(company_id, created_at)`  |
| `trip_status_events`        | `trip_status_events_company_located_recorded_at_idx`       | `(company_id, recorded_at)` |
| `trip_stop_occurrences`     | `trip_stop_occurrences_company_located_created_at_idx`     | `(company_id, created_at)`  |
| `trip_document_occurrences` | `trip_document_occurrences_company_located_created_at_idx` | `(company_id, created_at)`  |

Nenhum omitido: a frase do D1 ("só duas têm índice parcial") ficou velha — desde a
`20261002153258_occurrence_location_stamp` as **cinco** têm índice parcial, mas **só por tempo**
(`<tabela>_located_<tempo>_idx`); nenhuma tem `company_id` na frente, então nenhum novo duplica um
existente. Os cinco só por tempo **ficam**: a rotina de hoje varre só por data até a T2.2, e um
índice com `company_id` na frente não serve a ela. Depois da T2.2, os só-por-tempo viram candidatos a
`DROP` numa migration futura (medir com `EXPLAIN` antes). Construtor: `buildEventLocationCompanyIndex`
em `event-location.schema.ts`, usado nas cinco tabelas de `trip.schema.ts`.

**Lock:** `SET LOCAL lock_timeout = '3s'` no topo e `SET LOCAL lock_timeout = DEFAULT` no fim; o
cabeçalho do `migration.sql` registra o lock real — `CREATE INDEX` comum toma SHARE (escrita espera,
leitura segue) nas cinco tabelas de evento até o COMMIT, porque a pasta roda numa transação só e
`CONCURRENTLY` é impossível; a FK toma SHARE ROW EXCLUSIVE em `companies`. **Aplicar fora do horário de
campo**, medindo o tamanho das cinco tabelas em staging antes. O `rollback.sql` também limita a espera.

**Rollback:** recusa com `RAISE EXCEPTION 'Rollback recusado: ... tem % linha(s)'` antes de tocar em
qualquer coisa; sem linha, tira os cinco índices novos (os só por tempo ficam), a tabela e a entrada do
journal (`deleted_migrations <> 1` aborta).

**Testes:**

- `test/database-migration/static-migration.contract.ts`: pasta nova na lista exaustiva; teste que
  prende a criação aditiva (texto da tabela, defaults, os dois CHECKs, a FK, os cinco `CREATE INDEX`
  exatos e contagem = 5, sem `CONCURRENTLY`, rollback com recusa antes de todo `DROP`, sem `DELETE` da
  tabela, journal); teste do `lock_timeout` na migration e no rollback (posição medida só sobre os
  comandos, sem os comentários).
- `test/trip-schema/location-retention-settings.contract.ts` (importado por
  `test/trip-schema.contract.test.ts`): colunas e obrigatórias, tipos, defaults, data anulável sem
  default, os dois CHECKs, FK única (autor sem FK), índice por empresa nas cinco tabelas (laço com
  `toHaveLength(5)`) e o só-por-tempo ao lado.
- `test/database-migration/location-retention-rollback.assertion.ts`, chamada por
  `database-migration.integration.ts` contra Postgres: 29 e 91 recusados (23514), ligado sem data
  recusado (23514), empresa inexistente (23503), defaults `false/90/null`, PK (23505); rollback com
  linha recusa (conexão reservada, `ROLLBACK` na mesma, liberada em `finally`) e mantém tabela, linha,
  índices e journal; sem linha desfaz tabela e os cinco índices, mantém os cinco só por tempo e sai do
  journal; `runDatabaseMigrations` reaplica limpo. `support.ts`: tabela em `TRIP_TABLES`.

**Mutações** (`mutate.py` no scratchpad: edita, roda, reprova, restaura regravando o original;
`DRIZZLE_TEST_DATABASE_URL` = `DATABASE_URL` do `.env.test`):

| Mutação                                            | Resultado                                |
| -------------------------------------------------- | ---------------------------------------- |
| M1 migration sem `lock_timeout`                    | 1 fail (lock)                            |
| M2 CHECK `between 29 and 90` no SQL                | 2 fail (estático + integração)           |
| M3 sem o índice de `trip_status_events` no SQL     | 2 fail (estático + integração)           |
| M4 CHECK de carência fora do SQL                   | 2 fail (estático + integração)           |
| M5 rollback recusa só com `> 1` linha              | 1 fail (integração, 2,5 s — sem travar)  |
| M6 rollback com `RAISE NOTICE` no lugar da exceção | 1 fail (integração)                      |
| M7 rollback esquece um `DROP INDEX`                | 2 fail (estático + integração)           |
| M8 rollback derruba também um índice só por tempo  | 1 fail (integração: `TIME_ONLY_INDEXES`) |
| M9 rollback sem `lock_timeout`                     | 1 fail (lock)                            |
| M10 schema: padrão 60 dias                         | 1 fail                                   |
| M11 schema: `purge_enabled` padrão `true`          | 1 fail                                   |
| M12 schema: sem CHECK de carência                  | 1 fail                                   |
| M13 schema: `purge_effective_at` NOT NULL          | 2 fail                                   |
| M14 schema: FK no autor                            | 1 fail                                   |
| M15 construtor: índice só por tempo                | 1 fail                                   |
| M16 construtor: sem predicado parcial              | 1 fail                                   |

M5/M6 travavam 30 s na primeira versão (a conexão reservada não voltava ao pool quando o script
passava); corrigido com `finally`, e as duas reprovam em ~2,5 s.

**Gates (apps/api-transportada, primeiro plano):**

- `bun run db:generate --name x` -> `{"status":"no_changes","dialect":"postgresql"}` (nenhuma pasta gerada).
- `bun run typecheck` -> sem saída de erro. `bun run lint` -> sem saída de erro.
- `bun --env-file=../../.env.test test --timeout 120000` -> 9223 pass / 24 skip / 0 fail, 195 arquivos.
- `DRIZZLE_TEST_DATABASE_URL=<DATABASE_URL do .env.test> bun run db:test` -> 121 pass / 0 fail, 8 arquivos
  (Postgres 65432 aceitando conexões).
- Raiz: `bun run format:check` -> "All matched files use Prettier code style!".
- Worker: `bun test ./test/trip-location-purge/schema-parity.contract.ts ./test/trip-location-purge/stamped-tables.contract.ts` -> 10 pass / 0 fail.

**Não verificado:** `make migration-test` (ele faz `postgres-up` no compose e lê `.env` — infra
compartilhada com outras sessões; no lugar rodou o mesmo `db:test` que ele chama, contra o Postgres do
`.env.test`). `test:integration` da API (a task não toca `test/integration/**`). Tempo real do
`CREATE INDEX` em produção/staging (tamanho das tabelas não medido).

## T1.3 — Contrato HTTP antes (vermelho registrado)

`test/companies/location-retention-settings.contract.ts` (entrypoint `test/companies.contract.test.ts`),
commit `5b970a406`, escrito **antes** de qualquer arquivo de `src/`. Saída literal do vermelho:

```text
bun test v1.3.14 (0d9b296a)
test/companies.contract.test.ts:
# Unhandled error between tests
error: Cannot find module '../../src/companies/application/location-retention-settings.use-case.js' ...
 0 pass
 1 fail
 1 error
```

## T1.4 — Repositório, use cases, rotas e integração

**Rotas** (todas `settings.manage`, escopo `company`; `companyId` só de `context.scope`):

| Método | Caminho                                                       | Resposta                                                                             |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/company-settings/location-retention`                        | `200 { data: { purgeEnabled, retentionDays, purgeEffectiveAt, origin, updatedAt } }` |
| PUT    | `/company-settings/location-retention`                        | `200`, mesmo formato; corpo `{ purgeEnabled, retentionDays }` `.strict()`            |
| DELETE | `/company-settings/location-retention`                        | `204`, idempotente                                                                   |
| GET    | `/company-settings/location-retention/impact?retentionDays=N` | `200 { data: { byTable: [{ kind, count, capped }] } }`                               |

Sem rate limit por rota: nenhuma rota de `company-settings` declara `rateLimit` (a convenção de
`test/rate-limited-routes.contract.test.ts` cobre só rotas de e-mail e anônimas).

**Decisões de implementação:** a carência é calculada **dentro** da transação, sobre a linha lida com
`FOR UPDATE` (a política pura `resolvePurgeEffectiveAt` não muda). `metadata.affectedEstimate` é recontado
no servidor ao ligar (o corpo do `PUT` é `.strict()` e não traz número do cliente). A contagem de impacto
mora em arquivo próprio (`drizzle-location-retention-impact.query.ts`) porque o contrato
`event-location-readers` proíbe `select()`/`returning()` crus em arquivo que toca as cinco tabelas.

**Mutações (contrato unitário, `test/companies.contract.test.ts`):**

| Mutação                                         | Resultado |
| ----------------------------------------------- | --------- |
| M1 schema sem `.strict()`                       | 2 fail    |
| M2 piso do prazo 29                             | 2 fail    |
| M3 padrão sem linha com 60 dias                 | 2 fail    |
| M4 permissão `settings.read` nas rotas          | 1 fail    |
| M5 `impact` com empresa fixa em vez do contexto | 2 fail    |
| M6 IP lido de `x-forwarded-for` cru             | 2 fail    |
| M7 `impact` espalha a entrada do repositório    | 1 fail    |
| M8 `GET`/`PUT` espalham o objeto do repositório | 1 fail    |
| M9 estimativa calculada também ao desligar      | 1 fail    |
| M10 teto `>=` em vez de `>`                     | 1 fail    |
| M11 query de impacto aceita chave desconhecida  | 1 fail    |
| M12 `DELETE` responde 200                       | 2 fail    |
| M13 contagem sem `LIMIT cap+1`                  | 1 fail    |
| M14 auditoria fora da transação (fonte)         | 1 fail    |
| M15 `PUT` com empresa que não é a do contexto   | 3 fail    |

**Mutações (integração Postgres, `test/integration/location-retention-settings.integration.ts`):**

| Mutação                                              | Resultado                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| I1 `previous` sempre nulo (carência sempre reaberta) | 1 fail                                                                                                               |
| I2 auditoria fora da transação                       | **sobreviveu** à falha no audit (a exceção desfaz tudo igual); morta pelo teste novo "falha depois do audit": 1 fail |
| I3 contagem sem filtro de empresa                    | 1 fail                                                                                                               |
| I4 `DELETE` sem auditoria                            | 2 fail                                                                                                               |
| I5 auditoria sem IP                                  | 2 fail                                                                                                               |
| I6 `DELETE` sem empresa no `where`                   | 2 fail                                                                                                               |
| I7 corte de tempo ignorado na contagem               | 1 fail                                                                                                               |

**Gates (apps/api-transportada, primeiro plano):**

- `bun run typecheck` -> sem saída de erro. `bun run lint` -> sem saída de erro.
- `bun run db:generate --name x` -> `{"status":"no_changes","dialect":"postgresql"}`.
- `bun --env-file=../../.env.test test --timeout 120000` -> 9256 pass / 24 skip / 0 fail, 195 arquivos.
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/location-retention-settings.integration.ts` -> 6 pass / 0 fail (Postgres 65432).

**Não verificado:** `403` pelo roteador de verdade (provado pela política declarada nas quatro rotas, que
o roteador aplica; nenhuma rota de configuração tem teste de roteador completo); `EXPLAIN` da contagem
(a T2.2 mede a junção do worker); integração completa da API (fica para o gate final da fase);
`make migration-test`.

**Rebase sobre `origin/staging` (2026-10-03):** a migration da spec 237 (`20261003170340`) entrou
antes; o `snapshot.json` da T1.2 partia do snapshot anterior a ela (5 reprovações em
`schema-snapshot.contract.ts` e na cadeia de snapshots). Regerado com `db:generate` sobre o schema atual
(delta idêntico ao `migration.sql` da 239) e só o `snapshot.json` foi trocado (`prevIds` -> snapshot da 237).
Depois: `db:generate` = `no_changes`; suíte da API 9311 pass / 24 skip / 0 fail, 198 arquivos; integração
do arquivo novo 6 pass / 0 fail.
