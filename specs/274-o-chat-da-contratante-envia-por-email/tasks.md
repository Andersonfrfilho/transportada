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
- [x] **T0.2** 🧠 `opus` — Validar a ADR-0111 e o `plan.md` (D1–D13) com `architect`: uma mensagem com portal como
      vitrine (D2), modelo padrão configurável cadastrado pelo SDK no pré-deploy e o que migra do app (D3/D4, ajustados em 2026-10-19
      pelo dono), linha do e-mail pelo `message_id` do Resend (D7),
      revogação da 183 D7 (D8/D9), migration (D12). Ajuste aprovado entra no `plan.md` e na ADR ("Ajustado na T0.2");
      status → "aceita". **Outras tasks herdam este contrato.** Aceite: `grep -n "Status:\*\* aceita"
docs/adr/0111-o-chat-da-contratante-envia-por-email.md` casa. (Concluída; `evidence.md` § T0.2.)

## Fase 1 — SDK de notificação (repositório `adatechnology-packages`)

> _Ajustado em 2026-10-19 (dono): modelo padrão configurável no SDK (plan D3/D4), não layout fixo em código._
> 🤖 Modelo: `sonnet`

- [x] **T1.1** `sonnet` — `notification-contracts`, regras genéricas de e-mail HTML (D4). Teste antes (`bun test`),
      com as tabelas de caso da 272 copiadas sem editar caso (`apps/api-transportada/test/**/occurrence-mail-plain-text*`,
      `*html-safety*`, `*html-render*`, `*system-html*`): `htmlToPlainText`, `findUnsafeEmailHtml` (mesma regra do
      `validateEmailHtml` da `notification-ui`) _[ajustado na T0.2: a `notification-ui` delega na T1.4]_, `interpolateEmailHtml`, `buildInitials`,
      `renderEmailLogoHtml`, `STANDARD_EMAIL_THEME`. Aceite:
      `pnpm --filter @adatechnology/notification-contracts test`.
- [x] **T1.2** `sonnet` — `notification-contracts`, modelo padrão (D3; identidade, assinante e rodapé dentro do
      modelo). Teste antes: escape de cada variável, `{{x}}` do operador literal, estrutura sem
      `<script`/`on*=`/`flex`/`grid`/`var(`, URL de marca não http(s) → vazia, logo `cid` × iniciais, sem anexos/sem
      cargo/sem `replyHint`, < 100 KB com 8000 caracteres e 5 anexos, `text` sem tags, `assessStandardEmailTemplate`
      (sem uma das obrigatórias ou inseguro → inutilizável), o embutido passa no próprio `assess`. Depois `standard-email.pt-BR.html` (embutido no build com `loader: { '.html': 'text' }` no tsup e `with { type: 'text' }` no
      bun test, ou `.ts` gerado com teste de igualdade; _ajustado na T0.2_), `STANDARD_EMAIL_*`,
      `renderStandardEmail` (_ajustado na T0.2:_ o `marcasRodape` é HTML do sistema montado pelo SDK, só `http(s)`, e nenhuma
      variável em atributo ou `style`). Aceite: `pnpm --filter @adatechnology/notification-contracts test`.
- [x] **T1.3** `sonnet` — `notification-module` (D3). Teste antes: `standardEmail.ensureTemplate` (sem linha → v1 com o
      embutido; segunda chamada → nada; linha editada ou desativada → nada), `resolveTemplate` (versão ativa usável → a
      da empresa; sem linha ativa ou inutilizável → embutido `version: 0` + log sem conteúdo; outra empresa não vaza),
      `render`, `restoreDefault` (versão nova com o embutido), `upsert` da chave recusado sem as obrigatórias
      (`StandardEmailTemplateInvalidError`), desativar a chave recusado (`StandardEmailTemplateRequiredError`), catálogo
      mesclado em `/notification-template-variables`. Aceite: `pnpm -r check && pnpm -r test`.
- [x] **T1.4** `sonnet` — `notification-ui` (D3; _ajustado na T0.2:_ para a chave `notification.standard-email`, a UI valida com
      `assessStandardEmailTemplate` (sem depender da área de mensagem) e **esconde o campo assunto**; `validateEmailHtml`
      delega a `findUnsafeEmailHtml`, dependência direta de `notification-contracts`): selo "Modelo do sistema", sem "Remover" na chave padrão,
      "Restaurar padrão" (chama `restoreDefault`), prévia do modelo padrão por `renderStandardEmail` com os exemplos do
      catálogo. Teste antes. Aceite: `pnpm -r check && pnpm -r test`.
