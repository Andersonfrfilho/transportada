# Plan — 274 O chat da contratante envia por e-mail

ADR: [**0111 — O chat da contratante envia por e-mail**](../../docs/adr/0111-o-chat-da-contratante-envia-por-email.md)
(aceita, T0.2): composer por e-mail, modelo padrão configurável no SDK (ajustado em 2026-10-19, dono), "lida" por pixel
(revoga 183 D7), portal como vitrine.

Fatos que moldam o plano: [`evidence.md`](evidence.md) § Levantamento (arquivo:linha). Caminhos relativos a
`apps/<app>/src/` salvo indicação; pacotes em `~/Documents/personal/adatechnology-packages`.

## Decisões de desenho

- **D1 — Composer aberto, envio por e-mail.** `OccurrenceConversations` passa `status={canWrite ? 'open' : 'closed'}`
  (sai `canWritePortal`). O adaptador `occurrenceThreadApi.service.ts` envia a aba contratante por e-mail: canal
  `email`, status otimista `queued`, chave `email-message:<clientMessageId>`, upload dos anexos com `channel: 'email'`
  (os limites do e-mail valem no upload). `OccurrenceThread` continua **sem** a prop `channel` do SDK (o padrão do SDK
  confirma leitura, `confirmsRead`) — conferir na T0.1 que `read` aparece.
- **D2 — Uma mensagem, canal `email`; o portal é vitrine.** Nada de duas linhas. A listagem do portal não filtra canal
  (`drizzle-contractor-portal-conversation.repository.ts:287-310`): a mensagem já aparece lá. Com portal disponível, o
  caso de uso do chat dispara, depois do commit, o aviso sem corpo da ADR-0073 (`contractor-portal-message.use-case.ts:157-172`)
  para os usuários do portal cujo e-mail (normalizado, minúsculas) **não** está em `To`/`Cc`; nenhum restante → sem aviso. _Ajustado na T0.2._ A audiência passa a trazer o e-mail (minúsculas) de cada usuário do portal. Portal indisponível no chat = sem aviso, nunca `PortalUnavailableError`.
  Recusado: gravar `email` + `portal` e agrupar na tela (duas escadas de status para o mesmo texto, agrupamento novo
  no SDK `conversations-ui`, dois registros a auditar).
