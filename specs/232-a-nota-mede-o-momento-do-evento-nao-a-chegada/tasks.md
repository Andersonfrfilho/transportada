# Tasks

> 🤖 Modelo por fase abaixo. Tasks 🧠 (modelo de dados e regra de nota) rodam com `opus`; o resto,
> `sonnet`. A sessão precisa estar no modelo da fase antes de tocar em código (model-economy §2).

## Fase 1 — API: regra pura e contrato

> 🤖 Modelo: `opus` (T1.1 e T1.2 são 🧠), `sonnet` (T1.3 em diante)

- [ ] **T1.1** 🧠 Contrato **antes**: `resolveOccurredAt` (corrige, recusa futuro, ausente cai no
      comportamento de hoje) — `apps/api-transportada/test/trips/occurred-at.contract.ts`.
- [ ] **T1.2** 🧠 Contrato **antes** da pontualidade e do "ausente": CA1, CA2 e CA4 como casos de
      `classifyProofPunctuality` e do cálculo de `driver-score.policy.ts` — vermelho pelo motivo certo.
- [ ] **T1.3** Implementar `resolveOccurredAt`, a pontualidade (D4) e o "ausente" (D5) — T1.1 e T1.2 verdes.
- [ ] **T1.4** Esquemas `.strict()` aceitam `tappedAt`/`clockOffsetMs` opcionais; cliente antigo segue
      passando — contrato de rota.
- [ ] **T1.5** 🧠 Migration `clock_offset_ms` + `rollback.sql`; gravar o evento com a hora corrigida;
      ler o momento da entrega da nota e da pontualidade (D3) — `make migration-test` e a integração da
      nota (CA3) verdes.
- [ ] **T1.6** Registrar o limite antifraude em `docs/SECURITY.md`.
- [ ] **T1.7** Publicar a API em staging e **confirmar o deploy** antes da Fase 2.

## Fase 2 — App: medir e mandar

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato **antes**: o desvio sai do cabeçalho `Date`, o item da fila guarda o desvio da
      criação, e o corpo/multipart levam `tappedAt` e `clockOffsetMs` — vermelho.
- [ ] **T2.2** `clockOffset.service.ts`, fila, `reportBody` e anexo — T2.1 verde.
- [ ] **T2.3** Smoke: o corpo do `deliver` leva os dois campos; sem resposta ainda, vai sem eles.
- [ ] **T2.4** Prova por mutação (cada fase) — evidência em `evidence.md`.
- [ ] **T2.5** Publicar o app em staging depois da API (T1.7).
