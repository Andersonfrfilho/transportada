# Tasks — Spec 190

## Fase 1 — Botão "Trocar de usuário"

> 🤖 Modelo: `sonnet`

- [x] **T1.1** Contrato primeiro (`login-theme-password-only.contract.ts`): o botão com a classe do
      tema, o rótulo nos dois bundles, nenhum `${url.loginRestartFlowUrl}` no ramo identificado, e o
      script executado de verdade revelando o botão a partir do `client_data` (e escondido sem origem).
- [x] **T1.2** `password-reset-link.js` lê o `ru` do `client_data`; `login.ftl` troca o link por botão;
      `login.css` com `[hidden]` explícito (o `display` de `.action` venceria o do navegador);
      mensagens `transportadaSwitchUser=Trocar de usuário`.
- [x] **T1.3** Revisão de design (`web.md` §15) com prints em 1280px e 375px, antes e depois do clique,
      em container de sonda com o tema novo.
- [x] **T1.4** `docs/frontend/login-theme.md` atualizado.