- [x] **T1.5** `haiku` — `CLAUDE.md`/README dos três pacotes (o modelo padrão, o cadastro por `ensureTemplate` e por que
      no pré-deploy do host, a rede de segurança) e
      changesets `minor`. Aceite: `pnpm -r check`.
- [x] **T1.6** `sonnet` — PR no repositório de pacotes. **Pare e pergunte antes do merge em `main`** (publica no npm).
      Depois: `npm view` dos três pacotes; registrar versões e o diff desde `0.1.0-rc.2`/`0.1.0-rc.3`/`0.1.0-rc.9` (e `notification-client` `0.1.0-rc.3`) no
      `evidence.md`. _Ajustado na T0.2:_ listar também o diff da `notification-ui` e conferir a tela no navegador antes da T2.2.
      Mesmo PR, task e commit isolados para a subida de versão (T3.1; Q3 resolvida).

## Fase 2 — painel e worker tolerantes (vão a produção antes da API)

> _Ajustado na T0.2: o worker entra aqui (o worker antigo rebaixa `read` para `sent`, `message-status.policy.ts:89-100`)._
> 🤖 Modelo: `haiku` (T2.1 → `sonnet`)

- [x] **T2.1** `sonnet` — Teste antes: escada do e-mail aceita `read` em `messageStatus.service.ts` (selo "Lida" com a
      dica do RF8); o código `OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS` tem texto. Depois a mudança (composer **ainda**
      fechado sem portal) e, _ajustado em 2026-10-19 (dono)_, `notification-ui` e `notification-client` na versão da T1.6 (D13): a tela de
      Notificações mostra o modelo padrão.
- [x] **T4.1** `haiku` — _Movida da Fase 4 na T0.2._ Política de status do **worker** espelhada (D8) com o contrato de paridade.
      Teste antes. Vai a produção com o painel (plan § Publicação, passo 2).
- [ ] **T2.2** `sonnet` — Publicar a Fase 2 (painel **e worker**; PR → `staging` → `main`). **Pare e pergunte antes do merge em `main`.**

## Fase 3 — API

> 🤖 Modelo: `sonnet` (T3.1 → `haiku`)

- [x] **T3.1** `haiku` — Subir `notification-contracts`/`notification-module` para a versão da T1.6 na API **e** no
      worker (`bun install`, lock). Aceite: gates das duas apps verdes sem mudança de código, `db:test` e
      `notification-migration` verdes (migrations novas do módulo, T0.1 item 8).
- [x] **T3.2** `sonnet` — Migration (D12: só derruba a CHECK; sem `standard_body_version`, ajustado em 2026-10-19 pelo
      dono) + schema Drizzle + `rollback.sql` com guarda. Integração: e-mail aceita `read`; rollback aborta com linha
      `email`/`read`.
- [x] **T3.3** `sonnet` — D4 (_ajustado em 2026-10-19, dono_): `htmlToPlainText`, `escapeMailHtml`,
      `findUnsafeHtmlRules` e as cores viram re-export do SDK; `renderContractorMailHtml` delega a
      `interpolateEmailHtml`; `buildLogo`/`buildFooterMarks`/`buildInitials` delegam aos fragmentos; o renderer do
      modelo do tipo fica. `notification.standard-email` entra em `SYSTEM_NOTIFICATION_TEMPLATE_KEYS` (fora da escolha do
      tipo), _ajustado na T0.2:_ e a listagem de modelos escolhíveis filtra as chaves do sistema
      (`notification-template.query.ts:63-75`). `buildFooterMarks` delega a `renderEmailMarksHtml`. Teste antes: as tabelas da 272 continuam verdes sem editar caso; contrato da exclusão.
- [x] **T3.4** `sonnet` — Política de status (D8) com a tabela de casos (escada, salto, falha terminal, duplicado) e o
      webhook `email.opened → read` + gravação de `data.message_id` do `email.sent` (reserva `delivered`/`opened`) em
      `rfc_message_id` só se nulo (D7, ajustado em 2026-10-19 pelo dono). Contratos antes (payload de `email.sent` da doc
      do Resend; repetição não reescreve). Envio de teste de `Message-ID` próprio **não** é condição desta task.
- [x] **T3.5** `sonnet` — Extrair `occurrence-mail-delivery.service.ts` do `send-occurrence-mail.use-case.ts` sem mudar
      comportamento (teste de caracterização do diálogo antes, verde antes e depois).
