# Tasks — 042 A nota rejeitada tem saída

Regra da casa: **teste de contrato vermelho antes da implementação**, uma task por vez, evidência em
`evidence.md`. Arquivo de teste novo precisa entrar na lista explícita do `package.json` da app.

---

## Fase 1 — Domínio e banco

> 🤖 Modelo: `sonnet`

- [x] **T001** — Contrato da política de transição.
      `apps/api-transportada/test/nfse-invoices/invoice-state.contract.ts`: para cada um dos nove status,
      fixar o veredito de `issue`, `cancel`, `confirmCancellation` e do novo `discard`, conforme a tabela
      da spec. Deve falhar por `discard` não existir e por `discarded` não estar no catálogo.
      **Aceite:** saída vermelha registrada em `evidence.md`.

- [x] **T002** — Status `discarded` no catálogo e no banco.
      `NFSE_SERVICE_INVOICE_STATUSES` (`database/nfse.schema.ts:62`) ganha `'discarded'`; migration
      versionada alterando o CHECK `nfse_service_invoices_status_check`, com `rollback.sql` ao lado.
      ⚠️ O rollback só volta se nenhuma linha estiver em `discarded` — documentar isso no próprio arquivo.
      **Aceite:** `bun run db:check` limpo e `make migration-test` verde.

- [x] **T003** — Ligar `discard` e completar as tabelas.
      `nfse-invoice-state.policy.ts`: nova ação `discard` (permitida de `rejected` e `failed`, bloqueada
      no resto) e a coluna `discarded` acrescentada às quatro tabelas de transição, sempre bloqueando.
      **Aceite:** T001 verde.

---

## Fase 2 — API

> 🤖 Modelo: `sonnet` (T007 e T009 são 🧠 — o payload congelado é o que a prefeitura vai ler)

- [x] **T004** — Contrato do descarte.
      Rota `POST /nfse-service-invoices/{id}/discard`: `202` sobre `rejected` e `failed`; erro de transição
      no resto; **todos** os vínculos com `cancelled_at` carimbado na mesma transação; e o contrato de
      isolamento multiempresa em `test/nfse-schema/tenant-safety.contract.ts`.
      **Aceite:** vermelho registrado.

- [x] **T005** — Caso de uso e rota de descarte.
      `nfse-invoice-discard.use-case.ts` reusando `releaseInvoiceDocuments` +
      `buildInvoiceLinkReleaseFilters` (o mesmo seam do cancelamento), rota com a política de permissão do
      cancelamento e `idempotency-key`.
      **Aceite:** T004 verde.

- [x] **T006** — Contrato da reemissão simples (sem corpo).
      Rota `POST /nfse-service-invoices/{id}/reissue`: `202` sobre `rejected` e `failed`, fatura em
      `issuing`, `attempt_number` incrementado, payload copiado da tentativa anterior com o **mesmo**
      `payload_sha256`, linha de outbox gravada; erro de transição no resto; isolamento coberto.
      **Aceite:** vermelho registrado.

- [x] **T007** 🧠 — Caso de uso e rota de reemissão.
      Nova tentativa reaproveitando o payload congelado **sem recalcular nada** — o que a empresa aprovou
      na prévia é o que vai. Vínculos permanecem.
      **Aceite:** T006 verde.

- [x] **T008** — Contrato da correção na reemissão.
      Corpo opcional `strict()` com os nove campos corrigíveis da spec. Deve fixar: payload da tentativa
      nova com os campos trocados e `payload_sha256` **diferente**; linha de payload da tentativa anterior
      intacta; `serviceAmount`/`issAmount`/`taker`/`documents` no corpo → `400`; `issRate` corrigida
      recalcula `issAmount` (`serviceAmount × issRate`, `Decimal`) no payload **e** em
      `nfse_service_invoices.iss_amount`; `description` corrigida reescreve a da fatura; nenhuma outra
      coluna da fatura muda; o perfil de emissão não é tocado.
      **Aceite:** vermelho registrado.

- [x] **T009** 🧠 — Correção aplicada ao payload congelado.
      `applyNfseIssuanceCorrection` no domínio (puro: payload anterior + correção → payload novo), e a
      rota passando a aceitar o corpo. O recálculo do ISS é `Decimal`, nunca float.
      ⚠️ Nada de coluna nova: a correção mora na linha de `nfse_issuance_payloads` da tentativa nova.
      **Aceite:** T008 verde, e T006 continua verde (corpo ausente ≠ corpo vazio).

- [x] **T010** — Contrato da devolução das notas.
      Depois do descarte, as mesmas notas passam na seleção de NFS-e (sem `NFSE_DOCUMENT_ALREADY_LINKED`)
      **e** na seleção de lote de CT-e. É a prova de que os dois seams voltaram a enxergá-las.
      **Aceite:** verde sem tocar em `buildActiveInvoiceLinkFilters` nem em `buildActiveNfseLinkFilters` —
      se precisar mudar um dos dois, o desenho da spec está errado e a task para.

