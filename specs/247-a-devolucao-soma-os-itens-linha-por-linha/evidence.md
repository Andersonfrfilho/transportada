# Evidence

## Fase 0 — Conferência

### T0.1 — Conferência dos fatos em origin/staging

**Status**: ✅ Completo

**Distância da branch**: 0 commits (alinhada com origin/staging)

**Fatos conferidos**:

| Arquivo e linha(s) | Fato esperado | Status |
| --- | --- | --- |
| `trip.schema.ts:2522` | `quantity: numeric('quantity', { precision: 12, scale: 3 })` | ✅ Confirmado |
| `trip.schema.ts:2529` | `quantityUnit: varchar('quantity_unit', { length: 20 })` | ✅ Confirmado |
| `trip.schema.ts:2677` | `itemsMode: varchar('items_mode', ...)` | ✅ Confirmado |
| `trip.schema.ts:2686-2693` | `noteMode`, `signatureMode` de spec 246 | ✅ Confirmado |
| `trip-occurrence.constant.ts:61-66` | `OCCURRENCE_MOMENTS` com separation/document/stop/office | ✅ Confirmado |
| `occurrence-template.policy.ts:16-28` | Lista `OCCURRENCE_TEMPLATE_PLACEHOLDERS` com 11 marcadores | ✅ Confirmado |
| `save-occurrence-type.use-case.ts:147` | Zera `emailBody` e `emailSubject` quando há `email_template_key` | ✅ Confirmado (defeito a corrigir em RF2) |

**Conclusão**: Todos os fatos de plan.md § Contexto estão válidos em origin/staging. Nenhuma divergência encontrada.

---

### T0.2 — Consulta só-leitura em staging

**Status**: ⚠️ Não medido

**Motivo**: Acesso ao banco de staging requer credenciais criptografadas. Não exponho credenciais em sessão — conforme instruções da spec, registra-se como não medido e segue-se.

**Consulta esperada**: `SELECT COUNT(*) FROM company_occurrence_types WHERE email_template_key IS NOT NULL AND emails_contractor = true`

(Resultado não medido — não afeta execução das Fases 1 e posteriores)

---

## Fase 1 — Painel e app tolerantes

### T1.1 — `frontend-transportada` validação

**Status**: ⏳ Pendente

---

### T1.2 — `frontend-driver` validação

**Status**: ⏳ Pendente
