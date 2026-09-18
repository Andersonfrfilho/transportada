# Spec 157 — Evidência

## T1 — ADR-0068

Arquivo `docs/adr/0068-a-foto-obrigatoria-do-motorista-pesa-na-nota.md` já existia no worktree antes
desta sessão (aceita, cita ADR-0057 e ADR-0067 §5 emenda 2). Marcada como concluída junto do commit
da T2.

## T2 — `classifyProofPunctuality`

Arquivos:

- `apps/api-transportada/src/trips/domain/delivery-proof-punctuality.policy.ts` (novo)
- `apps/api-transportada/test/trip-delivery-proof/punctuality.contract.ts` (novo, 13 casos)
- `apps/api-transportada/test/trip-delivery-proof.contract.test.ts` (import adicionado)

Assinaturas exportadas: `PROOF_PUNCTUALITY` (const object), `ProofPunctuality`, `ProofPosition`,
`ClassifyProofPunctualityParams`, `classifyProofPunctuality(params): ProofPunctuality`.

Comandos e resultado:

```
$ bun run typecheck                                            # raiz, todas as apps — 0 erros
$ bun run lint                                                  # raiz, todas as apps — 0 erros
$ bun test ./test/trip-delivery-proof.contract.test.ts
 57 pass / 0 fail / 80 expect() calls
```

Casos cobertos: aceite 3 (100 m/10 min → on_time), aceite 4 (2h → late; 2 km → away; sem posição →
away), combinação `late_and_away`, `capturedAt` no futuro e antes da entrega (ambos limitados pela
folga de 2 min de `field-delivery-timing.policy.ts`), parada sem coordenada usa o evento, sem
referência nenhuma de local a distância não julga, precisão soma ao raio, `not_required` para
`optional`/`off`.

## T3 — `computeDriverScore`

Arquivos:

- `apps/api-transportada/src/fleet/domain/driver-score.policy.ts` (novo)
- `apps/api-transportada/test/fleet-domain/driver-score.contract.ts` (novo, 8 casos)
- `apps/api-transportada/test/fleet-domain.contract.test.ts` (import adicionado)

Assinaturas exportadas: `DRIVER_SCORE_WINDOW_DAYS = 90`, `DRIVER_SCORE_MAXIMUM = 100`,
`DRIVER_PENALTY_REASON` (const object), `DriverPenaltyReason`, `DriverScoreSettings`,
`DriverScoreDelivery`, `DriverPenalty`, `ComputeDriverScoreParams`, `DriverScoreResult`,
`computeDriverScore(params): DriverScoreResult`.

Comandos e resultado:

```
$ bun run typecheck                                            # raiz, todas as apps — 0 erros
$ bun run lint                                                  # raiz, todas as apps — 0 erros
$ bun test ./test/fleet-domain.contract.test.ts
 107 pass / 0 fail / 300 expect() calls
```

Casos cobertos: aceite 5 (late 5 + ausente 25h 10 → 85), ausente dentro do prazo não penaliza (sem
penalidade, nota 100), fora da janela de 90 dias não conta (`null`), sem nenhuma entrega avaliável
(`null`), nota nunca abaixo de 0, penalidade única por entrega mesmo com `late_and_away`, modo atual
`optional` não penaliza ausência (configuração mudou depois da entrega), foto `on_time`/`not_required`
não penaliza.

## Suíte completa da API (gate de regressão)

```
$ bun run --cwd apps/api-transportada test
 6521 pass / 32 skip / 0 fail / 22681 expect() calls — 180 arquivos
```

## Desvios da spec

Nenhum. `classifyProofPunctuality` e `computeDriverScore` seguem exatamente as assinaturas e regras
descritas no `plan.md` (RF4-RF9). Tipos ficaram inline no próprio `.policy.ts` (sem `.types.ts`
separado) — é o padrão da maioria dos arquivos de `trips/domain/` e `fleet/domain/` hoje
(`daily-allowance.policy.ts`, `delivery-proof-settings.policy.ts`, `driver-home-geocoding.policy.ts`),
reservando `.types.ts` só para módulos com tipos muito extensos (`cargo-layout-hash.types.ts`).

T4 em diante (migration, `/proof`, `/deliver`, snapshot, consulta da nota, rotas da frota, telas) não
fazem parte desta sessão.

## T4 — Migration aditiva + settings

Arquivos:

- `apps/api-transportada/src/database/trip.schema.ts` — `tripDeliveryProofs` ganha `latitude`,
  `longitude` (numeric 10,7), `accuracyMeters` (numeric 10,2), `capturedAt` (timestamptz), todos
  nulos, e `punctuality varchar(16) not null default 'not_required'` com CHECK contra
  `TRIP_DELIVERY_PROOF_PUNCTUALITIES` (nova const, duplicada de `PROOF_PUNCTUALITY` do domínio pelo
  mesmo motivo de `TRIP_FIELD_CHANNELS` — importar `trips/domain` no schema puxaria a árvore do
  módulo para dentro do fechamento de imports do pre-deploy). CHECKs de par de coordenada e faixa
  (-90..90/-180..180), mesmo molde de `trip_stops`.
- `apps/api-transportada/src/database/company-delivery-proof-settings.schema.ts` —
  `companyDeliveryProofSettings` ganha `proofWindowMinutes` (int, padrão 60, CHECK 5–1440),
  `proofRadiusMeters` (padrão 300, CHECK 50–5000), `latePenaltyPoints` (padrão 5, CHECK 0–100),
  `missingPenaltyPoints` (padrão 10, CHECK 0–100), `missingAfterHours` (padrão 24, CHECK 1–168).
  `deliveryProofSettingOverrides` **não** ganhou esses campos, como pedido.
- `apps/api-transportada/drizzle/20260918105116_delivery_proof_punctuality/` (novo) —
  `migration.sql` gerado por `bun run db:generate --name delivery_proof_punctuality`,
  `rollback.sql` escrito à mão (sem guarda de dado: migration puramente aditiva, nenhum dado de
  negócio depende das colunas novas), `snapshot.json` gerado junto.
- `apps/api-transportada/src/trips/domain/delivery-proof-settings.policy.ts` — `DeliveryProofFieldSettings`
  intacto; novo `DeliveryProofPunctualitySettings` (os cinco parâmetros) +
  `DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS`, e `CompanyDeliveryProofSettings` (os dois tipos
  combinados) + `DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS` para a configuração geral.
- `apps/api-transportada/src/trips/presentation/delivery-proof-settings.schema.ts` — novo
  `deliveryProofPunctualitySettingsSchema` (faixas do painel, `int().min().max()`) e
  `companyDeliveryProofSettingsSchema` (os quatro modos + os cinco parâmetros, `.strict()`); o
  schema de exceções continua só com `deliveryProofSettingsSchema` (os quatro modos).
