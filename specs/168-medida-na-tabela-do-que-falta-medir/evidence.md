# Evidência — spec 168 (medir o produto na própria tabela do que falta medir)

## O que foi feito

### API (`apps/api-transportada`)

- `src/nfe-documents/domain/pending-measurement-box.policy.ts` (novo): `buildPendingMeasurementBoxKey`
  e `resolveUniquePackageBoxId` — a chave de casamento (nota, produto) e o desempate de ambiguidade,
  puros e testados isoladamente.
- `src/nfe-documents/application/package-box.port.ts`: novo tipo `PendingMeasurementBoxMatch`
  (`boxId`, `unitsPerBox`, `grossWeightGrams`).
- `src/nfe-documents/infrastructure/drizzle-package-box.repository.ts`: novo método
  `findBoxIdsForPendingMeasurements` — um `select` só (join `nfe_products` → `nfe_documents` →
  `nfe_participants` (emitente) → `nfe_package_boxes`), nunca uma consulta por linha renderizada
  (RNF3).
- `src/trips/application/pending-measurement-box-lookup.port.ts` (novo): a porta que o caso de uso
  de leitura da planta usa — desacoplada de `PackageBoxRepositoryPort` de propósito, para não quebrar
  os stubs existentes que já implementam aquela interface.
- `src/trips/application/read-cargo-layout.use-case.ts`: `packageBoxLookup` é dependência opcional
  (default sem caixa nenhuma); cada `pendingMeasurements[i]` ganha `packageBoxId`, `unitsPerBox`,
  `grossWeightGrams` — `null` nos três sem par único (produto sem código, nota sem casamento, ou mais
  de uma caixa possível).
- `src/trips/application/read-cargo-layout.types.ts`: `CargoLayoutPendingMeasurement` e
  `CargoLayoutWithPackageBoxIds`.
- `src/main.ts`: injeta `packageBoxRepository` como `packageBoxLookup` na fábrica de
  `readCargoLayout`.

### Frontend (`apps/frontend-transportada`)

- `src/modules/trip/shared/trip.types.ts`: `TripPendingMeasurement` ganha `packageBoxId`,
  `unitsPerBox`, `grossWeightGrams`.
- `src/modules/trip/shared/tripResponse.validation.ts`: `isPendingMeasurement` valida os três campos
  novos.
- `src/modules/trip/shared/tripPendingMeasurementInline.service.ts` (novo):
  `resolvePendingMeasurementSubmission` — RF02/RF05/CA01/CA03 puro, reusa
  `packageBoxMeasurementUnits.service.ts` (`toMillimetres`, mesma faixa da fila).
- `src/modules/trip/hooks/useMeasurePendingBox.hook.ts` (novo): `useMutation` que chama
  `createPackageBoxClient(...).measureBox` (o mesmo cliente/rota `PUT /nfe-package-boxes/:id` da
  fila — RF03, nunca uma segunda escrita) e invalida `MUTATION_EFFECT.packageBoxMeasurement`, que já
  inclui `trip-cargo-layout`/`trip-cargo-preview` — a linha some e a cubagem se refaz pela releitura
  (RF04, CA02, CA04), nunca por adivinhação local.
- `src/modules/trip/components/TripPendingMeasurements.component.tsx`: três campos por linha
  (comprimento/largura/altura, cm no cabeçalho — RF01), só desenhados com `cargo.measure`
  (`useAuthMeQuery`, RF06/CA05); grava no `onBlur` só com os três preenchidos
  (`resolvePendingMeasurementSubmission`); erro de faixa por campo (`aria-invalid` + mensagem, CA03);
  erro de rede mantém o rascunho (`drafts` nunca é limpo em `onError`, CA06); produto sem
  `packageBoxId` aparece sem campos, com o motivo (`noBoxReason`).
- `src/modules/trip/styles/trip.module.css`: `.measureField*` com os tokens `--field-height-compact`
  / `--field-padding-compact` / `--field-font-size-compact` (nunca altura própria).
- `src/modules/trip/locales/trip.locale.json` + `trip.en.locale.json`: `pendingMeasurement.inline.*`.

### Testes (TDD — escritos antes da implementação)

- `test/nfe-package-box/pending-measurement-box-key.contract.ts` — chave e desempate, puro.
- `test/cargo-volume/cargo-layout-package-box-id.contract.ts` — o caso de uso enriquece
  `pendingMeasurements` com a caixa (casou única / sem caixa / produto sem código / entrada da porta
  / sem `packageBoxLookup` não quebra chamador antigo).
