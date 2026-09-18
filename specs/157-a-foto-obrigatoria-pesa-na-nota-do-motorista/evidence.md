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
