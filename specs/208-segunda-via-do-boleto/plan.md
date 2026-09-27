# Plano — Feature 208

## Modelo recomendado

> 🤖 Modelo: `sonnet` — mudança mecânica de catálogo, sem decisão de arquitetura.

## Abordagem

1. Acrescentar em `OCCURRENCE_TYPE_CATALOG` (`src/shared/occurrence-type-catalog.constant.ts`)
   uma entrada literal — não derivada de `TRIP_OCCURRENCE_TYPES` — para "Cliente pediu segunda via
   do boleto", etapa `delivery`. Comentário explica por quê (ver spec.md "Decisão").
2. Não tocar em `TRIP_OCCURRENCE_TYPES`, na migration do CHECK, nem na cópia do
   `frontend-transportada` — nenhum dos três é alimentado pelo catálogo de bootstrap.
3. `insertOccurrenceTypes` (repositório do seed) já grava só `{ companyId, name, stage }» — os
defaults de coluna (`attachment_mode = 'off'`, `leaves_document_behind = false`) cobrem os dois
   requisitos do pedido sem campo novo no tipo do catálogo.
4. Teste de contrato (`catalog-seed.contract.ts`) antes do código: a entrada existe com a etapa
   certa.
5. Teste de integração (`occurrence-type-catalog-seed.integration.ts`) antes do código: depois do
   seed, a linha da empresa vazia para esse tipo tem `attachmentMode: 'off'` e
   `leavesDocumentBehind: false`.
6. `test/integration/occurrence-type-catalog-seed.integration.ts` já usa
   `OCCURRENCE_TYPE_CATALOG.length` (não `7` fixo) para contar — não precisa mudar a contagem, só
   acrescentar a asserção de defaults do CA2.

## Riscos considerados e descartados

- **Acrescentar em `TRIP_OCCURRENCE_TYPES`**: dispararia CHECK do banco desatualizado (migration
  nova obrigatória), quebraria o contrato de paridade do frontend
  (`test/trip-occurrence/catalog.contract.ts`), e mudaria a superfície que decide permissão
  (`resolveOccurrenceStage`) — nenhum desses efeitos foi pedido. Descartado; ver spec.md.
- **Campo novo em `OccurrenceTypeCatalogEntry` para `attachmentMode`/`leavesDocumentBehind`**:
  desnecessário — os defaults de coluna já entregam exatamente os valores pedidos, e nenhum dos
  outros sete tipos do catálogo os declara hoje.

## O que este plano não decide sozinho

Nada — mudança aditiva, sem deploy, sem migration destrutiva.
