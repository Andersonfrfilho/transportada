# Tasks — 268 O e-mail da contratante cai no Mailpit fora de produção

> Gate de toda task: `tsc --noEmit` + lint + testes da app (script `test` do `package.json`, nunca `bun test` cru) +
> commit isolado (`git commit --only <caminhos>`). Teste novo entra na lista explícita do `package.json` da app.
> Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`.
> Worktree: `../transportada-wt/spec-268` (branch `work/spec-268`). Nada é feito fora dela.

## Fase 0 — Spec

> 🤖 Modelo: `sonnet`

- [x] **T0.1** `sonnet` — Levantamento contra o código e specs 143/150/183/211/248; spec, plano, tasks e evidence.

## Fase 1 — Env, coluna e API

> 🤖 Modelo: `sonnet`

- [x] **T1.1** `sonnet` — Teste antes: `CONTRACTOR_MAIL_SANDBOX_SMTP=true` + produção derruba o boot (API e worker); `true` na API
      exige `EMAIL_FROM`, no worker exige `SMTP_URL` e `EMAIL_FROM`. Depois, os dois schemas.
- [x] **T1.2** `sonnet` — Teste antes (contrato de schema/migration): coluna `transport` com default e CHECK. Depois, schema Drizzle
      (API e worker), migration com rollback; `db:generate` → `no_changes`; aplicar, reverter e reaplicar em banco descartável.
- [x] **T1.3** `sonnet` — Teste antes: sem Resend pronto e modo ligado grava `sandbox_smtp` (de = `EMAIL_FROM`, sem segredo
      decifrado); com Resend pronto grava `resend`; modo desligado mantém a recusa. Depois, caso de uso, porta, repositório,
      `main.ts`. Integração do repositório.
- [x] **T1.4** `sonnet` — Teste antes: `GET /contractor-mail-settings` devolve `sandboxDelivery`. Depois, caso de uso e rota.

## Fase 2 — Worker

> 🤖 Modelo: `sonnet`

- [x] **T2.1** `sonnet` — Teste antes (dublê do transporte): a linha `sandbox_smtp` sai pelo SMTP, vários destinatários, anexos, sem
      `Reply-To`, sem tocar o Resend nem as configurações; modo desligado falha sem enviar. Depois, gateway, caso de uso,
      repositório (lê `transport`) e `main.ts`.

## Fase 3 — Painel

> 🤖 Modelo: `sonnet`

- [x] **T3.1** `sonnet` — Teste antes: cliente/guarda aceita `sandboxDelivery` e recusa resposta sem ele. Depois, cliente e hook.
- [x] **T3.2** `sonnet` — Teste antes: a seção "Contatos de ocorrência" aparece na ficha, sem seletor, e a dica da aba de e-mail
      abre a aba Contratantes. Depois, `ContractorContactsPanel` e `ContractorFicha`.
- [x] **T3.3** `sonnet` — Teste antes: os dois avisos conforme prontidão e `sandboxDelivery`. Depois, `MailSendReadinessSummary` e locales.

## Fase 4 — Infra e fechamento

> 🤖 Modelo: `haiku`

- [x] **T4.1** `haiku` — `.railway/railway.ts` (`preserve()`), `.env.example`, `apps/*/CLAUDE.md`, `docs/ai-context/*`.
- [x] **T4.2** `sonnet` — Gates completos: contratos e integração das três apps, `prettier --check .` na raiz. Registrar no `evidence.md`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/268-o-email-da-contratante-cai-no-mailpit-fora-de-producao/ (leia
spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md, no worktree
../transportada-wt/spec-268.
Modelos: Fases 0-3 → executor model=sonnet · Fase 4 (T4.1) → executor model=haiku · revisão final → code-reviewer
model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes + commit isolado (`git commit --only`), evidência em evidence.md.
Pare e pergunte antes de: push, merge em staging/main, ligar CONTRACTOR_MAIL_SANDBOX_SMTP no Railway, qualquer
[NEEDS CLARIFICATION].
```
