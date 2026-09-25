# Evidência — 188

25/09/2026:

- T001: `activation-link.contract.ts` vermelho (1 falha) antes; depois
  `bun test test/code-email.contract.test.ts test/invitation-delivery.contract.test.ts` — 51 pass, 0 fail
- T002: 8 contratos vermelhos antes (cliente, fragmento, rota, moldura pública); depois
  `bun test test/identity.contract.test.ts` — 237 pass, 0 fail
- `bun run lint` (após ajustar o contrato novo) e `bun run typecheck` — exit 0
- `bun run --cwd apps/frontend-transportada test` — 5262 + 51 pass, 0 fail
- `bun run --cwd apps/worker-transportada test` — 1424 pass, 0 fail
- `prettier --check .` — ok; build do frontend e do worker — ok
- T003: deploy `711b36bcc` verde (api, worker, frontend). Convite reenviado pela tela de Usuários
  às 03:08 UTC; no Mailpit de staging o e-mail traz o botão "Ativar meu acesso" e a linha
  `Ativar meu acesso: https://app.staging.fernandes-transportadora.com.br/ativar#codigo=…`. O link
  abre "Ativar acesso" com o código preenchido, as senhas vazias, e a barra de endereço já sem o
  fragmento.
