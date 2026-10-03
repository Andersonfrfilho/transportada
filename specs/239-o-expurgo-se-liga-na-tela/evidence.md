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

## Fase 2 — Worker

### T2.0 — Parecer do architect aplicado (docs)

Correções 1–10 do parecer (`arch-239-t22`) aplicadas: D2 na forma `UPDATE` único com `CROSS JOIN LATERAL`
(sem `FOR UPDATE SKIP LOCKED`; `FOR UPDATE OF x` se um dia houver); D1 com os cinco índices
`*_company_located_*` e os antigos só por tempo sem leitor; tabela ausente = ciclo falha inteiro; CA6 com as
empresas A–E nas cinco tabelas e cinco mutações; Gate A no D3, no plano e na T4.6; Gate B nos riscos, no
plano e na T4.6; risco de encurtar suspender a empresa por 24 h; arquivo de integração
`test/trip-location-purge.integration.test.ts`; lista de contratos do worker no plano; T2.1 detalhada.
Prettier nos `.md`.

### T2.1 — Contrato de paridade antes (CA7)

Contrato em `apps/worker-transportada/test/trip-location-purge/schema-parity.contract.ts`
(regex `COLUMN_LINE` com `boolean|integer`, contagem 24 → 29, colunas das três tabelas da 196 no segundo
teste, `company_id` em todas, e dois testes novos da tabela de configuração por assinatura, ignorando
`.default(...)`, sem `updated_by_user_id`) e `stamped-tables.contract.ts` (bloco de cada tabela carimbada na
API tem `companyId: uuid('company_id').notNull()` e a chamada `buildEventLocationCompanyIndex` com a tabela e
a coluna de tempo certas).

**Vermelho registrado (antes da cópia):** `Cannot find module '../../src/database/company-location-retention-settings.schema.js'`
→ 9 pass · 1 fail · 1 error (o teste do `stamped-tables` novo já nasce verde: o que ele vigia é a API, que a
T1.2 entregou).

**Verde depois** (cópia por valor: `companyId: uuid('company_id').notNull()` nas cinco tabelas de
`trip-execution.schema.ts` e o arquivo `company-location-retention-settings.schema.ts` com
`companyId` PK, `purgeEnabled`, `retentionDays`, `purgeEffectiveAt`): `bun run test` do worker, 1561 pass / 0 fail.

| Mutação                                                                                   | Resultado                                                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| tirar `companyId` de uma cópia do worker                                                  | 2 testes reprovam (contagem 28 ≠ 29; lista de colunas da tabela)                |
| `.default(false)` na cópia da tabela de configuração                                      | reprova "the copy declares only the columns the worker reads, with no defaults" |
| trocar `buildEventLocationCompanyIndex` por `buildEventLocationIndex` na API (uma tabela) | reprova "company_id e o índice composto por empresa"                            |

### T2.2 — Redatores por empresa, `CountEligibleCompanies` e integração (🧠, desenho do parecer do architect)

**O que entrou.** `drizzle-trip-location.repository.ts`: os cinco redatores viram um `UPDATE` único com
`CROSS JOIN LATERAL` (`buildLocatedEventRedactionStatement`, exportado para o `EXPLAIN` do teste);
`createDrizzleCountEligibleCompanies`; `src/database/sql-timestamptz-parameter.support.ts` (cópia worker de
`timestamptzParameter`). Port: `{ now, limit }` nos redatores (`{ before, limit }` fica só no ping) e
`CountEligibleCompanies`. Rotina: ordem pings → contagem (mesmo `now`) → redatores; sem empresa elegível
vira o desvio `trip_location_purge_disabled` (com `companies: 0`); log do ciclo com `companies`, sem
`retentionDays` nem `companyId`. A rotina perdeu `enabled`; o `TRIP_LOCATION_RETENTION_DAYS` e
`resolveRetentionCutoff` saíram (o prazo vem da linha). `main.ts` liga a contagem; a variável de ambiente
segue no schema até a T2.3.

**SQL final** (`trip_stop_events`; as outras mudam só a tabela, a coluna de tempo e o `captured_at`):

```sql
update "trip_stop_events" as t
set "latitude" = null, "longitude" = null, "accuracy_meters" = null, "captured_at" = null,
    "location_state" = $1                                   -- 'expired'
where t."latitude" is not null
  and t."id" in (
    select e.id
    from "company_location_retention_settings" as s
    cross join lateral (
      select x."id" as id
      from "trip_stop_events" as x
      where x."company_id" = s."company_id"
        and x."latitude" is not null
        and x."created_at" < $2::timestamptz - make_interval(days => s."retention_days")
      order by x."created_at"
      limit $3
    ) as e
    where s."purge_enabled" and s."purge_effective_at" <= $4::timestamptz
    limit $5
  )
returning t."id"
```

