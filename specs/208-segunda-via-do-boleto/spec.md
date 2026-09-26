# Feature 208 — "Cliente pediu segunda via do boleto" no catálogo de bootstrap

Origem: pedido direto do usuário (25/09/2026).

## Problema e resultado

O catálogo de bootstrap (`shared/occurrence-type-catalog.constant.ts`) tem sete tipos de
ocorrência — três de `separation`, quatro de `delivery` — que `seedOccurrenceTypeCatalog` grava
para toda empresa sem nenhum tipo cadastrado (`docs/ai-context/api-transportada.md` § "O catálogo
de tipos de ocorrência nasce vazio no banco"). Falta um tipo de rua para o motorista registrar que
o cliente pediu a segunda via do boleto na entrega, sem que isso exija foto nem tire a nota da
viagem.

Resultado: o catálogo de bootstrap ganha o oitavo tipo, "Cliente pediu segunda via do boleto",
etapa `delivery`.

## Fora do escopo

- Empresa já existente (com qualquer tipo cadastrado, mesmo um só) não recebe o tipo novo — é a
  regra de bootstrap-não-sincronização, e continua valendo. Quem quiser o tipo cadastra pela tela
  Configurações → Tipos de ocorrência.
- Mexer em `TRIP_OCCURRENCE_TYPES` (`shared/trip-occurrence.constant.ts`) — ver "Decisão" abaixo.

## Decisão: catálogo de bootstrap, não a lista legada

`OCCURRENCE_TYPE_CATALOG` hoje deriva de `TRIP_OCCURRENCE_TYPES` só por conveniência ("a lista não
é reescrita à mão" — comentário do arquivo), mas `TRIP_OCCURRENCE_TYPES` não é o catálogo
configurável: é o `type` de `trip_document_occurrences`, uma coluna com **CHECK fixo no banco**
(`drizzle/20260902170000_trip_document_occurrences/migration.sql`), cópia por valor no
`frontend-transportada` com contrato de paridade próprio
(`test/trip-occurrence/catalog.contract.ts` ⇄ `frontend-transportada/test/trip/occurrence-catalog.contract.ts`),
e a `stage` de cada tipo decide **permissão** (`resolveOccurrenceStage`, `occurrence.policy.ts`):
mover ou acrescentar ali é migration nova + paridade de frontend + risco de autorização, para uma
tabela que este pedido não toca.

`company_occurrence_types` (o catálogo real, customizável pela tela) é uma tabela sem FK nem CHECK
de valor para `TRIP_OCCURRENCE_TYPES` — `name` é texto livre com `stage` restrita ao enum de etapa
(`galpão`/`rua`), e `attachmentMode`/`leavesDocumentBehind`/`redeliveryPolicy` têm default de
coluna (`'off'`, `false`, `'unset'`). O tipo novo entra só em `OCCURRENCE_TYPE_CATALOG`, como
entrada literal ao lado da derivada — sem migration, sem CHECK novo, sem mexer em permissão.

## Critérios de aceite

- CA1. `OCCURRENCE_TYPE_CATALOG` contém a entrada `{ name: 'Cliente pediu segunda via do boleto',
stage: 'delivery' }`.
- CA2. Prova contra Postgres real: depois do seed, a linha gravada para esse tipo tem
  `attachment_mode = 'off'` e `leaves_document_behind = false` (os defaults de coluna, sem
  escrita explícita).
- CA3. Empresa com qualquer tipo já cadastrado não recebe o tipo novo (regra existente,
  reconfirmada pelo teste que já cobre isso).

## Dúvidas

Nenhuma.
