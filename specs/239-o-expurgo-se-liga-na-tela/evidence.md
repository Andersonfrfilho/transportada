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

Desvio consciente da letra original do D5 ("alongar grava sem carência"): gravar `now` ao alongar
durante uma carência em curso (ligar e alongar em seguida) anularia os 24 h do ligar. Manter o valor
anterior é idêntico ao `now` quando a carência já passou (o worker compara `<= now`) e preserva a que
ainda corre. **Decisão exposta ao usuário e aceita por omissão em chat (2026-10-03)**; o D5 do `spec.md`
foi emendado para dizer exatamente isso. A escolha é **reversível em uma linha**: o último ramo de
`resolvePurgeEffectiveAt` (`return previous.purgeEffectiveAt`) passaria a devolver `now`, e as linhas
"alongar" da tabela do contrato mudariam de `PREVIOUS_EFFECTIVE_AT`/`PENDING_EFFECTIVE_AT` para `NOW`.
Limites: `isValidRetentionDays` aceita só número inteiro 30..90.

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
`db:generate`, depois comentada à mão). `snapshot.json` **final**: id `11c128c3-ec3c-438e-a4a1-975c6b5b9fcb`,
`prevIds = ["43e75ad7-6425-471b-8e2a-3cf44c53e90d"]` = id do snapshot de
`20261003170340_contractor_receiving_profiles` (spec 237, a última de `origin/staging` depois do
rebase). Na task, o snapshot nasceu com id `1c4bf6ed…` e `prevIds` apontando para
`20261003010806_event_location_whatsapp_coordinate` (`eb960c28…`); foi regerado no rebase (ver o
fim da T1.4). Sem bifurcação.

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
commit `a8a73718b`, escrito **antes** de qualquer arquivo de `src/`. Saída literal do vermelho:

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

## Correções da revisão opus da Fase 1

Revisão opus aprovou a Fase 1 com pendências; cada achado foi conferido no código antes de corrigir.
Um commit isolado por item.

### M1 — a contagem de impacto prende o filtro de latitude e o prazo (confirmado)

Confirmado: as duas mutações sobreviviam, porque o teste só tinha linhas posicionadas (vencida e dentro
do prazo). `test/integration/location-retention-settings.integration.ts` agora semeia na empresa A, em
cada uma das cinco tabelas: vencida (91 dias), de ~60 dias, dentro do prazo (3 dias) e uma **sem ponto**
(latitude NULL, `location_state 'expired'`, data vencida). Asserção por tabela (`kind`, `count`,
`capped`): prazo 90 -> 1 em cada; prazo 30 -> 2 em cada (a de 60 dias passa a contar, a sem ponto não).

| Mutação (em `drizzle-location-retention-impact.query.ts`) | Resultado                                 |
| --------------------------------------------------------- | ----------------------------------------- |
| M1a tira `isNotNull(latitude)` da consulta                | 1 fail (a linha `expired` passa a contar) |
| M1b troca `make_interval(days => N)` por `days => 90`     | 1 fail (prazo 30 não alcança a de 60 d)   |

Fonte restaurada regravando o original; `git status` sem diff em `src/` depois.

### B1 — dois `PUT` concorrentes sem linha (confirmado)

Confirmado: `FOR UPDATE` não trava linha que ainda não existe, então duas primeiras escritas liam
`previous = undefined` ao mesmo tempo (as duas "ligavam do zero", as duas auditadas com `before: null`).
Teste novo "concurrent first writes keep one row and a coherent before/after chain" (8 `save` em
paralelo, prazos distintos). **Vermelho antes da correção**, saída literal: `Expected length: 1` /
`Received length: 8` (oito auditorias com `beforeSnapshot` nulo), 6 pass / 1 fail.
Correção: `lockRow` toma `pg_advisory_xact_lock(hashtext(companyId))` antes do `select ... for update`
(serializa por empresa, solta no COMMIT; vale para `save` e `clear`). Verde: 7 pass / 0 fail.

### B3 — `rollback.sql` sem janela entre a recusa e o `DROP TABLE` (confirmado)

