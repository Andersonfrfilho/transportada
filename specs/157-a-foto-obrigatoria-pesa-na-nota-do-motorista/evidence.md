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