| Tabela                      | Coluna de tempo | `captured_at` no `SET` |
| --------------------------- | --------------- | ---------------------- |
| `trip_stop_events`          | `created_at`    | sim                    |
| `trip_delivery_proofs`      | `created_at`    | **não** (fica)         |
| `trip_status_events`        | `recorded_at`   | sim                    |
| `trip_stop_occurrences`     | `created_at`    | sim                    |
| `trip_document_occurrences` | `created_at`    | sim                    |

Contagem: `select count(*)::int from company_location_retention_settings where purge_enabled and
purge_effective_at <= $now::timestamptz`.

**Testes.** `test/trip-location-purge.integration.test.ts`: os dois describes antigos ganharam a linha de
configuração (90 d, vigente há 1 h); novo describe do CA6 com seis empresas (A–F, relógio injetado) nas
cinco tabelas — A ligada 30 d (31 d cai; 29 d, exatamente 30 d e sem ponto ficam), B desligada, C em
carência, D sem linha, E ligada 90 d (91 d cai, 60 d fica), F com `effective_at = NOW` (elegível); log com
`companies = 3`, `redactedByTable` = 3 por tabela, segunda execução zera; describe do `EXPLAIN`.
`test/trip-location-purge/statement-shape.contract.ts` (sem banco: `LATERAL`, `company_id`, dois
`::timestamptz`, sem `FOR UPDATE`/`SKIP LOCKED`, `captured_at` só nas quatro tabelas, coluna de tempo certa).
`disabled-switch.contract.ts` conta **chamadas** (zero elegíveis: `[purgeStalePings, countEligibleCompanies]`,
nenhum redator; mesmo instante; contagem que lança falha o ciclo com os pings já rodados). `purge`,
`stale-pings` (36 h contra o piso de 30 dias), `batch-ceiling` e `table-isolation` ajustados.

**Mutações** (editar, rodar, regravar o original):

| Mutação                                         | Reprova                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| M1 tirar `x.company_id = s.company_id`          | CA6 (B, C, D perdem ponto) + 5 testes de `EXPLAIN` (sem `company_id` na cond.) |
| M2 tirar `s.purge_enabled`                      | CA6 (B)                                                                        |
| M3 tirar `s.purge_effective_at <= now`          | CA6 (C)                                                                        |
| M4 `s.retention_days` por constante 30          | CA6 (E) e o describe 90 d da 196                                               |
| M5 `<` por `<=`                                 | CA6 (exatamente 30 d)                                                          |
| M6 comprovante passa a zerar `captured_at`      | os 3 describes de integração                                                   |
| M7 evento deixa de zerar `captured_at`          | os 2 describes de cinco tabelas                                                |
| M8 sonda sem `x.latitude is not null`           | os 5 testes de `EXPLAIN` (o índice parcial deixa de servir)                    |
| Contagem sem `purge_effective_at <= now`        | CA6 (`companies` 4 em vez de 3)                                                |
| S1 `FOR UPDATE` na subconsulta                  | `statement-shape`                                                              |
| S2 sem `::timestamptz`                          | `statement-shape`                                                              |
| S3 sem `order by`                               | `statement-shape`                                                              |
| S4 sem `x.company_id = s.company_id`            | `statement-shape`                                                              |
| S5 sem o filtro de latitude do `UPDATE` externo | `statement-shape`                                                              |
| R1 desvio `companies === 0` desligado           | 3 testes do `disabled-switch`                                                  |
| R2 contagem com outro `now`                     | "todos no mesmo instante"                                                      |
| R3 log do ciclo sem `companies`                 | "o log do ciclo conta as empresas"                                             |
| R4 `retentionDays` de volta no log do desvio    | "o log diz que foi de propósito"                                               |

**`EXPLAIN` com `SET LOCAL enable_seqscan = off`** (teste de integração, cinco tabelas, 5 000 linhas por tabela):
o nome `<tabela>_company_located_<tempo>_idx` aparece no plano e a condição de índice da sonda do `LATERAL`
tem `company_id`. ⚠️ **O teste derruba, dentro da transação (volta no rollback), o índice só por tempo
da tabela.** Com ele no caminho o planejador o escolhe, não o composto, e sem derrubar nada o teste ficaria
vermelho ou provaria o índice errado: o teste prova que o composto **serve** (predicado parcial e ordem de
colunas casam com o comando), **não** que o planejador o prefira. Sem a derrubada, no banco pequeno de
teste o planejador escolheu o `(company_id, id)` por empate de custo.

