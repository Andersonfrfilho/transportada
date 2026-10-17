# Evidência — 271 O modelo do e-mail à contratante vem do módulo de notificação

## Decisões do dono (chat, 2026-10-17)

1. **"É apenas criado no módulo de notificação; a escolha deve ser na ocorrência em si."** O modelo do e-mail à
   contratante é criado e editado só em Notificações → Preferências (`/notificacoes/preferencias`,
   `NotificationSettingsWorkspace` do `@adatechnology/notification-ui`, tabela `notification.templates`). A escolha fica
   no cadastro do **tipo** (Ocorrências → Tipos), num campo **separado** do aviso interno
   (`company_occurrence_types.email_template_key`, 079/246, que não muda).
2. **"Se cadastramos ocorrências gerais ou por contratantes específicos e selecionamos o modelo nesse cadastro, não
   precisa ter uma tela para isso."** Sem escolha de modelo na exceção por contratante: texto próprio de uma
   contratante = tipo de contratantes (270). O uso da coluna de modelo na exceção (269) sai.
3. **A entrega não muda:** `send-occurrence-mail` (Resend da empresa ou Mailpit fora de produção, 268), contatos da
   contratante em `To`, responsáveis em `Cc` (267), fio de resposta (183/248). O módulo é **só** depósito e
   renderizador — não passar por `sendNotification` (exige usuário do sistema, não tem `cc`, remetente global).
4. **Bloco "E-mail à contratante" no cadastro do tipo, com três coisas:**
   1. **Modelo** — modelo do módulo de notificação (itens 1–3).
   2. **Em cópia** — seleção múltipla dos **responsáveis da empresa** (`company_occurrence_watchers`, 267); ativos e
      elegíveis aparecem, inativos/inelegíveis marcados. Precedência da cópia: **escolha do tipo (se não vazia) ?? lista
      da contratante (267) ?? lista da empresa (267)**. Escolha vazia = como hoje. Tabela de ligação
      `company_occurrence_type_watchers (company_id, occurrence_type_id, user_id)` com FKs compostas e auditoria. Teto
      de 50, remoção de chip pelo operador no envio manual e impressão digital da 267 continuam.
   3. **Destinatários** — **só** em tipo de contratantes (270, `listed`): seleção múltipla dos contatos
      (`contractor_contacts`) das contratantes da lista. Escolhido: `To` = contatos escolhidos **da contratante da
      nota** (ativos, com e-mail). Vazio: automático como hoje (contatos da contratante da nota que recebem ocorrência
      daquela etapa). Tipo geral (`all`): campo escondido, `To` sempre automático. Tabela
      `company_occurrence_type_recipients (company_id, occurrence_type_id, contact_id)`; quando uma contratante sai da
      lista do tipo, os contatos dela saem da escolha (decidido nesta spec: apagados na mesma transação — D12).
5. Manter da 269 (ADR-0106): sem modelo não sai e-mail, nem à mão; reenvio da 248 isento; assunto saneado e truncado;
   automático só para ocorrência registrada depois da escolha; aviso só com o e-mail ligado.

**Emendas registradas:** a ADR-0108 substitui a ADR-0106 §1 (tipo `occurrence` no catálogo da 150) e §2 (modelo no
tipo **e na exceção**, por id). A 267 "Fora do escopo: responsáveis por tipo de ocorrência" deixa de valer (item 4.2). A
regra de `To` da 143/183 (contatos da etapa) ganha a escolha explícita no tipo `listed` (item 4.3).

## Decisões tomadas nesta spec (padrões; a T0.2 valida)

- **Pela chave, sem FK** (D1): a identidade do módulo é versionada; o envio lê a versão ativa mais alta. Editar o texto
  no módulo vale no próximo e-mail, sem tocar no tipo.
- **Carimbo novo** `contractor_notification_template_selected_at` (D2); as colunas da 269 saem na etapa B.
- **Lista do seletor** = modelos de e-mail ativos `pt-BR` da empresa, menos as chaves de aviso do sistema (D3).
- **Variáveis `{{camelCase}}`** com lista fechada validada pela TMS ao salvar o tipo (D4), porque o catálogo do módulo
  é por chave exata e a chave é livre.
- **Corpo HTML recusado** (D5); no envio, modelo não utilizável ≡ sem modelo (D9).
- **`{{linhasItens}}`** com a linha fixa da 269 substitui o texto de item configurável (Q1).
- **Rastreio por chave e versão** em `contractor_mail_messages` (D8); `template_id` fica para a correção de endereço.
- **Responsável do tipo amarrado à lista da empresa** por FK com `CASCADE` (D10); só se escolhe ativo; até 10.
- **Destinatário escolhido vence a etapa** e, sem nenhum da contratante da nota, vale a regra de hoje (D13); no manual,
  é pré-marcação.