- `apps/api-transportada/src/trips/infrastructure/drizzle-delivery-proof-settings.repository.ts` —
  `readSettings`/`saveSettings` leem/gravam os nove campos da configuração geral; ausência de linha
  cai em `DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS`. `listOverrides`/`replaceOverrides` inalterados.
- `apps/api-transportada/src/trips/presentation/delivery-proof-settings.routes.ts` — `GET`/`PUT
/company-settings/delivery-proof` tipados em `CompanyDeliveryProofSettings`, `PUT` valida com
  `companyDeliveryProofSettingsSchema`.
- `apps/api-transportada/test/trip-delivery-proof/punctuality-settings.contract.ts` (novo, 9 casos):
  defaults por `GET` sem linha, round-trip `PUT`→`GET`, faixa de cada um dos cinco campos (400 fora),
  inteiro não aceita fração, corpo de exceção continua recusando os campos de pontualidade.
- `apps/api-transportada/test/trip-delivery-proof.contract.test.ts` — import do arquivo acima.
- `apps/api-transportada/test/database-migration/static-migration.contract.ts` — lista estática de
  diretórios de migration ganhou `20260918105116_delivery_proof_punctuality`.

Comandos e resultado:

```
$ bun run db:generate --name delivery_proof_punctuality   # apps/api-transportada
{"status":"ok", ...}
$ bun run db:check                                        # apps/api-transportada
Everything's fine
$ bun run typecheck                                        # raiz, todas as apps — 0 erros
$ bun run lint                                              # raiz, todas as apps — 0 erros
$ bun test ./test/trip-delivery-proof.contract.test.ts     # apps/api-transportada
 65 pass / 0 fail / 99 expect() calls
$ bun test                                                  # apps/api-transportada, suíte completa
 6529 pass / 32 skip / 0 fail / 22700 expect() calls — 180 arquivos
$ make migration-test                                       # raiz — contra o Postgres do docker-compose (transportada-local-postgres-1, saudável)
 97 pass / 0 fail / 1368 expect() calls — inclui a migration nova aplicada em `database-migration.contract.test.ts`
```

Banco usado na integração: Postgres do `docker-compose.yml` da raiz (`transportada-local-postgres-1`,
porta 65432), já saudável neste worktree — não foi preciso o contorno do Postgres Homebrew descrito
no prompt. Nenhum teste pulou.

Desvio da spec: nenhum. `TRIP_DELIVERY_PROOF_PUNCTUALITIES` duplica os valores de `PROOF_PUNCTUALITY`
(T2) em vez de importar — decisão de camada preexistente no arquivo (ver comentário de
`TRIP_FIELD_CHANNELS`), não um desvio do RF4.

## T5 — `POST /me/trips/current/documents/:documentId/proof` classifica a pontualidade

Arquivos:

- `apps/api-transportada/src/trips/presentation/delivery-proof.schema.ts` — `parseDeliveryProofUpload`
  ganha `latitude`/`longitude` (par obrigatório junto, faixa -90..90/-180..180), `accuracyMeters`
  (≥0) e `capturedAt` (`z.iso.datetime()`), todos opcionais no multipart; inválido → 400
  `invalidRequest` (mesmo `ApiError` do resto do arquivo).
- `apps/api-transportada/src/trips/application/attach-delivery-proof.use-case.ts` — `DeliveryProofUpload`
  ganha `capturedAt`/`position`; `AttachDeliveryProofInput` ganha `now` (relógio do servidor,
  RF5); `DeliveryProofPort` ganha `resolveProofPunctualitySettings` e `findDeliveryContext`, e
  `findProofIdByAttachmentKey`/`saveProof` carregam a pontualidade. Para `kind = 'photo'`,
  `classifyPhotoPunctuality` junta configuração + contexto do evento e chama
  `classifyProofPunctuality` (T2); para `kind = 'signature'`, grava `not_required` direto (RF4).
  `attachDeliveryProof` devolve `{ id, punctuality }`; reenvio pela mesma `attachmentKey` devolve a
  pontualidade já gravada, sem reclassificar.
- `apps/api-transportada/src/trips/infrastructure/drizzle-delivery-proof.repository.ts` —
  `resolveProofPunctualitySettings` (config geral, fábrica se ausente) e `findDeliveryContext`
  (join `trip_stop_events`+`trip_stops` pelo `eventId` já resolvido; `deliveredAt = captured_at ??
recorded_at`); `saveProof`/`buildProofUpsertSet` gravam `latitude`/`longitude`/`accuracyMeters`/
  `capturedAt`/`punctuality` sempre (upsert por `(company, evento, kind)` também substitui a
  pontualidade — RF4 "a pontualidade da foto substituída acompanha a substituta").
- `apps/api-transportada/src/trips/application/driver-field-report.port.ts` +
  `.../infrastructure/drizzle-driver-field-report.repository.ts` — `saveDeliveryProofWithinTransaction`
  ganha os mesmos cinco campos, para o canhoto do escritório gravar pela mesma escrita.
- `apps/api-transportada/src/trips/application/report-document-delivery.use-case.ts` —
  `persistOfficeDeliveryProof` (canal `office`, `/deliver` + comprovante na mesma transação) grava
  sempre `not_required`, sem posição — decisão documentada: o canal `office` não entra na nota do
  motorista (RF8 exclui por canal na leitura, T7), então classificar aqui seria trabalho sem efeito;
  manter o mínimo que não quebra os testes existentes de `office-field-delivery.contract.ts`.
- `apps/api-transportada/src/trips/presentation/me-trip.routes.ts` — `attachProof` devolve
  `punctuality`; resposta `201 { data: { id, punctuality } }`.
- `apps/api-transportada/src/main.ts` — `attachProof` (rota do motorista) ganha `now: new Date()`;
  `field-proof` do escritório (rota separada de `/deliver`) também ganha `now` e passa
  `capturedAt`/`position` como `undefined` — ela ainda classifica (kind `photo`), mas sem posição
  conta como `away`/`late_and_away`; irrelevante para a nota (RF8 filtra por canal).
- Ajustes mecânicos de tipo em `test/driver-trip/office-field-delivery.contract.ts`,
  `test/field-trip-target/use-cases.contract.ts`, `test/trip-delivery-proof/receiver-document.contract.ts`,
  `test/integration/trip-field-office.integration.ts` (dublês de `DeliveryProofPort` e uploads
  ganham os campos novos; nenhuma asserção mudou de sentido).
- `apps/api-transportada/test/driver-trip/delivery-proof.contract.ts` (ampliado) — aceite 3 (posição
  a 0 m, 10 min depois → `on_time`), aceite 4 (2h depois → `late`; sem posição → `away`), assinatura
  grava `not_required` mesmo com `photo = required`, foto substituída (mesma `eventId`, chave nova)
  leva a nova pontualidade, reenvio pela mesma `attachmentKey` devolve `{ id, punctuality }`
  existente sem tocar bucket nem reclassificar.