- `test/trip/pending-measurement-inline.contract.ts` — `resolvePendingMeasurementSubmission` +
  asserções estruturais no componente (permissão, reuso do hook, motivo sem caixa, rascunho não
  limpo em erro) + textos pt-BR/en.
- Ajustes em testes existentes que comparavam a planta inteira (`cargo-preview-layout.contract.ts`,
  `trip-cargo-preview-layout.integration.ts`, `pending-measurements.contract.ts`,
  `pending-measurements-export.contract.ts`) para os três campos novos.
- `test/design-system/field-metrics.contract.ts`: `trip.module.css` entrou em
  `COMPACT_HEIGHT_FIELDS`.

## Gates — saída real

### `apps/api-transportada`

```
$ bunx tsc --noEmit
(sem saída — 0 erros)

$ bun --env-file=../../.env.test test --timeout 120000
7155 pass, 23 skip, 0 fail — Ran 7178 tests across 183 files. [24-30s]

$ bun --env-file=../../.env.test run test:integration
489 pass, 7 skip, 75 fail — Ran 571 tests across 105 files. [651s]
```

**Os 75 `fail` da integração são pré-existentes e não pertencem a esta spec.** Toda falha impressa é
`PostgresError: column "event_kind" of relation "trip_status_events" does not exist` — o schema
(`src/database/trip.schema.ts:406`) já declara `event_kind` desde os commits `365bb1a0c` (spec 171) e
`0bdd618cc` (spec 172), ambos anteriores a este trabalho e já no HEAD deste worktree, mas a migration
correspondente não está aplicada no banco descartável desta suíte — drift do worktree compartilhado
(o prompt já avisava: "spec 169, em trip-financials/company-settings" usando a mesma árvore).
Confirmado que nenhuma falha cita `cargo-layout`, `pending`, `package-box` ou "spec 145"/"spec 168" —
os testes de `trip-cargo-layout-read.integration.ts` e `trip-cargo-preview-layout.integration.ts`
(os dois que este trabalho tocou) passaram. Não gerei migration nova: `event_kind` não é campo desta
spec, e mexer nela arriscava colidir com a migration de outro agente na mesma árvore, o que o prompt
pede para evitar.

### `apps/frontend-transportada`

```
$ bun run typecheck
(sem saída — 0 erros)

$ bun run lint
(sem saída — 0 erros)

$ bun run test
4980 pass, 0 fail — Ran 4980 tests across 29 files. [4.4s]
44 pass, 0 fail — Ran 44 tests across 1 file. [test:hooks, 644ms]
```

## Defeito pós-entrega: `packageBoxId` chega `undefined` pelo detalhe da viagem

### Medição

No DOM da bancada, a tabela "O que falta medir" tinha **177 inputs de medida, todos com o id
`pending-measurement-undefined-<dimensão>`** — `measurement.packageBoxId` chegava **`undefined`**
(chave ausente), não `null`. Consequência em cadeia, com o guard `boxId === null` da spec 168:

- `undefined !== null` escapa da guarda em `handleDimensionChange` (linha ~79) e em `dimensionCell`
  (linha ~161) e do ramo `measurement.packageBoxId === null` na tabela (linha ~227) — todas as linhas
  passam a compartilhar o mesmo rascunho `drafts["undefined"]` (preencher uma preenche todas).
- O salvamento no blur envia `id: undefined` — nada é gravado (`select count(*) from
  nfe_package_boxes where length_mm is not null` = 0 depois de o usuário preencher vários campos).

### Causa raiz

Duas rotas servem `TripCargoLayoutView`, e só uma delas enriquece as pendências de medição:

1. **`GET /trips/:id/cargo-layouts/:layoutId`** (polling da prévia/planta) chama
   `createReadCargoLayoutUseCase` (`apps/api-transportada/src/trips/application/read-cargo-layout.use-case.ts:52-70`),
   que usa `packageBoxLookup` para preencher `packageBoxId`/`grossWeightGrams`/`unitsPerBox` — os
   três só existem no tipo local `CargoLayoutPendingMeasurement`
   (`apps/api-transportada/src/trips/application/read-cargo-layout.types.ts:25-28`), que **estende**
   `PendingMeasurement` do pacote `@adatechnology/cargo-placement`
   (importado em `apps/api-transportada/src/trips/application/trip.port.ts:4`).