- **Publicação junto:** 269 + 270 + 271 vão a produção juntas; a API da 269 nunca sozinha.

## Perguntas abertas (com padrão adotado — não bloqueiam a execução)

- **Q1 — Linha do item.** Padrão: fixa (`{codigo} – {item} – {quantidade} {unidade} – R$ {valor}`). Alternativa: um
  campo "linha do item" no tipo (volta um texto ao tipo, que o dono quis tirar). Mudar depois é aditivo.
- **Q2 — Variáveis no editor do módulo.** Padrão: a TMS mostra e valida as variáveis no editor do **tipo**; o painel de
  variáveis do módulo não as lista (catálogo por chave exata). Alternativa: mudar o pacote para aceitar catálogo por
  prefixo (ex.: `ocorrencia.*`) e passar `templateVariables` — exige release do `notification-module`/`-ui`.
- **Q3 — Remover modelo em uso no módulo.** Padrão: o módulo deixa desativar; a 271 mostra o aviso "Tipo sem modelo de
  notificação" e para de enviar. Alternativa: gancho no pacote para bloquear (mudança no pacote).
- **Q4 — Destinatários no envio manual.** Padrão: pré-marcados, o operador pode mudar (como a 183). Alternativa: travar
  o `To` nos escolhidos.
- **Q5 — Contato escolhido sem a etapa.** Padrão: a escolha explícita ignora `occurrence_stages`. Alternativa: cruzar com
  a etapa.

## Levantamento contra `origin/staging` (84c05c96b, 2026-10-17)

Leitura direta, só de leitura. Caminhos relativos a `apps/api-transportada/src/` salvo indicação. A T0.1 confere.

### Módulo de notificação (`~/personal/adatechnology-packages/packages/backend/`)

- `notification-module/src/schema/schema.ts:29-51`: `notification.templates` (`id`, `company_id`, `key varchar(128)`,
  `channel varchar(16)`, `locale varchar(16)`, `version`, `subject varchar(256)`, `body text`, `active`), índice único
  `(company_id, key, channel, locale, version)`.
- `notification-module/src/repositories/TemplateRepository.ts:24` `findActive` (versão ativa mais alta);
  `deactivateIdentity` (desativa todas as versões da chave); `listByCompany` (:85). Só `listTemplates` é exposto como
  caso de uso; a tabela `templates` é exportada (`index.ts:76`).
- `notification-contracts/src/templateRender.ts:34-35` `interpolateTemplate` (ausente → `''`);
  `extractTemplatePlaceholders`.
- `notification-module/src/use-cases/Template.use-cases.ts:43-49`: catálogo de variáveis só com `templateVariables` e
  por chave exata (`TemplateVariableCatalog = Record<key, …>`); a TMS não passa catálogo.
- `notification-ui/src/components/NotificationSettingsWorkspace.tsx:119` `isHtmlBody`; o editor cria modelo com chave
  livre ("Novo modelo"); o painel de variáveis lê `templateVariables[draft.key]` (`useTemplateEditor.ts:278`).
- Versões instaladas: `@adatechnology/notification-module` `0.1.0-rc.3`, `notification-contracts` `0.1.0-rc.2` (API);
  `notification-ui` `0.1.0-rc.9`, `notification-client` `0.1.0-rc.3` (painel). A T0.1 confere os exports na versão
  instalada (a branch não tem `node_modules`).

### TMS

- Catálogo de avisos do sistema: `notification/domain/notification-catalog.constant.ts` (`NOTIFICATION_TEMPLATE_KEY`);
  seed `notification-template-seed.service.ts:65`; `NOTIFICATION_DEFAULT_LOCALE = 'pt-BR'`
  (`notification/notification.constant.ts:9`); rota de teste `POST /notification-templates/:key/test`
  (`notification-template-test.routes.ts:13`).
- Aviso interno: `save-occurrence-type.use-case.ts:194-201` (`hasActiveEmailTemplate`), implementação em `main.ts:4439`
  (via `listTemplates`); painel `OccurrenceTypeNotification.component.tsx` + `notification/queries/useEmailTemplates.query.ts`.
