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

## O que não fechou nesta spec

- **RF07** ("a coluna 'Origem da medida' passa a dizer quem mediu e quando, para a medida digitada
  aqui") não foi implementado. Uma vez medido, o item sai de `pendingMeasurements` — a coluna
  "Origem da medida" da própria tabela não é mais o lugar onde essa informação apareceria; ela
  pertenceria à lista de caixas já medidas (`nfe-workspace`), que RF07 não delimitou com clareza
  suficiente para o escopo desta implementação (fora de `trips/**`, e a fila de medição está
  explicitamente fora do escopo — "Fora do escopo" §1 do `spec.md`). Sinalizado como acompanhamento
  separado abaixo, sem bloquear CA01-CA06, todos cobertos.
