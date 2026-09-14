# Spec 134 — Plano

1. Contrato antes: `test/cargo-placement/headboard-brace.contract.ts` — 12 entregas × 6 presumidas na
   Sprinter, nos três tetos de massa: zero sem apoio no juiz corrigido e a pilha que só a testeira
   segura dentro do giro com 1 cm de sobra (reprova em `eacd5225`: 6 sem apoio em cada teto); carga
   baixa, que a testeira não escora, termina na porta.
2. Política (a partir de `scratchpad/c133`, sem reempacotar): `createSupportMap` anota a folga das
   escoras na testeira só da posição carimbada; `packSlice` e `placeComplement` a devolvem;
   `placeDeliveryBlock` limita o deslocamento a `folga − 1 cm`.
3. Apagar `known-unsupported.ts`; `unloading.contract.ts` e `complement.contract.ts` voltam a `[]`.
4. Reescrever com a razão: `delivery-block.contract.ts` ("carga leve termina na porta") e
   `slices.contract.ts` ("carga pesada centraliza").
5. Medir: quatro viagens (todas as invariantes), 32 variações, três cubos, tempo.
6. Docs: `cargo-placement.md` §7, `cargo-placement-defects.md` Passo 5, `CLAUDE.md`.