- 269: `trip.schema.ts:2957-2965` (tipo) e `:3366-3375` (exceção) colunas `contractor_mail_template_id`/`_selected_at`,
  FKs `:3311-3319` e `:3458`; `contractor-mail/domain/mail-template-catalog.constant.ts:10,14`;
  `drizzle-occurrence-mail.repository.ts:171-260` (fonte efetiva, original), `:307` leitor da sugestão, `:369`
  `template_id`; `preview-occurrence-mail.use-case.ts:105-113,152,158,162`; `send-automatic-occurrence-mail.use-case.ts:90-117`;
  `send-occurrence-mail.use-case.ts:208-228` (`resolveTemplateId`); worker
  `occurrence-automatic-mail-sweep/infrastructure/drizzle-occurrence-automatic-mail-queue.repository.ts:37-70`. Painel:
  `OccurrenceTypeContractorMail.component.tsx:30,43`, `OccurrenceTypeMailTemplateSelect.component.tsx`,
  `OccurrenceExceptionItem.component.tsx:139-141`, `delivery-clients/shared/contractorMailTemplates.types.ts:7`.
- 267: `database/contractor-mail.schema.ts:757-835` (`company_occurrence_watchers` PK `(company_id, user_id)`, `status`;
  `contractor_occurrence_watchers`); `occurrence-watcher.policy.ts` (`resolveEffectiveWatchers`, "com algum ativo
  vence"); `resolve-mail-copy.service.ts` (teto, automático corta, manual 400); `occurrence-watcher-candidates.query.ts`
  (endereço e `occurrences.resolve` em lote); `drizzle-occurrence-watcher.repository.ts:195` (remover apaga a linha,
  com auditoria); `occurrence-watcher.constant.ts` (`MAX_ACTIVE = 10`, `MAX_TOTAL = 30`).
- Contatos: `database/contractor-mail.schema.ts:144-240` (`receives_occurrences`, `occurrence_stages` ⊆
  `separation|delivery|stop`, `status`, unique `(company_id, id)`); rotas `contractor-contacts.routes.ts` só `POST` e
  `PATCH` (contato não se apaga). `To` do automático por etapa: `send-automatic-occurrence-mail.use-case.ts:95`; manual
  recebe `contactIds` e confere a contratante (`send-occurrence-mail.use-case.ts:291-302`).
- Última migration em `staging`: `20261017010529_occurrence_type_contractor_scope` (270).
- **Staging (verificado antes desta spec):** zero modelos `contractor_mail_templates` com `mail_type = 'occurrence'` e
  zero escolhas no tipo e na exceção. A T0.1 mede de novo, só contagem.

## Registro das tasks

### T0.1 / T0.2 — 2026-10-17

- Veredito da revisão de arquitetura: **aprovado com mudanças** (plan § Revisão de arquitetura). ADR-0108 passa a aceita.


### T1.1 / T1.2 — painel tolerante (commits 4877cb6f2, e5caecedd)

- Guarda do tipo (`isOccurrenceType`) aceita `contractorNotificationTemplateKey`, `contractorMailWatchers`, `contractorMailRecipients`, `missingNotificationTemplate`; guarda da exceção já tolerava a ausência de `contractorMailTemplateId`. Prévia: `ccSource` aceita `occurrence_type`; `notificationTemplateKey` entra e `templateId` sai (nenhuma tela o lia). O guarda do histórico de mensagens não é estrito (não lê chave de modelo): nada a tolerar.
- Painel: `bun run test` 8328 + 1404 pass, 0 fail; typecheck limpo; lint 0 erros (16 avisos preexistentes).

### T2.1 — migration A

- `drizzle/20261017041702_occurrence_type_contractor_mail` (aplica, reverte e reaplica em Postgres descartável; `db:generate` → `no_changes`). Contrato de API completo: 12012 pass / 25 skip (preexistentes) / 0 fail.

### T2.2 — valores do modelo

- `buildContractorMailValues` (chaves `camelCase`, `tipoOcorrencia`, `linhasItens`, teto 200 + "e mais N itens") entra ao lado de `buildOccurrenceMailValues`; a função da 269 (e seu teste) **sai na T2.5**, junto com o último consumidor, para cada commit ficar verde. Gate API: tsc/lint/prettier limpos, contrato 11998 pass / 25 skip / 0 fail.

### T2.3 — políticas puras

- `occurrence-contractor-template.policy.ts` (`assessContractorTemplate`: todos os problemas, ordem `system_key`, `html_body`, `empty_subject`, `unknown_variables`, `malformed_placeholder`; `not_found` sozinho; `blocksContractorMailSend` bloqueia só `not_found`/`html_body`/`empty_subject`) e `occurrence-contractor-mail-render.policy.ts` (`renderContractorMail`). Gate API: tsc/lint/prettier limpos, contrato 12022 pass / 25 skip / 0 fail.

### T2.4 — modelo escolhido no tipo, pela chave

- `notification-template.query.ts` (SQL parametrizado em `notification.templates`, versão ativa mais alta, e-mail `pt-BR`), `PUT`/`GET` do tipo com `contractorNotificationTemplateKey` (ausente não mexe, `null` limpa, carimbo `is distinct from` sem cast, `INSERT` com chave carimba), 400 `OCCURRENCE_CONTRACTOR_TEMPLATE_INVALID` com todos os problemas.
- **Desvio de contrato:** o `ApiError` só carrega `details[{field,message}]`; os problemas vão como `{field:'contractorNotificationTemplateKey', message:<code>}` e cada variável desconhecida como `{field:'variables', message:<nome>}` (no lugar de `details.problems[]`).
- O aviso D9 (`missingNotificationTemplate`) já nasce em lote por `IN (chaves)` (feed, detalhe e editor do tipo), best-effort com log só do SQLSTATE; o teste que conta as consultas está em `missing-template-query.contract.ts`.
- Integração (36 arquivos de tipo, feed, envio e conversa): 128 pass / 0 fail / 0 skip. Contrato da API: 12032 pass / 25 skip / 0 fail; tsc e lint limpos.
- A suíte de integração inteira soma ~55 min sequenciais (pesos), então cada task roda só os arquivos que toca; a suíte inteira roda no fechamento (T5.1).

### T2.5 — envio pelo modelo do módulo

- `readSuggestedMail` renderiza o modelo do módulo (`renderContractorMail`), `findOccurrenceNotificationTemplate` (chave do tipo + versão ativa; sem modelo utilizável → `null`), envio manual 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`, automático `no_template_selected`/`registered_before_template` pelo carimbo novo, prévia com `notificationTemplateKey`, `recordMail` grava `notification_template_key`/`_version` e `template_id = null`; reenvio da 248 copia chave/versão da original sem bloqueio. A exceção por contratante deixou de contar. `buildOccurrenceMailValues` (269) saiu com o último consumidor.
- Integração (15 arquivos de envio, automático, conversa, 248, sandbox, cópia): 63 pass / 0 fail / 0 skip. Contrato 12026 pass / 25 skip / 0 fail; tsc, lint e prettier limpos.

### T2.6 — em cópia do tipo

- `company_occurrence_type_watchers` (FK composta à lista da empresa com `CASCADE`), `contractorMailWatcherUserIds` no `PUT` (ausente não mexe, `[]` limpa; 404 `OCCURRENCE_TYPE_WATCHER_NOT_FOUND` fora da lista da empresa ou de outra empresa; 400 `OCCURRENCE_TYPE_WATCHER_LIMIT` acima de 10; 400 `OCCURRENCE_TYPE_WATCHER_INACTIVE` só para o novo, o já escolhido fica), `contractorMailWatchers` na leitura (nome, situação, elegibilidade, sem endereço), `resolveEffectiveWatchers` com `typeWatchers` (tipo ?? contratante ?? empresa), `loadEffectiveWatcherCandidates` com `occurrenceTypeId` (as três listas numa ida), `actorUserId` do `main.ts` até a gravação, remover da lista da empresa grava na auditoria os tipos afetados.
- Integração (8 arquivos de cópia, envio, automático e reenvio da 248): 38 pass / 0 fail / 0 skip. Contrato 12028+ pass / 25 skip / 0 fail; tsc, lint e prettier limpos.

### T2.7 — destinatários escolhidos no tipo

- `company_occurrence_type_recipients`, `contractorMailRecipientContactIds` no `PUT` (tipo `all` com ids → 400 `OCCURRENCE_TYPE_RECIPIENTS_REQUIRE_LISTED_SCOPE`, `[]` → 200; contato de contratante fora da lista ou **novo** inativo / sem `receives_occurrences` → 400 `OCCURRENCE_TYPE_RECIPIENT_NOT_IN_SCOPE`; de outra empresa ou inexistente → 404 `ContractorContactNotFoundError`; o já escolhido que ficou inativo continua), poda **explícita** dentro de `replaceOccurrenceTypeContractorScope` (depois da lista regravada da 270) ao tirar contratante do escopo e ao trocar para `all`, `contractorMailRecipients` na leitura, política `resolveOccurrenceRecipients` (escolha vence a etapa; sem sobra, regra de hoje), `preselected` da prévia e `To` do automático.
- Integração (9 arquivos de escopo, cópia, automático, conversa): 33 pass / 0 fail / 0 skip. Contrato 12045 pass / 25 skip / 0 fail; tsc, lint e prettier limpos.