- `apps/api-transportada/test/integration/me-trip.integration.ts` (novo teste) — contra Postgres
  real: entrega sem coordenada na parada usa a posição do evento (RF6); foto na mesma posição e 5 min
  depois → `on_time`, gravada em `trip_delivery_proofs.latitude`/`punctuality`; segunda foto 3h
  depois e a 1300 km → `late_and_away`.

Comandos e resultado:

```
$ bun run typecheck                                        # raiz, todas as apps — 0 erros
$ bun run lint                                              # raiz, todas as apps — 0 erros
$ bun test                                                   # apps/api-transportada, suíte completa
 6534 pass / 32 skip / 0 fail / 22707 expect() calls — 180 arquivos
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/me-trip.integration.ts
 7 pass / 0 fail / 39 expect() calls   # apps/api-transportada, banco do docker-compose (65432)
```

Banco usado na integração: o mesmo Postgres do `docker-compose.yml` da raiz já saudável neste
worktree (`transportada-local-postgres-1`, porta 65432) — não foi preciso o contorno do Postgres
Homebrew. Nenhum teste pulou (`testWithPostgres` rodou, não caiu em `test.skip`).

Desvios da spec: nenhum nas regras RF3-RF6. Decisão registrada (não desvio): o canal `office`
(`persistOfficeDeliveryProof`, usado só por `/deliver` do escritório) grava `not_required` sem
posição, em vez de classificar — RF8 já exclui entregas do canal `office` da nota, então a
classificação ali seria trabalho sem efeito observável; o `field-proof` do escritório (rota separada,
usada quando a foto sobe depois da entrega) continua classificando normalmente.

## T6 — `/deliver` devolve `proofPending`; snapshot com `proofPending` por documento

Arquivos:

- `apps/api-transportada/src/trips/application/report-document-delivery.use-case.ts` —
  `ReportDocumentOutcomeResult` ganha `proofPending: boolean` (sempre `false` num `return`,
  RF1/RF2); `ReportDocumentDeliveryInput` ganha `resolveProofSettings` opcional (a porta que os três
  canais de produção já usam para resolver o comprovante — opcional só para não quebrar chamador que
  não precisa do campo, nunca bloqueia por ausência: sem ela, `proofPending` sai `false`).
  `resolveProofPendingFlag` (nova função pura sobre `RunOutcomeParams`) calcula: só em
  `document.deliver` (nunca em `return`), `photo` resolvido `required`, e nenhuma foto no evento —
  computado tanto no caminho de sucesso quanto no replay idempotente (a fila offline reenvia a mesma
  chave, e o segundo toque precisa recalcular, não reaproveitar a primeira resposta — a foto pode ter
  chegado entre os dois toques).
- `apps/api-transportada/src/trips/application/driver-field-report.port.ts` +
  `.../infrastructure/drizzle-driver-field-report.repository.ts` — novo
  `findProofExistsForEvent(companyId, eventId, kind)` na transação, usado só para `proofPending`
  (existência, não o proofId — mesma leitura que `saveDeliveryProofWithinTransaction` já grava).
- `apps/api-transportada/src/main.ts` — os três canais (`createMeTripRoutes` do motorista,
  `createTripFieldOfficeRoutes` do escritório, `createDriverWhatsAppFlowActions` do WhatsApp) passam
  `resolveProofSettings: (settings) => <repositório>.resolveProofFieldSettings(settings)`; novo
  `whatsappDeliveryProofRepository` (a instância do WhatsApp nasce antes de `deliveryProofRepository`
  no arquivo, então ganhou a própria, no mesmo molde de `whatsappDriverTripRepository`).
- `apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts` — novo
  `listDeliveryPhotoPresence` (uma consulta por lista de documentos, `selectDistinctOn` no
  `trip_document_id` ordenado por `created_at desc` — pega o **último** evento `delivered`, `left
join` na foto do evento); `toDriverDocument` calcula `proofPending = deliveredAt !== null &&
deliveryProof.photo === 'required' && !hasDeliveryPhoto`.
- `apps/api-transportada/src/trips/application/find-current-driver-trip.use-case.ts` —
  `DriverTripDocument` ganha `proofPending: boolean`.
- `apps/api-transportada/src/fleet/application/driver-score.port.ts` (novo) — `DriverScorePort`
  (`readScores`/`readPenalties`) definida para a T7 implementar (`DrizzleDriverScoreRepository`).
  **`score` não entra no snapshot nesta task** — nenhuma implementação real existe ainda, e a
  instrução foi explícita: nada de stub falso. `FindCurrentDriverTripResult` continua sem `score`;
  fica para a T7 acoplar a porta ao caso de uso e à rota.
