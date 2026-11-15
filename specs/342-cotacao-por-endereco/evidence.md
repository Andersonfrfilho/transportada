# Evidence — spec 342

- T1–T4b: `bun test ./test/freight-quote.contract.test.ts ./test/integration-api.contract.test.ts` — 47 pass. O contrato prova: distância e pedágio vêm da estrada, `distanceKm`/`tollAmount` do chamador são recusados, recusa de precisão `city`, estrada nula (503) e quatro formas de pedágio incompleto (422), metros → km sem ponto flutuante.
- Pendente: T5, T6.
