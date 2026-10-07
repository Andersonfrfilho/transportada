# Plano — Spec 253

## Contexto

- `/trips` (`TripWorkspace`) lista viagens; `useTripTable.hook.ts` guarda `filters`, `sort` e a seleção
  (`selectedIds`, podada para a página visível). Não há exportação.
- Os filtros de nota são **locais** na aba NF-e (`NfeDocumentFilterPanel` + `useNfeDocumentTable.hook.ts`).
  A API de viagens não devolve nota nem contratante.
- A exportação em Excel já tem caminho único: `useSpreadsheetExport` → `writeBrandedSpreadsheet` →
  `buildSpreadsheetLayout` (puro). Falta cor por linha.
- Contratante = emitente da nota, ligado a `contractors` por `tax_id`.

## Desenho

```
TripFilters (UI) ─┐
selectedIds ──────┼─► useTripReportExport ─► GET /trip-document-report (paginado, cursor)
                  │                              │
                  │                  tripReportQuery (Drizzle, filtros no SQL)
                  │                              │
                  │                  resolveTripReportTone (pura) ─► tone por linha
                  ▼
           buildTripReportRows ─► useSpreadsheetExport({ rows, rowTones, legend })
```

1. **API** (`apps/api-transportada/src/trips/`):
   - `trip-report.schema.ts` (Zod: query, linha, envelope) e `trip-report.types.ts` (`*Params`/`*Result`).
   - `resolve-trip-report-tone.policy.ts`: função pura `(tripStatus, documentStatuses[]) → tone`,
     usando os grupos de `trip-state.policy.ts`.
   - `list-trip-report.use-case.ts` + repositório `trip-report.repository.ts`: junta `trips`,
     `trip_documents` (sem `released_at`), nota e `contractors` por `tax_id`; filtros no SQL; conta antes
     e recusa acima do teto. Nota = `coalesce(trip_documents.nfe_document_id,
freight_calculations.nfe_document_id)` (molde do alias `nfeDocumentsViaFreight` em
     `drizzle-trip.repository.ts`); `documentIdIn` vale sobre a nota resolvida. Ordem
     `trips.created_at desc, trips.id desc, trip_documents.id desc`; cursor
     `<created_at com µs via to_char>::<tripId>::<tripDocumentId>` com parser próprio (o
     `readPaging` só aceita `<iso>::<uuid>`). Contratante: `left join contractors` por
     `(company_id, tax_id)`, unicidade garantida por `contractors_company_tax_id_unique`; endereço do
     destinatário por `LATERAL … limit 1` (`nfe_addresses` não é único por participante).
   - Rota `GET /v1/trip-document-report` registrada em `trip.routes.ts`. Esta API não tem OpenAPI
     (`apps/api-transportada/CLAUDE.md`): sem Scalar nem teste de cobertura de documento.
   - Erros `TripReportTooLargeError` (`TRIP_REPORT_TOO_LARGE`, 422) e `TripProofReportTooLargeError`
     (`TRIP_PROOF_REPORT_TOO_LARGE`, 422) em `trips/domain/trip.error.ts`, estendendo `ApiError`.
     Não existe `shared/errors/codes.ts`.
2. **Layout** (`shared/spreadsheet/`): `SpreadsheetRowTone` e `SPREADSHEET_ROW_TONES` em
   `spreadsheetLayout.service.ts`; `rows` aceita `{ cells, tone? }` **ou** o formato antigo (união
   discriminada por `Array.isArray`) para não tocar nos outros exportadores; `buildBodyRow` usa o tom
   antes da zebra; `legend` opcional renderizada sob o título.
3. **Front** (`modules/trip/`): tipos em `trip.types.ts` (`TripReportRow`, filtros novos),
   `tripReport.service.ts` (fetch paginado), `useTripReportExport.hook.ts`, `TripReportFilters` dentro do
   `TripFilters.component.tsx` (nota, contratante, cidade, UF, valor, situação da nota), botão na
   `bulkBar` e na barra de filtros, i18n em `trip.locale.json`.
   - **Aba de notas** (`nfe-workspace/`): reaproveita `useTripReportExport` e o botão
     (`TripReportExportButton` em `modules/shared/` ou no módulo de viagens, importado pelos dois, sem
     acoplar um módulo ao outro). A aba traduz o filtro local dela (nota, contratante, cidade, valor)
     para os parâmetros do endpoint; a seleção vai em `documentIdIn`. Notas sem viagem ficam de fora e o
     retorno informa a contagem (`excludedWithoutTrip`).
4. **Docs**: `docs/` do módulo de viagens e o arquivo de contexto de IA (regra 14).

### PDF de canhotos (RF10 a RF12)

- Rota `GET /v1/trip-document-report/proofs-pdf`, mesma query do relatório e `TRIP_FIELD_READ_POLICY`
  (`anyPermission` só é aceito em GET pelo roteador; 100 ids cabem em ~4 KB de URL). Resposta `Response(stream)` com
  `content-disposition: attachment`, `cache-control: no-store`, `application/pdf`.
