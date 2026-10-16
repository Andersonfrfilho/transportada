# Tasks — 267 Os responsáveis vão em cópia no e-mail da contratante

> Cada task responde: **Mecânica?** (tudo descrito) · **Aceite por comando?** (tsc/teste/`make check`).
> Duas respostas "sim" → `haiku`. Gate de toda task: `tsc --noEmit` + testes da app (script `test` do `package.json`,
> nunca `bun test` cru) + commit isolado. Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`.
> Teste novo entra no agregador e na lista explícita do `package.json` da app.
> Worktree: `../transportada-wt/spec-267` (branch `work/spec-267`). Nada é feito fora dela.

## Fase 0 — Contrato antes do código

> 🤖 Modelo: `sonnet` (T0.2 é 🧠)

- [x] **T0.1** `sonnet` — Conferir contra `origin/staging` as linhas de `plan.md` § Contexto e o levantamento de
      `evidence.md`. Responder também, com arquivo:linha: (a) a 211 já foi publicada (`ConversationEmailTransportPort`
      em uso)? (b) o validador do preview no painel (`SendToContractorDialog` e o da correção) ignora campo novo, ou
      precisa de fase de tolerância? (c) onde o `audit_logs` guarda o detalhe (antes/depois)? (d) de onde o
      `identity-recipient.resolver.ts` tira o e-mail do usuário, e o que acontece com `contactChannel` diferente de
      e-mail? (e) a correção de endereço tem preview/dado de formulário próprio? (f) a idempotência do envio de
      ocorrência — onde está a impressão digital? Divergência vira nota no `evidence.md` antes de seguir.
- [x] **T0.2** 🧠 `opus` — Validar com `architect` o `plan.md`: tabelas e FKs, elegibilidade (`occurrences.resolve`
      também para a correção de endereço, que é `settings.manage`), limite 50 e o corte no automático, o
      `kind: 'internal'` na entrada com DKIM, a ordem de publicação. Decidir se precisa de ADR (se sim, escrever
      `docs/adr/NNNN-...md` conferindo o número em `origin/staging`). Ajuste aprovado entra no `plan.md`. **Outras tasks
      herdam este contrato.** Veredito: aprovado com mudanças, sem ADR (ver `plan.md` § Revisão de arquitetura).

## Fase 1 — API: configuração dos responsáveis

> 🤖 Modelo: `sonnet` (T1.2 → `haiku`)

- [ ] **T1.1** `sonnet` — Migration das tabelas `company_occurrence_watchers` e `contractor_occurrence_watchers` e da
      coluna `contractor_mail_messages.cc_addresses` (plan § Dados, com `status`/`updated_at`/`updated_by_user_id`), schema Drizzle (API **e a cópia do worker**) e códigos de erro. Aceite:
      `make migration-test` e `db:generate` com `no_changes` depois.
- [ ] **T1.2** `haiku` — Teste antes de `occurrence-watcher.policy.ts` (`resolveEffectiveWatchers`, os 7 casos do plano
      § Estratégia de testes + inativo fora da cópia + lista da contratante só com inativos herda a da empresa), depois a implementação pura.
- [ ] **T1.3** `sonnet` — Repositório: ler/trocar as duas listas (transação, `audit_logs` com antes/depois),
      candidatos elegíveis (vínculo ativo + `occurrences.resolve`) e endereços dos elegíveis **em lote** (molde do
      `identity-recipient.resolver.ts`, sem N+1). Integração na mesma task.
- [ ] **T1.4** `sonnet` — Use cases e `occurrence-watchers.routes.ts` (`settings.manage`): endpoints por item (GET/POST/PATCH/DELETE) da empresa e da contratante, GET dos candidatos, teste com o roteador real. Contratos: 200, 400 inelegível, 400 acima de 10, 404 de outra empresa (lista e
      contratante), usuário de outra empresa → 400; nenhum par de rotas com o mesmo método casa o mesmo caminho.

## Fase 2 — Envio com cópia

> 🤖 Modelo: `sonnet` (T2.6 → `haiku`)

- [ ] **T2.1** `sonnet` — Worker, teste antes: `SendResendEmailInput.cc?` e o `cc?` do gateway sandbox, validação por endereço e
      `to + cc ≤ CONTRACTOR_MAIL_MAX_RECIPIENTS` conferido uma vez antes do transporte (Resend e sandbox); `send-contractor-mail-outbound-message` passa `message.ccAddresses`
      (vazio → sem campo). O contrato de paridade do limite continua verde.
- [ ] **T2.2** `sonnet` — `executeSend` resolve a cópia (`resolve-mail-copy.service.ts`), `recordMail` grava
      `ccAddresses`, a rota aceita `excludedWatcherUserIds` (ainda `.strict()`; o contrato `cc` → 400 é mantido) e entra
      na impressão digital da idempotência; o preview devolve `cc` e `ccSource`; `MAX_RECIPIENTS` local da rota passa a
      importar `CONTRACTOR_MAIL_MAX_RECIPIENTS`; manual acima de 50 → 400 `CONTRACTOR_MAIL_TOO_MANY_RECIPIENTS`.
      Contrato e integração (manual com e sem remoção, responsável sem permissão some).
- [ ] **T2.3** `sonnet` — Automático (lista inteira, corte com `warn` acima de 50), reenvio da 248 (lista recalculada) e
      encaminhamento a terceiro (`cc_addresses = '{}'`). Integração dos três.
- [ ] **T2.4** `sonnet` — Correção de endereço: o envio resolve a cópia pela contratante da correção, aceita
      `excludedWatcherUserIds`, o dado do formulário devolve `cc`. Contrato e integração.
- [ ] **T2.5** `sonnet` — O histórico de e-mail da conversa e da correção expõe `ccAddresses` (mesmo tratamento do
      `toAddresses` atual). Contrato da resposta.
- [ ] **T2.6** `haiku` — Documentação viva: OpenAPI das rotas novas e dos campos novos, `apps/api-transportada/CLAUDE.md`
      (núcleo) e `docs/ai-context/api-transportada.md`; `apps/worker-transportada/CLAUDE.md` e
      `docs/ai-context/worker-transportada.md` (cópia na saída e `cc` na entrada).

## Fase 3 — Entrada: a resposta do responsável

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** `sonnet` — Worker: o schema do e-mail recebido declara `cc`, e `record-contractor-mail-inbound-message`
      grava `cc_addresses`. Registrar a emenda da 143 (`plan.md:49`) com link para esta spec. Teste.
- [ ] **T3.2** `sonnet` — Teste antes: `identifyContractorSender` com `kind: 'internal'` (usuário da empresa com DKIM →
      interno; sem DKIM → `unknown`; contato vence usuário; `reachedContractor`). Depois, a política e o
      `occurrence-conversation.query.ts` (endereços dos usuários citados, em lote). Registrar a emenda da 183 com link.
- [ ] **T3.3** `sonnet` — Integração ponta a ponta: o responsável responde a todos pelo token → a conversa mostra a
      mensagem interna dele, sem sugestão de cadastro e **sem** e-mail de saída nem notificação nova.

## Fase 4 — Painel

> 🤖 Modelo: `sonnet` (T4.4 e T4.5 → `haiku`)

- [ ] **T4.1** `sonnet` — Aba "Responsáveis por ocorrências" em `/company-settings` (painel, placement, tab id, ramo na
      página, molde do `quickReplies`): seleção múltipla dos candidatos, "sem e-mail"/"sem permissão" marcados, máximo 10. Teste de renderização e do salvar.
- [ ] **T4.2** `sonnet` — Seção "Responsáveis desta contratante — substitui a lista da empresa" na tela da contratante,
      ao lado dos contatos, mostrando qual lista vale (`effectiveSource`) e "Limpar e herdar da empresa". Teste.
- [ ] **T4.3** `sonnet` — Linha "Cópia:" com chips removíveis no diálogo de envio de ocorrência e no da correção de
      endereço; o envio manda `excludedWatcherUserIds`; sem campo de digitar. Teste: remover um chip e enviar.
- [ ] **T4.4** `haiku` — Histórico: "Cópia:" na mensagem; mensagem interna por e-mail com o autor e o selo "só para a
      equipe — a contratante não recebeu" quando `reachedContractor` for falso. Teste.
- [ ] **T4.5** `haiku` — Locales pt-BR/en de tudo acima.

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** `sonnet` — Revisão (`code-reviewer`) e revisão de segurança (`security-reviewer`: BOLA nas listas,
      endereço livre impossível, nenhum endereço em log, `internal` só com DKIM). Achados corrigidos ou registrados.
- [ ] **T5.2** `sonnet` — Auditoria §15 (N+1 na resolução dos endereços, `Promise.all` vs `allSettled`, sem PII). Gates
      completos: `make check`, integração da API, `make migration-test`. Emenda da 248 (`spec.md:75`: a cópia só leva
      usuário da empresa) registrada com link.
- [ ] **T5.3** `sonnet` — Publicação em etapas, **cada uma com aprovação humana**: API + migration → worker → painel
      (plan § Publicação). Contexto de I.A. atualizado no `CLAUDE.md` da raiz.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/267-os-responsaveis-vao-em-copia-no-e-mail-da-contratante/ (leia
spec.md, plan.md, tasks.md e evidence.md antes de começar; leia também specs/143-a-contratante-responde-por-e-mail,
150-pedido-de-correcao-de-endereco, 183-a-ocorrencia-tem-duas-conversas, 211-o-nucleo-de-conversa-ganha-o-e-mail e
248-a-prorrogacao-do-boleto-vai-direto-a-contratante). Árvore única: ../transportada-wt/spec-267 (branch
work/spec-267); nada fora dela. Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus, validar com architect antes de qualquer código; decide se há
ADR) · Fase 1 → executor model=sonnet (T1.2 haiku) · Fase 2 → executor model=sonnet (T2.6 haiku) · Fase 3 → executor
model=sonnet · Fase 4 → executor model=sonnet (T4.4/T4.5 haiku) · Fase 5 → sonnet · revisão final → code-reviewer
model=sonnet e security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com tsc --noEmit + testes da app (script `test` do package.json, nunca
`bun test` cru) + commit isolado, evidência em evidence.md. Task que toca test/integration/** só fecha com
`bun --env-file=../../.env.test run test:integration` (de apps/api-transportada). Lote com migration roda
make migration-test e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates, prettier nos .md;
conferir numeração de spec/ADR/migration contra origin/staging.
Pare e pergunte antes de: qualquer deploy ou merge em staging/main (T5.3 — API + migration, depois worker, depois
painel), se a T0.1 achar a 211 publicada (o cc entra na porta do núcleo), se a T0.1 achar o validador do painel estrito
(fase de tolerância antes da API), qualquer item de "Perguntas ao dono" do evidence.md ainda aberto, e qualquer
[NEEDS CLARIFICATION] que surgir.
```