**`EXPLAIN (ANALYZE)` sem toggle, volume sintético — NÃO é o volume de staging.** Banco descartável
local (Postgres 17.10), 400 000 linhas por tabela, duas empresas: B desligada com 90 % das linhas e A ligada
(30 d) com 10 %, linhas inseridas em ordem cronológica, `ANALYZE` feito; não há volume de staging medido.

| Situação                                                                     | Plano da sonda do `LATERAL` (nas cinco tabelas)                                                                        | Tempo por tabela                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Fila de A (500 linhas elegíveis)                                             | `Index Scan` em `<tabela>_located_<tempo>_idx` (**só por tempo**), filtro `company_id`; `Rows Removed by Filter` 4 500 | 12–170 ms                             |
| Fila esvaziada (A purgada; B guarda 270 003 linhas com ponto e mais de 30 d) | idem, 0 linhas, `Rows Removed by Filter` ≈ 270 000                                                                     | 84–124 ms                             |
| Fila esvaziada, **sem o `ORDER BY`**                                         | `Seq Scan` na tabela inteira (9 925 buffers, 400 000 linhas filtradas)                                                 | ≈ 50 ms (cresce com a tabela inteira) |
| Fila esvaziada, índice só por tempo removido (transação, rollback)           | `Index Scan using <tabela>_company_located_<tempo>_idx`, `Index Cond: company_id = … AND created_at < …`               | **1–2 ms** (a primeira, fria, 58 ms)  |

Leitura honesta: **o planejador não escolhe o índice composto** enquanto o índice só por tempo existir (a
correlação física de `created_at` é ≈ 1 e a de `company_id` é baixa, então o custo do composto parece pior).
O custo da sonda vazia passa a ser proporcional às linhas com ponto, vencidas, **de empresas não elegíveis**
(aqui 270 mil → ≈ 90–120 ms por tabela por ciclo diário); numa instalação com uma empresa só é desprezível.
**Recomendação (fora desta spec, é migration):** `DROP INDEX` dos cinco índices `<tabela>_located_<tempo>_idx`
depois da T2.2 — com eles fora, o composto é escolhido e a sonda vazia cai a 1–2 ms.

**Gates (worker):** `bun run typecheck` limpo; `bun run lint` limpo; `bun run test` 1568 pass / 0 fail;
`bun run format:check` (raiz) limpo.

