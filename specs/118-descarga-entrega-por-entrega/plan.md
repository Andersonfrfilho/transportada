# Spec 118 — Plano

> 🤖 Modelo: `opus` (arquitetura do empacotador e simulação independente)

1. Medir: simulação da descarga no scratchpad sobre as plantas reais de `f126792f`.
2. Contrato antes do código: `test/cargo-placement/unloading.contract.ts` + helper
   `unloading-simulation.ts`, sobre as quatro cargas reais (Daily e Sprinter acrescentadas à fixture) e três
   casos sintéticos (faixas finas reprovam, paredes inteiras passam, mais cedo em cima e funda trava).
3. Código em `cargo-placement.policy.ts`: `OpenSides` na grade e nas faixas; faixa da grade ≥ 0,6 m;
   `isOutOfReach` no bloco por ordem de entrega; rendimento da orientação em células.
4. Reescrever, com a razão no teste, os contratos cuja premissa mudou (`slices`, `real-mixed-cargo`,
   `dead-space`).
5. Documentar em `docs/domain/cargo-placement.md` e no `CLAUDE.md`; gate `make check`.