- **D3 — Modelo padrão configurável, cadastrado pelo SDK.** _Ajustado em 2026-10-19 (dono): substitui o "layout fixo
  em código no pacote"; precisão do dono no mesmo dia: identidade, rodapé e assinante são **parte do modelo**, e o
  modelo é **cadastrado** no sistema a partir do SDK._ O envio sem modelo usa um **modelo** do módulo de notificação. O
  SDK (`@adatechnology/notification-*`) é dono do conteúdo padrão, do cadastro, da resolução e da renderização; o app só
  monta os valores e chama.
  - **Identidade do modelo:** chave `notification.standard-email` (constante `STANDARD_EMAIL_TEMPLATE_KEY`; prefixo
    `notification` = categoria na tela), canal `email`, locale `pt-BR`. Mesma identidade (`key`+`channel`+`locale`) que
    `TemplateRepository.findActive` já usa (`notification-module/src/repositories/TemplateRepository.ts:25-44`, tabela
    `notification.templates`, versão ativa mais alta).
  - **O modelo é a moldura inteira.** Arquivo `standard-email.pt-BR.html` versionado em `notification-contracts`
    (embutido como string no build): tabelas e estilos inline, 620 px, `color-scheme: light`, cores e fonte da
    plataforma (as de `occurrence-mail-html.constant.ts:9-33` da 272 migram ao SDK como `STANDARD_EMAIL_THEME`), segundo
    `~/.claude/rules/rules/email-templates.md` §6. **Identidade, assinatura e rodapé são marcação do modelo**, editável na
    tela, com variáveis — não blocos montados fora dele. **Sem assunto editável:** o assunto é dado do envio (a linha,
    D6); um assunto de modelo em volta de `{{assunto}}` se acumularia a cada mensagem da mesma linha.
  - **Variáveis (catálogo `STANDARD_EMAIL_VARIABLES`, aparece no editor).** Texto, escapado por valor:
    `nomeEmpresa`, `iniciaisAssinante`, `nomeAssinante`, `cargoAssinante` (vazio sem cargo), `rodapePlataforma`
    (frase do produto) e os `values` extras do host. HTML do sistema, decidido **pelo nome** (conjunto fechado
    `STANDARD_EMAIL_SYSTEM_HTML_VARIABLES`, mesma regra da 272 `occurrence-mail-html-render.policy.ts`), só onde a
    interpolação `{{x}}` não expressa a forma: `logoEmpresa` (`<img src="cid:…">` **ou** o quadrado de iniciais),
    `corpoMensagem` (texto escapado em parágrafos: linha em branco → parágrafo, quebra simples → `<br>`), `listaAnexos`
    (nomes escapados; vazio sem anexo), `faixaResposta` (vazio sem `replyHint`), `marcasRodape` (HTML do sistema: as
    imagens das marcas montadas pelo SDK a partir de `footer.productMarkUrl/platformMarkUrl`, só `http(s)`; sem URL, só o
    texto). Nenhuma variável em atributo ou `style`; as cores são literais no `.html`. _Ajustado na T0.2._ Obrigatórias no modelo:
    `corpoMensagem`, `logoEmpresa`, `nomeEmpresa`, `nomeAssinante`, `rodapePlataforma` e `marcasRodape` (identidade,
    assinante e rodapé obrigatórios).
  - **Cadastro pelo SDK (semente idempotente, no pré-deploy).** O módulo expõe
    `standardEmail.ensureTemplate({ companyId, locale })`: grava a v1 com o conteúdo embutido **só se a identidade não
    tem nenhuma linha** (ativa ou não), pelo `upsert` do módulo; nunca sobrescreve versão da empresa. A API o chama no
    pré-deploy (`database/pre-deploy.service.ts:74,149`; o caminho de semente de modelos desta base é o
    `notification-template-seed.service.ts`), **para toda empresa** existente (como o `seedOccurrenceTypes`). _Ajustado na T0.2._ Passo novo `seedStandardEmailTemplates` em `PreDeploySteps`/`PreDeployReport` (campo `standardEmailTemplates`): lê todos os
    `companies.id` e chama `ensureTemplate` em série, independente de `COMPANY_ID`, e roda depois de `provision`. Sem
    gancho separado no provisionamento. Na semente local, a rede de segurança (versão `0`) basta. Conflito de unicidade
    (23505) no `ensureTemplate` = já existe (conta 0, sem erro); teste com duas chamadas concorrentes. **Por que este mecanismo:** (a) já é o caminho de semente de
    modelos desta base, ordenado depois da migration e do provisionamento, um processo só (sem corrida de versão entre
    réplicas); (b) **boot do servidor** foi recusado — regra da casa ("nunca no startup do servidor",
    `notification-template-seed.service.ts:91`) e N réplicas disputariam a v1; (c) **migration do pacote** foi recusada —
    as migrations do módulo são de schema, não conhecem empresas, e congelariam o conteúdo em SQL; (d) **script manual**
    foi recusado como caminho principal — seria esquecido por ambiente e por empresa nova; o script avulso existente
    (`db:seed:notification-templates`) continua servindo para reparo. O pré-deploy grava dados em staging/produção: a
    primeira execução em produção sai no deploy da T6.5, com aprovação humana e contagem antes/depois.
  - **Resolução no SDK (rede de segurança):** `standardEmail.resolveTemplate({ companyId, locale })` lê `findActive`;
    versão ativa **usável** → ela; sem linha ativa ou inutilizável → o conteúdo embutido (`version: 0`) e log
    `standard_email_template_fallback` (`reason: missing | unusable`, ids, sem conteúdo). "Usável" =
    `assessStandardEmailTemplate`: HTML seguro (`findUnsafeEmailHtml`, a regra de `validateEmailHtml` da
    `notification-ui` e da 272 `findUnsafeHtmlRules`, numa cópia só) e as obrigatórias presentes.
  - **Tela de Notificações:** a linha cadastrada aparece e edita como as outras (`listByCompany`; editar = `upsert`,
    nova versão). O SDK protege a chave: `upsert` sem as obrigatórias ou com HTML inseguro → `StandardEmailTemplateInvalidError`
    (400); "Remover" (desativar) a chave → `StandardEmailTemplateRequiredError` (409), para o modelo não sumir da tela;
    `standardEmail.restoreDefault({ companyId, locale })` grava uma versão nova com o conteúdo embutido ("Restaurar
    padrão", histórico preservado). _Ajustado na T0.2._ Rota `POST /notification-templates/:id/restore-default` no `managementRoutes` do módulo, sob o portão
    `settings.manage` do host (`notification-http.router.ts:22-30`); erros: `StandardEmailTemplateInvalidError` → 400,
    `StandardEmailTemplateRequiredError` → 409; o `notification-client` ganha `restoreDefault`. O catálogo do modelo padrão é mesclado ao `templateVariables` do host pelo SDK (o host
    não o sobrescreve): `/notification-template-variables` e a validação do `upsert` o conhecem. A `notification-ui`
    ganha o selo "Modelo do sistema", o "Restaurar padrão", esconde "Remover" na chave e faz a prévia pelo mesmo
    `renderStandardEmail` com os exemplos do catálogo.
  - **Renderização no SDK:** `renderStandardEmail({ template, input })` (puro, `notification-contracts`, usado também
    pela prévia) e `standardEmail.render({ companyId, locale, input })` (`notification-module`: resolve e renderiza).
    Entrada (`StandardEmailInput`, só texto, nenhum HTML):
    `identity: { displayName, logo: { kind: 'cid', contentId } | { kind: 'initials' } }`, `bodyText`,
    `attachments: readonly { name }[]`, `signer: { name, role? }` (iniciais calculadas no SDK),
    `footer: { platformNote, productMarkUrl?, platformMarkUrl? }`, `replyHint?`, `values?: Record<string, string>`.
    Saída: `{ html, text, bytes, tooLarge, template: { key, version, source: 'company' | 'builtin' } }`; `text` =
    `htmlToPlainText(html)`. O SDK **não envia**: o transporte do chat é o outbox da TMS (Resend da transportadora,
    webhook, idempotência, cabeçalhos de linha). Testes no SDK: escape de cada variável, `{{x}}` do operador literal,
    estrutura (sem `<script`/`on*=`/`flex`/`grid`/`var(`), < 100 KB com 8000 caracteres e 5 anexos, empresa × embutido
    × inutilizável, `ensureTemplate` idempotente e sem sobrescrever, `upsert` recusado sem `rodapePlataforma`, desativar
    recusado, `restoreDefault`.
- **D4 — O que migra do app ao SDK e o que fica (uma cópia de cada regra).** _Ajustado em 2026-10-19 (dono)._
  - **Migra ao SDK (o app vira re-export ou delega; as tabelas de caso da 272 continuam verdes sem editar caso):**
    `htmlToPlainText` (`occurrence-mail-plain-text.policy.ts:44`); `escapeMailHtml` (`mail-template-render.policy.ts:85`,
    idêntico a `escapeTemplateHtml`); a regra de HTML inseguro (`findUnsafeHtmlRules` da 272 → `findUnsafeEmailHtml`);
    o desenho do logo/iniciais (`buildLogo` :55 de `occurrence-mail-system-html.policy.ts` → `renderEmailLogoHtml`;
    `buildInitials`);
    cores e fonte (`occurrence-mail-html.constant.ts:9-33`); e a interpolação "valor escapado, HTML do sistema pelo
    nome" (`renderContractorMailHtml` passa a delegar a `interpolateEmailHtml({ template, values, systemHtml,
systemHtmlNames })` do SDK, mantendo no app o assunto, o limite e o `tooLarge`).
  - **Fica no app:** o renderer do modelo **do tipo** da 272 (vocabulário da ocorrência: `tabelaItens`,
    `logoTransportadora`, `marcasRodape` — `buildFooterMarks` delega a `renderEmailMarksHtml` do SDK com a mesma saída (_Ajustado na T0.2._), o rodapé do modelo
    padrão é marcação do modelo —, área `<!-- mensagem -->`, compor, leitura do modelo dentro da transação do outbox em
    `notification-template.query.ts`), `applySubjectPrefix`, `buildSenderDisplayName` (e a cópia do worker),
    `buildSignerValues`/`resolveSignerJobTitle`, `COMPANY_LOGO_CONTENT_ID`, `APP_BASE_URL`/caminhos das marcas.
    **Critério:** vai ao SDK o que é regra genérica de e-mail HTML (sem vocabulário da TMS) ou o que o envio sem modelo
    precisa; mover o renderer do tipo traria vocabulário de ocorrência ao SDK e mudaria a leitura transacional da 272 sem
    ganho para esta spec.
  - _Ajustado na T0.2._ Regra de HTML inseguro: três cópias — API e painel delegam a `findUnsafeEmailHtml` (o painel ganha dependência
    direta de `@adatechnology/notification-contracts`); a do worker fica (SQL, filtro grosso), com a paridade presa pelo
    contrato de hoje.
  - O app exclui `notification.standard-email` da lista de modelos escolhíveis no tipo
    (`SYSTEM_NOTIFICATION_TEMPLATE_KEYS`, `occurrence-contractor-template.policy.ts:36`; `listActiveContractorTemplates`
    lista toda chave `email`/`pt-BR` ativa).
- **D5 — Rota: variante "chat" do POST de mensagens.** `POST /trip-occurrences/:id/conversations/contractor/messages`
  com `{ channel: 'email', mode: 'chat', body, attachmentIds }` `.strict()` (a variante do diálogo continua sem `mode`). _Ajustado na T0.2._ O `parse` desvia por `raw.mode === 'chat'` antes do `mailMessageSchema`; o diálogo continua recusando `mode`.
  `body` 1..8000 depois do `trim`. O servidor resolve tudo o resto. Caso de uso novo
  `occurrence-conversation/application/send-occurrence-chat-mail.use-case.ts`, que reutiliza as peças do
  `send-occurrence-mail.use-case.ts` (prontidão `resolveMailSendReadiness` :401-406, entrega Resend/sandbox :187-218,
  `resolveMailCopy` :430, `recordMail` :491-511, `recordConversationMessage` :512-520, idempotência :378-398/:564-569),
  extraídas para `occurrence-mail-delivery.service.ts` **sem mudar comportamento** (teste de caracterização do diálogo
  antes). Destinatários: `resolveOccurrenceRecipients` (`occurrence-contractor-recipients.policy.ts:22-38`) e só os
  pré-marcados. Assinante: o operador (`buildSignerValues`, 272). "De": `buildSenderDisplayName`. `has_inline_logo`
  quando há logo (o worker já anexa o `cid:` — `send-contractor-mail-outbound-message.use-case.ts:270-300`).
  _Ajustado em 2026-10-19 (dono):_ o caso de uso monta `StandardEmailInput` (texto, nomes dos anexos, assinante,
  identidade `cid` `company-logo` ou iniciais, rodapé com a frase e as marcas por `APP_BASE_URL`, `replyHint` quando há
  `Reply-To`) e chama
  `notifications.standardEmail.render(...)` **antes** da transação; grava `body_html`/`body_text` devolvidos e
  `notification_template_key = 'notification.standard-email'` + `notification_template_version` = a versão usada
  (`0` = rede de segurança embutida) — as colunas da 271 D8, sem coluna nova. `tooLarge` → 400 (não 500). _Ajustado na T0.2._ O render acontece depois do replay de idempotência, da prontidão e dos destinatários.
- **D6 — Assunto.** O assunto do último e-mail de saída da linha da ocorrência que **não** é encaminhamento da 248 (_ajustado na T0.2_;
  `contractor_mail_messages` da `contractor_mail_threads` da ocorrência), sem acrescentar "Re:". Sem e-mail anterior: `applySubjectPrefix` sobre
  `Ocorrência <nome do tipo> — NF <número>` (parada sem nota não chega aqui: o composer exige nota). Idempotente.
- **D7 — Linha do e-mail.** Hoje o worker só põe `In-Reply-To`/`References` com a última mensagem **de entrada**
  (`drizzle-contractor-mail-outbound-worker.repository.ts:158-176`) e não guarda o `Message-ID` de saída.
  _Ajustado em 2026-10-19 (dono), pelo fato da T0.1 (evidence § T0.1 itens 4-5):_ a linha usa o **`message_id` que o
  Resend devolve** no webhook, não um `Message-ID` escolhido por nós. O webhook lê `data.message_id` de `email.sent`
  (documentado; também de `email.delivered`/`email.opened` se vier, como reserva) e grava em
  `contractor_mail_messages.rfc_message_id` da mensagem de saída **só se nulo**; hoje o webhook não lê o campo. _Ajustado na T0.2._
  `UPDATE contractor_mail_messages SET rfc_message_id = normalize(data.message_id) WHERE company_id = $empresaDoWebhook AND
