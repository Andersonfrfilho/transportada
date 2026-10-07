# Tasks

## Fase 1 — Sem prazo, com descarte explícito

> 🤖 Modelo: `sonnet` (nenhuma task 🧠 — as decisões estão fechadas na spec)

- [x] **T1.1** Contratos **antes** do código no app novo: `queue-retention.contract.ts` e
      `queue-discard.contract.ts` (portado do legado), registrados em `driver-trip.contract.test.ts` —
      evidência: vermelho (módulo `queueDiscard.service` inexistente).
- [x] **T1.2** Remover o prazo de 7 dias e a exclusão da contagem; portar o descarte com
      confirmação — evidência: T1.1 verde.
- [x] **T1.3** Legado: remover o prazo e inverter o teste "anexo vencido não segura o motorista" —
      evidência: suíte verde.
- [x] **T1.4** Atualizar `docs/SECURITY.md` (D4) — evidência: diff.
- [x] **T1.5** Prova por mutação (6) — evidência em `evidence.md`.
- [x] **T1.6** 🧠 Revisão de design: prints da tela de pendências com o recusado, o "Descartar" e a
      confirmação, 375 px, claro e escuro — achou os dois "Descartar" lado a lado; corrigido.
- [x] **T1.7** Publicado em staging depois da aprovação do usuário nos prints (02/10/2026).
