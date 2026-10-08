# Plano — 257

Molde: spec 249 (`trip-crew-transfer.persistence.ts`, `trip-crew-transfer.schema.ts`,
`trip-timeline-crew.query.ts`, `TripCrewTransferDialog.component.tsx`).

1. **Domínio**: `TRIP_ACTION.linkDocumentsAfterDispatch`, `isLinkableAfterDispatch(status)`,
   entrada em `trip-allowed-actions.policy.ts` (gate `canReportInField`). Lista explícita de
   `TRIP_STATUSES_BEFORE_DISPATCH` (D10).
2. **Persistência**: `trip-document-link-after-dispatch.persistence.ts` — lock + janela, filtro de
   já vinculadas, insert `loaded`, `trip_document_events`, paradas (D5, só abertas), evento D9,
   auditoria, divergência fiscal (reusa `hasAuthorizedManifest` e a query de readiness).
   Migration aditiva `trip_document_link_events` (+ rollback), schema Drizzle.
3. **Use case + rota + schema Zod**: `POST /v1/trips/:id/documents/after-dispatch`, `OFFICE_REPORT_POLICY`.
4. **Timeline**: `documents_added` em `TRIP_TIMELINE_KINDS` e `trip-timeline-documents.query.ts`.
5. **Painel** (publica antes da API): kind novo na timeline, `tripAllowedActions`, diálogo
   "Adicionar notas" (seletor de notas soltas + motivo), aviso fiscal.
6. **Docs**: OpenAPI gerado da rota, `docs/ai-context/api-transportada.md`, nota na ADR-0043 §2
   (exceção com motivo) e `apps/api-transportada/CLAUDE.md`.