---

## Fase 3 — Worker

> 🤖 Modelo: `sonnet`

- [x] **T011** — Contrato do write-back sobre `discarded`.
      Nenhuma transição do worker pode cair sobre uma fatura descartada — reentrega tardia não ressuscita
      o que o operador encerrou.
      **Aceite:** vermelho registrado.

- [x] **T012** — Cópia do catálogo no worker.
      `NFSE_SERVICE_INVOICE_STATUSES` de `database/nfse-issuance-execution.schema.ts` ganha `'discarded'`,
      e `ALLOWED_FROM` de `nfse-write-back.policy.ts` continua sem aceitá-lo em nenhum `kind`.
      ⚠️ É cópia por valor da API — mudou um lado, muda o outro.
      **Aceite:** T011 verde.

---

## Fase 4 — API: prefill da reemissão

> 🤖 Modelo: `sonnet`
>
> Inserida depois da descoberta em T013 original: nenhuma resposta da API expunha o payload
> congelado (nem o detalhe, nem a resposta da reemissão — só o corpo de requisição da reemissão
> conhecia os nove campos). O detalhe da fatura passa a devolver `lastPayload`, que já carrega os
> nove campos corrigíveis **e** `serviceAmount`/`issAmount`/`taker`/`documents` — o mesmo objeto que
> `freezeNfseIssuancePayload` grava, então um único campo cobre o pré-preenchimento e o resumo
> somente-leitura do diálogo de reemissão.

- [x] **T013** — Contrato do payload congelado no detalhe.
      `GET /nfse-service-invoices/{id}` passa a devolver `lastPayload`: `cnaeCode`, `description`,
      `documentCount`, `issAmount`, `issExigibility`, `issRate`, `issWithheld`, `municipalityIbgeCode`,
      `municipalTaxationCode`, `nbsCode`, `serviceAmount`, `serviceListItem`, `takerLegalName`,
      `takerTaxId` — lidos de `findLatestPayload` (hoje só em `NfseInvoiceTransactionPort`; promover para
      `NfseInvoiceReaderPort`, já que é leitura pura e `loadDetail` não abre transação). `null` quando a
      fatura ainda não tem tentativa (`requested`). `test/nfse-invoices-application/invoice-queries.contract.ts`
      ganha o caso; schema de resposta declarado em `nfse-invoices.schema.ts` (hoje não existe nenhum
      schema de resposta para esta rota — só os de corpo de requisição).
      **Aceite:** vermelho registrado.

- [x] **T014** — Expor o payload na rota.
      `loadDetail` busca o último payload via `repository.findLatestPayload` e o use-case devolve
      `NfseInvoiceDetail & { lastPayload }`; `serializeDetail` extrai os campos do JSON não tipado com uma
      função pura e explícita (não confiar na forma do `Record<string, unknown>` sem checagem).
      **Aceite:** T013 verde.

---

## Fase 5 — Frontend

> 🤖 Modelo: `sonnet`

- [x] **T015** — Contrato dos dois botões e do formulário de correção.
      `test/nfse-invoice/*.contract.ts`: **Reemitir** e **Descartar** aparecem só em `rejected` e `failed`;
      descarte pede confirmação; ambos com ícone do design system e `aria-label` onde couber. O diálogo de
      reemissão abre com os nove campos corrigíveis **já preenchidos** com `invoice.lastPayload` (T013), e
      mostra valor do serviço, valor do ISS, tomador e a contagem de notas **somente-leitura** — os mesmos
      campos de `lastPayload`, sem recálculo no cliente. Enviar sem mexer em nada manda corpo ausente, não
      objeto vazio.
      **Aceite:** vermelho registrado.

- [x] **T016** — Botões, diálogo, mutations e rótulos.
      Duas mutations no client do módulo, rótulo de `discarded` no `*.locale.json` (acentuado — o contrato
      `locale-accents` varre), diálogo de confirmação no descarte por ser irreversível. O select de
      exigibilidade usa `@/components/ui/select` (nativo é proibido) e o ISS retido usa
      `@/components/ui/checkbox`.
      **Aceite:** T015 verde e `make check` completo.

---

## Fase 6 — Produção

> 🤖 Modelo: `sonnet`

- [ ] **T017** — Destravar as 16 notas de Ribeirão Preto.
      Com a 042 no ar, **reemitir** a fatura `111e44f5-03bb-407e-9d5c-7747c45075cd` — a rejeição foi
      `Por favor informe o campo "Exigibilidade ISS"`, já corrigida pela 040, então o payload congelado
      deve passar sem correção nenhuma. Se a prefeitura recusar de novo por campo fiscal, corrigir no
      próprio diálogo; só se a recusa for de seleção é que se descarta.
      Sem `UPDATE` manual: a correção é ação de produto, com trilha de auditoria.
      **Aceite:** nota autorizada, ou — no caminho do descarte — as mesmas 16 voltando à seleção.
