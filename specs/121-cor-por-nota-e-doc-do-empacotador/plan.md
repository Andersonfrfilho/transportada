# Spec 121 — Plano

## Ordem

1. **Medir antes de desenhar a paleta.** Redespejar `layout-inputs` com as notas reais (a 119 mediu
   com notas injetadas, porque o despejo era anterior ao carimbo) e contar notas por viagem; gerar a
   paleta por ponto mais distante em três variantes (sem semear, semeando 96 cores de parada na grade
   antiga, semeando na grade densa) e comparar ΔE, contraste e luminância.
2. **Contrato antes do código**, afirmando propriedade e não valor: paleta cresce sem quebrar
   (monotonia do prefixo), cor determinística por nota, nenhuma colisão com `MAP_SURFACE` nem com cor
   de parada nem entre notas, contraste nos dois temas, e a parada identificável pelo meio escolhido.
3. Substituir `noteTone.service.ts` por `noteColor.service.ts`; tirar `.noteTone*` do CSS e o `tone`
   de `IsometricBox`; `CargoToneSwatch` → `CargoNoteSwatch`.
4. Ficha da parada: disco fora, lista de notas sempre, aviso de cor repetida na legenda, locales.
5. Documentação em dois arquivos irmãos; ponteiros do `CLAUDE.md`.
6. Medir depois, nas quatro viagens reais e com 2, 3 e 5 notas por parada sintéticas; provar que
   nenhuma coordenada mudou.

## Riscos

- **Colisão com a cor de parada**: é o risco principal, e a medição mostrou que ignorá-lo produzia
  identidade literal. Resolvido por semeadura, com o custo medido e escrito.
- **Paleta curta**: a maior viagem real tem 94 notas, e o array tem 128 — a folga é de 34. Passando
  disso, a repetição é anunciada em vez de silenciosa.
