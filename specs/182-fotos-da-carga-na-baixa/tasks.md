# Tasks — Feature 182

Uma task por vez. Cada uma fecha com typecheck + testes + commit isolado, e evidência em
`evidence.md`. Teste de aceite **antes** da implementação.

## Fase 1 — O banco aceita foto de carga, e ela soma
> 🤖 Modelo: 🧠 `opus`

- [ ] **T1.1** Mapear todo `onConflict` sobre `trip_delivery_proofs` e registrar em `evidence.md`
  qual depende de `trip_delivery_proofs_company_event_kind_unique`.
- [ ] **T1.2** Teste de contrato: `TRIP_DELIVERY_PROOF_KINDS` tem `cargo`; o schema expressa a
  unicidade parcial.
- [ ] **T1.3** Constante + schema + migration aditiva (check com três valores; unicidade parcial
  `where kind <> 'cargo'`) com `rollback.sql` que falha sem apagar. Ajustar os `onConflict` da T1.1
  para repetir o predicado. Fecha com `make migration-test` — **`make check` não cobre migration**.
- [ ] **T1.4** Teste de integração (CA01, CA02): duas linhas `cargo` no mesmo evento convivem, e o
  canhoto do escritório continua substituindo o anterior.

## Fase 2 — A rota do escritório aceita a carga
> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Teste (CA03, CA04, CA05): sexta foto → 422 `TRIP_DELIVERY_PROOF_CARGO_LIMIT`;
  mesmo `attachmentKey` não duplica; acima de 960 KiB ou cabeçalho falso é recusado; `kind:
  signature` no canal `office` é recusado.
- [ ] **T2.2** `kind` opcional em `parseOfficeFieldProofRequest`; ramo `cargo` em
  `persistOfficeProof`; erro de domínio novo e código em `shared/errors/codes.ts`.

## Fase 3 — O assistente coleta a carga
> 🤖 Modelo: `sonnet`

- [ ] **T3.1** Teste: com duas fotos de carga, o envio faz a baixa e depois duas chamadas `cargo`;
  falha numa foto não desfaz a baixa.
- [ ] **T3.2** "Adicionar foto da carga" no `FieldDeliveryReviewStep` (D4), até cinco, com
  miniatura e remover, reduzida por `reduceFieldDeliveryImageToJpeg`. Locale pt-BR e en.

## Fase 4 — O comprovante separa documento de mercadoria
> 🤖 Modelo: `haiku`

- [ ] **T4.1** Teste: `deliveryProof.service` agrupa `cargo` à parte de `photo` e `signature`.
- [ ] **T4.2** `TripDeliveryProof` mostra o grupo de fotos de carga com rótulo próprio (CA06).

## Fase 5 — Revisão de design e usabilidade
> 🤖 Modelo: 🧠 `opus`

- [ ] **T5.1** (CA07) Assistente com canhoto e duas fotos de carga em 375px e 1280, claro e escuro.
  Prints em `specs/182-fotos-da-carga-na-baixa/prints/`.
- [ ] **T5.2** Auditoria do §15 do code-standart: sem PII em log, bucket privado, URL assinada, sem
  stack trace em 500.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/182-fotos-da-carga-na-baixa/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 🧠 → opus · Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet ·
Fase 4 → executor model=haiku · Fase 5 🧠 → opus · revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
A T1.3 fecha com `make migration-test`, não só com `make check`.
Integração: `bun --env-file=../../.env.test run test:integration` de dentro de
apps/api-transportada — sem a flag a integração pula em vez de falhar.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
