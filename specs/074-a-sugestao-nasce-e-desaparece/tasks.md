# Tasks — 074 A sugestão nasce e desaparece

Uma task por vez. Teste **antes** da implementação. Evidência em `evidence.md`.

---

## Fase 0 — Reprovar o código que existe

> 🤖 Modelo: `sonnet`

- [x] **T001** — Teste de **integração** (Postgres real) de `create` do repositório multiveículo:
      empresa, notas e veículos semeados; `create` devolve a sugestão com pool e frota gravados.
      **Tem de falhar** contra o código atual, com `multi vehicle suggestion vanished after insert`.
      **Onde:** dentro de `test/integration/multi-vehicle-suggestion.integration.ts`, que já
      existe, já roda contra Postgres e já está na lista — mas semeia a sugestão por `insert`
      direto (linha 287) e exercita só o **aceite**. `create` nunca é chamado ali.
      **Por que integração:** dublê de repositório não tem duas conexões — ele responde o que o
      Postgres esconde. (RNF1 · CA1)
- [x] **T002** — ~~Acrescentar o arquivo à lista de `test:integration`~~: o arquivo **já está**
      na lista. A lacuna não era de arquivo, era de caminho coberto dentro dele.

---

## Fase A — A correção

> 🤖 Modelo: `sonnet`

- [x] **T003** — Construir o repositório de sugestões **dentro** da transação. T001 passa. (RF1)
- [x] **T004** — Teste: falha no meio da criação não deixa sugestão sem pool. (RF2 · CA2)
- [x] **T005** — Trocar os dois `throw new Error(...)` por erro tipado do domínio, com código
      estável em `shared/errors/codes.ts`. (RF3 · CA4)

---

## Fase B — O erro que se pode diagnosticar

> 🤖 Modelo: `sonnet`

- [x] **T006** — Teste do filtro de exceção: erro desconhecido registra `message` além de
      `errorName`, e a resposta ao cliente segue `INTERNAL_ERROR` sem detalhe. (RF4 · CA5, RNF3)
- [x] **T007** — Implementar. (RF4)
- [x] **T008** — Contrato: nenhum campo de dado pessoal no que o filtro registra. (RNF2 · CA6)

---

## Fase C — A borda que estava atrás do 500

> 🤖 Modelo: `sonnet`

- [x] **T009** — Teste: nota já vinculada a outra viagem responde **409**, não 500 — a recusa de
      negócio estava inalcançável porque o 500 acontecia antes. (CA3)

---

## Fase D — Fecho

> 🤖 Modelo: `haiku`

- [ ] **T010** — `make check` verde, `make e2e-up` / integração da API verde, evidência completa.
- [ ] **T011** — Verificar em staging pela tela: distribuir notas entre veículos deixa de dar 500.
