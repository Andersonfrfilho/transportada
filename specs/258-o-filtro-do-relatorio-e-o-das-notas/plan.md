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
