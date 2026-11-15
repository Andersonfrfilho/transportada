# Tasks — spec 342

- [x] T1 Política (`isPreciseEnoughToQuote`, `isTollKnown`) e erros tipados.
- [x] T2 Caso de uso `createCalculateFreightQuoteByAddressUseCase` com portas de localização e estrada.
- [x] T3 Adaptadores: localizador (`geocoded_addresses` + Google) e estrada (`readRouteGeometry`).
- [x] T4 Rotas: integração (substitui `distanceKm`) e escritório (`/freight-quotes/by-address`); ligação no `main.ts`.
- [x] T4b Contrato `freight-quote-by-address.contract.ts` e ajuste do contrato da API de integração.
- [x] T4c Doc do integrador atualizada.
- [ ] T5 Tela `/orcamento` por endereço.
- [ ] T6 Conferência em staging contra viagem real (distância e pedágio) e evidência.
