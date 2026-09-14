# Spec 133 — Plano

1. Contrato antes (`unloading.contract.ts`): a fileira do fundo a 0,474 m da testeira não se escora nela
   mesma; a mesma fileira a 0,2 m é escorada pela testeira; a caixa alta e fina sozinha no piso não se
   escora no vazio. Os dois primeiros casos novos ficam vermelhos no juiz antigo.
2. Juiz: `findUnsupportedBoxes` troca a grade de 1 cm por intervalos exatos — cada caixa presente cobre
   o trecho da face em que ela ocupa o lado de fora, dentro do vão, alcançando a contenção.
3. Linha de base: `known-unsupported.ts` por placa; `unloading.contract.ts` e `complement.contract.ts`
   cobram `≤` a linha em vez de `[]`.
4. Validação cruzada, no scratchpad: juiz antigo × juiz corrigido × conferência exata, nas quatro
   viagens, nas 32 variações (fração × teto de massa) e nos três cubos da spec 130.
5. Docs: `cargo-placement.md` §10, `cargo-placement-defects.md` Passo 8, `CLAUDE.md`.
