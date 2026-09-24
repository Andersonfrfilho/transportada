# Plano — 163

```
apps/api-transportada/
  drizzle/<ts>_package_box_unit_and_estimate/{migration,rollback}.sql       RF01
  src/database/nfe.schema.ts                                                colunas novas
  src/nfe-documents/domain/package-box-estimate.policy.ts                   RF02 (pura)
  src/nfe-documents/domain/package-box-unit-sanity.policy.ts                RF03 (pura)
  src/nfe-documents/domain/package-box-cubage-dimensions.policy.ts          RF07 (pura)
  src/nfe-documents/application/record-package-box-unit.use-case.ts         P1 + RF04
  src/nfe-documents/infrastructure/drizzle-package-box-unit.repository.ts
  src/nfe-documents/presentation/…routes.ts                                 PUT unidade + RF08
  test/package-box-estimate/*.contract.ts, test/integration/package-box-unit-estimate.integration.ts
apps/frontend-transportada/src/modules/…/package-box queue                  RF09
scripts/box-catalog-harvest/{cosmos-capture.user.js, assisted-capture-server.ts}   RF06
```

## Algoritmo da estimativa (RF02)

Para cada fatoração inteira `a×b×c = n` e cada permutação das arestas da unidade, caixa =
`(a·u1+8, b·u2+8, c·u3+8)` mm (4 mm por face). Escolhe menor área `2(xy+xz+yz)`; empate → menor
maior aresta. Peso = `round(n × peso_unidade × 1,05)`. Volume = produto / 1000.
`n` primo grande (ex.: 7, 11) cai em `1×1×n` — aceitável, rótulo de estimativa cobre.

## Pontos de consumo da cubagem (RF07)

Levantar com `grep` os leitores de `length_mm` de `nfe_package_boxes` (ocupação do baú, layout de
carga, exportações) e trocar por `resolveBoxDimensionsForCubage`. Exportação de medidas continua só
com medida real.

### Pontos de consumo — levantamento da T007 (22/09/2026)

Varredura: `grep -rnE "nfePackageBoxes\.(lengthMm|widthMm|heightMm)|nfe_package_boxes|length_mm"` em
`apps/api-transportada/src`, `apps/worker-transportada/src`, `apps/cron-transportada/src` e
`apps/frontend-transportada/src`, mais os leitores do resultado (`loadTripOccupancy`,
`boxesByDocument`, `measuredShapes`). Só **um** arquivo lê as dimensões da caixa para cubagem; os
demais leem para exibir, validar ou gravar a medida real.