2. **`GET /trips/:id`** (detalhe da viagem — a rota que a tela realmente usa para desenhar
   `TripCargoPanel`, via `layout={trip.cargoLayout}` em
   `apps/frontend-transportada/src/modules/trip/components/TripDetail.component.tsx:752`) serializa
   `trip.cargoLayout` **direto**, sem passar pelo caso de uso de enriquecimento:
   `apps/api-transportada/src/trips/presentation/trip.routes.ts:1831` (antes da correção) fazia
   `cargoLayout: trip.cargoLayout === null ? null : { ...trip.cargoLayout }` — um spread raso. Como
   `trip.cargoLayout.pendingMeasurements[]` é tipado como `PendingMeasurement[]` puro (o tipo do
   pacote, sem os três campos — confirmado em `apps/api-transportada/src/trips/application/trip.port.ts:247`),
   a chave `packageBoxId` **não existe no objeto**, e o `JSON.stringify` simplesmente a omite. No
   frontend, `measurement.packageBoxId` lê `undefined` — nunca `null`.

O guard do frontend (`isPendingMeasurement`,
`apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts:1005`) exige
`isNullableString(value.packageBoxId)`, que recusa `undefined` — mas ele **não é aplicado** ao
detalhe da viagem: o comentário em
`apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts:934` já registrava,
de propósito, que "o detalhe da viagem não valida `cargoLayout` — ele passa direto, lacuna da spec
076" (para não derrubar a tela inteira por causa da planta). Essa lacuna deliberada é o motivo de a
tabela aparecer sem erro, em vez de a consulta falhar.

### Correção

1. **Origem (API)** — `apps/api-transportada/src/trips/presentation/trip.routes.ts`: nova função
   `serializeCargoLayoutForDetail` substitui o spread raso; cada `pendingMeasurements[i]` ganha
   `grossWeightGrams: null`, `packageBoxId: null`, `unitsPerBox: null` explícitos — a chave passa a
   sempre existir, e ausência vira `null`, nunca `undefined` solto. (O detalhe da viagem continua sem
   o `packageBoxLookup` real — ele exigiria injetar a mesma porta assíncrona no caminho de leitura do
   `getTrip`, fora do escopo mínimo deste defeito; ver "Pendente" abaixo.)
2. **Defesa em profundidade (frontend)** —
   `apps/frontend-transportada/src/modules/trip/components/TripPendingMeasurements.component.tsx`:
   os três pontos que comparavam `boxId === null` (linhas ~79, ~161, ~227) passam a `boxId == null` /
   `measurement.packageBoxId == null` — ausência é ausência, cobre `null` e `undefined` igualmente,
   sem depender de o servidor nunca mais soltar um `undefined`.
3. **Confirmação de gravação (RF04, reclamação do usuário — "não temos botão de salvar medidas")** —
   escolhido um indicador visível por linha (`savedBoxIds`, texto "Medida salva" /
   "Measurement saved") em vez de um botão explícito ou de fazer a linha sumir: a gravação já é
   `onBlur` reusando a mesma mutação da fila (RF03 não pode virar uma segunda escrita), e a lista já
   se refaz pela invalidação de `trip-cargo-layout`/`trip-cargo-preview` quando a leitura confirma o
   `packageBoxId` real — mas até essa releitura devolver a planta enriquecida (que, pelo caminho do
   detalhe da viagem, hoje nunca acontece — ver "Pendente"), a linha não some sozinha. Um texto de
   confirmação some assim que o campo volta a ser editado (não por tempo, para não desaparecer antes
   de o operador olhar de volta à tela) — o critério é "quem preenche precisa saber se salvou", e o
   texto cumpre isso sem depender da releitura.

### Testes novos

- `apps/api-transportada/test/trip-http/detail.contract.ts` — `GET /trips/:id > normalizes
  packageBoxId/grossWeightGrams/unitsPerBox to null in the trip detail layout`: roda no worktree
  (`bun --env-file=../../.env.test test ./test/trip-http.contract.test.ts`, já listado no
  entrypoint); **falha pelo motivo certo** antes da correção (`Received` sem as três chaves,
  `Expected` com `null`) — confirmado revertendo `trip.routes.ts` com `git stash` e rodando de novo.
- `apps/frontend-transportada/test/trip/pending-measurement-inline.contract.ts`: assertivas
  estruturais atualizadas (`packageBoxId == null`, nunca `=== null`), mais três casos novos —
  rascunho sempre indexado por `boxId` real (`drafts[boxId]`), gravação sempre com `id: boxId`, e a
  confirmação visível (`savedBoxIds`, chave i18n `pendingMeasurement.inline.saved` em pt-BR e en).
  Ambos os arquivos já estavam na lista explícita dos `package.json` (não são arquivos novos).
