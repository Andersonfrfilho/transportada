# Evidence — spec 342

- T1–T4b: `bun test ./test/freight-quote.contract.test.ts ./test/integration-api.contract.test.ts` — 47 pass. O contrato prova: distância e pedágio vêm da estrada, `distanceKm`/`tollAmount` do chamador são recusados, recusa de precisão `city`, estrada nula (503) e quatro formas de pedágio incompleto (422), metros → km sem ponto flutuante.
- Pendente: T5, T6.

## T5: prints da tela de orçamento por endereço

Prints em claro e escuro, 1440 e 375 px, gerados por `apps/frontend-transportada/test/spec-342-quote-prints.smoke.spec.ts`
(dados sintéticos, rotas dubladas; fora da CI). O painel "Parâmetros do orçamento" logo abaixo serve de vizinho: mesma altura
de campo, mesmo rótulo em cima, mesma grade. Observação: no desktop os seis campos de endereço quebram em duas linhas (UF sozinha).