- `export-trip-proof-pdf.use-case.ts` reaproveita o repositório do relatório para listar as notas e
  busca `trip_delivery_proofs` (`kind = 'photo'`) → `trip_stop_events` por `stop_event_id` →
  `trip_stop_events.trip_document_id`; objeto por `object_id` → `stored_objects.bucket/object_key`;
  ordem `trip_delivery_proofs.created_at asc`; lê cada imagem por `getObjectStream` do `NfeStorageGateway`.
- `trip-proof-pdf.gateway.ts` com `pdfkit`, no molde de `occurrence-statement-pdf.gateway.ts` e
  `invoice-pdf.gateway.ts`; layout puro separado (`trip-proof-page.layout.ts`) para testar a
  disposição sem renderizar. Página A4 retrato em fluxo: o layout puro calcula a altura de cada bloco (1,6 cm de informações + imagem de 5 a 7 cm + 0,4 cm de folga) e vai empilhando enquanto couber na área útil (29,7 − 3 de margens − 1,2 de cabeçalho − 0,8 de rodapé = 24,7 cm); o bloco que não cabe abre a página seguinte. Imagem com `fit` de largura, mínimo de referência 5 cm sem esticar, máximo 7 cm; imagem em retrato é girada 90° com `doc.rotate` (EXIF: não há `sharp` na API; confirmar no spike da T2.4 se o pdfkit 0.19 aplica a orientação). O layout puro expõe essas medidas em constantes (`PROOF_IMAGE_MIN_HEIGHT_CM` e `PROOF_IMAGE_MAX_HEIGHT_CM`; o número total de páginas vem de calcular o fluxo antes de desenhar (para o "Página X de Y")).
- Imagem corrompida ou formato que o `pdfkit` não lê (só JPEG/PNG): a página sai com o aviso
  "Imagem indisponível" e as informações, e o PDF segue (catch local de fallback gracioso, §7).
- Front: `tripProofPdf.service.ts` (POST → blob → `saveArchiveFile`), `useTripProofPdfExport.hook.ts`
  e o botão ao lado do de planilha, nas duas telas.
- Risco: memória e tempo com 200 imagens grandes. O PDF é gravado em streaming, uma imagem por vez; o
  teto e o `AbortSignal` do cliente mitigam. Medir o tamanho do arquivo e, se passar de ~50 MB,
  reduzir a resolução no `fit` (registrar em `evidence.md`).

## Riscos

- **Teto e memória**: 5 000 linhas × paginação de 100 = 50 requisições; mitigado pelo teto e por
  progresso. Se for lento, subir `limit` para 250 (decisão registrada em `evidence.md`).
- **Seleção podada**: `selectedIds` só vale para a página visível; o export com seleção usa o que o
  hook entrega hoje. Se o usuário espera selecionar entre páginas, é outro requisito (anotar).
- **`Promise.all` no front**: as páginas são sequenciais por cursor, sem lote paralelo; busca de
  logo/timbre fica em `Promise.allSettled` dentro de `letterhead.load` (já existente).
- **Contratante sem cadastro**: sem duplicação (índice único `company_id, tax_id`); o risco de linha
  duplicada está em `nfe_addresses`, tratado com `LATERAL … limit 1`.
- **Contraste**: tons só são aceitos com texto escuro e razão ≥ 4,5:1 (teste unitário calcula).

## Contrato HTTP

`GET /v1/trip-document-report`

Query: `cursor?`, `limit?` (1–100, padrão 100), `tripIdIn?` (≤ 100), `documentIdIn?` (≤ 100, para a
seleção feita na aba de notas), `statusIn?` (mesmo parser de `GET /trips`), `vehicleIdIn?`,
`driverIdIn?`, `createdFrom?`, `createdUntil?`, `proofPendingEq?`, `search?`, `contractorIdIn?`
(aceita o marcador `none`), `recipientCityIn?`, `recipientStateIn?`, `valueOperator?` + `valueAmount?`,
`documentStatusIn?`.

200 → `{ data: TripReportRow[], page: { nextCursor, total }, excludedWithoutTrip }` (`total` e
`excludedWithoutTrip` só na primeira página, sem `cursor`);
`TripReportRow = { tripId, tone, documentNumber, documentSeries, accessKey, contractorName,
recipientName, recipientCity, recipientState, amount?, documentStatus, deliveredAt?, returnedAt?,
returnReason? }` (`amount` omitido sem `trip.financials`).
Erros: 400 `INVALID_REQUEST` (query em Zod com `details`, todos juntos) · 401 · 403 · 422 `TRIP_REPORT_TOO_LARGE`.

## Decisão 🧠 que as demais tasks herdam

O contrato acima, a regra de tom e a junção de contratante. Validado com `architect` (opus) em 2026-10-07: APROVADO COM AJUSTES, ajustes aplicados acima
(ver `evidence.md` T1.1).
