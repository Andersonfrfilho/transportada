# 044 — Tarefas

## Fase 1 — Domínio da API

> 🤖 Modelo: `sonnet`

- [x] **T001** — Contrato do rótulo no bloqueio.
      Em `test/nfse-domain/selection.contract.ts`: bloqueio de documento existente carrega `number` e
      `series`; bloqueio `notFound` carrega os dois como `null`; bloqueio `duplicated` (segunda
      ocorrência do mesmo id) carrega o rótulo, porque o documento existe.
      **Aceite:** vermelho registrado.

- [x] **T002** — `NfseSelectionBlock` ganha `number` e `series`.
      `selectNfseCandidates` resolve o rótulo de `documentsById` quando presente, `null` quando não.
      Nenhum I/O novo — o dado já vem de `findSelectionDocuments`.
      **Aceite:** T001 verde, `nfse-domain` verde.

---

## Fase 2 — Fronteira HTTP

> 🤖 Modelo: `sonnet`

- [x] **T003** — O rótulo atravessa o fio.
      `nfse-invoices.routes.ts`: o `map` de `preview.blocked` passa a serializar `number` e `series`.
      Contrato em `test/nfse-invoices-http/` afirmando os quatro campos no corpo da prévia.
      **Aceite:** `nfse-invoices-http` verde.

---

## Fase 3 — Frontend

> 🤖 Modelo: `sonnet`

- [x] **T004** — Tipo e agrupamento com rótulo.
      `NfsePreviewBlock` ganha `number: null | string` e `series: null | string`;
      `groupNfseBlocksByReason` passa a devolver `labels` (até `NFSE_BLOCK_LABEL_LIMIT`) e
      `remainingCount`. Rótulo de documento sem número cai no id — bloqueio tem de aparecer mesmo
      sem nome.
      **Aceite:** suíte de `nfseEmission.service` verde.

- [x] **T005** — Contrato do vocabulário de bloqueio.
      Suíte nova varrendo `emission.blockReason.*` nos dois `*.locale.json` contra a lista de razões
      que a NFS-e devolve — é o que o `defaultValue` esconde hoje.
      **Aceite:** vermelho se faltar verbete; verde com a lista atual.

- [x] **T006** — A seção nomeia, e o botão espera.
      `NfseEmissionDialog`: cada linha vira razão traduzida + rótulos, com "e mais N" acima do teto.
      `isEmissionEnabled` passa a devolver `false` com bloqueio na mesa.
      Verbetes `emission.blockedMore` acentuados nos dois idiomas.
      **Aceite:** `nfse-invoice` e `locale-accents` verdes.

---

## Fase 4 — Fechamento

> 🤖 Modelo: `sonnet`

- [x] **T007** — Gates e evidência.
      Suítes das quatro apps, `typecheck`, `lint`, `format:check`. `evidence.md` com as saídas.
      Confirmar que o 422 de `assertNoNfseBlocks` segue coberto — ele deixa de ser o caminho normal
      e passa a ser guarda de corrida, mas não sai.
      **Aceite:** tudo verde, evidência escrita.
