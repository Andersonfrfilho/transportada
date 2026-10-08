# Plano — Spec 258

## Contexto

- Aba de notas: `useNfeDocumentTable.hook.ts` (1370 linhas) avalia **no cliente** (`documentMatchesFilters`,
  `evaluateAdvancedFilter`). `NfeDocumentFilterPanel` (367 linhas) recebe `{ table }` inteiro e lê `filters`,
  `setSelectFilter/setMultiFilter/setTextFilter/setNumberFrom/To/setDateRange/setAmountOperator/Value/
setUnlinkedOnly/setMode`, `mode`, `advancedFilter` e as opções (`cityOptions`, `stateOptions`, `emitterOptions`,
  `textOptions`).
- Relatório: `TripReportFilterPanel` próprio (155 linhas) + `useTripReportFilters`; servidor em
  `trip-report.query.ts` (`buildTripReportConditions`) com 8 filtros; `translateNfeFiltersToTripReport` marca o resto
  como `unsupported`.
- Modelo avançado já existe: `ConditionField` (14), `ConditionOperator`, `OPERATORS_BY_TYPE`, `GroupConnector`.

## Desenho

### Entrega 1

1. **Controlador.** Tipo `NfeFilterPanelController` (somente leitura + setters + opções) em `modules/shared`. O painel
   deixa de receber `UseNfeDocumentTableResult` e recebe o controlador; `UseNfeDocumentTableResult` já o satisfaz
   (estrutural), então a aba de notas só muda o import/prop. É **mover**, não reescrever: nenhum JSX de filtro muda.
2. **Relatório.** `useTripReportFilters` passa a expor o mesmo controlador sobre o estado do relatório; as opções
   (cidades, UFs, emitentes, textos) vêm de um endpoint de **facetas** do relatório (distintos sobre as notas em
   viagem) — não da lista carregada, que é paginada. Campos de viagem (contratante, situação da entrega) continuam
   no painel do relatório, como seção extra acima/abaixo do compartilhado.
3. **Contrato HTTP.** `TripReportFilters` ganha: `numberFrom/numberTo` (string numérica), `issuedFrom/issuedUntil`
   (`YYYY-MM-DD`), `emitterNameIn/emitterTaxIdIn/emitterCityIn/emitterStateIn` (listas), `emitterAddress`,
   `recipientName`, `recipientAddress` (texto), `cteIssued`, `fiscalStatusIn`. Query string no mesmo formato dos
   atuais (CSV nas listas). Zod no limite; chave desconhecida → 400.
4. **SQL.** Texto: `ilike` com `escapeLike`. Número: só notas cujo `number` é `^[0-9]+$` entram na comparação, cast
   `::bigint`. Data: intervalo no dia civil de São Paulo (mesma regra de `issuedAt.slice(0,10)` do cliente — conferir
   fuso). `cteIssued` e `status`: igualdade. Nenhum `sql.raw` novo.
5. **Compatibilidade.** `translateNfeFiltersToTripReport` deixa de produzir `unsupported` para o que agora é
   suportado; o botão de exportar da aba de notas passa a mandar tudo.

### Entrega 2 🧠

6. **Schema Zod da árvore**: no máx. 3 grupos × 10 condições, valor ≤ 200 caracteres, operador validado **contra o
   tipo do campo** (`OPERATORS_BY_TYPE`), `between` exige os dois lados ou um.
7. **Tradutor Drizzle**: `FIELD_COLUMN` (mapa fechado campo→coluna) e `OPERATOR_BUILDER` (mapa fechado operador→
   função); condição sem valor é ignorada como no cliente (`conditionHasValue`); `totalAmount` ausente nunca casa.
   Paridade exigida com `evaluateAdvancedFilter`: um contrato com a **mesma tabela de casos** roda no cliente e no
   servidor.
8. **Transporte**: a árvore vai por `POST` de leitura? Decidir em T5.1 🧠 (URL longa × semântica) — padrão: parâmetro
   `advanced` com JSON, limite de 4 KiB, ou corpo no `POST /trip-document-report/query` já idempotente.

## Riscos

| Risco                                         | Mitigação                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Mover o painel quebra a aba de notas          | Contratos e smoke de `nfe-workspace` rodam **antes e depois** da T2.1; diff do JSX do painel = só props |
| Divergência cliente × servidor nos operadores | Tabela de casos única (T5.3)                                                                            |
| Injeção por valor de filtro                   | Zod + mapas fechados + sem `sql.raw`; `security-reviewer` antes do push da entrega 2                    |
| Consulta lenta com muitos `ilike`             | Limite de 5000 linhas já existe; medir com `EXPLAIN` na T3.3 e registrar                                |
| Opções (facetas) divergirem da lista          | Facetas calculadas com os **mesmos** filtros de viagem, sem os de nota                                  |