- [x] **T3.6** `sonnet` — Variante chat da rota + `send-occurrence-chat-mail.use-case.ts` + assunto (D5, D6, D10, D11).
      O caso de uso monta `StandardEmailInput` e chama `notifications.standardEmail.render` (porta no app, dublê no
      contrato); grava `notification_template_key`/`_version` (ajustado em 2026-10-19 pelo dono). Contratos antes: schema
      `.strict()`, sem modelo do tipo envia, sem pré-marcado 409, idempotência, `tooLarge` → 400, BOLA 404, 403.
      Integração `test/integration/occurrence-chat-mail.integration.ts` (na lista, `--env-file`, zero skip): sem linha →
      versão `0`; com versão da empresa → a versão dela.
- [x] **T3.7** `sonnet` — Portal (D2, D9): aviso sem corpo só a quem não está em `To`/`Cc`; `markRead` leva `email` a
      `read`. _Ajustado na T0.2:_ a audiência passa a trazer o e-mail (minúsculas) de cada usuário do portal; portal
      indisponível no chat = sem aviso, nunca `PortalUnavailableError`. Contrato + integração.
- [x] **T3.9** `sonnet` — Cadastro do modelo padrão (D3, ajustado em 2026-10-19 pelo dono): _ajustado na T0.2:_ passo novo
      `seedStandardEmailTemplates` em `PreDeploySteps`/`PreDeployReport` (campo `standardEmailTemplates`): lê todos os
      `companies.id` e chama `notifications.standardEmail.ensureTemplate` em série, independente de `COMPANY_ID`, depois de
      `provision`; sem gancho no provisionamento; conflito 23505 = já existe (conta 0). Na semente local, a rede de
      segurança (versão `0`) basta. Teste antes:
      contrato do `runPreDeploy` (chama por empresa; relatório conta as gravadas), duas chamadas concorrentes sem erro e integração (primeira execução grava
      uma por empresa, segunda grava zero, versão editada intacta). Gravar em staging acontece no deploy da T6.2
      (autorizado); em produção, só na T6.5 com aprovação humana e contagem antes/depois.
- [x] **T3.8** `haiku` — OpenAPI da variante, `apps/api-transportada/CLAUDE.md` e `docs/ai-context/api-transportada.md`
      (§ "O chat da contratante envia por e-mail"; a 183 D7 revogada).

## Fase 4 — Worker

> 🤖 Modelo: `sonnet` (T4.3 → `haiku`; a T4.1 foi para a Fase 2)

- [x] **T4.2** `sonnet` — Cadeia de `References`/`In-Reply-To` com os `rfc_message_id` de entrada e de saída (este, o
      `message_id` do Resend gravado pela T3.4; saída sem ele fica fora), últimos 20; o worker não gera `Message-ID`
      (D7, ajustado em 2026-10-19 pelo dono). Teste do repositório e do caso de uso antes; integração do worker
      (`make worker-integration`).
- [x] **T4.3** `haiku` — `docs/ai-context/worker-transportada.md`.

## Fase 5 — Painel

> 🤖 Modelo: `sonnet` (T5.3 → `haiku`)

- [x] **T5.1** `sonnet` — Composer aberto com `canWrite` (D1); adaptador envia a variante chat com
      `email-message:<id>`, otimista `queued`, upload com `channel: 'email'`. Teste antes.
- [x] **T5.2** `sonnet` — Erros (D10): falha na mensagem com motivo; sem destinatário → ação "Enviar por e-mail" que
      abre o diálogo com o texto. Teste antes.
- [x] **T5.3** `haiku` — Textos em `.locale.json` (some `thread.closed.noPortal`), smoke do painel.

## Fase 6 — Publicação e verificação

> 🤖 Modelo: `sonnet`

- [x] **T6.1** `sonnet` — Revisão: `code-reviewer` e `security-reviewer` (escape dos slots, BOLA, PII em log, webhook).
- [x] **T6.2** `sonnet` — Rebase em `origin/staging`, gates completos, `bunx prettier --check .`, numeração de
      spec/ADR/migration conferida, PR → `staging` (autorizado; API + worker no mesmo run), acompanhar CI e deploy. _Ajustado na T0.2:_ o pacote só chega a
      staging depois do merge em `main` dos pacotes (T1.6); sem `publish.yml` de branch.
