# Spec 144 — Plano

> 🤖 Modelo: `opus` 🧠 na fase 1 · `sonnet` nas fases 2 a 4

Base: `work/cargo-missing-box` sobre `origin/staging`, já com `da30f9a0` (toda parada entrega caixa ao
empacotador) e `1ca4b17a` (`securesCargo` no detalhe da viagem). Contrato antes do código em toda fase.

## Fase 1 — Regra do resíduo no domínio (🧠 `opus`)

Onde: `apps/api-transportada/src/nfe-documents/domain/cargo-volume.policy.ts` (já exporta
`resolveCargoVolume`, `resolveMeasuredCargoVolume`, `medianBoxVolumeM3`, `countMeasuredBoxes`).

- Nova função pura `resolveDocumentCargoEstimate` com um objeto de entrada (regra 10):
  `{ items: MeasuredCargoItem[], medianBoxVolumeM3: string | null, volumeQuantity: string | null,
volumeFactor: string | null }`. Devolve `{ source: 'measured' | 'partial' | 'estimated',
volumeM3: string, unmeasuredBoxVolumeM3: string | null, unmeasuredBoxCount: number,
estimateSource: 'note' | 'median' | 'none' } | null`, na aritmética da D2, em `bigint` escalado
  (`VOLUME_SCALE`) como o resto do arquivo — nunca float.
- `resolveMeasuredCargoVolume` fica como está (chamadores fora da ocupação; conferir com grep antes de
  tocar). A ocupação passa a chamar a nova função no lugar dos dois passos de hoje
  (`trip-occupancy.support.ts` ~linhas 185–201).
- Contrato `test/cargo-volume/document-box-estimate.contract.ts` (G001) importado em
  `test/cargo-volume.contract.test.ts` — ⚠️ a lista de testes é explícita.

## Fase 2 — A caixa leva o volume presumido até o empacotador (`sonnet`)

- `CargoPlanBox` (`cargo-plan.policy.ts`) ganha `estimatedVolumeM3?: number | null` e
  `productCode?: string | null`. Opcionais, pelo mesmo motivo das restrições da 094.
- `loadMeasuredItems` (`trip-occupancy.support.ts` ~360–450) passa a selecionar `nfeProducts.code`
  e devolver as linhas sem ficha marcadas; `loadTripOccupancy` calcula a estimativa por documento
  (fase 1) e carimba `estimatedVolumeM3` nas caixas sem ficha daquele documento. A caixa medida não
  recebe nada.
- `toPlacementBoxes` (`cargo-layout.policy.ts` ~559) aplica a D1:
  `medida ? caixa : resolveFallbackBox(box.estimatedVolumeM3 ?? fallbackVolumeM3)`; sem os dois,
  `notMeasured` como hoje.
- `cargo-layout-conservation.contract.ts` estendido (G002, vermelho antes) e um caso novo em
  `cargo-layout.contract.ts` para G003.
- ⚠️ Prévia e detalhe são dois caminhos (`preview-trip-cargo.use-case.ts` e
  `drizzle-trip.repository.ts` ~786): os dois recebem as caixas de `loadTripOccupancy`, então o carimbo
  vale para ambos sem código repetido. `documentNumber` hoje é carimbado só no repositório
  (~linha 819); a prévia precisa do mesmo para a lista da D4.

## Fase 3 — Lista do que falta medir, da API à tela (`sonnet`)

- `ResolvedCargoLayout.pendingMeasurements` montada em `resolveCargoLayout` a partir de `stop.boxes`
  sem as três dimensões: agrupa por (`documentNumber`, `productCode`), soma `count`, ordena por
  `boxCount` desc.
- `TripCargoLayoutView` (`trip.port.ts` ~202) e o mapper do repositório; resposta da prévia
  (`cargo-preview.contract.ts` cobre); schema Zod de resposta se houver um para o layout
  (grep `stopsWithoutVolume` em `*.schema.ts` — hoje o grep só acha porta e repositório).
- Frontend `apps/frontend-transportada/src/modules/trip/`: `trip.types.ts` (~393),
  `tripResponse.validation.ts` (~793: chave **opcional**, API antiga não a serve, mesma regra do
  `placement`), `TripCargoPanel.component.tsx` (~157, ao lado de `occupancy.withoutVolume`),
  `trip.locale.json` e `trip.en.locale.json`. Link para a fila de medição usando a rota já existente
  do módulo `nfe-workspace` — conferir o nome da rota antes de escrever.
- Nenhum componente novo se a lista couber no painel; se passar de ~40 linhas de JSX, extrair
  `TripPendingMeasurements.component.tsx` (padrão do módulo).

## Fase 4 — Documentação e gate (`sonnet`)

- `docs/ai-context/api-transportada.md` ~555: precedência D1 e a aritmética D2 no parágrafo das
  "duas origens novas". `apps/api-transportada/CLAUDE.md` §"Carga: cubagem…" aponta para a 144.
  `docs/domain/cargo-placement.md` se descrever a caixa presumida.
- `evidence.md`: saída dos contratos vermelho → verde, `typecheck`, `make check`, e a comparação G006
  (caixas colocadas antes/depois nas viagens reais dos contratos de placement).
- Commits isolados por task; sem push — publicar é
  `git fetch && git rebase origin/staging && git push origin HEAD:staging`, decisão do usuário.

## Riscos

- **Fator de espécie ausente** (`company_cargo_volume_factors` sem a espécie e sem `''`): a nota não
  tem total, degrau 3. É o caso de hoje; não piora.
- **`qVol` menor que Σ linhas sem ficha**: a contagem segue a das linhas; o m³ fecha, a caixa fica
  menor. Registrar no contrato.
- **Resíduo minúsculo** (medido quase igual ao total): caixa presumida de poucos cm³, que o
  empacotador arredonda à célula de 5 cm. Aceitável: é `estimated`, hachurada, e a lista da D4 pede
  a medida. Não inventar piso — piso é regra de negócio nova.