| #   | Arquivo:linha                                                                                                                                                                                                              | O que lê                                                                                                                                                                                         | Decisão                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/api-transportada/src/trips/infrastructure/trip-occupancy.support.ts:392-401` (`boxVolume`) e `:404-409` (`boxLengthMm/boxWidthMm/boxHeightMm` de `loadMeasuredItems`)                                                | m³ da caixa por linha da nota (ocupação do baú, `resolveDocumentCargoEstimate`) e as caixas da planta (`boxesByDocument` → `CargoPlanBox`, entrada do empacotador no worker e do hash da planta) | **`resolveBoxDimensionsForCubage`** — medida real, senão estimada; m³ derivado das dimensões resolvidas. Nota que usou caixa estimada conta como `partial` na ocupação (a pior origem manda) — é essa a marca "contém caixa estimada" (P3). |
| 2   | `apps/api-transportada/src/trips/infrastructure/trip-occupancy.support.ts:455-466` (`measuredBoxes`) e `:504-511` (`measuredShapes`, `medianM3`)                                                                           | formas e mediana das caixas **medidas** da empresa (`isNotNull(measured_at)`) — proporção e volume da caixa presumida                                                                            | **Manter só medida real.** Estimativa alimentando a mediana viraria estimativa de estimativa, e "forma medida" é literalmente o nome do dado.                                                                                               |
| 3   | `apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts:82`, `trip-cargo-layout-input.support.ts:26`, `trip-cargo-preview.query.ts:13`, `drizzle-trip-document-review.repository.ts:75`                 | consumidores de `loadTripOccupancy` (detalhe, entrada da planta, prévia, fila de revisão)                                                                                                        | **Sem troca direta** — herdam a decisão da linha 1 pela função única.                                                                                                                                                                       |
| 4   | `apps/worker-transportada/src/cargo-layout/application/stored-cargo-layout-input.schema.ts`                                                                                                                                | `CargoPlanBox` já resolvido pela API (payload da planta)                                                                                                                                         | **Sem troca** — o worker nunca lê `nfe_package_boxes` para dimensão; recebe as dimensões resolvidas na linha 1. O formato de `CargoPlanBox` (pacote `@adatechnology/cargo-placement`) **não** ganha campo novo.                             |
| 5   | `apps/worker-transportada/src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.ts:525`, `drizzle-nfe-package-box-backfill.repository.ts:59`, `drizzle-nfe-package-box-gtin-backfill.repository.ts:32-132` | inserção da caixa sem medida e backfill de GTIN                                                                                                                                                  | **Não lê dimensão** — fora do escopo.                                                                                                                                                                                                       |
| 6   | `apps/api-transportada/src/nfe-documents/infrastructure/drizzle-package-box.repository.ts:126-143` (`list`, fila do conferente) e `:405-418` (`SIBLING_COLUMNS`)                                                           | medida real exibida na fila e nas irmãs                                                                                                                                                          | **Manter só medida real** nas colunas `lengthMm…`; a T008 acrescenta `unit`, `estimate` e `isEstimated` **ao lado**, nunca no lugar.                                                                                                        |
| 7   | `apps/api-transportada/src/nfe-documents/infrastructure/drizzle-package-box.repository.ts:293-321` (`replicate`, origem)                                                                                                   | medida real da origem copiada para as irmãs                                                                                                                                                      | **Manter só medida real** — replicar estimativa como medida violaria RNF02.                                                                                                                                                                 |
| 8   | `apps/api-transportada/src/nfe-documents/infrastructure/drizzle-package-box-measurement-export.repository.ts:82-108`                                                                                                       | histórico `nfe_package_box_measurements` (exportação de medidas)                                                                                                                                 | **Manter só medida real** (plano: "exportação de medidas continua só com medida real").                                                                                                                                                     |
| 9   | `apps/api-transportada/src/nfe-documents/infrastructure/drizzle-package-box-catalog-import.repository.ts:52,133`                                                                                                           | guarda `length_mm is null` da importação de catálogo (160/162)                                                                                                                                   | **Manter** — é a guarda de "nunca sobrescrever medida humana", não cubagem.                                                                                                                                                                 |
| 10  | `apps/frontend-transportada/src/modules/nfe-workspace/shared/packageBoxClient.service.ts:40` e `components/PackageBoxMeasurementPanel.component.tsx:768,845,969,993`                                                       | medida real da caixa na fila/formulário                                                                                                                                                          | **Manter** a medida real; a T011 acrescenta o selo "Estimada" e as medidas estimadas lendo `estimate`/`isEstimated` da API.                                                                                                                 |

**Decisões da troca (T007, depois do mapeamento):**

- A ocupação **não** ganhou campo novo (`containsEstimatedBoxes`): o frontend valida
  `TripOccupancyView` por `hasExactKeys(TRIP_OCCUPANCY_KEYS)`, e API nova com frontend velho
  derrubaria o detalhe da viagem inteiro. A marca é a origem `partial`, que a tela já imprime ao
  lado do número; campo próprio fica para quando API e frontend puderem subir juntos.
- O m³ da caixa passou do `round(…, 6)` do SQL para `resolveCubageBoxRow` (JS, mesma regra de
  meio-para-cima e mesmas seis casas) — conferido contra o Postgres (`0.004570`), para o hash da
  planta (spec 145 D6) não mudar em viagem nenhuma sem motivo.
- Efeito aceito: caixa só com estimativa deixa a lista "falta medir" da **planta** (spec 144 D4 —
  ela tem dimensão para desenhar). Continua pendente na fila do conferente, com o selo "Estimada".