- [x] **T6.3** `sonnet` — Verificar em staging no navegador (texto, não screenshot): composer aberto sem portal,
      mensagem no Mailpit com logo e anexos, selo "Enviada", portal mostra a mensagem uma vez; a tela de Notificações
      lista o modelo padrão (selo "Modelo do sistema"; o pré-deploy de staging o cadastrou). **Pare e pergunte** antes de editar o modelo padrão em staging (mudança de dados);
      com aprovação: editar, enviar, conferir no Mailpit, "Restaurar padrão". Evidência no `evidence.md`.
- [ ] **T6.4** `sonnet` — Ligar a confirmação de leitura (plan § roteiro) numa conta Resend de teste/staging. **Pare e
      pergunte antes de qualquer mudança de configuração do Resend ou de DNS.** Evidência: "Lida" depois de abrir.
- [ ] **T6.5** `sonnet` — Produção **com aprovação humana**, na ordem do plan § Publicação; o pré-deploy cadastra o
      modelo padrão (contar linhas de `notification.standard-email` antes/depois); o rastreio no Resend da
      transportadora é outra aprovação.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/274-o-chat-da-contratante-envia-por-email/ (leia spec.md, plan.md,
tasks.md e evidence.md antes de começar; leia também specs/183-*, 263-* (T5.2-C), 267-*, 268-*, 271-* e 272-* com os
evidence.md, a ADR-0073, a ADR-0110 e a ADR-0111, e a regra ~/.claude/rules/rules/email-templates.md).
Árvore única: ~/Documents/personal/transportada-wt/spec-274 (branch work/spec-274, criada de origin/staging); pacotes em
~/Documents/personal/adatechnology-packages na branch work/spec-274-standard-email. Nada fora delas.
Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → sonnet (T0.2 🧠 → opus, validar com architect antes de qualquer código) · Fase 1 → sonnet (T1.5 haiku) ·
Fase 2 → haiku (T2.2 sonnet) · Fase 3 → sonnet (T3.1/T3.8 haiku) · Fase 4 → sonnet (T4.1/T4.3 haiku) ·
Fase 5 → sonnet (T5.3 haiku) · Fase 6 → sonnet · revisão final → code-reviewer e security-reviewer (sonnet).
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com bun run typecheck + lint por app (cwd na app) + script `test` do
package.json da app (nunca `bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em evidence.md.
Task que toca test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de
apps/api-transportada), ZERO skips. Migration: aplica, reverte e reaplica e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates, `bunx prettier --check .`
na raiz; conferir numeração de spec/ADR/migration contra origin/staging. Publicar em staging está autorizado (T6.2).
Pare e pergunte antes de: merge em main do repositório de pacotes (T1.6, publica no npm); qualquer merge em main deste
repositório (T2.2, T6.5 — painel tolerante vai a produção ANTES da API); qualquer mudança de configuração do Resend
(domínio, rastreio, webhook) ou de DNS, em qualquer ambiente (T6.4, T6.5); qualquer mudança de dados que não seja
contagem em staging ou produção; e qualquer [NEEDS CLARIFICATION] que surgir.
Decisões já tomadas (evidence.md): composer sempre aberto com nota+contratante+occurrences.resolve, envia por e-mail;
uma mensagem canal email, o portal é vitrine (aviso sem corpo só a quem não está em To/Cc; leitura no portal marca o
e-mail como lida); sem modelo do tipo e sem 409 de modelo no chat;
AJUSTADO 2026-10-19 (dono): o corpo é o MODELO PADRÃO CONFIGURÁVEL
notification.standard-email (email, pt-BR), com identidade, assinante e rodapé dentro do modelo, CADASTRADO pelo SDK
(standardEmail.ensureTemplate no pré-deploy, para toda empresa, só se ausente, nunca sobrescreve); resolução (versão
ativa da empresa; embutido só como rede de segurança) e renderização no SDK; a API só monta os valores e chama standardEmail.render; a tela de Notificações o
lista e edita; escape, htmlToPlainText, regra de HTML inseguro, interpolação e logo/marcas migram ao SDK, o renderer do
modelo do tipo/prefixo/"De"/assinante ficam no produto; "lida" por pixel (email.opened → read) revogando a 183 D7,
falha terminal; destinatários = pré-marcados + cópia 267; assunto = o da linha; References com entrada e saída pelo
message_id que o Resend devolve no email.sent (sem Message-ID próprio); idempotência email-message:<id>, otimista
queued; o rastreio no Resend é configuração manual com aprovação.
```
