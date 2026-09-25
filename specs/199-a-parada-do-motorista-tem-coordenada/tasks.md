# Tasks — Spec 199

## Fase 1 — A leitura certa

> 🤖 Modelo: `sonnet`

- [x] **T1** Teste de integração que reprova: parada geocodificada chega sem coordenada —
      `test/integration/me-trip.integration.ts` — evidência: falha registrada em `evidence.md`.
- [x] **T2** `listStops` lê `geocoded_addresses` por `left join` em `address_key` —
      `drizzle-current-driver-trip.repository.ts` — evidência: T1 verde, suíte `me-trip` inteira verde.
- [x] **T3** Gates: typecheck, lint, contrato e integração da API, testes do `frontend-driver`.
- [x] **T4** Revisão de design: a distância no cartão da parada, vista no preview local (porta 53200) pelo usuário, com print, antes de subir.