provider_email_id = data.email_id AND rfc_message_id IS NULL`, em qualquer evento que traga `message_id`
  (`sent`/`delivered`/`opened`), independente do resultado do status; o schema do corpo
  (`process-inbound-email-webhook.use-case.ts:52-55`) ganha `message_id` opcional. Normalizar com `<…>` na gravação e
  na montagem, para entrada e saída. A cadeia exclui as mensagens de encaminhamento; o encaminhamento continua sem
  `In-Reply-To`/`References` (ramo `forward` de hoje). O worker
  monta `References` com os `rfc_message_id` da linha (entrada e saída, ordem de criação, últimos 20) e `In-Reply-To`
  com o último. Mensagem anterior cujo `email.sent` ainda não chegou fica de fora; o assunto igual mantém a linha no
  Gmail. O worker **não** põe `Message-ID` próprio. Um envio de teste numa conta Resend de teste que prove que o
  provedor preserva `Message-ID` customizado é **condição opcional** (follow-up, fora do desenho): só se provado, outra
  spec pode trocar a espera pelo webhook por um id gerado. Vale para todo e-mail de saída da ocorrência (o diálogo
  também ganha a linha). Sandbox: sem cabeçalhos (como hoje).
- **D8 — Lida pelo pixel.** Escada do e-mail `['queued','sent','delivered','read']` nas três cópias: API
  `occurrence-conversation/domain/message-status.policy.ts:37-50`, worker `…/message-status.policy.ts:38-51`, painel
  `messageStatus.service.ts:20-25`; `failableUntil` continua `sent` (devolução depois de entregue é ignorada, como hoje;
  falha é terminal: `opened` depois de `bounced` → `stale`). `process-inbound-email-webhook.use-case.ts:25-35` ganha
  `email.opened → read`; `email.clicked` continua ignorado. Repetição de `opened` → `duplicate`.
- **D9 — Lida pelo portal.** `markRead` (`drizzle-contractor-portal-conversation.repository.ts:312-349`) passa a
  levar as mensagens de saída de canal `portal` **e** `email` (status não nulo, não falha) a `read`, cada uma pela
  própria regra de canal. _Ajustado na T0.2._ Aceito: leitura no portal com o e-mail ainda `queued` leva a `read`; falha posterior do worker fica
  `stale`.
- **D10 — Erros do chat.** 409 `OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS` (nenhum pré-marcado); prontidão de hoje
  (`CONTRACTOR_MAIL_NOT_CONFIGURED`/`CONTRACTOR_MAIL_SENDING_NOT_VERIFIED` — T0.1 confere qual a rota devolve); 400
  corpo vazio/longo e anexos fora da regra; 409 chave reutilizada; 404 outra empresa. **Nunca** 409 de modelo. No
  painel: o composer marca a mensagem como falha (`failed`) e mostra o motivo; no sem-destinatário, ação "Enviar por
  e-mail" (abre o diálogo com o texto).
- **D11 — Idempotência.** Chave `email-message:<clientMessageId>`; impressão digital = `companyId`, `occurrenceId`,
  `mode: 'chat'`, `body` com `trim`, `attachmentIds` ordenados; operação própria `SEND_OCCURRENCE_CHAT_MAIL_OPERATION`.
  Destinatários resolvidos no servidor não entram (o replay devolve a resposta gravada).
- **D12 — Migration mínima.** `ALTER TABLE occurrence_conversation_messages DROP CONSTRAINT
occurrence_conversation_messages_email_never_read_check`. _Ajustado em 2026-10-19 (dono):_ **sem** a coluna
  `standard_body_version` — o modelo usado vai em `notification_template_key`/`notification_template_version` (271 D8;
  sem CHECK de versão, `0` = padrão embutido). Rollback com guarda: aborta se houver mensagem `email` em `read` (não
  reescreve dado); senão recria a CHECK. As migrations do `notification-module` novo (T0.1 item 8) entram pelo
  `notification-migration` do host, não por esta migration.
- **D13 — Versão do pacote.** API e worker estão em `notification-contracts` `0.1.0-rc.2` e `notification-module`
  `0.1.0-rc.3`, e o repositório de pacotes já saiu do modo `rc`. A T1.6 lista o diff entre as versões fixadas e a nova
  (`npm view`, changelog/commits) e a sobe nas **duas** apps juntas (lock coerente). _Ajustado em 2026-10-19 (dono):_ o
  painel sobe `@adatechnology/notification-ui` (hoje `0.1.0-rc.9`) para a versão com o selo, o "Restaurar padrão" e sem
  "Remover" no modelo padrão (D3), na Fase 2. _Ajustado na T0.2._ Sobe também `@adatechnology/notification-client` (hoje `0.1.0-rc.3`).

## Arquivos por app

- **Pacotes** (`adatechnology-packages`) — _ajustado em 2026-10-19 (dono)_: `notification-contracts/src/` —
  `emailHtml.ts` (`htmlToPlainText`, `findUnsafeEmailHtml`, `interpolateEmailHtml`, `buildInitials`, fragmento do
  logo, `STANDARD_EMAIL_THEME`), `standardEmail.ts` (chave, catálogo, `renderStandardEmail`,
  `assessStandardEmailTemplate`), `standard-email.pt-BR.html` (embutido no build), testes `*.test.ts`, `index.ts`;
  `notification-module/src/` — `use-cases/StandardEmail.use-cases.ts` (`ensureTemplate`/`resolveTemplate`/`render`/
  `restoreDefault`), `Template.use-cases.ts` (validação do `upsert` e bloqueio do desativar da chave), `NotificationModule.ts`
  (`standardEmail`, catálogo mesclado), `index.ts`; `frontend/notification-ui` — selo "Modelo do sistema",
  "Restaurar padrão", prévia; `CLAUDE.md` dos pacotes; changesets `minor`.
- **API:** `occurrence-conversation/presentation/occurrence-conversation.routes.ts` (variante `mode: 'chat'`),
  `application/send-occurrence-chat-mail.use-case.ts` (novo), `application/occurrence-mail-delivery.service.ts`
  (extraído), `domain/occurrence-chat-mail-subject.policy.ts` (D6), `domain/occurrence-conversation.error.ts`
  (`OccurrenceChatMailNoRecipientsError`), `domain/message-status.policy.ts` (D8),
  `domain/occurrence-mail-plain-text.policy.ts`, `domain/occurrence-mail-system-html.policy.ts`,
  `domain/occurrence-mail-html-render.policy.ts`, `domain/occurrence-mail-html-safety.policy.ts`,
  `domain/occurrence-mail-html.constant.ts` e `domain/occurrence-contractor-template.policy.ts` (D4),
  `contractor-mail/domain/mail-template-render.policy.ts` (re-export do escape),
  `contractor-mail/application/process-inbound-email-webhook.use-case.ts` (D7, D8),
  `occurrence-conversation/infrastructure/drizzle-occurrence-message-status.repository.ts` (gravar `rfc_message_id`),
  `infrastructure/drizzle-contractor-portal-conversation.repository.ts` (D9), aviso do portal (D2),
  `database/occurrence-conversation.schema.ts`, `database/contractor-mail.schema.ts`, migration nova,
  `database/pre-deploy.service.ts` (passo `seedStandardEmailTemplates`, D3), `main.ts` (fiação),
  OpenAPI da rota, `package.json` (versões + testes novos).
- **Worker:** `occurrence-conversation/domain/message-status.policy.ts` (D8),
  `contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.ts` (cadeia de referências D7),
  `contractor-mail/application/send-contractor-mail-outbound-message.use-case.ts` (cabeçalhos), `package.json`.
- **Painel:** `modules/occurrence-conversation/components/OccurrenceConversations.component.tsx` (D1),
  `shared/occurrenceThreadApi.service.ts` (D1, D10), `shared/occurrenceConversation.service.ts`
  (`createEmailMessageIdempotencyKey`, `sendContractorChatMail`), `shared/messageStatus.service.ts` (D8),
  `locales/occurrenceConversation.locale.json` (dica do "Lida", erros), `package.json` (`notification-ui`, D13),
  testes.
- **Portal (`frontend-client`):** nada (a listagem já mostra o canal e o SDK mostra a mensagem).

## Contratos

- `POST …/conversations/contractor/messages` `{ channel: 'email', mode: 'chat', body, attachmentIds? }`, cabeçalho
  `Idempotency-Key` → 202 `{ data: { conversationId, conversationMessageId, mailMessageId, recipientCount, threadId } }`
  (forma do diálogo; _Ajustado na T0.2._).
  Erros: D10. Permissão `occurrences.resolve`; limite 30/300 s (o de hoje).
- Webhook: `email.opened` → `read`; `data.message_id` de `email.sent` (reserva: `delivered`/`opened`) grava
  `rfc_message_id` se vazio (D7).
- Listagem da conversa e do portal: forma inalterada; `status: 'read'` passa a aparecer em mensagens `email`.
- SDK (_ajustado em 2026-10-19, dono_): `notification-contracts` — `STANDARD_EMAIL_TEMPLATE_KEY`,
  `STANDARD_EMAIL_BUILTIN_TEMPLATE`, `STANDARD_EMAIL_VARIABLES`, `STANDARD_EMAIL_SYSTEM_HTML_VARIABLES`,
  `renderStandardEmail({ template, input })`, `assessStandardEmailTemplate`, `interpolateEmailHtml`, `htmlToPlainText`,
  `findUnsafeEmailHtml`, `renderEmailLogoHtml`, `buildInitials`, `STANDARD_EMAIL_THEME`, tipos
  `StandardEmailInput`/`StandardEmailRendered`; `notification-module` — `module.standardEmail.ensureTemplate`,
  `.resolveTemplate`, `.render` e `.restoreDefault` (todos `{ companyId, locale, … }`),
  `StandardEmailTemplateInvalidError` (400), `StandardEmailTemplateRequiredError` (409); HTTP do módulo:
  `POST /notification-templates/:id/restore-default` (`settings.manage`) e `notification-client.restoreDefault`
  (_Ajustado na T0.2._).

## Dados, migration e rollback

D12. Sem backfill. O modelo padrão é cadastrado pelo pré-deploy (D3): uma linha em `notification.templates` por empresa,
só onde não existe. Mensagens antigas de e-mail passam a poder subir para `read` (pixel futuro ou leitura no portal).
`make migration-test` (aplica, reverte, reaplica) e `db:generate` → `no_changes`.

## Segurança e tenant

- Slots do pacote só texto, escapados; URLs do rodapé só http(s); nenhum HTML do operador.
- Webhook: assinatura Svix por empresa de hoje; `email_id` resolvido dentro da empresa do `webhookId`.
- `markRead` do portal continua restrito à conversa da contratante do usuário do portal.
- Contrato BOLA na variante chat (outra empresa → 404) e de permissão (403).

## Idempotência e concorrência

D11. Status pela política monotônica com `FOR UPDATE` (já existe). `rfc_message_id` gravado só se nulo
(`… where rfc_message_id is null`), eventos repetidos não reescrevem.

## Observabilidade

Log estruturado sem PII: `occurrence_chat_mail_sent` (`messageId`, `attachments`, `recipients` contagem, `cc` contagem,
`transport`), `occurrence_chat_mail_no_recipients` (`occurrenceId`), `contractor_mail_status_applied` com
`incoming: 'read'` e `source: 'pixel'|'portal'`.

## Estratégia de testes (antes da implementação)

- SDK: casos de escape e estrutura (D3), paridade de `htmlToPlainText`/`findUnsafeEmailHtml`/`interpolateEmailHtml` com
  as tabelas da 272, resolução empresa × embutido × inutilizável, `ensureTemplate` idempotente, `upsert`/desativar
  recusados, `restoreDefault`.
- API pré-deploy: `seedStandardEmailTemplates` chama `ensureTemplate` para cada empresa; segunda execução grava zero; duas
  chamadas concorrentes não erram (23505 = já existe).
- API contrato: política de status (tabela: escada do e-mail com `read`, salto, falha terminal, duplicado); assunto do
  chat (D6); schema da rota (variante chat `.strict()`, 1..8000); caso de uso com dublês (sem modelo → envia; sem
  pré-marcado → 409; idempotência; aviso do portal só a quem não está em `To`/`Cc`; grava chave e versão do modelo
  usado); webhook `opened` e `message_id` de `email.sent`; `notification.standard-email` fora da lista do tipo.
- API integração (`test/integration/occurrence-chat-mail.integration.ts`, na lista do `package.json`, `--env-file`,
  zero skip): grava mensagem + e-mail + outbox numa transação; CHECK removida aceita `read`; `markRead` do portal leva
  `email` a `read`; BOLA 404.
- Worker: paridade da política de status; cadeia de `References` (entrada + saída, 20).
- Painel: composer aberto sem portal; envio chama a variante chat com a chave `email-message:`; otimista `queued`;
  erro sem destinatário mostra a ação "Enviar por e-mail"; selo "Lida" no e-mail com a dica.
- Verificação em staging: Mailpit (sandbox) com o padrão embutido e, com aprovação, com uma versão editada na tela de
  Notificações (depois "Restaurar padrão"); com o rastreio ligado numa conta Resend de teste, o selo "Lida".

## Publicação

1. **Pacotes:** PR no repositório de pacotes → `main` (o CI publica no npm) **com aprovação humana**; conferir
   `npm view` de `notification-contracts`, `-module`, `-ui` e `-client`. _Ajustado na T0.2._ Não há caminho para staging antes do merge em
   `main` dos pacotes. Disparar o `publish.yml` de branch é proibido (empurra a branch para `main`). O desenvolvimento
   das Fases 2–5 pode usar `pnpm pack`/tarball **local**, nunca commitado; o `package.json` só fixa a versão depois da
   T1.6. Uma tag `next` por snapshot só com aprovação humana explícita e fora deste fluxo.
2. **Painel e worker tolerantes** (_Ajustado na T0.2._): escada do e-mail com `read` (painel e worker; o worker velho rebaixa `read`
   para `sent`, `message-status.policy.ts:89-100`), textos de erro novos e `notification-ui` nova (sem abrir o composer) →
   `staging` → `main`, antes da API, com aprovação.
3. **API + worker + migration** (o pré-deploy cadastra o modelo padrão por empresa) no mesmo PR e no mesmo run (a cadeia de referências do worker sai junto).
4. **Telas:** composer aberto, dica do selo → `staging`; verificação no Mailpit.
5. **Ligar a confirmação de leitura** (abaixo), primeiro numa conta de teste/staging, depois a da transportadora em
   produção — cada uma com aprovação humana.
6. Produção na mesma ordem, depois da 272 em `main`.

### Ligar a confirmação de leitura (roteiro, executado por quem administra o Resend e o DNS da transportadora)

1. Resend → Domains → domínio do remetente (`contractor_mail_settings.sender_address`) → Configuration: **Open
   tracking** ligado, **Click tracking** desligado, subdomínio de rastreio (ex. `links`; evitar nomes como `tracking`).
   Pela API: `PATCH https://api.resend.com/domains/:id` `{ "open_tracking": true, "click_tracking": false,
