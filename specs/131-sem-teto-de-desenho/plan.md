# Spec 131 — Plano

1. Contrato antes: a planta leva toda caixa empacotada (6000 caixas; Atego 85 × 24 = 2040); os dois
   contratos antigos que cobravam o teto são reescritos com a razão.
2. API: tirar `MAX_DRAWN_BOXES` e `trimForDrawing` de `cargo-placement.policy.ts` — só o teto; o
   coração do empacotador é da spec 132.
3. Medir o 3D no navegador (1332 reais, 1500, 3000, 6000) com o componente real.
4. Corrigir o desenho onde passou do orçamento: `filter: brightness` por face virou cor calculada
   (`shadeHexColor`), a profundidade sai uma vez por caixa e a geometria uma vez por ângulo
   (`projectSolids`).
5. Documentação: `docs/domain/cargo-placement.md`, `cargo-placement-defects.md`, `CLAUDE.md`.
