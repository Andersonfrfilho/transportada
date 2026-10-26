# Plano — Feature 280

1. API: `scope=unlinked|all` em `GET /nfe-documents` (`buildDocumentListFilters`) e o corte de 30 dias nas consultas de busca de viagens, criação de viagem e roteiro automático.
2. Frontend: `useNfeWorkspace` passa o escopo à consulta; pílula e **Mostrar tudo** no mecanismo de pílulas (`nfeDocumentFilterPills.service.ts`, `tripReportFilterPills.service.ts`).
3. Medição em staging e índice, se o `EXPLAIN` pedir.
