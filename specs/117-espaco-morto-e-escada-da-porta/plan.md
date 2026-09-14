# Spec 117 — Plano

> 🤖 Modelo: `opus`

1. Medir sobre a planta final do Atego, com cópia instrumentada da política fora de `src/`, quantas
   caixas cada regra ainda segura e onde (`scratchpad/whatif.ts`), e as camadas por fileira
   (`scratchpad/rowlayers.ts`).
2. Separar limite do modelo de defeito da busca com dois tetos sintéticos: as 1417 presumidas numa
   parada só e distribuídas pelas 85 paradas reais (`scratchpad/ceiling.ts`), e as mesmas com cubos
   medidos (`scratchpad/cubes.ts`).
3. Contratos de propriedade antes do código: o cubo não custa mais que a coluna em que entra; a busca
   de lugar deixa fora no máximo a escada da porta (reprova teto fixo de 64); o piso do Atego sobe para
   o que a porta explica.
4. `createDeadSpaceTracker` em `cargo-placement.policy.ts`: forma dominante da fatia, busca de assento
   com folga até o teto menor que a dominante, memória de falha por versão do mapa, mesmo predicado de
   assento da busca comum.
5. Invariantes nas quatro viagens reais (`scratchpad/measure.ts`), tela, documentação e `make check`.
