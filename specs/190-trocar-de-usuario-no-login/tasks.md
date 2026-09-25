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

## Fase 2 — Identificador lembrado e "Continuar conectado"

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Contrato primeiro: `test/identity/login-identifier-memory.contract.ts` (aba, limpeza
      depois da sessão, armazenamento recusado) e `keycloak-realm.contract.ts` § "continuar conectado"
      (realm declara, reconciliação liga, não reescreve à toa, regrava prazo divergente).
- [x] **T2.2** `loginIdentifierMemory.service.ts` + `LoginIdentifier.page.tsx` (campo preenchido e
      selecionado) + `main.tsx` (esquece depois do login).
- [x] **T2.3** `rememberMe` com prazos nos dois `realm.json`, aplicados pelo `keycloak-reconcile.sh`.
- [x] **T2.4** Ponta a ponta: sonda do Keycloak com o realm novo e Vite do worktree; prints da caixa e
      do campo preenchido; navegador reaberto com e sem a caixa marcada.

## Fase 3 — Link de texto no lugar do botão

> 🤖 Modelo: `sonnet`

- [x] **T3.1** Contrato: `<a class="identified-user-switch">` sem `action` e sem `<svg>`, "Não é você?"
      nos dois bundles, CSS com cobre, `min-height: 2.75rem`, sem borda e com `:focus-visible`.
- [x] **T3.2** `login.ftl` (linha do usuário), `login.css`, mensagens.
- [x] **T3.3** Suspeita de "trocar volta ao mesmo usuário" medida com `login_hint=anderson.fernandes`.
- [x] **T3.4** Prints nos temas claro e escuro, em 1280px e 375px.