## Contrato HTTP (entrega 1)

`GET /trip-document-report?numberFrom=00001&numberTo=99999&issuedFrom=2026-10-01&emitterNameIn=A,B&fiscalStatusIn=authorized`
→ mesmo envelope atual. `GET /trip-document-report/facets` → `{ data: { cities[], states[], emitters[], texts{} } }`.
Permissão: a do relatório (`trip.report`). `companyId` do contexto, nunca do payload.

## Revisão T1.1 (architect, opus, 2026-10-08) — **prevalece sobre o texto acima onde divergir**

**Controlador (substitui o item 1).** Tem 27 membros: avançado (`advancedFilter`, `activeConditionCount`, `addCondition`,
`addGroup`, `removeCondition`, `removeGroup`, `clearConditions`, `updateCondition`, `setGroupConnector`,
`setRootConnector`, `saveAdvancedFilter`), modo (`mode`, `setMode`), `filters`, 9 setters simples e 4 listas de opções.
Mais `capabilities: { unlinkedOnly: boolean; advanced: boolean }` — o relatório liga `unlinkedOnly: false` e
`advanced: false` na entrega 1 (esconde sem bifurcar o JSX). Campos de data seguem `dateFrom`/`dateTo`; `issuedFrom/
issuedUntil` existem só no adaptador HTTP.
**Dependência invertida:** o painel importa tipos/constantes do hook de `nfe-workspace`. A T2.1 move para
`modules/shared/nfe-filter/` os tipos e constantes de filtro (`DocumentFilters`, `EMPTY_FILTERS`, `*_FILTER_FIELDS`,
`CONDITION_*`, `OPERATORS_BY_TYPE`, `AMOUNT_*`, `CTE_ISSUED_*`), o `AdvancedFilterBuilder` e as regras de CSS do painel;
o hook **re-exporta** (imports de `nfeTripReportFilters.service`, pílulas e `viewPreferences.serialization` seguem
valendo). Terceiro consumidor: `TripDocumentSearch`. O relatório usa `EMPTY_REPORT_FILTERS` com `unlinkedOnly: false`.

**SQL (substitui o item 4), com paridade com o cliente — a aba de notas é a referência:**

- **Data:** intervalo semiaberto **em UTC** sobre `reportDocument.issuedAt` (o cliente corta `issuedAt.slice(0,10)`, dia UTC).
  Defeito conhecido, fora do escopo: nota emitida após 21h em Brasília cai no dia seguinte (registrar em `evidence.md`).
- **Número:** `(number !~ '^[0-9]+$' OR number::numeric BETWEEN …)`, cada lado só se informado (o cliente deixa passar
  número não numérico, `Number()`→`NaN`); `::numeric`, nunca `::bigint`. Zod: `^[0-9]{1,15}$`, faixa invertida → 400.
- **`cteIssued`:** não é coluna. `issued` = `EXISTS` em `cte_batch_item_documents`+`cte_batches` (status ≠ `cancelled`) e
  `reportDocument.status = 'authorized'`; `pending` = o resto. **Aproximação documentada** da elegibilidade completa
  (`cte-batch-eligibility.policy.ts`), com testes de borda; predicado de vínculo extraído de
  `buildDocumentBatchLinkFilters` e compartilhado.
- **Emitente:** `legalName`/`taxId` de `reportEmitter`; cidade/UF/endereço exigem **lateral novo** de endereço do emitente
  (hoje só existe o do destinatário). O lateral do destinatário passa a trazer `street/number/district`.
- **Endereço (emitente e destinatário):** `concat_ws(' - ', nullif(concat_ws(', ', nullif(street,''), nullif(number,'')),''),
nullif(district,''))` — a mesma string de `composeAddress`; `ilike` com `escapeLike`.

**Contrato HTTP (corrige a seção):** permissão `TRIP_FIELD_READ_POLICY`; rate limit (60/300 s) e `no-store` herdados;
`/proofs-pdf` usa o mesmo parser e ganha caso de teste próprio; `TripReportRow` não muda; **facetas sem `texts`** na
entrega 1 (o filtro de texto é "contém" livre) — emitentes saem como pares `{ name, taxId }`, teto 500, facetas em
`Promise.all`, mesmo escopo de viagem e **sem** filtro de nota. Envelope das facetas é próprio:
`{ data: { cities, states, emitters } }`.

**Tarefas afetadas:** T1.2 nomeia `TripDocumentSearch`, `cte-issued-filter.contract.ts`, pílulas e
`viewPreferences.serialization` como linha de base; T2.1 inclui mover tipos/CSS/builder e `capabilities`; T3.2 cresce
com o lateral do emitente e o `cteIssued`; T4.1 é **adaptador novo** sobre `TripReportFiltersController`.