- Chave i18n nova: `pendingMeasurement.inline.saved` em
  `apps/frontend-transportada/src/modules/trip/locales/trip.locale.json` e `trip.en.locale.json`.
- CSS: `apps/frontend-transportada/src/modules/trip/components/TripPendingMeasurements.module.css`
  (arquivo novo, colocado ao lado do componente) — `trip.module.css` está no território de outra
  frente e não foi tocado; o teste `test/design-system.contract.test.ts` (que audita classes CSS
  Module em uso) passou com o módulo novo.

## Gates — saída real desta sessão

```
$ bun run typecheck                                    # raiz — todas as 6 apps
(sem saída — 0 erros)

$ bun run --cwd apps/api-transportada lint
(sem saída — 0 erros)

$ bun run --cwd apps/frontend-transportada lint
(sem saída — 0 erros)

$ bun --env-file=../../.env.test test ./test/trip-http.contract.test.ts   # apps/api-transportada
141 pass, 0 fail — Ran 141 tests across 1 file.

$ bun --env-file=../../.env.test test --timeout 120000                    # apps/api-transportada
7173 pass, 23 skip, 0 fail — Ran 7196 tests across 183 files.

$ bun --env-file=../../.env.test run test:integration                     # apps/api-transportada
564 pass, 7 skip, 0 fail — Ran 571 tests across 105 files. [578.57s]

$ bun test ./test/trip.contract.test.ts                # apps/frontend-transportada
1514 pass, 0 fail — Ran 1514 tests across 1 file.

$ bun test ./test/design-system.contract.test.ts        # apps/frontend-transportada
392 pass, 0 fail — Ran 392 tests across 1 file.
```

## Pendente

- Integração completa rodada até o fim nesta sessão: **564 pass, 7 skip, 0 fail** — sem nenhuma
  falha (o drift de `event_kind` que a spec original registrava não se repetiu; provavelmente outra
  sessão nesta mesma árvore já aplicou a migration entre as duas rodadas).
- **`GET /trips/:id` continua sem `packageBoxId` real** — a normalização feita aqui só evita o
  `undefined` solto (troca por `null` sempre), então toda linha servida por esse caminho aparece como
  "sem caixa do catálogo" (`noBoxReason`), mesmo quando existe casamento único. Medir efetivamente
  pela tabela da viagem só funciona hoje enquanto a planta ainda está sendo servida pela rota de
  polling dedicada (`/cargo-layouts/:layoutId`, que já enriquece). Fechar isso de verdade exige
  injetar o mesmo `packageBoxLookup` (ou equivalente) no caminho de `getTrip`/`serializeTripDetail` —
  mudança de escopo maior (chamada assíncrona nova dentro da leitura do detalhe), fora do que cabe
  numa correção mínima de bug; sinalizo como acompanhamento.

## O que não fechou nesta spec

