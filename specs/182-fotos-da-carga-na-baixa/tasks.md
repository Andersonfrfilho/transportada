# Tasks — Feature 182

Uma task por vez. Cada uma fecha com typecheck + testes + commit isolado, e evidência em
`evidence.md`. Teste de aceite **antes** da implementação.

## Fase 1 — O banco aceita a foto de carga

> 🤖 Modelo: `sonnet`

- [ ] **T1.1** Teste de contrato: `TRIP_DELIVERY_PROOF_KINDS` contém `cargo`, e o schema de
      apresentação aceita os três valores e recusa um quarto.
- [ ] **T1.2** `TRIP_DELIVERY_PROOF_KINDS` ganha `'cargo'`; migration aditiva recriando o `check`,
      com `rollback.sql` ao lado. Fecha com `make migration-test` — **`make check` não cobre migration**.
- [ ] **T1.3** Teste de integração: anexar comprovante com `kind: 'cargo'` grava a linha e volta na
      consulta do comprovante. Roda com `bun --env-file=../../.env.test run test:integration`.

## Fase 2 — A assinatura vira primitivo das duas telas

> 🤖 Modelo: 🧠 `opus` — mexe no caminho crítico do motorista

- [ ] **T2.1** Mover `SignaturePad.component.tsx` para `src/components/ui/signature-pad.tsx` e
      `signatureCapture.service.ts` para `src/modules/shared/`. Atualizar `driver-trip` e o contrato
      `test/driver-trip/signature.contract.ts` **no mesmo commit** — ele checa caminho de arquivo e
      quebra ao mover.
- [ ] **T2.2** Rodar a suíte do `driver-trip` inteira e registrar em `evidence.md` que o
      comportamento do motorista não mudou.

## Fase 3 — O assistente coleta o que faltava

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** Teste de aceite (CA01, CA02): assinar grava `signature`; pular não grava e a nota
      fica entregue.
- [ ] **T3.2** Passo de assinatura no `FieldDeliveryWizard`, depois do canhoto, com "pular"
      explícito. Locale pt-BR e en.
- [ ] **T3.3** Teste de aceite (CA03, CA04): duas fotos de carga geram duas linhas `cargo`, e o
      reenvio com o mesmo `attachmentKey` não duplica.
- [ ] **T3.4** "Adicionar foto da carga" no passo de captura, com o mesmo caminho câmera → upload do
      canhoto. O envio monta uma chamada por anexo, sequencial.

## Fase 4 — O comprovante separa documento de mercadoria

> 🤖 Modelo: `haiku`

- [ ] **T4.1** Teste: `deliveryProof.service` agrupa `cargo` separado de `photo` e `signature`.
- [ ] **T4.2** `TripDeliveryProof` mostra o grupo de fotos de carga com rótulo próprio.

## Fase 5 — Revisão de design e usabilidade

> 🤖 Modelo: 🧠 `opus`

- [ ] **T5.1** (CA05) Assistente completo em 375px e 1280, claro e escuro, sem rolagem horizontal.
      Prints em `specs/182-assinatura-e-fotos-na-baixa/prints/`.
- [ ] **T5.2** Auditoria do §15 do code-standart: log sem PII (nome do recebedor **não** vai para
      log), bucket privado, URL assinada, sem stack trace em 500.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/182-assinatura-e-fotos-na-baixa/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 → executor model=sonnet · Fase 2 🧠 → opus (validar com architect antes de mover o
SignaturePad) · Fase 3 → executor model=sonnet · Fase 4 → executor model=haiku ·
Fase 5 🧠 → opus · revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
A T1.2 fecha com `make migration-test`, não só com `make check`.
A T1.3 roda `bun --env-file=../../.env.test run test:integration` de dentro de apps/api-transportada
— sem a flag a integração pula em vez de falhar.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