Confirmado: a recusa contava as linhas e o `DROP TABLE` vinha depois, sem lock; um `PUT` no meio gravaria
a decisão de uma empresa e o `DROP` a apagaria em silêncio (a estratégia "recusar, não apagar" furada).
Editado **só** o `rollback.sql` da `20261003190847_location_retention_settings` (ainda não publicada):
`LOCK TABLE "company_location_retention_settings" IN ACCESS EXCLUSIVE MODE;` logo depois do
`SET LOCAL lock_timeout = '3s'` e antes do `DO $$` da recusa. O teste estático "bounds the lock wait..."
passou a exigir o `LOCK TABLE` depois do `lock_timeout` e antes de `Rollback recusado`.
Mutação (remover a linha do `rollback.sql`, rodar, restaurar regravando): 1 fail (esse teste).
Verde: `test/database-migration.contract.test.ts` 85 pass / 0 fail; `bun run db:test` 122 pass / 0 fail
(inclui o rollback real contra Postgres: recusa com linha, desfaz sem linha, reaplica limpo).

### M4 — `affectedEstimate` só quando a escrita abre carência (confirmado)

Confirmado: o use case recontava sempre que `purgeEnabled` era verdadeiro, inclusive ao alongar e ao
repetir o valor, gravando no `audit_logs` uma estimativa de algo que a escrita não amplia (e pagando
cinco consultas à toa). Agora `opensPurgeGracePeriod({ next, previous })` (política pura, mesma pergunta
de `resolvePurgeEffectiveAt`, que não mudou) decide; o use case lê a configuração atual com `find` e só
conta quando abre carência; `null` nos demais. Teste de consistência: para cada uma das 14 linhas da
tabela de carência, `opensPurgeGracePeriod` concorda com "a data gravada é `now + 24 h`". Teste novo de
rota: ligar de desligado e encurtar contam; alongar e repetir não chamam `countImpact` e gravam `null`.
A recontagem usa o `now` do servidor na escrita (D4 emendado no `spec.md`).
Limite honesto: o `find` do use case e o `FOR UPDATE` do repositório são leituras separadas; numa corrida
a estimativa pode seguir a decisão da leitura anterior. É metadado de auditoria, não decide a carência
(que é calculada dentro da transação).

| Mutação                                              | Resultado |
| ---------------------------------------------------- | --------- |
| M4a use case conta sempre que `purgeEnabled`         | 1 fail    |
| M4b `opensPurgeGracePeriod` com `<=` (repetir abre)  | 3 fail    |
| M4c `opensPurgeGracePeriod` sem o desvio de desligar | 3 fail    |

Verde: `test/companies.contract.test.ts --test-name-pattern retention` 71 pass / 0 fail.

### B9 — faixa 30–90 numa constante neutra (confirmado)

Confirmado: `src/database/company-location-retention-settings.schema.ts` importava os limites de
`companies/domain/location-retention.policy.ts` (camada de dados dependendo do domínio de uma feature).
Movidos para `src/shared/location-retention.constant.ts`; o domínio (`policy`, `constant`), a
apresentação (Zod) e o schema do banco leem de lá, e a `policy` deixou de exportá-los. Teste novo em
`test/trip-schema/location-retention-settings.contract.ts`: o schema do banco importa a constante neutra
e o fonte não contém `/companies/`; o teste do CHECK passou a travar também o teto 90.
Mutação (schema ganha um `import type` de `companies/domain/...policy.js`): 1 fail (a asserção `not.toContain('/companies/')`); voltar ao import antigo da constante também reprova (SyntaxError de export ausente). Verde: `bun run typecheck` limpo;
`test/trip-schema.contract.test.ts` + `test/companies.contract.test.ts` 476 pass / 0 fail.

### B8 — `403` pelo serviço de autorização real (barato, feito)

O evidence da T1.4 declarava o `403` "provado pela política declarada". Teste novo em
`test/companies/location-retention-settings.contract.ts`: para cada papel de `COMPANY_ROLE_PERMISSIONS`
e cada uma das quatro rotas, o `AuthorizationService` real (mesmo que o roteador chama) com as
permissões resolvidas por `resolveCompanyPermissions([papel])` — só `company-admin` passa; todos os
outros recebem `ApiError` 403. Mutação (primeira rota passa a exigir `fleet.read`): 1 fail.
Não é o `createRouter` completo (autenticação, tenant e rate limit ficam fora): é o ponto que decide o 403.

### M2 — a regra da carência no `spec.md` (confirmado; só documentação)

