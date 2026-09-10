# Spec 111 — tarefas

> 🤖 Modelo: `sonnet` (T2 é 🧠 — regra de ordem no aceite, validada com contrato de comportamento)

- [x] **T1 — A proposta ordena por chave, não por rótulo** (D1). Dep: nenhuma.
      Verificação: `bun test ./test/trip.contract.test.ts` — `proposal-stop-order.contract.ts`.
- [x] **T2 🧠 — O aceite leva a ordem** (D3, D4). Dep: nenhuma.
      Verificação: `bun test ./test/routing-application.contract.test.ts ./test/routing-http.contract.test.ts`.
- [x] **T3 — Setas, prévia e carga seguindo a ordem** (D2, D5). Dep: T1, T2.
      Verificação: `proposal-manual-order.contract.ts`, `manual-creation-convergence.contract.ts`.
- [x] **T4 — Receita em verde** (D6). Dep: nenhuma. Verificação: `proposal-manual-order.contract.ts`.
- [ ] **T5 — Linhas recolhidas e barra na prévia.** Dep: T3. Aberta — ver "Fora do escopo".