**Integração do worker.** `make worker-integration` **não rodou até o fim**: o banco compartilhado
`transportada_worker_integration` (provisionado pelo script e reaproveitado entre worktrees) está num estado
que não migra — `column "latitude" of relation "trip_status_events" already exists` na migration da 196,
sem relação com esta mudança. Em vez de tocar nele, a mesma receita rodou num banco descartável próprio
(`transportada_s239_t22`, criado do zero e migrado com `db:migrate`): `bun run test:integration` do worker,
**168 pass / 1 fail** — a falha é `osrm-routing-matrix.integration.test.ts` ("a matriz do OSRM contra o
serviço de verdade", `Expected: 4511.2, Received: 1143650`), serviço OSRM local que responde com outro
dataset, sem relação com o expurgo. `trip-location-purge.integration.test.ts` passou inteiro (10 testes).

### T2.3 — `TRIP_LOCATION_PURGE_ENABLED` removida (D3, CA9)

Saiu do schema de ambiente (`environment.schema.ts`), do tipo `WorkerEnvironment` (`worker.types.ts`), do
`.env.example`, de `main.ts` e da rotina (já na T2.2: `enabled` virou `countEligibleCompanies`), e as menções em
`docs/SECURITY.md` (3), `docs/ai-context/worker-transportada.md` e `apps/worker-transportada/CLAUDE.md` foram
reescritas ("a empresa liga na tela"; a variável saiu e, se sobrar, é ignorada). O texto completo do
achado de 2026-10-02 no `SECURITY.md` e a pendência do WhatsApp continuam para a T4.1/T4.2.

Contratos: `environment.contract.test.ts` perdeu a chave do `toEqual` (sem afrouxá-lo);
`disabled-switch.contract.ts` ganhou "a chave que sobrou no ambiente é ignorada" (`'true'`, `'false'` e `'1'`
não derrubam o boot e o campo não existe) no lugar dos dois testes da variável; "sem empresa elegível" e a
contagem de **chamadas** já tinham entrado na T2.2.

| Mutação                                                                      | Reprova                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Devolver `TRIP_LOCATION_PURGE_ENABLED` ao schema e ao objeto de configuração | "a chave que sobrou é ignorada" **e** o `toEqual` do `environment.contract` |
| Desvio `companies === 0` desligado (R1, T2.2)                                | 3 testes de "sem empresa elegível"                                          |

**Gates (worker):** `bun run typecheck` limpo; `bun run lint` limpo; `bun run test` 1567 pass / 0 fail;
`bun run format:check` (raiz) limpo; `bun run test:integration` no banco descartável próprio, 168 pass / 1 fail
(o mesmo `osrm-routing-matrix`, sem relação; `make worker-integration` segue quebrado pelo banco compartilhado,
ver T2.2). Nada da API foi tocado: os gates da API não se aplicam a esta task.

`grep` por `TRIP_LOCATION_PURGE_ENABLED` em `apps/**/src|test`, `.env.example` e `docs/` só acha as frases
que dizem que ela saiu; sobram as menções históricas em `specs/196-*` e o `dist/` ignorado pelo git.

## Fase 3 — Painel

### T3.1–T3.3 — Aba Localização, painel, confirmação e linha do tempo (CA10, CA11)

Commit `ca0088f45`. **Ordem:** o contrato foi escrito **depois** do código desta vez (a tarefa pedia vermelho
antes); a prova de que ele não é decoração é a tabela de mutações da T3.4, que reprova cada regra tirada.

- **Endereço:** `locationRetention: { module: 'trip', source: 'locationRetentionSettings', tab: 'location' }` em
  `SETTINGS_PANEL_PLACEMENT`; só a aba `location` liga a consulta (`tabs.contract.ts`: a aba `proof` e a `trips` não).
  `TripWorkspace.page.tsx` ganhou a aba (`TRIP_TABS = ['trips', 'proof', 'location']`) e o corpo da lista de viagens
  só aparece na aba `trips`.
- **Peças:** `TripLocationRetentionPanel` + `LocationRetentionConfirmDialog` (portal e `useModalDialog`, como
  `TripConfirmDialog`), `useLocationRetentionPanel` (todas as decisões), `useLocationRetention.query.ts`
  (TanStack; a contagem de impacto com `gcTime`/`staleTime` 0 e `enabled` só com a confirmação aberta),
  `locationRetentionClient.service.ts` (fetch injetado; `locationRetentionClient.provider.ts` o monta),
  `locationRetention.validation.ts` (tolera campo novo, **recusa `kind` desconhecido** — subestimar o que cai é
  pior; o vizinho, a diária, também não recusa chave a mais) e `locationRetention.service.ts` (regras puras).
  Controle do prazo = `<input type="number" min=30 max=90>` com `aria-invalid` e mensagem de faixa, como os
  parâmetros de pontualidade do Comprovante; `parseLocationRetentionDays` só aceita dígitos (nada de `45.5`).
  Sem permissão: nem pede (`enabled` = `canManage && aba`), mostra o `role="alert"` e nenhum controle.
- **Estilo:** classes do `trip.module.css` do vizinho (`.panel`, `.hint`, `.alert`, `.fieldGrid`,
  `.actionActions`, `.settingsStatusOn`, `.mdfeGate*`) e duas novas (`.retentionImpactList`,
  `.retentionDestructive`); `Button`, `Icon` e `Skeleton` do design system; nada de estilo inline, nada de
  Tailwind/shadcn; `min-width` só.
- **T3.3 (D8):** `eventTimeline.location.expired` e `eventTimeline.map.missingExpired_*` dizem "pelo prazo de
  retenção" (pt-BR) e "after the retention period" (en). O `scoreHint` do motorista (90 dias da nota) não foi tocado.
- **Contratos:** `test/trip-hooks/location-retention-panel.contract.ts` (18 testes, DOM montado, cliente trocado
  por `locationRetentionClientMocks.helper.ts`), `test/trip/location-retention.contract.ts` (regras puras,
  validação, cliente com `fetch` falso, D8 pelo i18n) e o caso novo de `test/company-settings/tabs.contract.ts`.
  Estados cobertos no DOM: carregando (esqueleto), erro de leitura, padrão, ligado, em carência ("Começa a valer em
  DD/MM HH:mm"), salvando, sem permissão (zero chamadas ao cliente), prazo inválido, a confirmação SÓ ao
  ligar/encurtar (alongar, desligar, salvar prazo desligado e voltar ao padrão salvam direto e **não** chamam a
  contagem), o botão "Ligar e apagar N pontos" (1.633, singular, "mais de 100 mil"), a contagem que falha, o texto
  de LGPD no diálogo.

### T3.4 — Mutações (editar e restaurar regravando; `git status` limpo depois)

| Mutação                                                           | Reprova                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| M1 tirar a confirmação ao ligar                                   | 5 do painel (DOM) + 1 da tabela de regras               |
| M2 tirar a confirmação ao encurtar                                | 1 do painel + 1 da tabela                               |
| M3 alongar passa a pedir confirmação (`<` vira `!==`)             | 2 do painel + 1 da tabela                               |
| M4 desligar passa a pedir confirmação                             | 1 do painel + 1 da tabela                               |
| M5 **inverter a regra de carência na tela** (`>` vira `<`)        | 2 do painel ("ligado", "em carência") + 1 da tabela     |
| M6 **tirar a permissão** da consulta (`enabled: input.isEnabled`) | "sem settings.manage: nem pede ao servidor" (DOM)       |
| M7 tirar o aviso sem permissão                                    | o mesmo teste (DOM)                                     |
| M8 contar o impacto sem a confirmação aberta (`enabled: true`)    | 4 do painel (sem permissão, ligar, alongar, desligar)   |
| M9 botão destrutivo sem o número                                  | 4 do painel                                             |
| M10 confirmar sem esperar a contagem                              | 2 do painel ("espera a contagem", "contagem que falha") |
| M11 tirar o texto de LGPD do diálogo                              | "ligar abre o diálogo…"                                 |
| M12 teto sem "mais de 100 mil"                                    | "acima do teto…" (DOM) + a soma por grupo               |
| M13 aba no lugar errado (`tab: 'proof'`)                          | `tabs.contract` (nova) + o contrato do Comprovante      |
| M14 devolver "após 90 dias" ao estado `expired`                   | 2 de D8 (texto e i18n)                                  |

### Gates (apps/frontend-transportada)

`bun run typecheck` limpo; `bun run lint` 0 erros / 16 avisos (todos `react-hooks/exhaustive-deps` pré-existentes);
`bun run test` 6640 pass / 0 fail (contratos) + 403 pass / 0 fail (`test:hooks`, DOM). Smoke
`test/spec-239-prints.smoke.spec.ts` (API dublada, `PLAYWRIGHT_FRONTEND_PORT=53231`, API de saúde falsa em 53232):
4 passed — desligado → confirmação com 1.633 pontos → "aguardando a carência" com "Começa a valer em", e sem
permissão (zero pedidos ao `location-retention`); sem rolagem horizontal em 1280 e 375. PNGs em `prints/`
(1280 escuro e 375 claro). **A T4.5 (ok de design do usuário) continua aberta.**

### T2.4 — correções da revisão opus da Fase 2 (após rebase em `origin/staging` 83813b175)

O rebase (20 commits sobre 26 de staging, só da spec 239 do ajudante, renumerada para 243) não teve conflito e
staging não trouxe migration: o snapshot da `20261003190847_location_retention_settings` já encadeia no mais
recente de staging (`prevIds` = `43e75ad7…` da `contractor_receiving_profiles`); `db:generate` = `no_changes`;
`db:migrate` num banco novo aplica as 270 pastas.

| Item  | Conferido no código                                                                   | Correção                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1+M5 | Procede: `LIMIT` interno = externo = 500; a fila drena por empresa, sem justiça       | Comentário do redator, D2 e Riscos da `spec.md` emendados (planejador não escolhe o composto, sondas crescem com as empresas elegíveis, follow-up com migration: `DROP INDEX` com `lock_timeout`, `idx_scan` antes, rollback que recria; justiça junto). **Sem mudar o `LIMIT`** (decisão do usuário)                                                                                                                                                                                                                  |
| M3    | Procede: `make worker-integration` não rodou                                          | `tasks.md` T2.2 diz o substituto e a causa. Aqui a mesma receita rodou em banco descartável próprio (`s239_f2fix_rebased`, migrado do zero, derrubado no fim): `test:integration` do worker **170 pass / 1 fail** — o `osrm-routing-matrix` de sempre (serviço OSRM local com outro dataset). O banco compartilhado `transportada_worker_integration` **não foi tocado**: journal com pasta de migration renumerada que não existe em nenhuma branch remota; precisa de drop + reprovisionamento por quem o administra |
| M4    | Procede: o `.catch` engolia qualquer erro                                             | `ExplainRollback` (sentinela) é a única exceção devolvida; o resto relança; `SET LOCAL lock_timeout = '2s'`; describe/teste renomeados para "o índice composto serve à sonda". Mutação: trocar o nome do índice a derrubar → `index "…_nao_existe_…" does not exist` falha 4 testes em vez de ler `undefined`                                                                                                                                                                                                          |
| B1    | Procede                                                                               | Comentários de "noventa dias" / "varre só por data" corrigidos (schema da API e `trip-location-purge.constant.ts`)                                                                                                                                                                                                                                                                                                                                                                                                     |
| B2    | Procede: `expect(name.length).toBe(1)` sempre passava                                 | Troca por contagem das linhas conferidas (empresas × linhas × 5 tabelas)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| B3    | Procede                                                                               | Describe novo "lote pequeno": `limit: 2`, A com 3 vencidas, B com 2, C desligada com 3: lotes `[2, 2, 1, 0]`, C intacta. Mutação: tirar o `LIMIT` externo → falha                                                                                                                                                                                                                                                                                                                                                      |
| B4    | Procede: o conjunto de linhas do arquivo inteiro aprovava `companyId` de outra tabela | Paridade por BLOCO (`parseApiTables` movido para `api-schema.support.ts`); as três tabelas da 196 leem a posição do spread `buildEventLocationColumns`. Mutação: renomear o `companyId` do bloco `trip_status_events` da API → reprova a paridade e o contrato do índice composto                                                                                                                                                                                                                                      |
| B5    | Procede                                                                               | O piso do `stale-pings.contract` é lido do `LOCATION_RETENTION_MIN_DAYS` da API. Mutação: `MIN_DAYS = 1` → reprova "o prazo do rastro é mais curto que o piso"                                                                                                                                                                                                                                                                                                                                                         |
| B7    | Procede                                                                               | Provider de teste com `TimeZone: 'UTC'` na conexão; teste `show timezone` = `UTC` passou também com o banco em `America/Sao_Paulo` (prova que o parâmetro vale)                                                                                                                                                                                                                                                                                                                                                        |
| B8    | Procede                                                                               | Gate A com o comando e o plano de saída em `spec.md` D3 e `tasks.md` T4.6 (escrever a linha da empresa antes do deploy do worker é decisão do usuário)                                                                                                                                                                                                                                                                                                                                                                 |
| B9    | Procede                                                                               | `trip_location_purge_pings_finished` antes da contagem, só ids opacos e contadores; contrato novo (a contagem que lança deixa os pings no log). Mutação: renomear a mensagem → 2 testes reprovam                                                                                                                                                                                                                                                                                                                       |
| B6    | Mantido como está                                                                     | Registrado, sem mudança                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Gates (depois do rebase e das correções):** worker `typecheck` limpo, `lint` limpo, `test` 1568 pass / 0 fail;
integração do worker em banco descartável 170 pass / 1 fail (OSRM); API `typecheck` limpo, `lint` limpo,
`bun --env-file=../../.env.test test --timeout 120000` 9356 pass / 24 skip / 0 fail; frontend `typecheck` limpo,
`test` 6682 pass / 0 fail + 415 pass / 0 fail (hooks).

## T4.1–T4.3

Documentação conferida contra `spec.md`, `plan.md`, a migration `20261003190847_location_retention_settings` e o
código. O commit `8deb398cd` trazia erros, corrigidos aqui:

- `docs/SECURITY.md`: definições de Gate A e Gate B trocadas pelas da `spec.md` (D3, Riscos) e da T4.6; lock das
  migrations da 196 separado como pré-condição própria; `innerJoin` trocado por `CROSS JOIN LATERAL`; "company-admin"
  trocado por `settings.manage`; rollback recusa com qualquer linha (não só `purge_enabled = true`); emenda da ADR
  removida do achado e escrita na ADR; linha solta `_Nenhum ainda._` removida.
- `docs/adr/0081-...md`: emenda 7.1 de 2026-10-03 (interruptor substituído, variável removida, pendência do
  transcript do WhatsApp).
- `apps/worker-transportada/CLAUDE.md`: restaurado o texto anterior ao `8deb398cd` (o commit apagou o texto correto
  e pôs `innerJoin`).
- `apps/api-transportada/CLAUDE.md`, `apps/frontend-transportada/CLAUDE.md`: ponteiro e permissão corrigidos.
- `docs/ai-context/worker-transportada.md` e `api-transportada.md` já descreviam a spec 239; sem mudança.
  `bun run format:check` (raiz), saída literal:

```text
$ bunx prettier --check .
Checking formatting...
All matched files use Prettier code style!
```

## T4.4 e a parte de design da T4.5 — aba Localização × painel do Comprovante

Medido no navegador por `apps/frontend-transportada/test/spec-239-prints.smoke.spec.ts` (`getBoundingClientRect` e
`getComputedStyle`, cor composta sobre o fundo, esperando a transição de 150 ms terminar), com a API dublada, nos
quatro pares 1280 escuro, 1280 claro, 375 escuro, 375 claro (375 com ponteiro de toque). Comando:
`PLAYWRIGHT_FRONTEND_PORT=53231 PLAYWRIGHT_API_PORT=53232 PLAYWRIGHT_REUSE_EXISTING_API_SERVER=true PLAYWRIGHT_TEST_MATCH=spec-239-prints.smoke.spec.ts bun run smoke`
→ `16 passed`. As 44 PNGs estão em `prints/` (`spec-239-<estado>-<largura>-<tema>.png`): desligado, confirmação
contando, confirmação, aguardando carência, ligado, prazo inválido, gravando, erro de gravação, carregando, erro de
leitura, sem permissão.

### Elemento × equivalente do Comprovante (valor medido)

| Elemento                   | Comprovante                                                    | Localização                                               | Resultado                    |
| -------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------- |
| Campo, altura              | 48 px                                                          | 48 px                                                     | igual                        |
| Campo, borda / raio        | 1 px, 32% do slate / 0                                         | 1 px, 32% do slate / 0                                    | igual                        |
| Campo, fundo / cor / fonte | asfalto 62% / fog / Avenir Next 14,4 px                        | idem                                                      | igual                        |
| Campo, padding             | 12 px                                                          | 12 px                                                     | igual                        |
| Campo, foco                | contorno sólido 2 px cobre (global `:focus-visible`)           | idem                                                      | igual                        |
| Rótulo do campo            | Avenir Next 12,8 px, 400, `slate-muted`, sem caixa alta        | idem                                                      | igual                        |
| Título (`h3`) e dica       | 15,2 px 700 / 12,8 px 400, `slate-muted`                       | idem                                                      | igual                        |
| Cartão (painel)            | borda 1 px 18%, fundo graphite 82%, padding 20, gap 16, raio 0 | idem                                                      | igual                        |
| Botão primário `sm`        | 38,39 px (1280) / 44 px (375 toque), padding 8×12, 13,33 px    | "Ligar o apagamento": idem                                | igual                        |
| Botão secundário `sm`      | (o Comprovante não tem secundário)                             | 38,39 px (1280) / 44 px (375 toque)                       | igual ao primário            |
| Botão que apaga (diálogo)  | —                                                              | 44 px (o overlay do diálogo fixa `--touch-target`)        | igual aos diálogos do módulo |
| Campo inválido             | borda **sem mudança** (antes)                                  | borda `--color-alert` (255,95,87 escuro; 194,56,47 claro) | **corrigido nos dois**       |
| Campo desabilitado         | idêntico ao normal (antes)                                     | opacidade 0,5, cursor `not-allowed`                       | **corrigido nos dois**       |
| Erro de campo              | `aria-describedby` ligado ao aviso                             | ligado (antes não estava)                                 | **corrigido**                |

### Divergências achadas e corrigidas na tarefa

1. **Diálogo sem descrição acessível** — `aria-describedby` ausente; leitor de tela anunciava só o título. Agora aponta
   para o parágrafo "Com o prazo de N dias…". Contrato: `toHaveAccessibleDescription`. Mutação (tirar o atributo) reprova.
2. **Dois botões "Cancelar" no diálogo** — o "X" e o rodapé tinham o mesmo nome acessível. O "X" agora é "Fechar"
   (`locationRetention.confirm.close`, pt-BR e en). Contrato: ordem de tab `Fechar → Cancelar → Ligar e apagar N pontos →
Fechar`. Mutação (voltar para `cancel`) reprova.
3. **Campo inválido e campo desabilitado invisíveis** — `aria-invalid` e `disabled` renderizavam como o campo normal. Regras
   novas em `.fieldGrid input[aria-invalid='true']` (borda de alerta) e `.fieldGrid input:disabled` (opacidade 0,5, igual
   ao botão desabilitado). São seletores compartilhados: o painel do Comprovante também passou a pintar o estado
   (efeito colateral deliberado, medido). Mutação de cada regra reprova o smoke.
4. **Erro de faixa sem ligação com o campo** — o aviso agora tem `id` e o campo `aria-describedby` (como o Comprovante).
5. **Esqueleto fora de forma** — o painel era três barras coladas, sem rótulo; o diálogo, duas barras coladas que liam
   como uma lousa. Agora o painel repete a forma (estado, rótulo + campo de 48 px, fileira de dois botões compactos) e o
   diálogo tem uma linha por grupo (4) com a altura da linha real (`min-height: var(--control-height-compact)` na linha da
   contagem, o que a deixa uniforme). Contrato: alturas do esqueleto `[16, 16, 48, compacto, compacto]` e linhas do diálogo
   iguais às reais. Mutação (tirar a barra do rótulo) reprova.

### Contraste (razão mínima entre os quatro pares de viewport e tema; piso 4,5:1)

| Estado                                                              | Elemento                                                                                | Mínimo medido                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| Desligado                                                           | título, rótulo, dica, estado (`slate-muted`)                                            | 5,66 (claro)                    |
| Desligado                                                           | campo (texto sobre fundo)                                                               | 13,01                           |
| Desligado                                                           | "Ligar o apagamento" (cobre)                                                            | 4,94 (claro)                    |
| Confirmação                                                         | título 12,92 · LGPD e carência 5,27 · linha e número da contagem 13,34 · Cancelar 11,92 | 5,27                            |
| Confirmação                                                         | "Ligar e apagar N pontos" (alerta sobre secundário)                                     | 4,87 (escuro)                   |
| Aguardando carência/ligado                                          | estado em verde (`--color-ready`)                                                       | 4,71 (claro)                    |
| Aguardando carência/ligado                                          | "Desligar o apagamento" 12,96 · "Voltar ao padrão" 11,82                                | 11,82                           |
| Prazo inválido / erro de gravação / erro de leitura / sem permissão | aviso em cobre (`--color-alert` do módulo)                                              | 4,91 (claro)                    |
| Gravando                                                            | aviso "Gravando"                                                                        | 5,66                            |
| Desabilitado                                                        | "Salvar prazo" 3,01 · "Ligar e apagar…" (contando) 2,13 · campo 2,92 · botão 3,01       | isento (WCAG 1.4.3), registrado |

Todo estado habilitado ≥ 4,5. O desabilitado fica abaixo porque o primitivo `Button` usa `opacity: 0.5` em toda a
aplicação; o campo agora segue o mesmo critério.

### Pendências declaradas

- **Desabilitado < 4,5:1** em botão (`.ui-button:disabled { opacity: 0.5 }`) e, agora, em campo: decisão do design system, não
  deste painel; WCAG isenta controle inativo.
- **Verde do estado "Ligado" a 4,71:1 no tema claro** passa, mas é o acento (`--color-ready`) usado como texto; o
  `--color-ready-ink` (selo) é mais firme. `settingsStatusOn` é compartilhado com a leitura do canhoto — mudar é decisão do
  módulo, não desta tarefa.
- **"Aguardando a carência" usa o mesmo verde de "Ligado"**, embora nada seja apagado ainda — decisão de produto sobre tom
  (neutro ou aviso) para o usuário.
- **"Gravando" empurra o texto jurídico para baixo** (a linha nasce no fluxo). Sem reserva de altura, igual aos vizinhos.
- **Folha do diálogo no celular** deixa vazio sob o rodapé (o rodapé é sticky no fim do conteúdo, não da janela), igual aos
  demais diálogos do módulo.
- **Rótulo em mono**: o rótulo do campo no Comprovante, e portanto aqui, é Avenir Next 12,8 px, não mono; o mono
  (`--font-utility`) vive nos selos e cabeçalhos. Mantido em paridade.
- **T4.5 segue aberta**: falta o ok do usuário sobre os prints e a revisão final do código com `code-reviewer` em `opus`.

Gates (`apps/frontend-transportada`): `bun run typecheck` limpo; `bun run lint` 0 erros, 16 avisos pré-existentes
(`react-hooks/exhaustive-deps` em outros módulos); `bun run test` 6682 pass / 0 fail + 415 pass / 0 fail (hooks); raiz
`bun run format:check`: "All matched files use Prettier code style!".

## T4.5 e T4.6 — ok do usuário, Gate A e publicação (2026-10-03)

- **Ok de design:** o usuário aprovou o visual da aba “Localização” nos prints (“visual está ótimo”) e autorizou a publicação em staging pela pipeline.
- **Revisão final (opus):** aprovada com pendências; nada bloqueia o push. Achados 4–14 (rótulo “apagar N” com contagem de agora, advisory lock de 32 bits, `Error` cru, fuso da sessão do worker, rate limit do impact, risco de lock em produção, marcar T1.5/T2.4) ficam como pendências declaradas.
- **Gate A (feito):** `railway variables --service worker --environment staging|production --kv`, contando só a chave `TRIP_LOCATION_PURGE_ENABLED`: ausente nos dois (58 e 57 variáveis lidas). O deploy não desliga o expurgo de nenhum ambiente.
- **Gate B:** num push único o painel sobe em paralelo ao worker; o pior caso é a tela dizer “ligado” com o worker antigo (variável desligada) sem apagar nada. Ninguém liga o expurgo em staging antes de o `deploy-services (worker)` estar verde.
