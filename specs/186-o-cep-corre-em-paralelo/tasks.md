# Tasks — 186

## Fase 1 — A corrida

> 🤖 Modelo: `opus` 🧠 (concorrência: quem vence, quem é abortado, quando a falha do banco sobe)

- [x] T001 Contratos do caso de uso: banco e provedor ao mesmo tempo; completo vence; parcial do
      provedor antes do parcial do banco; falha do banco sobe sem vencedor — `lookup.contract.ts`
- [x] T002 Contratos do gateway: três provedores ao mesmo tempo; perdedor abortado; AwesomeAPI pelo
      formato real; `404` vazio; desempate de parciais pela ordem — `postal-code-gateway.contract.ts`
- [x] T003 `raceCompletePostalCodeSuggestion`, caso de uso e gateway — os contratos de T001/T002 verdes
- [x] T004 `POSTAL_CODE_AWESOME_API_URL` no schema, tipos, composição, `.env.example`,
      `.railway/railway.ts` e integração
- [x] T005 `docs/SECURITY.md` e `CLAUDE.md` da API

- [x] T007 Google Geocoding na corrida (`google-postal-code.mapper.ts`), CEP devolvido conferido
      contra o pedido — `postal-code-gateway.contract.ts`

## Fase 2 — Publicação

> 🤖 Modelo: `sonnet`

- [ ] T006 Variável no Railway (staging), gates (`make check`), push para staging, medição do tempo
      de `GET /postal-codes` no log HTTP
