# Tasks — Spec 244

Contrato vermelho antes do código, prova por mutação, commit isolado e evidência em `evidence.md`. Tela só vai
a staging depois de o usuário ver.

## Fase 1 — API e apps

> 🤖 Modelo: `sonnet`

- [x] **T1** `pendingProofs` vazio sem `trip.report` em `GET /me/trips/current` (D2): contrato e integração.
- [ ] **T2** O Perfil do app do motorista não monta o cartão de consentimento quando a leitura responde 403 (D1).
- [ ] **T3** Zero preservado nos três campos de diária da ficha e na diária geral (D3).

## Fase 2 — Fechamento

> 🤖 Modelo: `sonnet` (T4) · `haiku` (T5)

- [ ] **T4** Revisão de design com prints: Perfil do ajudante sem o cartão, e os campos de diária com `0,00`
      (ficha e painel da diária geral), 375 px, claro e escuro; o usuário aprova antes de ir a staging.
- [ ] **T5** Documentação viva: tirar as três pendências do `docs/SECURITY.md`/`evidence` da 243 e uma nota no ADR-0095.
