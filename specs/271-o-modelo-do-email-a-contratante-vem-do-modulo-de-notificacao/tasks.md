# Tasks — 271 O modelo do e-mail à contratante vem do módulo de notificação

> Cada task responde: **Mecânica?** (tudo descrito) · **Aceite por comando?** (tsc/teste/`make check`).
> Duas respostas "sim" → `haiku`. Gate de toda task: `bun run typecheck` (`tsc --noEmit`) + lint por app (cwd na app) +
> testes da app (script `test` do `package.json`, nunca `bun test` cru) + commit isolado (`git commit --only`).
> Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`.
> Teste novo entra no agregador e na lista explícita do `package.json` da app.
> Task que toca `test/integration/**` só fecha com `bun --env-file=../../.env.test run test:integration` (de
> `apps/api-transportada`) **sem nenhum skip**.
> Task com migration: aplica, reverte e reaplica (`make migration-test` ou Postgres descartável) e `db:generate` com
> `no_changes` depois.
> Worktree: `~/transportada-wt/spec-271` (FS do Linux, branch `work/spec-271`). Nada é feito fora dela.

## Fase 0 — Contrato antes do código

> 🤖 Modelo: `sonnet` (T0.2 é 🧠)

- [x] **T0.1** `sonnet` — Conferir contra `origin/staging` e contra o pacote instalado (os pacotes `notification-module` e `notification-contracts` em `node_modules`) os fatos de `plan.md` § Contexto e o levantamento do `evidence.md`: a versão
      instalada exporta `templates`, `interpolateTemplate` e `extractTemplatePlaceholders`; a casa de
      `occurrence-mail-template.policy.ts`; o código 404 de contato inexistente; se `CONTRACTOR_MAIL_TEMPLATE_IN_USE` só
      serve ao `occurrence`; se o `saveOccurrenceType` já grava `audit_logs`; os nomes exatos das constraints da 269 para
      o rollback B; a permissão das rotas que o editor do tipo vai ler (lista de responsáveis da 267, contatos da
      contratante, `listTemplates`); se o guarda da prévia do diálogo e o do histórico de mensagens são estritos; a lista
      de testes da 269 que só cobrem o que sai. **Medir em staging (só contagem):** modelos `occurrence`, linhas com
      `contractor_mail_template_id` não nulo no tipo e na exceção, mensagens com `template_id` de modelo `occurrence`.
      Divergência vira nota no `evidence.md` antes de seguir.
- [x] **T0.2** 🧠 `opus` — Validar com `architect` a ADR-0108 e D1–D15 do `plan.md`: chave sem FK (D1), carimbo novo
      (D2), filtro das chaves do sistema (D3), recusa de HTML (D5), `EXISTS` cross-schema no feed e no worker (D9), FK
      dos responsáveis para a lista da empresa com `CASCADE` (D10), precedência (D11), poda dos destinatários na mesma
      transação da 270 (D12), pré-marcação no manual (D13), ordem das guardas no `PUT` (escopo 270 → destinatários →
      modelo → responsáveis). Ajuste aprovado entra no `plan.md`, e a ADR passa a "aceita". **Outras tasks herdam este
      contrato.** Veredito: **aprovado com mudanças** (plan § Revisão de arquitetura).

## Fase 1 — Painel tolerante (vai a produção ANTES da API, junto das Fases 1 da 269 e da 270)

> 🤖 Modelo: `haiku`

- [x] **T1.1** `haiku` — Teste antes: tipo com `contractorNotificationTemplateKey`, `contractorMailWatchers`,
      `contractorMailRecipients` e `missingNotificationTemplate`, **sem** `contractorMailTemplateId`, passa por
      `occurrenceTypesFromApi`; com `contractorMailTemplateId` também (tipo antigo). Depois, as chaves entram opcionais
      em `allowed` de `isOccurrenceType` (`tripResponse.validation.ts`). Exceção sem `contractorMailTemplateId` passa
      (`occurrenceAttachmentOverrides.validation.ts`).
- [x] **T1.2** `haiku` — Teste antes: prévia do diálogo com `notificationTemplateKey` e sem `templateId`, e mensagem do
      histórico com `notificationTemplateKey`/`notificationTemplateVersion`, passam (guardas da T0.1). Depois, a
      tolerância. `ccSource` aceita `'occurrence_type'` (`occurrenceConversationClient.service.ts` ~:304 e
      `occurrenceConversation.types.ts` ~:148).
- [ ] **T1.3** `sonnet` — Publicar a Fase 1 (PR → `staging` → `main`) **com aprovação humana**, junto da 269 T1.4 e da
      270 T1.2. Registrar o commit em produção no `evidence.md`. **A Fase 2 não vai a `main` antes disto.**

## Fase 2 — API: o modelo vem do módulo

> 🤖 Modelo: `sonnet` (T2.2 e T2.9 → `haiku`)

- [x] **T2.1** `sonnet` — Migration A (plan § Dados) + schema Drizzle (colunas, CHECK, duas tabelas, colunas da
      mensagem) + `rollback.sql`. Aceite: aplica, reverte e reaplica; `db:generate` → `no_changes`.
- [x] **T2.2** `haiku` — Teste antes (tabela espelhada dos valores da 269): `occurrence-mail-values.policy.ts` produz as
      chaves `camelCase` do plan § Variáveis com os mesmos valores, mais `tipoOcorrencia` e `linhasItens` (1 item, 3
      itens, 201 itens → 200 linhas + "e mais 1 item", item sem código). Depois, a mudança.
- [x] **T2.3** `sonnet` — Teste antes das políticas puras: `occurrence-contractor-template.policy.ts` (utilizável;
      `not_found`, `system_key`, `html_body`, `empty_subject`, `unknown_variables` — todos de uma vez; chave do sistema
      vinda de `NOTIFICATION_TEMPLATE_KEY`) e `occurrence-contractor-mail-render.policy.ts` (variável ausente → vazio;
      assunto com quebra de linha colapsado e truncado; corpo longo encurta `linhasItens` antes de truncar; sem HTML
      escapado no texto). Depois, a implementação.
- [ ] **T2.4** `sonnet` — `notification-template.query.ts` (versão ativa mais alta, `email`, `pt-BR`, empresa; outra
      empresa não aparece) e o `PUT`/`GET` do tipo com `contractorNotificationTemplateKey` (ausente não mexe, `null`
      limpa, carimbo D2 só quando a chave muda, `missingNotificationTemplate` na leitura). Integração: modelo de outra
      empresa → 400 `not_found`; desativado; HTML; `{{foo}}`; versão nova da mesma chave não muda o carimbo.
- [ ] **T2.5** `sonnet` — Envio pelo modelo do tipo: `readSuggestedMail`, `send-occurrence-mail` (`resolveTemplate`,
      409 `OCCURRENCE_MAIL_TEMPLATE_MISSING` sem modelo utilizável), `send-automatic-occurrence-mail`
      (`no_template_selected`, `registered_before_template` pelo carimbo novo), `preview-occurrence-mail`
      (`notificationTemplateKey`), `recordMail` com chave/versão e `template_id = null`; reenvio da 248 copia chave/versão
      da original sem bloqueio. A exceção deixa de contar. Integração: automático renderiza e grava chave/versão;
      desativar no módulo → manual 409, automático pula; reenvio da 248 sem modelo segue.
- [ ] **T2.6** `sonnet` — Em cópia (D10/D11): teste antes de `resolveEffectiveWatchers` com `typeWatchers` (tipo com
      ativo vence; tipo só com inativo herda contratante; contratante vazia herda empresa; removido no manual; já no
      `To`; sem e-mail); depois a política, `loadEffectiveWatcherCandidates` com `occurrenceTypeId` (uma ida), o `PUT`
      (`contractorMailWatcherUserIds`: fora da lista da empresa → 404, outra empresa → 404, > 10 → 400, novo inativo →
      400, inativo já escolhido fica) e a auditoria do remover da 267 com os tipos afetados. Integração dos critérios 5
      da spec (manual, automático, reenvio da 248) e da cascata ao remover da lista da empresa. Correção de endereço sem
      mudança (teste de regressão).
- [ ] **T2.7** `sonnet` — Destinatários (D12/D13): teste antes de `occurrence-contractor-recipients.policy.ts` (só da
      contratante da nota; inativo e sem `receives_occurrences` caem; ignora etapa; vazio → regra de hoje); depois o
      `PUT` (`contractorMailRecipientContactIds`: tipo `all` → 400; contato de contratante fora da lista → 400; outra
      empresa → 404; > 50 → 400), a poda ao tirar contratante do escopo e ao trocar para `all` (mesma transação, depois
      da gravação da 270), o automático e o `preselected` da prévia. Integração do critério 6 e 7 da spec.
- [ ] **T2.8** `sonnet` — Auditoria D15 (só quando muda; ids, nunca endereço) e aviso D9 no feed e no detalhe na mesma
      consulta (`EXISTS`), sem N+1 (teste que conta consultas, molde da 269 T2.7).
- [ ] **T2.10** `sonnet` — Gate do TMS nas rotas do módulo: `POST`/`PUT`/`DELETE` em `/notification-templates*` exigem
      `settings.manage` antes do roteador do módulo (`router.service.ts` ~:288). Teste de contrato: membro sem a permissão
      → 403. (Lacuna existente: as rotas do módulo usam escopo `admin` sem `requiredScopes` e `isScopeSatisfied` deixa
      qualquer membro entrar.) Também as rotas de leitura do plan § Revisão item 3 (`contractor-mail-templates` e
      `contractor-mail-recipient-candidates`), com `settings.manage`.
- [ ] **T2.9** `haiku` — Documentação viva: OpenAPI das rotas alteradas, `apps/api-transportada/CLAUDE.md` (núcleo, uma
      linha sob ocorrência) e `docs/ai-context/api-transportada.md`.

> Publicação (registro, nada é publicado nesta execução): o passo 1 é uma branch `promote/*` a partir de `origin/main`
> com **só** os commits do painel tolerante (269 T1.1–T1.3, 270 T1.1, 271 T1.1–T1.2), como o PR #158.

## Fase 3 — API e worker: o que a 269 deixou e sai (etapa A)

> 🤖 Modelo: `sonnet` (T3.3 → `haiku`)

- [ ] **T3.1** `sonnet` — Remover conforme `plan.md` § Inventário: tipo `occurrence` do catálogo da 150 (prévia,
      arquivar em uso, suporte de uso), `occurrence-mail-body.policy.ts`, `occurrence-mail-template.policy.ts`, leitura e
      escrita de `contractor_mail_template_id`/`_selected_at` no tipo e na exceção (a chave fica aceita e ignorada no
      `PUT`, D14), e os testes que só cobriam isso (fora do `package.json` e do agregador). O `POST` de modelos da 150 com `mailType: 'occurrence'` → 400 (teste).
- [ ] **T3.2** `sonnet` — Worker: varredura pela chave, carimbo e `EXISTS` (plan § Worker). Teste de integração do
      worker: tipo sem chave, chave sem modelo ativo, modelo HTML e ocorrência anterior ao carimbo não entram; o caso
      certo entra uma vez.
- [ ] **T3.3** `haiku` — Gate de limpeza: o `grep` do aceite da etapa A (`plan.md` § Inventário) só acha o schema das
      colunas da B e a chave aceita-e-ignorada. Colar a saída no `evidence.md`.

## Fase 4 — Telas

> 🤖 Modelo: `sonnet` (T4.4 e T4.5 → `haiku`)

- [ ] **T4.1** `sonnet` — Teste antes; depois o bloco "E-mail à contratante" no editor do tipo e na criação: interruptor
      (fica), **Modelo** (`OccurrenceTypeContractorTemplateSelect`: lista D3, "Nenhum", link "Criar modelo em
      Notificações", prévia com `interpolateTemplate` e valores de exemplo, variáveis, modelo sugerido para copiar,
      variáveis desconhecidas do modelo atual como aviso, aviso do RF9 só com o e-mail ligado, erros 400 com os
      problemas). **Neste campo a lista vem de `GET /company-settings/occurrence-types/contractor-mail-templates`**
      (plan § Revisão, item 3), **não** de `useEmailTemplatesQuery` (o seletor do aviso interno segue nela). O campo do aviso interno ganha o rótulo "Aviso interno" e não muda de comportamento.
- [ ] **T4.2** `sonnet` — Teste antes; depois **Em cópia** (`OccurrenceTypeWatchersSelect`: `MultiSelect` da lista da
      empresa, inativo/sem permissão/sem e-mail marcados, teto 10, frase "vazio: vale a lista da contratante, senão a da
      empresa") e **Destinatários** (`OccurrenceTypeRecipientsSelect`: só com escopo `listed` — teste de que não renderiza
      no `all`; contatos das contratantes do tipo agrupados; inativo marcado; ao tirar contratante do escopo, os
      contatos dela somem da seleção com aviso; frase "vazio: vão os contatos que recebem ocorrências da etapa").
- [ ] **T4.3** `sonnet` — Remover o seletor da 269 no tipo e na exceção, `contractorMailTemplateId` dos tipos, serviços e
      validações do painel; o link do aviso no feed/detalhe/diálogo aponta só para o tipo. Testes da 269 do painel que
      só cobriam isso saem.
- [ ] **T4.4** `haiku` — "Modelos" (150): `occurrence` sai de `CONTRACTOR_MAIL_TEMPLATE_TYPES` do painel, do rótulo e do
      caso de 409 em `contractorMailTemplateErrors.service.ts`. Teste.
- [ ] **T4.5** `haiku` — Locales pt-BR/en das telas novas e dos códigos de erro; chaves mortas da 269 saem.

## Fase 5 — Fechamento e publicação

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** `sonnet` — Gates completos: `bun run typecheck`; lint por app; script `test` de `apps/api-transportada`,
      `apps/worker-transportada` e `apps/frontend-transportada`; contrato da API
      `bun --env-file=../../.env.test test --timeout 120000`; integração
      `bun --env-file=../../.env.test run test:integration` sem skip; `bunx prettier --check .` na raiz; auditoria §15
      (N+1, `Promise.all` × `allSettled` na prévia, PII em log).
- [ ] **T5.2** `sonnet` — `code-reviewer` e `security-reviewer` em paralelo sobre `origin/staging...HEAD` (BOLA em
      modelo/responsável/contato, chave de outra empresa, endereço em log, cliente tentando mandar modelo ou `cc`).
      Corrigir e reverificar.
- [ ] **T5.3** `sonnet` — Conferir no navegador local, por texto (`read_page`): criar modelo em Notificações, escolher no
      tipo, cópia e destinatários num tipo `listed`, enviar pelo diálogo e ver no Mailpit (268) assunto, corpo, `To` e
      `Cc`. Um screenshot só no fim. Evidência.
- [ ] **T5.4** `sonnet` — Publicação **com aprovação humana em cada passo** (plan § Publicação): rebase em
      `origin/staging`, `bun install --frozen-lockfile`, gates, conferir numeração de spec/ADR/migration; API + worker
      (269 + 270 + 271 juntas) → `staging` → `main`; telas → `staging` → `main`. Atualizar o `CLAUDE.md` da raiz (o
      parágrafo da 269 vira o da 271).
- [ ] **T5.5** `sonnet` — Depois das telas em produção: a chave `contractorMailTemplateId` sai do `PUT` do tipo e da
      exceção (400 por `.strict()`); teste; publicação com aprovação.

## Fase 6 — Migration B: as colunas da 269 saem (DESTRUTIVA — pare e pergunte)

> 🤖 Modelo: `sonnet` (T6.2 é 🧠)

- [ ] **T6.1** `sonnet` — Conferir que nenhum código lê ou escreve as colunas (grep) e que a A e as telas estão no
      ambiente alvo. **Medir** (só contagem) a pré-condição do plan § Dados em staging e produção; diferente de zero →
      parar e perguntar.
- [ ] **T6.2** 🧠 `opus` → `sonnet` — Migration B + `rollback.sql` escrito (nomes da T0.1) + schema Drizzle sem as
      colunas e com a CHECK de volta a `address_correction`. Aplica, reverte, reaplica; `db:generate` → `no_changes`.
- [ ] **T6.3** ⛔ `sonnet` — Publicação da B (`staging` → conferir → `main`) **com aprovação humana**, nunca automática.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/271-o-modelo-do-email-a-contratante-vem-do-modulo-de-notificacao/
(leia spec.md, plan.md, tasks.md, evidence.md e a ADR docs/adr/0108-o-modelo-do-email-a-contratante-vem-do-modulo-de-notificacao.md
antes de começar; leia também specs/267-*, 268-*, 269-* (+ ADR-0106) e 270-* (+ ADR-0107) com os evidence.md, e o
notification-module/notification-contracts em ~/personal/adatechnology-packages/packages/backend/).
Árvore única: ~/transportada-wt/spec-271 (FS do Linux, branch work/spec-271, criada de origin/staging); nada fora dela.
Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus, validar com architect antes de qualquer código) ·
Fase 1 → executor model=haiku (T1.3 sonnet) · Fase 2 → executor model=sonnet (T2.2/T2.9 haiku) ·
Fase 3 → executor model=sonnet (T3.3 haiku) · Fase 4 → executor model=sonnet (T4.4/T4.5 haiku) · Fase 5 → sonnet ·
Fase 6 → sonnet (T6.2 🧠 opus → sonnet) · revisão final → code-reviewer model=sonnet e security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com bun run typecheck + lint por app (cwd na app) + script `test` do
package.json da app (nunca `bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em evidence.md.
Task que toca test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de
apps/api-transportada), ZERO skips. Lote com migration: aplica, reverte e reaplica (make migration-test ou Postgres
descartável) e db:generate esperando no_changes. Antes de publicar: git fetch, rebase em origin/staging,
bun install --frozen-lockfile, gates, `bunx prettier --check .` na raiz; conferir numeração de spec/ADR/migration contra
origin/staging.
Pare e pergunte antes de: qualquer merge em main (T1.3, T5.4, T5.5, T6.3 — o painel tolerante vai a produção ANTES da
API, e a API da 269 nunca vai sozinha a produção: 269 + 270 + 271 juntas); qualquer mudança de dados ou consulta que
não seja contagem em staging ou produção; a migration destrutiva B (Fase 6 inteira, com a pré-condição medida); e
qualquer [NEEDS CLARIFICATION] que surgir.
Decisões já tomadas (evidence.md): o modelo é criado só em Notificações e escolhido no tipo (campo separado do aviso
interno), pela chave; a exceção por contratante não escolhe modelo; variáveis {{camelCase}} da lista fechada com
{{linhasItens}}; modelo HTML ou com variável desconhecida é recusado; sem modelo utilizável não sai e-mail, nem à mão
(409 OCCURRENCE_MAIL_TEMPLATE_MISSING), reenvio da 248 isento; cópia = tipo ?? contratante ?? empresa; destinatários só
em tipo listed, filtrados pela contratante da nota, vazio = automático; a entrega continua pelo send-occurrence-mail
(nunca sendNotification).
```