Confirmado: o D5 e a linha "Alongar de 30 para 90" da tabela de casos extremos ainda diziam que alongar
"grava sem carência", enquanto o código (T1.1, aceito em chat em 2026-10-03) mantém o
`purge_effective_at` anterior. Emendados no `spec.md`: D5 (regra gravada: desligar = `now`; ligar e
encurtar = `now + 24 h`; alongar e repetir = mantém o anterior; o porquê — alongar logo após ligar não pode
anular as 24 h) e a linha da tabela. O "a confirmar" da T1.1 saiu; a escolha é reversível em uma linha
(ver T1.1). O D1 também foi emendado: a frase "só duas têm índice parcial" (B6) agora diz que as cinco têm
índice parcial só por tempo e que os novos acrescentam `company_id`.

### B7 — encurtar e voltar a alongar pausa o expurgo até acabar a carência (registrado; não é furo)

Sequência: com o expurgo ligado e 90 dias, o admin encurta para 30 (`purge_effective_at = now + 24 h`) e,
dez minutos depois, alonga para 60. Alongar mantém a data de início anterior, então o worker continua
ignorando a empresa até `now + 24 h`, mesmo que o prazo novo apague **menos** do que o de 30. É excesso de
cautela (pausa maior que o necessário), nunca apagamento a mais: o pior efeito é o expurgo atrasar até
24 h. Aceito porque distinguir "alongar depois de encurtar" de "alongar" exigiria guardar o prazo
anterior ao encurtamento, estado extra para um ganho de horas. Se virar queixa, o remédio é guardar o prazo vigente antes da carência (desligar e ligar de novo só abriria outra carência de 24 h).

### M3 — risco de lock da migration em produção (registrado; nada foi executado em produção)

O `CREATE INDEX` comum da `20261003190847_location_retention_settings` toma `SHARE` nas cinco tabelas de
evento (`trip_stop_events`, `trip_delivery_proofs`, `trip_status_events`, `trip_stop_occurrences`,
`trip_document_occurrences`) e o segura até o `COMMIT`: escrita do motorista espera, leitura segue. O
migrador aplica **todas** as pendentes numa transação só. A produção está atrás do schema, então a mesma
transação carregaria também as migrations da 196 — `20261001123700`, `20261002153258` e `20261003010806` —
que tomam `ACCESS EXCLUSIVE` nas mesmas tabelas (informação da revisão; as notas da 196 em `specs/196-*/evidence.md` são a fonte a conferir). Somadas, as janelas de
bloqueio se acumulam, e `lock_timeout = 3s` (que aborta tudo se o lock não vier) não limita o **tempo
de construção** do índice, só a espera pelo lock.

**Pré-condições de deploy em produção** (a migration não deve subir sem elas):

1. Medir `pg_total_relation_size` das cinco tabelas **em produção** (o tamanho decide quanto dura o
   `CREATE INDEX`; staging pode não ter o volume).
2. Promover as migrations da 196 em **deploy separado, antes** da 239 — as janelas `ACCESS EXCLUSIVE` e
   `SHARE` não podem cair na mesma transação.
3. Aplicar **fora do horário de campo** (o motorista grava chegada, entrega, comprovante, status e
   ocorrência nessas tabelas).
4. Considerar `statement_timeout` por índice (um `SET LOCAL statement_timeout` antes de cada
   `CREATE INDEX`) para que uma construção inesperadamente longa aborte a transação em vez de segurar a
   escrita por minutos; exige editar a `migration.sql`, o que cabe antes da publicação.

Repetido em `plan.md` § "Riscos de execução".

### Pendências deliberadamente fora desta rodada

| Achado | Estado                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B2     | `countLocationRetentionImpact` usa `Promise.all` de cinco consultas (cinco conexões do pool por chamada); `allSettled`/sequencial fica para a Fase 2, junto da medição.                    |
| B4     | O repositório lança `Error` cru (`..._UPSERT_RETURNED_NOTHING`) em vez de erro de domínio tipado; só dispara com `returning()` vazio, estado que não deve existir.                         |
| B10    | Contratos de texto (`readFileSync` do fonte) em `location-retention-settings.contract.ts` seguem o padrão do repositório, mas não provam comportamento; trocar por comportamento onde der. |