"tracking_subdomain": "links" }` com chave de acesso total (a chave gravada na aplicação pode ser só de envio).
2. DNS: criar o CNAME que o Resend mostrar (`links.<domínio>` → `links1.resend-dns.com` ou o valor indicado) e esperar
   a verificação. O subdomínio não pode ser removido depois, só trocado.
3. Resend → Webhooks → o webhook que aponta para `…/public/inbound-emails/<webhookId>`: acrescentar o evento
   `email.opened`.
4. Teste: mandar uma mensagem do chat a uma caixa própria, abrir com imagens liberadas, conferir "Lida".
5. Desligar = desmarcar Open tracking (o selo volta a parar em "Entregue" nas próximas mensagens).

## Riscos

- **Entregabilidade** (pixel em e-mail transacional; o rastreio vale para todo e-mail do domínio). Aceito pelo dono;
  medir devoluções antes/depois em produção (contagem).
- **"Lida" falsa ou ausente** (Apple MPP, bloqueio de imagem). Aceito; dica no selo.
- **Volume:** cada mensagem do chat é um e-mail. Limite da rota segura rajadas.
- **Salto de versão do pacote** (`rc` → estável) pode trazer mudança não relacionada: T1.6 lista o diff antes.
- **Regra global `email-templates.md`** (§2: arquivo `.html` + script por chave): o arquivo mora no SDK e a semente é
  o `ensureTemplate` do SDK no pré-deploy, não um script do produto; ADR-0111 registra; o dono atualiza a regra.
- **Semente grava dados no deploy** de staging/produção (uma linha por empresa, só se ausente): contagem antes/depois e
  aprovação humana na T6.5.
- **Versão da empresa ruim** (sem rodapé, HTML inseguro): recusada no `upsert` e, se já gravada, ignorada na
  resolução (cai no padrão, com log). _Ajustado em 2026-10-19 (dono)._
- **Padrão muda com o SDK, a linha não:** a semente nunca sobrescreve; um padrão novo do SDK só chega pelo "Restaurar
  padrão" (perde as edições da empresa). Atualização automática de linha não editada fica como follow-up.
- **Modelo padrão escolhível no tipo** se não for excluído (`listActiveContractorTemplates` lista toda chave de e-mail):
  T3.3 o exclui.
- **Fase 1 maior:** três pacotes (contracts, module, ui) e o painel sobe a `notification-ui`.
- **Empresa nova entre deploys** fica sem linha até o próximo pré-deploy ou o provisionamento: a rede de segurança
  envia com o embutido (versão `0`, log `missing`).
- **Linha do e-mail** depende do `email.sent` para o `message_id` de saída: mensagens em rajada podem sair sem a
  anterior em `References`; o assunto igual mitiga.
