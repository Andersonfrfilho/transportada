# Plano — Feature 317

Leia antes (ordem): spec 060 (D4c/D5), 164 (ponte `returned_goods`, Ressarcimentos), 204 (valor da
cobrança inesperada, nunca implementada), 209 (foto da parada), 218 (`stopKind`), 246/247 (exigência,
valor declarado), 315 (localização e chegada obrigatórias, já em staging — a migration desta spec vem depois da dela; conferir o que ela mudou em `trip_stop_occurrences` antes do T1).

## Fatias

1. **Banco** (aditivo): enum `receiving_charge`; `delivery_charges.stop_occurrence_id` + índice único
   parcial + CHECK; `trip_stop_occurrences.declared_amount`; `company_occurrence_type_photo_slots`;
   `trip_stop_occurrence_photos`; colunas da marca em `delivery_clients`; semeadura e renomeação por
   empresa. Teste em `test/database-migration/` e `make migration-test`.
2. **Domínio/API**: política pura `stop-occurrence-photo-slots.policy.ts` (vagas obrigatórias),
   extensão de `report-stop-occurrence.use-case.ts` (valor, nota, fotos, linha, marca, uma transação),
   `DrizzleOccurrenceChargeReportRepository` devolvendo `receiving_charge` com `photos[]`, rota de limpar
   a marca, travas do RF7 na validação do tipo. Contratos antes do código.
3. **Painel** (`frontend-transportada`): Ressarcimentos com fotos rotuladas, selo e ação na ficha do
   cliente. Publicar primeiro (tolerante a linha nova).
4. **App do motorista** (`frontend-driver`): formulário com valor, seletor de nota e vagas de foto; fila
   com `slotKey`. Publicar por último.
5. **Fechamento**: runbook, `CLAUDE.md`, `evidence.md`, prints, publicação em staging.

## Riscos

- `documentId: null` no app atual: a fatia 4 corrige; até lá o servidor recusa (E8), então o app
  novo e a API sobem juntos para este tipo (tipo `active = false` até lá).
- Fila offline com versão antiga do app: `slotKey` ausente + tipo com vagas = `422`; o app mostra o
  que falta em vez de descartar.
- A 315 já está em staging: a migration desta spec usa timestamp posterior à última do diretório e herda as colunas que a 315 criou.

## Modelo por etapa

Ver `tasks.md` (campo **Modelo**).
