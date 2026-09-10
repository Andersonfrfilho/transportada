# Spec 117 — Tarefas

> 🤖 Modelo: `opus`

- [x] **T1** — Medir a quebra das 135 recusas por regra e por posição na entrada real (instrumentação
      no scratchpad, fora do commit). Dependência: nenhuma. Verificação: `scratchpad/whatif.ts`,
      `scratchpad/rowlayers.ts`, `scratchpad/ceiling.ts`. Aceite: divisão entre porta e desarrumação.
- [x] **T2** — Contratos: cubo × coluna, busca até a porta, piso do Atego. Dependência: T1.
      Verificação: reprovam `e0dec156` (2 falhas); o da busca reprova teto fixo de 64 (111 > 96).
- [x] **T3** — Caixa pequena primeiro no espaço morto. Dependência: T2. Verificação:
      `bun test ./test/cargo-volume.contract.test.ts` e `bun run typecheck`.
- [x] **T4** — Invariantes nas quatro viagens e tempo. Dependência: T3. Verificação:
      `scratchpad/measure.ts`.
- [x] **T5** — Tela com 1282+ caixas: redesenho ao girar e destaque por parada. Dependência: nenhuma.
      Verificação: navegador e `scratchpad/render-bench.ts`.
- [x] **T6** — Documentação e gate `make check`. Dependência: T3, T4, T5.
