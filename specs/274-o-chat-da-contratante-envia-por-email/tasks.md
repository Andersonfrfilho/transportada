# Tasks — 274 O chat da contratante envia por e-mail

> Cada task responde: **Mecânica?** · **Aceite por comando?** Duas "sim" → `haiku`. Gate de toda task de código:
> `bun run typecheck` + lint por app (cwd na app) + script `test` do `package.json` da app (nunca `bun test` cru) +
> commit isolado (`git commit --only <paths>`). Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`.
> Teste novo entra no agregador e na lista explícita do `package.json`. Task que toca `test/integration/**` fecha com
> `bun --env-file=../../.env.test run test:integration` (de `apps/api-transportada`) **sem skip**. Migration: aplica,
> reverte, reaplica e `db:generate` → `no_changes`. Pacotes: `pnpm -r check` + `pnpm -r test` no repositório de pacotes.
> Worktree: `~/Documents/personal/transportada-wt/spec-274` (branch `work/spec-274`). Pacotes: branch
> `work/spec-274-standard-email` em `~/Documents/personal/adatechnology-packages`. Nada fora delas.

## Fase 0 — Contrato

> 🤖 Modelo: `sonnet` (T0.2 é 🧠)

- [x] **T0.1** `sonnet` — Conferir o `evidence.md` § Levantamento contra `origin/staging` (rebase antes) e completar:
      qual erro de prontidão a rota de e-mail devolve sem Resend e sem sandbox; se o SDK `conversations-ui` 0.10.0 mostra
      `read` no tema sem a prop `channel` (`confirmsRead`); a forma de `contractor_mail_threads` por ocorrência e onde
      ler o último assunto de saída; se o payload de `email.sent`/`email.delivered` traz `data.message_id`; se o Resend
      mantém um `Message-ID` próprio no cabeçalho (doc via context7 e, se possível, envio de teste em conta de teste);
      se a chave Resend gravada é só de envio; diff entre as versões fixadas de `notification-*` e a última publicada
      (`npm view`). Medir em staging (só contagem): mensagens `email` por status, empresas com Resend pronto. Divergência
      vira nota no `evidence.md`. Aceite: § T0.1 preenchido.
- [ ] **T0.2** 🧠 `opus` — Validar a ADR-0111 e o `plan.md` (D1–D13) com `architect`: uma mensagem com portal como
      vitrine (D2), corpo padrão no pacote e a exceção à regra `email-templates.md` (D3/D4), linha do e-mail (D7),
      revogação da 183 D7 (D8/D9), migration (D12). Ajuste aprovado entra no `plan.md` e na ADR ("Ajustado na T0.2");
      status → "aceita". **Outras tasks herdam este contrato.** Aceite: `grep -n "Status:\*\* aceita"
docs/adr/0111-o-chat-da-contratante-envia-por-email.md` casa.

## Fase 1 — Pacote (repositório `adatechnology-packages`)

> 🤖 Modelo: `sonnet`

- [ ] **T1.1** `sonnet` — Teste antes (`bun test`): tabela de casos de `htmlToPlainText` copiada da 272
      (`apps/api-transportada/test/**/occurrence-mail-plain-text*`); depois a função em
      `notification-contracts/src/htmlToPlainText.ts`. Aceite: `pnpm --filter @adatechnology/notification-contracts test`.
- [ ] **T1.2** `sonnet` — Teste antes: casos do corpo padrão (escape de cada slot, `{{x}}` literal, estrutura sem
      `<script`/`on*=`/`flex`/`grid`/`var(`, URL não http(s) → rótulo, logo `cid` × iniciais, sem anexos/sem cargo/sem
      `replyHint`, < 100 KB com 8000 caracteres e 5 anexos, `text` sem tags); depois `standardEmail.ts` com os
      fragmentos exportados e o re-export em `notification-module`. Cores/fonte da 272 (`occurrence-mail-html.constant.ts:9-33`).
      `CLAUDE.md` dos dois pacotes atualizados. Changeset `minor`. Aceite: `pnpm -r check && pnpm -r test`.
- [ ] **T1.3** `sonnet` — PR no repositório de pacotes. **Pare e pergunte antes do merge em `main`** (publica no npm).
      Depois: `npm view @adatechnology/notification-contracts dist-tags` e `…/notification-module`; registrar versões e o
      diff desde `0.1.0-rc.2`/`0.1.0-rc.3` no `evidence.md`.

## Fase 2 — Painel tolerante (vai a produção antes da API)

> 🤖 Modelo: `haiku`

- [ ] **T2.1** `haiku` — Teste antes: escada do e-mail aceita `read` em `messageStatus.service.ts` (selo "Lida" com a
      dica do RF8); o código `OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS` tem texto. Depois a mudança (composer **ainda**
      fechado sem portal).
- [ ] **T2.2** `sonnet` — Publicar a Fase 2 (PR → `staging` → `main`). **Pare e pergunte antes do merge em `main`.**

## Fase 3 — API

> 🤖 Modelo: `sonnet` (T3.1 → `haiku`)

- [ ] **T3.1** `haiku` — Subir `notification-contracts`/`notification-module` para a versão da T1.3 na API **e** no
      worker (`bun install`, lock). Aceite: gates das duas apps verdes sem mudança de código.
- [ ] **T3.2** `sonnet` — Migration (D12) + schemas Drizzle + `rollback.sql` com guarda. Integração: e-mail aceita
      `read`; rollback aborta com linha `email`/`read`.
- [ ] **T3.3** `sonnet` — D4: `htmlToPlainText` e `escapeMailHtml` viram re-export do pacote; `buildLogo`/
      `buildFooterMarks` da 272 delegam aos fragmentos. Teste antes: as tabelas da 272 continuam verdes sem editar caso.
- [ ] **T3.4** `sonnet` — Política de status (D8) com a tabela de casos (escada, salto, falha terminal, duplicado) e o
      webhook `email.opened → read` + gravação de `rfc_message_id` (D7). Contratos antes.
- [ ] **T3.5** `sonnet` — Extrair `occurrence-mail-delivery.service.ts` do `send-occurrence-mail.use-case.ts` sem mudar
      comportamento (teste de caracterização do diálogo antes, verde antes e depois).
- [ ] **T3.6** `sonnet` — Variante chat da rota + `send-occurrence-chat-mail.use-case.ts` + assunto (D5, D6, D10, D11).
      Contratos antes: schema `.strict()`, sem modelo envia, sem pré-marcado 409, idempotência, BOLA 404, 403. Integração
      `test/integration/occurrence-chat-mail.integration.ts` (na lista, `--env-file`, zero skip).
- [ ] **T3.7** `sonnet` — Portal (D2, D9): aviso sem corpo só a quem não está em `To`/`Cc`; `markRead` leva `email` a
      `read`. Contrato + integração.
- [ ] **T3.8** `haiku` — OpenAPI da variante, `apps/api-transportada/CLAUDE.md` e `docs/ai-context/api-transportada.md`
      (§ "O chat da contratante envia por e-mail"; a 183 D7 revogada).

## Fase 4 — Worker

> 🤖 Modelo: `sonnet` (T4.3 → `haiku`)

- [ ] **T4.1** `haiku` — Política de status espelhada (D8) com o contrato de paridade. Teste antes.
- [ ] **T4.2** `sonnet` — Cadeia de `References`/`In-Reply-To` com entrada e saída (D7, últimos 20). Teste do
      repositório e do caso de uso antes; integração do worker (`make worker-integration`).
- [ ] **T4.3** `haiku` — `docs/ai-context/worker-transportada.md`.

## Fase 5 — Painel

> 🤖 Modelo: `sonnet` (T5.3 → `haiku`)

- [ ] **T5.1** `sonnet` — Composer aberto com `canWrite` (D1); adaptador envia a variante chat com
      `email-message:<id>`, otimista `queued`, upload com `channel: 'email'`. Teste antes.
- [ ] **T5.2** `sonnet` — Erros (D10): falha na mensagem com motivo; sem destinatário → ação "Enviar por e-mail" que
      abre o diálogo com o texto. Teste antes.
- [ ] **T5.3** `haiku` — Textos em `.locale.json` (some `thread.closed.noPortal`), smoke do painel.

## Fase 6 — Publicação e verificação

> 🤖 Modelo: `sonnet`

- [ ] **T6.1** `sonnet` — Revisão: `code-reviewer` e `security-reviewer` (escape dos slots, BOLA, PII em log, webhook).
- [ ] **T6.2** `sonnet` — Rebase em `origin/staging`, gates completos, `bunx prettier --check .`, numeração de
      spec/ADR/migration conferida, PR → `staging` (autorizado; API + worker no mesmo run), acompanhar CI e deploy.
- [ ] **T6.3** `sonnet` — Verificar em staging no navegador (texto, não screenshot): composer aberto sem portal,
      mensagem no Mailpit com logo e anexos, selo "Enviada", portal mostra a mensagem uma vez. Evidência no `evidence.md`.
- [ ] **T6.4** `sonnet` — Ligar a confirmação de leitura (plan § roteiro) numa conta Resend de teste/staging. **Pare e
      pergunte antes de qualquer mudança de configuração do Resend ou de DNS.** Evidência: "Lida" depois de abrir.
- [ ] **T6.5** `sonnet` — Produção **com aprovação humana**, na ordem do plan § Publicação; o rastreio no Resend da
      transportadora é outra aprovação.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/274-o-chat-da-contratante-envia-por-email/ (leia spec.md, plan.md,
tasks.md e evidence.md antes de começar; leia também specs/183-*, 263-* (T5.2-C), 267-*, 268-*, 271-* e 272-* com os
evidence.md, a ADR-0073, a ADR-0110 e a ADR-0111, e a regra ~/.claude/rules/rules/email-templates.md).
Árvore única: ~/Documents/personal/transportada-wt/spec-274 (branch work/spec-274, criada de origin/staging); pacotes em
~/Documents/personal/adatechnology-packages na branch work/spec-274-standard-email. Nada fora delas.
Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → sonnet (T0.2 🧠 → opus, validar com architect antes de qualquer código) · Fase 1 → sonnet ·
Fase 2 → haiku (T2.2 sonnet) · Fase 3 → sonnet (T3.1/T3.8 haiku) · Fase 4 → sonnet (T4.1/T4.3 haiku) ·
Fase 5 → sonnet (T5.3 haiku) · Fase 6 → sonnet · revisão final → code-reviewer e security-reviewer (sonnet).
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com bun run typecheck + lint por app (cwd na app) + script `test` do
package.json da app (nunca `bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em evidence.md.
Task que toca test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de
apps/api-transportada), ZERO skips. Migration: aplica, reverte e reaplica e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates, `bunx prettier --check .`
na raiz; conferir numeração de spec/ADR/migration contra origin/staging. Publicar em staging está autorizado (T6.2).
Pare e pergunte antes de: merge em main do repositório de pacotes (T1.3, publica no npm); qualquer merge em main deste
repositório (T2.2, T6.5 — painel tolerante vai a produção ANTES da API); qualquer mudança de configuração do Resend
(domínio, rastreio, webhook) ou de DNS, em qualquer ambiente (T6.4, T6.5); qualquer mudança de dados que não seja
contagem em staging ou produção; e qualquer [NEEDS CLARIFICATION] que surgir.
Decisões já tomadas (evidence.md): composer sempre aberto com nota+contratante+occurrences.resolve, envia por e-mail;
uma mensagem canal email, o portal é vitrine (aviso sem corpo só a quem não está em To/Cc; leitura no portal marca o
e-mail como lida); corpo padrão no pacote notification-contracts (re-exportado pelo notification-module), sem modelo do
tipo e sem 409 de modelo no chat; htmlToPlainText e os fragmentos de logo/marcas migram ao pacote, prefixo/"De"/
assinante ficam no produto; "lida" por pixel (email.opened → read) revogando a 183 D7, falha terminal; destinatários =
pré-marcados + cópia 267; assunto = o da linha; References com entrada e saída; idempotência email-message:<id>,
otimista queued; o rastreio no Resend é configuração manual com aprovação.
```
