# Plano — Feature 280

1. API: `scope` em `GET /nfe-documents` (`buildDocumentListFilters`) e `finishedWithinDays` em `trip-report-document-filters.query.ts`.
2. Frontend: `useNfeWorkspace` passa o escopo à consulta; pílula e **Mostrar tudo** no mecanismo de pílulas (`nfeDocumentFilterPills.service.ts`, `tripReportFilterPills.service.ts`).
3. Medição em staging e índice, se o `EXPLAIN` pedir.
