# Spec 116 — Tarefas

> 🤖 Modelo: `opus`

- [x] **T1** — Medir de onde vêm as 435 recusas na entrada real (instrumentação temporária, fora do
      commit). Dependência: nenhuma. Verificação: `scratchpad/diag.ts`. Aceite: quebra por regra.
- [x] **T2** — Contratos de propriedade: vão lateral (duas metades) e piso do Atego. Dependência: T1.
      Verificação: reprovam `6af8669d`. Aceite: 2 falhas no código antigo.
- [x] **T3** — Teto de tentativas proporcional às fileiras. Dependência: T2. Verificação:
      `bun test ./test/cargo-volume.contract.test.ts`.
- [x] **T4** — Vão mais estreito que o giro da pilha é apoio. Dependência: T2. Verificação: idem.
- [x] **T5** — Invariantes nas quatro viagens reais, documentação e gate `make check`. Dependência:
      T3, T4. Verificação: `scratchpad/measure.ts`, `make check`.