- `apps/api-transportada/test/driver-trip/office-field-delivery.contract.ts` — o teste `:313` ("o
  caminho do motorista continua sem validar deliveredAt nem exigir foto") ganhou
  `expect(result.proofPending).toBe(false)`; dois novos testes: `photo = required` sem foto →
  `proofPending: true` **e a entrega continua aceita** (aceite 1), `photo = optional` →
  `proofPending` sempre `false`.
- `apps/api-transportada/test/driver-trip/field-report.contract.ts` (ampliado) — o reenvio da mesma
  `idempotencyKey` recalcula `proofPending` (não reaproveita a primeira resposta), simulando a foto
  chegando entre os dois toques.
- `apps/api-transportada/test/driver-trip/current-trip.contract.ts` (ampliado) — o caso de uso
  repassa `proofPending` do documento tal como o repositório o devolveu, sem recalcular (a conta em
  si é SQL, provada só em integração).
- `apps/api-transportada/test/integration/me-trip.integration.ts` (novo teste) — contra Postgres
  real: `/deliver` sem foto com `photo = required` → `proofPending: true`, aceito (201, não 422); o
  mesmo documento no snapshot também `proofPending: true`; a foto chega depois (rota separada) e o
  snapshot vira `proofPending: false`; a segunda nota da mesma parada, ainda não entregue, nunca fica
  pendente antes da entrega.

Comandos e resultado:

```
$ bun run typecheck                                        # raiz, todas as apps — 0 erros
$ bun run lint                                              # raiz, todas as apps — 0 erros
$ bun test                                                   # apps/api-transportada, suíte completa
 6538 pass / 32 skip / 0 fail / 22722 expect() calls — 180 arquivos
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/me-trip.integration.ts
 8 pass / 0 fail / 43 expect() calls   # apps/api-transportada, banco do docker-compose (65432)
```

Banco usado: o mesmo Postgres do `docker-compose.yml` da raiz (65432), já saudável neste worktree.
Nenhum teste pulou.

Desvios/pendências para a T7: `score` (nota do motorista) fica inteiramente fora desta task, por
decisão explícita do prompt — só a porta (`DriverScorePort`) foi definida. A T7 precisa: implementar
`DrizzleDriverScoreRepository` (uma consulta por empresa+lista de motoristas, sem N+1, `EXPLAIN` na
integração), acoplar `readScores`/`readPenalties` ao `find-current-driver-trip.use-case.ts`
(`score: number | null` na raiz de `FindCurrentDriverTripResult`, não por viagem — é atributo do
motorista) e passar a implementação real em `main.ts`. Nenhum `DriverTripDocument`/`DriverTrip`
existente foi tocado além de `proofPending`.

## T7 — `DrizzleDriverScoreRepository` (uma consulta, sem N+1)

Retomada de uma sessão interrompida: o trabalho não commitado foi revisado arquivo a arquivo e
aproveitado inteiro — repositório, integração, índice com `rollback.sql`, acoplamento ao snapshot e
os ajustes de chamadores. Nada precisou ser corrigido na lógica; o que faltava era a medição do
`EXPLAIN` registrada aqui, o teste do `rollback.sql` e a evidência.

Arquivos:

- `apps/api-transportada/src/fleet/infrastructure/drizzle-driver-score.repository.ts` (novo) —
  `readScores`/`readPenalties` sobre `computeResults`: **uma** consulta de entregas para a lista
  inteira de motoristas + as duas leituras de configuração da empresa (geral e exceções por CNPJ), em
  paralelo. O modo `photo` atual de cada nota sai de `resolveProofSettingsForRecipient`; os pontos e o
  prazo, da configuração geral (sem linha → `DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS`). A regra é
  toda de `computeDriverScore`.
- `apps/api-transportada/src/fleet/application/driver-score.port.ts` — `readPenalties` devolve
  `DriverScoreResult` (nota + penalidades): a ficha da T8 mostra as duas coisas, e duas chamadas
  fariam a mesma consulta duas vezes.
- `apps/api-transportada/src/trips/application/find-current-driver-trip.use-case.ts` — `score` na
  raiz do resultado, lido **só** para o motorista resolvido do vínculo (conta sem cadastro → `null`
  sem consulta), com `now` injetado; `me-trip.routes.ts` serializa `score`.
- `apps/api-transportada/src/main.ts` — `DrizzleDriverScoreRepository` nos dois pontos que montam
  `findCurrentDriverTrip` (rota do motorista e ações do WhatsApp).
- `apps/api-transportada/src/database/trip.schema.ts` + migration
  `drizzle/20260918115535_driver_score_delivered_index/` (`migration.sql`, `snapshot.json`,
  `rollback.sql` à mão) — índice parcial `trip_stop_events (company_id, coalesce(captured_at,
recorded_at)) where kind = 'delivered'`. `static-migration.contract.ts` lista a pasta nova.
- Testes: `test/integration/driver-score.integration.ts` (novo, listado em `test:integration`),
  `test/driver-trip/current-trip.contract.ts` (nota do próprio motorista, perguntada pelo id resolvido;
  conta sem cadastro não pergunta), e chamadores ajustados (`me-trip`, `mixed-cargo-end-to-end`,
  `whatsapp-driver-flow-actions` na integração; `driver-flow-actions` no contrato).

SQL (resumo). Subconsulta `last_delivery`: `select distinct on (trip_document_id) … from
trip_stop_events where company_id = $1 and kind = 'delivered' and coalesce(captured_at, recorded_at)

> = now − 90d order by trip_document_id, created_at desc, id desc`— o último`delivered`de cada nota.
Por fora:`join trip_documents`(empresa + id;`separation_status <> 'returned'`), `left join
> user_company_memberships`(empresa +`user_id = actor_user_id`) → `left join fleet_drivers`(empresa +`membership_id`) — a mesma ligação de `findDriverIdByMembership`do`/me/trips/current`—,`left join
> nfe_documents`(número),`left join nfe_participants` (`role = 'recipient'`, CNPJ para a exceção),
`left join trip_delivery_proofs` (`kind = 'photo'`do evento →`punctuality`); `where channel <>
> 'office' and coalesce(on_behalf_of_driver_id, fleet_drivers.id) in (…ids)`. `company_id`do contexto
em **toda** tabela do join. O recorte de canal fica fora do`distinct on` de propósito: se a última
> entrega da nota foi do escritório, ela sai da nota do motorista.

`EXPLAIN (ANALYZE, BUFFERS)` da consulta real (capturada pelo logger do Drizzle, script no scratchpad
da sessão), Postgres 18.4, 5 empresas × 100 motoristas × 40 000 notas em 365 dias (400 000 eventos,
metade `arrived`), 60% com foto, empresa medida com 80 000 eventos:

|              | leitura de `trip_stop_events`                                                            | linhas lidas → descartadas        | buffers | execução |
| ------------ | ---------------------------------------------------------------------------------------- | --------------------------------- | ------- | -------- |
| sem o índice | Bitmap Index Scan em `trip_stop_events_company_stop_created_at_idx` só por `company_id`  | 80 000 → 70 026 (87,5%) no filtro | 2 110   | 27,8 ms  |
| com o índice | Bitmap Index Scan em `trip_stop_events_company_delivered_at_idx` (`company_id` + janela) | 9 974 → 0                         | 930     | 23,0 ms  |

Sem o índice a leitura cresce com **todo** o histórico da empresa (todos os tipos, todos os anos);
com ele, só com a janela fixa de 90 dias — por isso a migration fica. O resto do plano: `Unique` do
`distinct on` sobre 9 974 linhas, foto por `trip_delivery_proofs_company_event_kind_unique` (index
scan por evento), motoristas e vínculos por hash. Ponto conhecido e aceito: o planejador faz hash de
`trip_documents` da empresa inteira (40 000 linhas, ~6 ms) em vez de ir pela PK por nota; cresce com
o histórico, mas é leitura por índice e não pediu índice novo nesta medição.

`rollback.sql` provado à mão num banco descartável: migrations aplicadas → índice presente (1) →
`rollback.sql` → índice 0, linha do journal 0 → migrations de novo → índice 1.

Comandos e resultado:

```
$ bun run typecheck                                        # raiz — 0 erros
$ bun run lint                                              # raiz — 0 erros
$ DRIZZLE_TEST_DATABASE_URL=… bun --env-file=../../.env.test test --timeout 120000   # contrato
 6571 pass / 1 fail / 23216 expect() calls — 180 arquivos
$ DRIZZLE_TEST_DATABASE_URL=… API_TEST_DATABASE_URL=… bun --env-file=../../.env.test run test:integration
 412 pass / 10 fail / 0 skip / 3100 expect() calls — 79 arquivos
$ … test --timeout 120000 ./test/integration/driver-score.integration.ts
 4 pass / 0 fail   # aceite 5 (85; 3 h sem penalidade; 91 dias, office, devolvida e exceção por CNPJ fora; WhatsApp conta), só o último delivered, vários motoristas numa chamada (null sem histórico), tenant negativo
$ … test --timeout 120000 ./test/integration/{driver-score,me-trip,whatsapp-driver-flow-actions,mixed-cargo-end-to-end}.integration.ts
 14 pass / 0 fail
```

Banco: o Docker não estava de pé nesta sessão (daemon parado), então a integração rodou no Postgres
18.4 do Homebrew em cluster descartável no scratchpad (porta 65433). As falhas são todas de
ambiente, nenhuma em arquivo tocado: 8 de MinIO ausente (`cte-archive-gateway`, `toll-booth-extract`,
`toll-booth-reload` — `OBJECT_STORAGE_UNAVAILABLE`), 1 de `server.integration.ts` que estoura os 5 s
padrão a frio sob a suíte (sozinho, com `--timeout`, 4 pass / 0 fail), e 1 de
`database-migration.integration.ts` (`cte-profile-output-constraints`: o Postgres 18 devolve `23001`
`restrict_violation` onde o teste espera `23503` — a mesma falha aparece no contrato, pelo mesmo
arquivo). Nenhum teste pulou.

Desvios: nenhum na regra. Decisão registrada: o recorte dos 90 dias fica **dentro** do `distinct on`
(para o índice servir); se uma correção de entrega fosse gravada depois com `captured_at` de mais de
90 dias atrás, o evento anterior da mesma nota seria o eleito — caso só teórico, porque o
`captured_at` do motorista é o relógio do aparelho no momento da entrega.

## T8 — nota na frota: `score` em `GET /fleet/drivers` e `GET /fleet/drivers/:id/score`

Arquivos:

- `apps/api-transportada/src/fleet/application/fleet-driver-scores.use-case.ts` (novo) —
  `list` embrulha a listagem existente e faz **uma** `readScores` com os ids da página (nunca uma por
  motorista); `read` confere o motorista na empresa do contexto (`findById`) e só então lê
  `readPenalties` — inexistente ou de outra empresa é `FleetDriverNotFoundError` (404
  `FLEET_DRIVER_NOT_FOUND`, o erro da frota que já existia), sem consultar nota nenhuma. Relógio
  injetado.
- `apps/api-transportada/src/fleet/presentation/fleet.routes.ts` — a listagem serializa `score` por
  item; rota nova `GET /fleet/drivers/:id/score` → `{ data: { score, penalties: [{ tripDocumentId,
documentNumber, deliveredAt, expiresAt, reason, points }] } }`, `fleet.read` (a mesma da
  listagem), `cache-control: no-store`. Nenhuma coordenada na resposta.
- `apps/api-transportada/src/shared/api.constant.ts` — `API_FLEET_DRIVER_SCORE_PATH`.
- `apps/api-transportada/src/main.ts` — `createFleetDriverScoresUseCase` com o
  `DrizzleDriverScoreRepository` da T7; `listDrivers` passa por ele.
- `apps/api-transportada/CLAUDE.md` — parágrafo da nota (onde sai, permissão, sem posição).
- Frontend (compatibilidade, UI é T9/T10): `fleetResponse.validation.ts` valida a ficha com
  `hasOnlyKeys`, então o `score` novo derrubaria a listagem. `driverListFromApi` passa a ler
  `score` (inteiro 0–100 ou `null`) por item e valida o resto como antes; tipo
  `FleetDriverListItem` em `fleet.types.ts` (`FleetDriverPage.items`), `useFleet.hook.ts` ajustado.
  A ficha de criar/editar continua sem `score`. O snapshot do motorista
  (`driverTripResponse.validation.ts`) não é estrito na raiz — `score` é ignorado até a T9.
- Testes: `test/fleet-application/driver-scores.contract.ts` (novo, no entrypoint
  `fleet-application.contract.test.ts`) — uma leitura por página com todos os ids, ficha com
  penalidades, 404 sem ler nota; `test/fleet-http/driver-scores.contract.ts` (novo, no entrypoint
  `fleet-http.contract.test.ts`) — listagem com `score`, rota com `fleet.read` só, 404 de motorista
  alheio, 404 do roteador para id que não é UUID (o `:id` canônico é exigido antes do `parse`), 403
  sem `fleet.read`; `drivers.contract.ts` e as fixtures com `score`;
  `test/separator-role.contract.test.ts` — decisão por escrito: o separador alcança
  `GET /fleet/drivers/:id/score` (a nota já chega na listagem que ele lê para montar a viagem e ordena
  o seletor; a ficha só explica o número). Integração: caso novo em
  `driver-score.integration.ts` — use case com os repositórios reais: listagem com a nota e ficha de
  outra empresa → `FleetDriverNotFoundError` (aceite 6). Frontend: fixtures de listagem com `score`.

Comandos e resultado:

```
$ bun run typecheck                                        # raiz — 0 erros
$ bun run lint                                              # raiz — 0 erros
$ DRIZZLE_TEST_DATABASE_URL=… bun --env-file=../../.env.test test --timeout 120000   # API, contrato
 6579 pass / 1 fail — 180 arquivos   # a única falha é a do Postgres 18 (23001 × 23503), igual à T7
$ … test --timeout 120000 ./test/integration/driver-score.integration.ts ./test/integration/company-user-fleet-link.integration.ts
 11 pass / 0 fail / 0 skip
$ bun run test                                              # apps/frontend-transportada
 4338 pass / 0 fail (+ 2 pass test:hooks)
```

Desvio: o aceite pedia "rota no OpenAPI", mas esta API **não gera OpenAPI** — não há documento,
Scalar nem teste que valide rota contra ele (`grep -ri openapi` em `src/` e `test/` volta vazio; o
`docs/spec/architecture.md` só cita OpenAPI na tabela de stack). O registro exaustivo de rotas que
existe hoje é o `separator-role.contract.test.ts`, e a rota nova entrou nele com a decisão escrita.
Gerar OpenAPI das rotas é trabalho próprio, fora desta spec.

## T9 — PWA: aviso, fotos pendentes, posição no anexo, nota do motorista

Arquivos:

- `apps/frontend-transportada/src/modules/driver-trip/shared/driverTrip.types.ts` — `proofPending`
  no `DriverTripDocument`, `score` na raiz do `DriverTripSnapshot`, `ProofPunctuality` (cópia por
  valor de `delivery-proof-punctuality.policy.ts`).
- `driverTripResponse.validation.ts` — `proofPending` lenient (ausente vira `false`), `score`
  lenient (fora de 0-100 ou ausente vira `null`) — nunca quebra a tela por um campo que ainda não
  chegou.
- `driverTripView.service.ts` — `isProofPendingWarningDue` (RF12) e `listProofPendingDocuments`
  (a lista da tela de pendentes, achatada de todas as viagens do snapshot).
- `DriverStopCard.component.tsx` — aviso (`proofPendingWarning`) antes do botão "Entreguei" quando
  `proofSettings.photo === 'required'` e a nota ainda não foi entregue; nunca bloqueia o botão.
  `DeliveryProofSection` exportada para reúso.
- `pages/DriverPendingProofs.page.tsx` (novo) — lista as notas `proofPending`, reaproveita
  `DeliveryProofSection`, mostra a pontualidade devolvida em linguagem simples quando ela chega.
- `pages/DriverTripWorkspace.page.tsx` — atalho com contagem (`pendingProofs.open`), estado
  `isPendingProofsOpen` no mesmo molde de `isQueueOpen`; `handleProof` compartilhado entre a tela
  principal e a de pendentes.
- `pages/DriverProfile.page.tsx` — seção "Sua nota" (`score` ou "sem nota ainda").
- `offlineAttachments.service.ts` — **revisão do D6**: `enqueueAttachment` não recusa mais com
  `event-not-queued`; sem evento de entrega na fila, usa uma chave sintética
  (`documentAttachmentKey`, `document:${documentId}`) — o anexo de uma nota já entregue (em outra
  sessão, ou pela tela de pendentes) entra na fila do mesmo jeito. `AttachmentSendOutcome`/
  `AttachmentDrainResult` carregam a pontualidade devolvida por anexo enviado
  (`attachmentsSent: {documentId, punctuality}[]`).
- `driverTripClient.service.ts` — `attachProof` aceita `latitude`, `longitude`, `accuracyMeters`,
  `capturedAt` no multipart e devolve `{id, punctuality}` (antes descartava a resposta).
- `hooks/useDriverTrip.hook.ts` — `attachProof` sempre enfileira (nunca mais rota multipart direta:
  o comentário antigo "entrega já enviada segue pela rota multipart direta" saiu); lê
  `readCurrentLocation()` na captura; expõe `proofOutcomeByDocumentId` (a última pontualidade por
  documento nesta sessão, atualizada no `onSuccess` da drenagem).
- Locales (`driverTrip.locale.json`/`.en.locale.json`): `pendingProofs.*`, `proofPendingWarning`,
  `profile.score(None)?`.

Testes: `test/driver-trip/proof-pending.contract.ts` (novo — validação de `proofPending`/`score`,
`isProofPendingWarningDue`, `listProofPendingDocuments`); `test/driver-trip/offline-attachments.contract.ts`
ampliado — o teste antigo "sem evento na fila, devolve `event-not-queued`" virou "grava numa chave
própria do documento" (comportamento mudou por decisão desta task, não regressão), mais o par
offline→online do **aceite 8** (fica na fila sem rede, sobe quando ela volta, com `attachmentsSent`
carregando a pontualidade); `test/driver-trip/dispatch.contract.ts` ajustado (o teste que fixava a
string do caminho multipart direto passou a fixar a ausência dela, `not.toInclude('event-not-queued')`);
fixtures de `occurrence.contract.ts`/`progress.contract.ts` ganharam `proofPending: false`.

Comandos e resultado (`apps/frontend-transportada`):

```
$ bun run typecheck   # 0 erros
$ bun run lint        # 0 erros
$ bun run test        # 4357 pass / 0 fail (+ 2 pass test:hooks)
$ bun run build       # ok
```

Desvio: a pontualidade só aparece na tela quando a foto sobe **nesta sessão** — o snapshot do
motorista não carrega pontualidade por documento (só `proofPending`), e persistir isso no cliente
ficaria fora do escopo desta task (a API não devolve o dado no snapshot, só no `/proof`).

## T10 — Escritório: nota no seletor, na ficha e na frota

Arquivos:

- `fleet/shared/fleet.types.ts` + `fleet.constant.ts` — `FleetDriverPenalty`,
  `FleetDriverScoreResult`, `DRIVER_PENALTY_REASONS`, `driverScorePath`.
- `fleet/shared/fleetResponse.validation.ts` + `fleetClient.service.ts` — `readDriverScore` (`GET
/fleet/drivers/:id/score`), guardas `isDriverPenalty`/`isDriverScoreResult` (nunca aceitam
  coordenada — a chave está fora do `DRIVER_PENALTY_KEYS`).
- `fleet/queries/useDriverScore.query.ts` (novo) — `enabled` só com `driverId` definido (nunca no
  formulário de criação).
- `fleet/components/DriverScoreBadge.component.tsx` (novo) — cor por faixa (`ready` ≥80, neutra
  50-79, `alert` <50, `muted` sem histórico), tokens do design system (`--color-ready/alert/slate`).
- `fleet/components/DriverList.component.tsx`/`DriverPanel.component.tsx` — coluna da nota na
  listagem; tipo `FleetDriverListItem` propagado (o `score` deixou de se perder no viewmodel).
- `fleet/components/DriverForm.component.tsx` — seção "Nota do motorista" na ficha (só quando
  `driver !== undefined`, nunca na criação): badge + tabela de penalidades vigentes (nota fiscal,
  entrega, motivo, pontos, expira em) — nenhuma coordenada.
- `fleet/shared/driverRecommendation.service.ts` (novo) — `sortDriversByScore` (RF11): desc por
  nota, `null` por último, empate por nome (`localeCompare` pt-BR). Pura, sem tela.
- `trip/components/TripQuickCreateDialog.component.tsx`/`TripRouteAssemblyPanel.component.tsx`
  (+ `TripRouteAssemblyDialog` para o tipo do prop) — `activeDrivers` ordenado por
  `sortDriversByScore`; a nota entra como primeira linha da descrição da opção do motorista
  (reaproveita `t('driverScore.*')` do módulo `fleet`, sem duplicar o texto).
- `trip/shared/deliveryProofSettings.service.ts` — os cinco campos do RF7
  (`DELIVERY_PROOF_PUNCTUALITY_FIELDS`, faixas idênticas às do Zod da API,
  `DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS`), `CompanyDeliveryProofSettings` (quatro modos +
  cinco parâmetros — a exceção por CNPJ continua só com os quatro modos).
- `trip/shared/tripClient.service.ts` + `queries/useDeliveryProofSettings.query.ts` — `read`/`save`
  trocam de `DeliveryProofFieldSettings` para `CompanyDeliveryProofSettings`; o `PUT` passa a mandar
  os nove campos (a API exige o corpo `.strict()` inteiro).
- `trip/components/TripDeliveryProofSettingsPanel.component.tsx` — cinco campos numéricos com
  validação de faixa no campo (`aria-invalid` + mensagem), botão de salvar desabilitado enquanto
  algum estiver fora da faixa.
- Locales: `fleet.locale.json`/`.en` (`driverScore.*`, `penaltyReason.*`, `penaltyColumn.*`,
  `driverScoreSectionTitle/Hint`, `driverPenaltiesTitle/Empty`); `trip.locale.json`/`.en`
  (`deliveryProofSettings.punctuality.*`).

Testes: `test/fleet/driver-recommendation.contract.ts` (novo — aceite 7: ordena por nota, `null`
por último, empate por nome, não muta a entrada); `test/trip/delivery-proof-punctuality-settings.contract.ts`
(novo — faixas idênticas às da API, `isCompanyDeliveryProofSettings`, rótulo de cada campo no
locale).

Comandos e resultado (raiz do monorepo e `apps/frontend-transportada`):

```
$ bun run typecheck   # raiz, todas as apps — 0 erros
$ bun run lint        # raiz, todas as apps — 0 erros
$ bun run test        # apps/frontend-transportada — 4357 pass / 0 fail (+ 2 pass test:hooks)
$ bun run build       # apps/frontend-transportada — ok
```

Desvio: `GET /fleet/drivers/:id/score` não tem cache de query além do padrão do TanStack Query — a
ficha relê a nota a cada abertura, como as demais consultas da ficha do motorista; não há
invalidação dedicada porque nada nesta tela grava penalidade (ela é derivada de entregas, fora do
alcance da ficha).

Rotas para print (T12): `/fleet` (aba de motoristas — coluna e ficha), `/trip` (aba "Comprovante de
entrega" — painel de configuração; diálogo de criação rápida e de montagem de rota — seletor de
motoristas), `/minha-viagem` (card da parada com aviso, Perfil com a nota, tela de fotos pendentes
via o atalho no topo).

## T11 — correção da revisão (backend: API e worker) — **aberta, falta o frontend**

Decisões do usuário (2026-09-18): D1 sem retroatividade, D2 WhatsApp fora da nota, D3a relógio do
aparelho com prazo, D3b substituta fica com a pior pontualidade, D4 penalidades seguem `fleet.read`.
Registradas em `spec.md` (RF2–RF9, RF13, casos extremos) e em ADR-0068 (emenda 2026-09-18). Teste
escrito antes da correção em cada item.

| #      | Achado                                                                  | Correção                                                                                                                                                                                                                                                                                                                                                                              | Teste                                                                                                                                                                                                             | Commit                 |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1 ALTO | Viagem concluída some do snapshot e a foto pendente fica inalcançável   | `pendingProofs` na raiz de `GET /me/trips/current` (vazio sem cadastro, presente sem viagem ativa); `listPendingProofs` com o recorte de tripulação do `/proof` e `TRIP_DISPATCHED_STATUSES` (inclui `completed`). `/proof` em viagem `completed` confirmado                                                                                                                          | `current-trip.contract.ts` (2 novos); integração `me-trip` "a última entrega conclui a viagem e a pendente continua listada" (concluída → `trips: []`, pendentes listadas, `/proof` aceita, sai da lista, tenant) | `75c31fb9`             |
| 2 ALTO | `field-proof` do escritório penalizava (sem posição = `away`) ou lavava | canal `office` não classifica: `not_required` fundido com a anterior (`mergeProofPunctuality`); comentário de `main.ts` corrigido                                                                                                                                                                                                                                                     | `office-field-delivery.contract.ts` (3 casos, sem ler configuração); integração `trip-field-office`: motorista `late_and_away` + canhoto do escritório → fica `late_and_away`; sem foto anterior → `not_required` | `2bf747b5`             |
| 3 ALTO | No-op `alreadySettled` gravava `delivered` novo que escondia a foto     | no-op devolve o último evento do tipo (`findLatestEventForDocument`); só nota sem evento (legado) grava um. Resposta segue 201 `alreadySettled: true`                                                                                                                                                                                                                                 | `field-report.contract.ts` (2 novos); integração `trip-field-office`: baixa do escritório com foto + `deliver` repetido do motorista → mesmo evento, `proofPending: false`, 1 `delivered`, nota `null`            | `9ed00ed4`             |
| 4      | `accuracyMeters` sem teto                                               | parse: 0–10000, senão 400; regra: `min(accuracy, proofRadiusMeters)`                                                                                                                                                                                                                                                                                                                  | `proof-location-parse.contract.ts`; `punctuality.contract.ts` "precisão enorme soma no máximo um raio"                                                                                                            | `869cef1b`, `758637d1` |
| 5      | Configuração lida dentro da transação (segunda conexão do pool)         | `resolveOutcomeProofSettings` antes de `unitOfWork.execute`; o `field-proof` do escritório não lê mais a configuração de pontualidade                                                                                                                                                                                                                                                 | contratos de `field-report`/`office-field-delivery` + integrações verdes                                                                                                                                          | `758637d1`             |
| 6      | `PUT` exigia os cinco campos novos                                      | opcionais; ausente mantém o gravado (ou o padrão)                                                                                                                                                                                                                                                                                                                                     | `punctuality-settings.contract.ts` (2 novos)                                                                                                                                                                      | `758637d1`             |
| 7      | Nota varria a empresa; desempate do snapshot divergente                 | subquery só nas notas com entrega dos motoristas pedidos (`buildRequestedDriverDocuments`), `distinct on` segue por nota; snapshot com `desc(id)`                                                                                                                                                                                                                                     | integração `driver-score` "última entrega do escritório tira a nota do motorista" + as 5 anteriores                                                                                                               | `bb788045`, `75c31fb9` |
| 8      | Posição da foto sem prazo (LGPD)                                        | worker `trip.location.purge` zera lat/long/precisão de `trip_delivery_proofs` aos 90 dias (contador `redactedProofs`; `captured_at` fica); índice parcial `trip_delivery_proofs_located_created_at_idx`                                                                                                                                                                               | `purge.contract.ts` (novo caso); `trip-location-purge.integration.test.ts` contra Postgres migrado                                                                                                                | `45fbd11a`             |
| 9      | `params:` do `DrizzleQueryError` ia ao Sentry                           | `scrubSentryEvent` apaga `\nparams: …` de toda string e a chave `params`                                                                                                                                                                                                                                                                                                              | `sentry.contract.ts` "os parâmetros de uma consulta que falhou nunca saem"                                                                                                                                        | `758637d1`             |
| 10     | Multipart novo sem Zod                                                  | `proofLocationSchema`: texto com teto e regex decimal (até 17 casas — `String(number)` do GPS) antes de `Number`                                                                                                                                                                                                                                                                      | `proof-location-parse.contract.ts` (15 casos)                                                                                                                                                                     | `758637d1`             |
| 11     | `new Error('TRIP_STOP_EVENT_NOT_FOUND')`                                | `DeliveryProofEventVanishedError` (`DiagnosableError`)                                                                                                                                                                                                                                                                                                                                | typecheck + contratos                                                                                                                                                                                             | `758637d1`             |
| 12     | Literais repetidos (§16)                                                | `trips/domain/delivery-event.constant.ts` (`DELIVERED_EVENT_KIND`, `DELIVERED_DOCUMENT_STATUS`, `PHOTO_PROOF_KIND`, `RECIPIENT_PARTICIPANT_ROLE`, `REQUIRED_PROOF_FIELD_MODE`) e `shared/time.constant.ts`                                                                                                                                                                            | typecheck                                                                                                                                                                                                         | `758637d1`, `75c31fb9` |
| 13     | Índice de `20260918115535` sem `CONCURRENTLY`                           | **não dá**: o migrator do Drizzle (`pg-core/async/session.js`, `migrate`) roda todas as migrations pendentes numa transação só, e `CREATE INDEX CONCURRENTLY` não roda em transação. Mantido; os três índices novos da T11 são parciais/pequenos. Se a tabela crescer, criar à mão fora do deploy antes da migration (o `IF NOT EXISTS` não existe no gerado — seria migration à mão) | — (documentado)                                                                                                                                                                                                   | —                      |
| 14     | Motorista resolvido pelo vínculo atual                                  | `trip_stop_events.reported_by_driver_id` (FK composta com `fleet_drivers`), gravado por entrega/retorno do app e do WhatsApp; atribuição `on_behalf → reported_by → vínculo`. **Limitação**: evento anterior à T11 segue pelo vínculo (registrado em SECURITY.md e na spec)                                                                                                           | integração `driver-score` "o histórico sobrevive ao desligamento do acesso ao app"; `me-trip` confere a coluna gravada                                                                                            | `bb788045`             |
| 15     | Riscos aceitos sem registro                                             | `docs/SECURITY.md` 2026-09-18 (posição/horário declarados pelo cliente; fila offline guarda posição; limitação do item 14)                                                                                                                                                                                                                                                            | —                                                                                                                                                                                                                 | commit de docs         |
| D1     | Retroatividade                                                          | `score_effective_since` (migration grava o instante nas linhas e cria a linha de fábrica de toda empresa sem linha; sem linha depois disso = empresa nova, sem corte); `computeDriverScore({ effectiveSince })`; `pendingProofs` com o mesmo corte                                                                                                                                    | `driver-score.contract.ts` (2 novos); integração "entrega anterior à ativação da nota não conta"; rollback + reaplicação manual (abaixo)                                                                          | `869cef1b`             |
| D2     | WhatsApp na nota                                                        | `eq(channel, 'driver_app')`                                                                                                                                                                                                                                                                                                                                                           | integração aceite 5 com entrega `whatsapp` que não pesa                                                                                                                                                           | `869cef1b`             |
| D3a    | Relógio do aparelho sem prazo                                           | piso `max(entrega − 2 min, recebimento − missingAfterHours)`                                                                                                                                                                                                                                                                                                                          | `punctuality.contract.ts` (2 novos)                                                                                                                                                                               | `869cef1b`             |
| D3b    | Substituta lavava a pontualidade                                        | `mergeProofPunctuality`                                                                                                                                                                                                                                                                                                                                                               | `punctuality.contract.ts` (13 combinações); `delivery-proof.contract.ts` "foto pontual que substitui a tardia continua late"                                                                                      | `2bf747b5`             |

Migrations novas (todas aditivas, com `snapshot.json` e `rollback.sql`):
`20260918132305_driver_score_reported_by_driver`, `20260918133047_driver_score_effective_since`
(com `INSERT … SELECT id FROM companies ON CONFLICT DO NOTHING`), `20260918134113_delivery_proof_location_purge_index`.
Verificação manual contra Postgres 18 descartável: migrar tudo → aplicar os rollbacks de
`effective_since` e `reported_by_driver` → colunas somem (0) → inserir empresa → migrar de novo →
a empresa ganhou linha de fábrica com `score_effective_since` preenchido e as colunas voltaram (2).

Contrato novo para o frontend (`GET /me/trips/current`, campo aditivo):

```json
{
  "data": {
    "isRegisteredDriver": true,
    "score": 85,
    "trips": [],
    "pendingProofs": [
      {
        "documentId": "<trip_documents.id>",
        "tripId": "…",
        "tripStatus": "completed",
        "documentNumber": "1234",
        "documentSeries": "1",
        "recipientName": "…",
        "deliveredAt": "2026-09-18T12:00:00.000Z",
        "deliveryProof": {
          "photo": "required",
          "receiverDocument": "off",
          "receiverName": "optional",
          "signature": "optional"
        }
      }
    ]
  }
}
```

O que o frontend precisa fazer (não feito nesta task):

1. Tela "fotos pendentes" e contador: ler `data.pendingProofs` (raiz) em vez de percorrer `trips` —
   é o único jeito de ver a pendente de viagem concluída; validar o bloco em
   `driverTripResponse.validation.ts` (hoje ignorado por ser chave desconhecida). O anexo continua
   pelo `POST /me/trips/current/documents/:documentId/proof` com o `documentId` do item.
2. `/proof`: `accuracyMeters` acima de 10000 agora é `400` — omitir (ou limitar) a precisão acima de
   10 km antes de enviar, inclusive nos itens já parados na fila offline, senão eles travam.
3. Aviso ao motorista: a foto refeita não melhora mais a pontualidade (D3b), e a foto que sobe depois
   de `missingAfterHours` é tardia mesmo com `capturedAt` antigo (D3a) — o texto do card/pendentes
   que sugere "tire de novo no local" deve dizer isso.
4. Fila offline: prazo de descarte do anexo parado (risco aceito em `docs/SECURITY.md`).
5. Painel de configuração: nada obrigatório (o `PUT` continua aceitando os cinco campos); pode
   omitir os que não mudaram.

Comandos e resultado (Postgres 18 Homebrew descartável na porta 65471 — 65433/65434 estavam
ocupadas por clusters de outras sessões —, `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65471/postgres`):

```
$ bun run typecheck                      # raiz, todas as apps — 0 erros
$ bun run lint                           # raiz, todas as apps — 0 erros
# apps/api-transportada
$ bun --env-file=../../.env.test test --timeout 120000
  6624 pass / 1 fail (6625 em 180 arquivos)
  falha pré-existente de ambiente: "Drizzle migration integration > … fiscal migration"
  (Postgres 18 devolve 23001 onde o teste espera 23503 — cte-profile-output-constraints)
$ bun --env-file=../../.env.test run test:integration
  409 pass / 18 fail (427 em 79 arquivos) — as 18 são de ambiente:
  - 9: auth-me, authentication-repository, database-availability (5 + beforeAll), tenant-context
    leem API_TEST_DATABASE_URL/DATABASE_URL do .env.test (Postgres do Docker quebrado); rodadas de
    novo contra um banco migrado local → 8 pass / 0 fail
  - 8: cte-archive (2) e toll-booth extract/reload (6) precisam do MinIO (59000 não está ouvindo)
  - 1: a mesma migration 23001 do Postgres 18
# apps/worker-transportada
$ bun run test                           # 1382 pass / 0 fail (90 arquivos)
$ DATABASE_URL=<banco migrado> bun test ./test/trip-location-purge.integration.test.ts   # 2 pass
# apps/frontend-transportada (contrato da API mudou só de forma aditiva)
$ bun run test                           # 4357 pass / 0 fail (+ 2 pass test:hooks)
```

T11 **não** fica `[x]`: falta a parte do frontend acima (e a revisão dela).