- **RF07** ("a coluna 'Origem da medida' passa a dizer quem mediu e quando, para a medida digitada
  aqui") não foi implementado. Uma vez medido, o item sai de `pendingMeasurements` — a coluna
  "Origem da medida" da própria tabela não é mais o lugar onde essa informação apareceria; ela
  pertenceria à lista de caixas já medidas (`nfe-workspace`), que RF07 não delimitou com clareza
  suficiente para o escopo desta implementação (fora de `trips/**`, e a fila de medição está
  explicitamente fora do escopo — "Fora do escopo" §1 do `spec.md`). Sinalizado como acompanhamento
  separado abaixo, sem bloquear CA01-CA06, todos cobertos.

## Acompanhamento fechado: `GET /trips/:id` ganha `packageBoxId` real

O "Pendente" acima ficou resolvido nesta sessão: `GET /trips/:id` — a rota que a tela de detalhe usa
de fato — agora resolve `packageBoxId`/`grossWeightGrams`/`unitsPerBox` com o **mesmo**
`PendingMeasurementBoxLookupPort` (`DrizzlePackageBoxRepository.findBoxIdsForPendingMeasurements`,
casado por `buildPendingMeasurementBoxKey`) que `createReadCargoLayoutUseCase` já usava só na rota
dedicada `/cargo-layouts/:layoutId`. Nenhum casamento novo foi escrito — é o mesmo mecanismo, injetado
num ponto novo.

### O que mudou

- `apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts`: `DrizzleTripRepository`
  ganha um terceiro parâmetro de construtor opcional (`{ packageBoxLookup }`, default sem caixa
  nenhuma — mesmo padrão de `createReadCargoLayoutUseCase`). A função interna `readTripDetail` chama o
  novo helper `enrichPendingMeasurementsWithBox` logo depois de `readTripCargoLayout` — **uma consulta
  para todas as pendências**, nunca uma por linha.
- `apps/api-transportada/src/trips/application/trip.port.ts`: `TripCargoLayoutView.pendingMeasurements`
  passa a usar `CargoLayoutPendingMeasurement` (de `read-cargo-layout.types.ts`, já existente) em vez do
  `PendingMeasurement` cru do pacote — a interface do repositório agora declara os três campos.
- `apps/api-transportada/src/trips/presentation/trip.routes.ts`: `serializeCargoLayoutForDetail` para
  de **forçar** os três campos para `null` — agora só normaliza `undefined → null` (rede de segurança),
  preservando o valor real que o repositório já resolveu.
- `apps/api-transportada/src/main.ts`: `packageBoxRepository` (`DrizzlePackageBoxRepository`) é
  construído mais cedo — antes de `tripRepository` — e injetado nele; a instância é a mesma reusada
  mais abaixo pelos demais casos de uso de caixa (nenhuma instância duplicada).

### Sem N+1

Teste novo em `test/integration/trip-detail-query-count.integration.ts` (describe
`the trip detail resolves the box of each pending measurement (spec 168)`), no molde dos dois testes
de contagem de query já existentes no arquivo: semeia uma nota com um produto sem código de caixa
medida, um `nfe_package_boxes` do catálogo que casa por (emitente, código do produto, unidade
comercial), e uma linha `ready` fabricada em `trip_cargo_layouts` (servida via `readPreviousReady`,
que casa só por `companyId`/`tripId`/`status` — sem precisar reproduzir o hash real da entrada). O
teste prova a correção end-to-end contra Postgres: a pendência sai com `packageBoxId`, `grossWeightGrams`
e `unitsPerBox` do catálogo, não `null`. Os dois testes de contagem de query que já existiam no arquivo
continuam provando que o número de `select`s não cresce com o tamanho da viagem — o lookup novo é
sempre uma consulta fixa a mais, do mesmo jeito que `read-cargo-layout.use-case.ts` já fazia.

Também precisou de dois ajustes em `test/integration/trip-cargo-layout-read.integration.ts`: dois
`expect(detail?.cargoLayout)` comparavam contra `resolveCargoLayout(...)` puro, que não tem os três
campos novos no tipo — o `as unknown` (já usado nos vizinhos do mesmo arquivo) resolve o TS sem mudar
o comportamento do teste, já que nesses cenários `pendingMeasurements` é sempre vazio.

### Medido contra o banco de desenvolvimento local (viagem `536b67aa-3409-4ec4-b086-ca5231063edf`)

A API local na porta 53011 exige token Keycloak; sem um fluxo de login à mão nesta sessão, a
verificação foi feita direto no Postgres de desenvolvimento (a mesma base que a API usa), reproduzindo
a consulta que `DrizzlePackageBoxRepository.findBoxIdsForPendingMeasurements` roda: das **59**
pendências de medição da planta `ready` mais recente da viagem, **59 casam uma caixa única** do
catálogo (0 ambíguas, 0 sem casamento) — ou seja, `GET /trips/:id` para essa viagem passa a servir
`packageBoxId`/`grossWeightGrams`/`unitsPerBox` preenchidos em **59 de 59** pendências, contra 0 de 59
antes desta correção.

### Gates — saída real desta sessão

```
$ bun run typecheck                                    # raiz — todas as 6 apps
(sem saída — 0 erros)

$ bun run --cwd apps/api-transportada lint
(sem saída — 0 erros)

$ bun --env-file=../../.env.test test --timeout 120000                    # apps/api-transportada
7196 pass, 0 fail — Ran 7196 tests across 183 files.

$ bun --env-file=../../.env.test run test:integration                     # apps/api-transportada
572 pass, 0 fail — Ran 572 tests across 105 files. [319.00s]
```

Postgres de teste: instância nativa descartável (`initdb`/`pg_ctl`, porta 57018) — o Docker local
(65432) segue com o defeito de I/O já registrado em `banco-de-teste-local-quebrado.md`.
