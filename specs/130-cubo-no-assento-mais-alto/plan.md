# Spec 130 — Plano

> 🤖 Modelo: `opus` (medição e decisão no empacotador) · docs `sonnet`

1. Medir no scratchpad, numa cópia instrumentada do empacotador: onde cada cubo senta, por que regra o
   espaço morto é recusado, quanto cada entrega perde.
2. Medir as variantes (adiar, complemento na hora, assento mais alto e seus desempates, combinação) nas
   densidades 3/5/10 e nas quatro viagens reais.
3. Contrato antes do código: `dead-space.contract.ts` volta ao limite de uma coluna, por densidade, e ganha
   a descarga.
4. `cargo-placement.policy.ts`: `rankSmallLast` na ordenação de `packSlice`; `findHighest` em
   `createDeadSpaceTracker`, com a testeira fora da escora da caixa pequena.
5. Documentação: `docs/domain/cargo-placement.md` e `cargo-placement-defects.md`; evidência.
