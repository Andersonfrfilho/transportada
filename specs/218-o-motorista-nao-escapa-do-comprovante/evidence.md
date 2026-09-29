# Evidência — Spec 218

## Fase 0 (T0/T0b) — 29/09/2026

Investigação só de leitura, sem edição de código. Achados abaixo já refletidos em `plan.md` e nas
decisões do `spec.md` (D1).

### T0.1 — call site de `document.deliveryProof`

`apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts:835-844`
(`toDriverDocument`):

```
const deliveryProof = resolveProofSettingsForRecipient({
  lookup: proofSettings,
  recipientTaxId: row.recipientTaxId ?? '',
})
```

Segundo call site irmão, para "Fotos pendentes": mesma função, linha 328 do mesmo arquivo. A query
de origem (linhas 395-415, `selectDistinctOn`) já seleciona `recipientTaxId`
(`nfeParticipants.taxId`, linha 407) mas **não** seleciona `emitterTaxId` — RF-C3 precisa adicionar
esse select nos dois pontos.

### T0.2 — call site de `attachmentMode` efetivo para o motorista

`apps/api-transportada/src/trips/presentation/me-trip.routes.ts:721-734`, rota `GET` em
`OCCURRENCE_TYPES_PATH` (`me-trip.routes.ts:99`, `${API_ME_CURRENT_TRIP_PATH}/occurrence-types`) →
`listFieldOccurrenceTypes` em
`apps/api-transportada/src/trips/application/list-field-occurrence-types.use-case.ts:35-47`. Linha
43: `attachmentMode: type.attachmentMode ?? 'off'`. Filtra por `type.active && type.stage ===
TRIP_OCCURRENCE_STAGE.delivery` (linha 41). Reaproveitado por duas rotas: o motorista
(`me-trip.routes.ts:724`) e o escritório em nome do motorista
(`trip-field-office-occurrence.routes.ts:68`) — plugar a resolução de 3 camadas aqui cobre as duas.

### T0.3 — junção `nfe_documents`/`nfeParticipants` → `contractors.taxId`

Não existe leitura (SELECT/JOIN) do lado da API hoje. A ligação existe do lado da **escrita**, no
worker:

- `apps/worker-transportada/src/nfe-imports/domain/delivery-registry.policy.ts:34-41`
  (`resolveDeliveryRegistryCandidates`) pega o `party` com `role === 'emitter'`.
- `apps/worker-transportada/src/nfe-imports/infrastructure/delivery-registry.writer.ts`
  (`ensureDeliveryRegistry`) faz o upsert em `contractors`, chamado de
  `apps/worker-transportada/src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.ts:450-459`.

Ou seja: `contractors.taxId` **já é** o CNPJ do emitente por construção (ADR-0048 §1) — não existe
ambiguidade, só falta o _read_ do lado da API. Primitivos reaproveitáveis:
`findContractorByTaxId`/`findByTaxId` em
`apps/api-transportada/src/delivery-clients/infrastructure/drizzle-contractor.repository.ts:50-59`
(hoje usado por `address-correction`). `emitterTaxId` já sai em `GET /nfe-documents`
(`apps/api-transportada/src/nfe-documents/presentation/nfe-documents.routes.ts:316`, coluna em
`apps/api-transportada/src/database/nfe.schema.ts:505`), só não no snapshot do motorista (ver T0.1).

### T0.4 — rotas de `company_occurrence_types` (CRUD do catálogo)

`apps/api-transportada/src/trips/presentation/trip.routes.ts:174`:
`OCCURRENCE_TYPES_PATH = '/company-settings/occurrence-types'`. Mesmo arquivo hospeda outras rotas
de `company-settings` — confirma que a rota nova de `attachment-overrides` (RF-B3) e o campo `flow`
(RF-B5) entram ali, sem arquivo próprio.

### T0b — os dois botões de ocorrência usam a mesma lista de tipos?

**Não.** Achado que mudou o desenho de D1 (registrado na spec):

- **"Registrar ocorrência" por nota** (`onDocumentOccurrence`,
  `DriverStopCard.component.tsx:832-889`) usa `occurrenceTypes.types` — vindo de `GET
/me/trips/current/occurrence-types` (T0.2), o catálogo configurável de verdade
  (`company_occurrence_types`, com `id`/`name`/`attachmentMode`). A mesma variável é passada para
  `DriverNotDeliveredForm` (linha 898) — "Não entreguei" (spec 179) e "Registrar ocorrência" (spec 079) compartilham a mesma fonte.
- **"Deu problema" por parada** (`DriverStopOccurrenceForm.component.tsx` +
  `useStopOccurrenceForm.hook.ts`) **não usa `occurrenceTypes` em nenhum momento**. Usa
  `DRIVER_OCCURRENCE_KINDS`, constante fixa
  (`apps/frontend-driver/src/modules/driver-trip/shared/driverTrip.types.ts:169-176`):
  `['unexpected_charge', 'long_wait', 'dock_closed', 'appointment_required', 'other']`, cópia por
  valor de `TRIP_STOP_OCCURRENCE_KINDS`
  (`apps/api-transportada/src/database/trip.schema.ts:1265-1272`) — enum fixo em código, gravado em
  `trip_stop_occurrences.kind`, sem nenhum conceito de `attachmentMode`.

**Conclusão:** não é "falta uma regra de roteamento" — são dois modelos de dado incompatíveis (um
configurável com FK para o catálogo, outro fixo em código sem `attachmentMode`). Levado ao usuário
em 29/09/2026; decisão: migrar o enum fixo para dentro do catálogo, com um campo novo `flow`
(`document | stop`) editável na mesma tela de cadastro (`OccurrenceTypeCatalogPanel`). Ver `spec.md`
D1 e RF-B5, `plan.md` "Backend — RF-B5".

## Pendências para a próxima evidência

- Rótulo exato de cada `DRIVER_OCCURRENCE_KINDS` (para nomear os 5 tipos novos do catálogo sem
  inventar texto) — confirmar em `driverTrip.locale.json` na Fase 2.
- Confirmar se o `PUT`/criação de `company_occurrence_types` é a mesma rota (upsert) ou duas
  diferentes, antes de decidir se `flow` é obrigatório só na criação.
