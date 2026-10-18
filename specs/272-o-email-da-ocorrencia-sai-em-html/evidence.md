# Evidência — 272 O e-mail da ocorrência sai em HTML

## Decisões do dono (sessões de 2026-10-17 e 2026-10-18)

A prévia aprovada é a versão 10 do artefato "Modelos de e-mail de ocorrência"; cópia nesta pasta em
[`desenho-aprovado.html`](desenho-aprovado.html) (o CSS e a função `render()` são o desenho de referência; o CSS
moderno da prévia serve só para desenhar — o e-mail final usa tabelas e estilos inline).

- **D1** O texto do modelo continua simples (Notificações → Preferências, sem HTML; a 271 recusa corpo HTML). **O
  sistema** monta o HTML em volta. Sempre vai também a parte `text/plain` (`multipart/alternative`).
- **D2** Cores da plataforma, fixas (o e-mail não segue tema escuro): asfalto `#10222c`, cobre `#d58a47`, névoa
  `#f0f2ee`, ardósia `#5a6b74`, tinta `#1d2b33`. HTML compatível com clientes de e-mail: tabelas e estilos inline; nada
  de grid, flex ou variável CSS no HTML final.
- **D3** Cabeçalho com o logo da transportadora (o cadastrado; sem logo, as iniciais), o nome de exibição, CNPJ e cidade,
  e o selo do tipo de ocorrência.
- **D4** Assunto começa com `<nome de exibição> · CNPJ <cnpj> — ` + assunto do modelo. O modelo não precisa repetir.
- **D5** Título = assunto do modelo preenchido.
- **D6** Resumo em três grupos: **Nota fiscal** (Número `NF …`; Valor da nota em linha própria, em destaque), **Partes**
  (Contratante; CNPJ da contratante em linha própria; Cliente), **Registro** (Parada; Data; Motorista).
- **D7** Corpo = texto do modelo; `{{linhasItens}}` vira tabela (Código, Item, Qtd., Valor, rodapé "Total dos itens").
- **D8** Faixa "↩ Responda este e-mail: a resposta entra na conversa desta ocorrência e chega à equipe."; escondida no
  sandbox da 268 (sem `Reply-To`).
- **D9** Assinatura: manual = operador (nome, papel, transportadora, CNPJ, avatar com iniciais); automático = "Equipe
  <transportadora>" e, quando a 273 estiver publicada, o dono da ocorrência. A 272 não depende da 273: lê o dono se
  existir, senão a equipe.
- **D10** Rodapé: logo da transportadora antes de "<nome de exibição> · <razão social> · CNPJ …" e "Ocorrência da NF …";
  abaixo, separada por linha fina, as miniaturas [transportadora][TransportAdA][Ada] com "Enviado pelo TransportAdA —
  uma solução Ada Technology"; e "© <ano> Ada Technology — TransportAdA. Todos os direitos reservados." As marcas
  TransportAdA e Ada como asset público estável, não base64 inline.
- **D11** Achado do teste em staging de 2026-10-18: o sandbox (268) manda o "De" só com o endereço, sem nome. A 272 põe o
  nome de exibição da transportadora no "De" também no sandbox.
- **D12** (2026-10-18, veto da assunção A1 da primeira versão) **"De" com o nome de exibição sempre**: também no envio
  pelo Resend em produção, o nome no "De" é o nome de exibição da transportadora configurado no sistema (operador/dono:
  `<nome> — <nome de exibição>`; equipe: `<nome de exibição>`), ignorando o nome do remetente salvo na configuração do
  Resend. O endereço continua o da configuração (Resend) ou `EMAIL_FROM` (sandbox). **Colisão com a 273 RF7**, que dizia
  `<nome do dono> — <nome do remetente da empresa>`: a 273 passa a herdar a regra da 272 (`<nome do dono> — <nome de
exibição>`); o RF7 e o critério 10 da 273 se ajustam quando ela for executada.
- **D13** (2026-10-18, veto da assunção A2 da primeira versão) **Cargo livre na assinatura**: campo de cargo livre por
  usuário na empresa (ex.: "Atendimento — ocorrências"), editável na tela de usuários do painel, exibido abaixo do nome
  do operador/dono na assinatura; sem cargo, o rótulo do papel ("Operador", "Financeiro"). Entra no escopo: migration
  aditiva (coluna anulável, limite de tamanho, saneada), rota/permissão de edição, auditoria se o padrão do módulo de
  usuários audita, tela e locales, contratos negativos de BOLA.

## Decisões tomadas nesta spec (padrões; a T0.2 valida)

Detalhe e trade-offs em `plan.md` § Decisões de desenho.

- **Montador puro no servidor, sem biblioteca** (D1/D2 do plan): funções TS que devolvem string com tabelas e estilos
  inline; mjml/react-email/juice recusados (dependência pesada ou React na API para um layout fixo).
- **Logo da transportadora por `cid:`** (D3 do plan): o logo mora em `company_logos` (Postgres, até 256 KiB); o worker
  o anexa como parte inline. A rota anônima `/public/landing-logo` serve só a empresa da instalação (errado em
  multi-CNPJ) e imagem remota é bloqueada por padrão no Outlook.
- **Marcas pelo painel** (D4 do plan): `APP_BASE_URL` + `/icons/icon-192.png` e `/icons/ada-technology.png`, o mesmo
  molde do e-mail de código do worker; sem a variável, só o texto.
- **Ponto `signer` + `buildSenderDisplayName`** (D5 do plan): uma regra para o "De" e a assinatura, com `owner` já
  desenhado para a 273.
- **Tabela no manual só com o bloco intacto** (D6 do plan).
- **Prefixo do assunto nunca é cortado** (D7 do plan).
- **Prévia = envio** (D8 do plan), com rota que renderiza o texto editado.
- **Gravar o que saiu** (D9 do plan): `from_display_name`, `signer_kind`, `signer_user_id`, `layout_version`,
  `has_inline_logo`.
- **Cargo (D10 do plan, da D13 do dono):** `user_company_memberships.job_title varchar(80)` nula — o cargo é por empresa,
  e o perfil de identidade é por pessoa e sincronizado com o Keycloak. Editado por quem tem `users.manage` no `PATCH
/company-users/:id` que já edita a ficha (padrão existente; não há rota de perfil próprio, e criar uma só para o cargo
  abriria superfície nova). **Sem auditoria**, como o resto do perfil (`update-company-user-profile.use-case.ts` não
  audita; status, senha, permissões e grupos auditam). 404 para usuário de outra empresa pelo caso de uso existente.
  Cargo fora de log.

## Assunções (reversíveis; o dono pode vetar sem bloquear a execução)

As assunções A1 (nome do remetente do Resend no "De") e A2 (só o rótulo do papel na assinatura) da primeira versão
foram vetadas pelo dono e viraram D12 e D13.

- **A1 — Encaminhamento a terceiro (248) continua em texto/HTML simples** (`buildOccurrenceMail` de hoje).
- **A2 — Mensagens anteriores à 272 não são reprocessadas**: o histórico as mostra como hoje; o reenvio de uma delas usa
  o montador novo com assinatura da equipe.
- **A3 — Cidade no cabeçalho** = `city · state` de `company_fiscal_profiles` (endereço fiscal).

Nenhum `[NEEDS CLARIFICATION]`: as perguntas acima têm padrão adotado e não bloqueiam.

## Coordenação com a 273

Ver `plan.md` § Coordenação com a 273. Em resumo: a 272 vai antes; ela cria `OccurrenceMailSigner` (com `owner`), a
porta `OccurrenceOwnerReader` (implementação nula) e `buildSenderDisplayName`; a T3.3 da 273 passa a ser "implementar a
porta". A 273 não precisa tocar no montador nem no "De". Pela D12, a regra do "De" da 273 RF7 passa a ser a da 272
(`<nome do dono> — <nome de exibição>`); o leitor de dono devolve também o cargo (D13).

## Levantamento contra `origin/staging` (68613c0f9, 2026-10-18)

Leitura direta, só de leitura. Caminhos relativos a `apps/`. A T0.1 confere.

### Texto do e-mail (271)

- `api-transportada/src/occurrence-conversation/domain/occurrence-contractor-mail-render.policy.ts:29`
  `renderContractorMail(params)` → `{ bodyText, subject }` (:24-27), só texto; parâmetros `bodyTemplate`, `itemLines`,
  `subjectTemplate`, `values` (:15-22). Interpola com `interpolateTemplate` (:7, :31, :37). Assunto colapsado e cortado em
  200 (:31-34); corpo em 8000 (:49); limites em `occurrence-conversation.constant.ts:10`. `linhasItens` via
  `joinItemLines` (:39); laço que tira linhas até caber (:43-48). Sem escape dentro do render (comentário :4-5: escape e
  assinatura ficam com `buildOccurrenceMail`).
- Variáveis: `occurrence-contractor-mail.constant.ts:24-45` (`OCCURRENCE_CONTRACTOR_MAIL_VARIABLES`), Set em :47;
  `HTML_BODY_PATTERN` :16-17; `OCCURRENCE_ITEM_LINES_LIMIT` :14. Lista: `numeroNota`, `numeroNotaSemSerie`,
  `razaoSocial`, `valorNota`, `contratante`, `motorista`, `parada`, `data`, `observacao`, `tipoOcorrencia`,
  `numeroReferencia`, `somaItens`, `valorDeclarado`, `itens`, `codigosItens`, `quantidadesItens`, `linhasItens`.
- Linha do item fixa: `api-transportada/src/trips/domain/occurrence-mail-values.policy.ts:54-70` (`buildItemLine`),
  `joinItemLines` :73-81 ("e mais N itens"), `buildContractorMailValues` :88-122. `email_item_line_template` é legado
  (`database/trip.schema.ts:3094`; aceito e descartado em `trips/presentation/occurrence.schema.ts:462-466`).

### Montagem e envio na API

- `occurrence-conversation/domain/occurrence-mail.template.ts:28` `buildOccurrenceMail({ bodyText, carrierName,
operatorName, subject })` → `{ html, subject, text }` (:11-15). Assinatura em texto `\n\n--\n<operador>\n<transportadora>`
  (:17, :35-39); HTML = `<p>` escapado com `<br>` (:19-26) e assinatura `<p>--<br>…` (:40-45). Escape:
  `contractor-mail/domain/mail-template-render.policy.ts:85-92` (`escapeMailHtml`).
- Chamadores de `buildOccurrenceMail`: `send-occurrence-mail.use-case.ts:321`, `preview-occurrence-mail.use-case.ts:167`,
  `forward-contractor-reply-by-email.use-case.ts:259`.
- `occurrence-conversation/application/send-occurrence-mail.use-case.ts`: `To` dos `contactIds` (:294-303), dedupe
  (:115-117), recusa de `\r\n,<>` (:56); `Cc` por `resolveMailCopy` (:304-313); `From` = `settings.senderAddress` no
  Resend (:196) e `sandbox.fromAddress` (`EMAIL_FROM`) no sandbox (:171-177); só grava `replyTokenHash` (:197-199);
  transportadora e operador em :315-326 (`Promise.all`); `recordMail` (:355-373) grava `bodyHtml`, `bodyText`, `subject`,
  `toAddresses`, `ccAddresses`, `fromAddress`, `transport`.
- `infrastructure/drizzle-occurrence-mail.repository.ts`: mensagem em :744-761, outbox `payload: {}` em :765-771;
  `findOccurrenceTarget` descarta o CNPJ da contratante (:98-104); `findCarrierName` (:139-154) usa
  `resolveCompanyDisplayName`; `findOperatorName` (:156-176); leitor da sugestão `createOccurrenceSuggestedMailReader`
  (:302-372, render :363-369); data `createdAt.toLocaleDateString('pt-BR')` (:356).
- Envelope RabbitMQ só com `{ messageId }`: `worker-transportada/src/messaging/contractor-mail-outbound-envelope.schema.ts:20-30`.
- Automático: `send-automatic-occurrence-mail.use-case.ts:113-123` (`actorUserId: null, automatic: true` → assinatura só
  com a transportadora, `send-occurrence-mail.use-case.ts:317-318`). Disparos: gancho pós-commit
  `automatic-occurrence-mail.hook.ts:33` (`main.ts:1200`, `:1405`, `:4079`) e varredura do worker por `POST
/trip-occurrences/:id/automatic-mail` (`occurrence-automatic-mail-api.gateway.ts:71`; rota
  `occurrence-automatic-mail.routes.ts:19`, `:54`).
- Manual: o painel pede a prévia (`preview-occurrence-mail.use-case.ts:111-120`), o operador pode editar, o `POST` manda
  o texto pronto (`occurrence-conversation.routes.ts:217-228`); ator de `context.scope.userId` (:218).

### Worker

- Consumidor `runtime/contractor-mail-outbound-consumer.service.ts:21-57` → `contractor-mail/application/send-contractor-mail-outbound-message.use-case.ts:78`.
- Resend: `From` = `` `${settings.senderName} <${settings.senderAddress}>` `` (:163); `html` só se `bodyHtml` não nulo
  (:165), `text` sempre (:169); `Reply-To` por `buildReplyAddress`/`deriveReplyToken` (:123-133); `In-Reply-To`/
  `References` (:135-145). HTTP em `infrastructure/resend-mail.gateway.ts:117-145` (`from`, `html?`, `reply_to?`, `text`,
  `cc`, `attachments`). Colunas `sender_name`/`sender_address` em `api-transportada/src/database/contractor-mail.schema.ts:67-69`.
- Sandbox: `sendThroughSandbox` (:192-240) com `from: message.fromAddress` (:221) — **sem nome** (D11); `html`/`text`
  (:222-224); sem `Reply-To`. Gateway nodemailer (`infrastructure/sandbox-smtp-mail.gateway.ts:65-70`, `sendMail`
  :92-109; comentário :21). Padrão `EMAIL_FROM=no-reply@localhost` (`.env.example:153`); o endereço de staging é do
  Railway.

### Logo, empresa e marcas

- `company_logos` (`api-transportada/src/database/company-logo.schema.ts:15-39`): `content_base64`, `mime_type`
  (png/jpeg), `sha256`; teto 256 KiB (:13). Rota autenticada `/company-settings/logo` (`shared/api.constant.ts:12`,
  `companies/presentation/company-logo.routes.ts:26-53`, `SETTINGS_MANAGE_POLICY`, `no-store`).
- Rota anônima `/public/landing-logo` (`api.constant.ts:15`, `landing/presentation/landing.routes.ts:56-75`, cache
  `public, max-age=3600` :28), só da empresa da instalação (`main.ts:1848`, `landing-logo.use-case.ts:19-26`); usada pelo
  e-mail de código (`worker-transportada/src/identity/infrastructure/landing-email-brand.gateway.ts:18`, :89).
- `company_fiscal_profiles` (`database/company-fiscal-profile.schema.ts`): `legal_name` :77, `trade_name` :78,
  `display_name_mode` :79, `cnpj` :83, `city`/`state` :92-93. Nome de exibição: `resolveCompanyDisplayName`
  (`companies/domain/company-display-name.policy.ts:24-31`).
- E-mail com desenho já existente: `worker-transportada/src/identity/domain/code-email-template.service.ts` (marcas por
  `appBaseUrl` + `/icons/icon-192.png` e `/icons/ada-technology.png`, :50-51; nota sobre imagem bloqueada :175-180; HTML
  :197). Assets: `frontend-transportada/public/icons/icon-192.png` (PNG 192×192) e `ada-technology.png`.
- `APP_BASE_URL` existe no worker (`worker-transportada/src/config/environment.schema.ts:52`), **não** na API.

### Dados do resumo

- `readOccurrenceMailValues` (`api-transportada/src/trips/infrastructure/delivery-proof-read.support.ts:1551`): valor da
  nota e motorista (:1569-1574), parada, contratante, cliente (:1656). **CNPJ da contratante falta** (o feed lê `taxId`
  em `trip-occurrence-feed.query.ts:628`, :639, :667).
- Papel do operador não é lido no caso de uso; existe em `roles: CompanyRole[]` (`shared/api.types.ts:230`).

### Usuários e cargo (D13)

- Não existe cargo. `identity_user_profiles` (`api-transportada/src/database/identity-user-profile.schema.ts:19-50`) é
  por pessoa (nome, login, canal/contato, e-mail, telefone, CPF); `user_company_memberships`
  (`database/identity.schema.ts:117-140`) tem usuário, empresa, status e datas.
- `PATCH /company-users/:id` (`identity/presentation/user-administration.routes.ts:381-407`; `USER_PATH` :86,
  `USERS_MANAGE_POLICY = { permission: 'users.manage', scope: 'company' }` :98; `API_COMPANY_USERS_PATH` em
  `shared/api.constant.ts:261`); corpos `.strict()` em `user-administration.schema.ts`.
- `update-company-user-profile.use-case.ts`: acha pela empresa do token (:61-62, `CompanyUserNotFoundError`), sincroniza
  atributos com o Keycloak (:119), **sem auditoria**. Auditam: `change-company-user-status`, `set-company-user-password`,
  `manage-direct-permissions`, `manage-company-groups`, `activate-company-user`, `remove-company-user-membership`.
- Sem rota de perfil próprio: `/me/*` só tem viagens, diagnóstico, consentimento de localização e WhatsApp
  (`shared/api.constant.ts:217-222`).
- Painel: `frontend-transportada/src/modules/identity/components/CompanyUserEditDialog.component.tsx`,
  `pages/UserAdministration.page.tsx`, `hooks/useUserAdministration.hook.ts`, guarda
  `shared/companyUsersResponse.validation.ts`.

### Bibliotecas e ambiente

- Sem mjml, react-email, juice ou handlebars; só `nodemailer ^7.0.9` (`worker-transportada/package.json:47`).
- API: `CONTRACTOR_MAIL_SANDBOX_SMTP` :296, `EMAIL_FROM` :300, regras :380-395, mapeamento :415-416
  (`api-transportada/src/config/environment.schema.ts`). Worker: `EMAIL_FROM` :74, `CONTRACTOR_MAIL_SANDBOX_SMTP` :76,
  `RESEND_API_KEY` :81, `SMTP_URL` :150.

### Numeração

- Spec 272: livre em `origin/staging` (273 em `work/spec-273`).
- ADR: a última em `docs/adr/` é a 0108; a 273 reservou a 0109 (escrita na T0.2 dela); a 272 usa a **0110**.

## Registro das tasks

### T0.1 — Levantamento conferido (2026-10-18)

Conferido contra HEAD `5e1ec9c35` (= `origin/staging` 68613c0f9 + docs da 272), leitura direta, nada alterado em código.

**Conferência do § Levantamento e do plan § Contexto: tudo bate**, com os desvios de número de linha abaixo e as
divergências relevantes mais adiante. Bateu sem ajuste: `occurrence-contractor-mail-render.policy.ts` (:7, :15-22, :24-27,
:29-49), `occurrence-contractor-mail.constant.ts` (:14, :16-17, :24-47), `occurrence-conversation.constant.ts:10`,
`occurrence-mail.template.ts` (:11-15, :17, :19-26, :28, :35-39, :40-45), `escapeMailHtml` (`mail-template-render.policy.ts:85-92`), os três
chamadores de `buildOccurrenceMail` (:321, :167, :259), `send-occurrence-mail.use-case.ts` (:56, :115-117, :171-177, :196-199, :294-326,
:355-373), `drizzle-occurrence-mail.repository.ts` (:139-154, :156-176, :302-372, :356, :744-761, :765-771), envelope
(`contractor-mail-outbound-envelope.schema.ts:20-30`), worker (`send-contractor-mail-outbound-message.use-case.ts:123-145`, :163, :165, :169,
:192-240, :221-224), `resend-mail.gateway.ts:117-145`, `company-logo.schema.ts:13-39`, `company-logo.routes.ts`, `landing.routes.ts:28`,
`company-fiscal-profile.schema.ts:77-93`, `resolveCompanyDisplayName` (:24-31), `code-email-template.service.ts:50-51`, env schemas
(API :296, :300, :380-395, :415-416; worker :52, :74, :76, :81, :150), `.env.example:153`, `readOccurrenceMailValues:1551`,
identidade (`identity.schema.ts:117-140`, `identity-user-profile.schema.ts:19`, rotas `/company-users`, `/me/*`), `update-company-user-profile`
sem auditoria (nenhuma referência a audit no arquivo), numeração (migration mais recente
`20261017041702_occurrence_type_contractor_mail`; ADR 0108 a última).

Desvios de linha (sem efeito no plano): `findOccurrenceTarget` é :90-107 (o descarte do CNPJ continua em :98-104); gateway do
sandbox: `createSandboxSmtpMailGateway` :72, `sendEmail` :83, `sendMail` ~:96-111 (não :65-70/:92-109); rota de envio
`occurrence-conversation.routes.ts` :216-229 (ator :218 confere).

#### Respostas (a)–(j)

**(a) Anexo inline: ok nos dois.**

- Resend: `attachments[].content_id` (string arbitrária, menos de 128 caracteres), `content` em base64, `content_type`; o HTML usa
  `<img src="cid:<content_id>">` (doc oficial, "Embed inline images"). Limites: 40 MB por e-mail depois do base64; alguns webmails
  rejeitam inline; anexos não aparecem na prévia do painel da Resend. O gateway atual
  (`resend-mail.gateway.ts:119-128`) só mapeia `content`/`content_type`/`filename`: a T3.x acrescenta `content_id`.
- nodemailer 7.0.13 (`apps/worker-transportada/node_modules`): `cid` no anexo vira `Content-Id` e a parte vai em `multipart/related`;
  imagem com `cid` sai `inline` por padrão (`lib/mail-composer/index.js:100-101`, :134-135, :197-198, :530-531, :543). **Não há
  `.d.ts`**: nem `@types/nodemailer` nem tipos no pacote; o gateway do sandbox importa o módulo por nome e usa o tipo local
  `SandboxSmtpTransport` (`sandbox-smtp-mail.gateway.ts:58-70`), que precisa ganhar `cid` no anexo e `from` como `{ name, address }`.

**(b) Marca TransportAdA: ok, sem plano B.** `frontend-transportada/public/icons/icon-192.png` (192x192, "T" claro com barra cobre sobre asfalto) é
**byte a byte** o PNG embutido na prévia (`desenho-aprovado.html`, sha256 `9421fde26e23…`); `ada-technology.png` (96x86) idem
(`21056124193b…`). D4 mantém `APP_BASE_URL` + `/icons/...`; não entra `public/email/transportada-mark.png`.

**(c) Reenvio da 248 hoje** (`resend-contractor-reply-request.use-case.ts`): `findContext` (:54) acha a resposta e o **primeiro e-mail de saída**
da conversa (`drizzle-contractor-reply-resend.repository.ts:115-144`: `occurrenceConversationMessages.bodyText` = o texto cru **sem assinatura**,
`contractorMailMessages.subject`, `toAddresses`); o caso de uso chama o **mesmo** `sendMail.send` (:61-71) com
`actorUserId: input.actorUserId` (quem reenvia), `bodyText: buildResendBodyText(original.bodyText)` (`contractor-reply-resend.policy.ts:49-51`:
"Reenvio do pedido abaixo.\n\n" + original), `subject: original.subject`, `contractorReplyResend: true`. Não monta HTML: o
`buildOccurrenceMail` roda dentro do envio (:321). **Divergência:** (1) o plan D5 diz "reenvio da 248 → o assinante gravado no original"; hoje o
assinante é **quem reenvia** (o ator), e `findOriginalRequest` não lê autor nem colunas D9. Para repetir o assinante do original, a T2.x
estende `findOriginalRequest` (colunas `signer_*`) e o `ContractorReplyResendContext.original`; senão fica "quem reenvia" e o plan D9/teste de
integração ("reenvio repete layout e assinante") muda. (2) **Prefixo duplicado:** `original.subject` já sai com o prefixo `<nome> · CNPJ … — `
depois da 272, e é passado de volta como `subject` ao envio; se o prefixo for montado no envio (D7), o reenvio o duplica. A T2.x do envio
precisa ou prefixar só o assunto vindo do modelo (nunca o reenvio) ou remover o prefixo existente; teste obrigatório. (3) A faixa de itens
(D6) funciona no reenvio porque o texto cru do original traz o bloco intacto.

**(d) Rota da prévia:** `POST /trip-occurrences/:id/conversations/contractor/mail-preview` (`MAIL_PREVIEW_PATH`,
`occurrence-conversation.routes.ts:61`, rota :326-342), política `WRITE_POLICY = { permission: 'occurrences.resolve', scope: 'company' }`
(:50) — **sem `rateLimit`** (as de mensagem e upload têm, :285, :314). Corpo `.strict()` `{ body?, subject? }`, `body` até 8000 e `subject`
até 200 (`mailPreviewSchema`, :120-125). **Divergência relevante:** a prévia **já é POST, já aceita o texto editado** (`body`) e, quando recebe
texto, não usa o modelo (`typed`, `preview-occurrence-mail.use-case.ts:110-120`); e **já devolve `html`, `subject`, `text`** (spread de
`buildOccurrenceMail`, :167-172) além de `bodyText`. Efeito no plano: **a rota nova D8 é desnecessária.** Basta a prévia existente
devolver o `html` do layout novo (o campo é `html`, não `bodyHtml`) a partir do `body` digitado; o painel chama a mesma rota com atraso.
Caminho e permissão finais: nenhuma rota nova, `occurrences.resolve`. A prévia carrega também destinatários e cópia
(`Promise.all` :122-147): a cada chamada com 400 ms de atraso isso é custo à toa — se pesar, extrair só a parte do HTML para um
caso de uso interno chamado pela mesma rota, sem endpoint novo. Falta o `rateLimit` (a rota fica mais chamada pelo atraso): decidir na T0.2 se
ganha o balde `OCCURRENCE_CONVERSATION_RATE_LIMIT`. Critério 12 (prévia = envio) vira "o `html` da prévia é igual ao `body_html` gravado".

**(e) Rótulo pt-BR de `CompanyRole`.** **A API não tem rótulo pt-BR.** Papéis: `COMPANY_ROLES` em
`api-transportada/src/database/identity.schema.ts:29-56`, na ordem `company-admin, finance, fiscal, operator, viewer, driver, aggregate,
separator, helper, contractor, automation` (a ordem do catálogo). Os rótulos moram **só no painel**:
`frontend-transportada/src/modules/identity/locales/identity.locale.json:57-66` (`role.*`: Administrador, Financeiro, Fiscal, **Operação**, Consulta,
Motorista, Agregado, Separador, Ajudante; **sem** `contractor` e `automation`). Atenção: `operator` é "Operação" no painel, não "Operador"
(o plan/spec dizem "Operador"). Os papéis do usuário na empresa vêm de `membership_roles(membership_id, role)` (:146-168, PK composta, sem
ordem), e `roles` aparece também por grupo (`company-group.schema.ts:73`). Proposta: um mapa `COMPANY_ROLE_LABELS_PT_BR` (`Record<CompanyRole, string>`
com `satisfies`, para papel novo reprovar o typecheck) em `identity/domain/company-role-label.constant.ts`, copiando os nove rótulos do painel
(com `contractor: 'Contratante'` e `automation: 'Automação'`, nunca alcançados por assinatura humana), mais função pura
`resolveJobTitle({ jobTitle, roles })` → cargo, senão rótulo do primeiro papel **na ordem de `COMPANY_ROLES`** que o usuário tenha (a consulta
ordena em memória pela posição no catálogo, não pelo banco). Contrato de paridade API↔painel nos rótulos (padrão
`occurrence-type-mail-parity.contract.ts`). Papel efetivo por grupo não entra na assinatura (só `membership_roles` direto): registrar na ADR.

**(f) API e worker NÃO saem num único deploy atômico.** `.github/workflows/deploy.yml`: jobs separados, `deploy-api` (:186) e
depois `deploy-services` (:378-429, `needs: [..., deploy-api]`, matriz `worker`/`cron`), e **cada um só roda se `changes` o marcou**
(`changed-targets.sh`; `changes.outputs.worker` :155-157). Ordem fixa API → worker, com janela entre o fim do deploy da API e o do worker
(minutos). **Divergência com plan § Publicação passo 2** ("o monorepo publica os dois juntos"): é o mesmo run, mas sequencial, não atômico,
e o worker só publica se o diff tocar `apps/worker-transportada` (a 272 toca). O worker **não pode ir antes** da API: ele lê colunas D9 e
`company_logos` que a migration da API cria (`preDeployCommand: bun src/database/pre-deploy.service.ts`, `.railway/railway.ts:78`). Na janela, o
worker velho envia o `body_html` novo com `cid:company-logo` sem a parte inline (imagem quebrada ou "faltando") e usa o "De" antigo
(`from_display_name` é ignorado). Opções para a T0.2/T5.4: (i) aceitar a janela (poucos e-mails automáticos, só visual; o `alt` com o nome de exibição aparece) e registrar;
(ii) a API só liga `cid`/`has_inline_logo` por variável de ambiente `OCCURRENCE_MAIL_INLINE_LOGO` ligada depois de o worker novo estar no ar
(duas publicações; recomendado só se a janela incomodar). `APP_BASE_URL`: no `railway.ts` existe só no worker (:163, `preserve()`); a API **não** tem a
variável (`environment.schema.ts` da API sem `APP_BASE_URL`), então o item de Infra do plan procede; `.env.example:109` já a define (compartilhado).

**(g) Cargo (D10).**

- Repositório: `CompanyUserRepositoryPort` (`company-user.port.ts`, `findByUserId` :108, `updateProfile` :201), implementação
  `DrizzleCompanyUserRepository` (`drizzle-company-user.repository.ts`): `findByUserId` :232-246 (filtra por `userCompanyMemberships.companyId` +
  `userId`, join com `identityUserProfiles`), `updateProfile` :757-781, **que só escreve `identity_user_profiles` e filtra só por `userId`** (sem empresa).
  Leitura de todas as telas parte de `MEMBERSHIP_COLUMNS` (:77-89) e `CompanyUserRecord` (`company-user.port.ts:17-36`).
  O cargo precisa de **método novo** que atualiza `user_company_memberships.job_title` com `where (user_id, company_id)` (o caso de uso já
  recusou usuário de outra empresa em :61-62); não cabe em `updateProfile`.
- **Divergência (plan D10):** `serializeCompanyUser` (`user-administration.routes.ts:551-553`) é só `{ ...companyUser }`; quem monta a resposta é
  `toCompanyUserView` (`company-user.policy.ts:136-166`, a partir de `CompanyUserViewSource`). `jobTitle` entra em `MEMBERSHIP_COLUMNS`,
  `CompanyUserRecord`, `CompanyUserViewSource` e no tipo/retorno de `toCompanyUserView` (e no `toCompanyUserView({...existing,...})` do caso de uso, :131-139).
  Não há alteração em `serializeCompanyUser`.
- **Divergência (efeito colateral do caso de uso):** `execute` **sempre** chama o Keycloak (`updateUser` :77 e `updateAttributes` :117)
  mesmo quando o corpo só traz `jobTitle`; um `PATCH` só de cargo faria chamadas desnecessárias e **falharia se o Keycloak estiver fora**. A T2.x
  precisa desviar: só `jobTitle` → grava a membership e devolve, sem gateway.
- Corpo: `updateCompanyUserProfileSchema` (`user-administration.schema.ts:158-171`) é `.strict()` com `.refine` "ao menos um campo" (`null` conta como
  campo; `undefined` não): `jobTitle: z.string().nullable().optional()` com saneamento/limite pela política pura. Rota :381-407 repassa campo a campo
  (precisa de linha nova para `jobTitle`). Rota/permissão: `PATCH /company-users/:id`, `USERS_MANAGE_POLICY = users.manage` (:98).
- **Guarda do painel não reprova chave nova**: `toCompanyUser` (`identity/shared/companyUsersResponse.validation.ts:63-89`) lê campo a campo e
  **ignora chave extra** (comentário :46-49: guarda de chaves exatas foi evitada de propósito). **Efeito no plano:** o painel não precisa de fase
  "tolerante" para `jobTitle`; basta tipar e ler `jobTitle` (opcional) quando a tela do cargo chegar.
- Auditoria: `update-company-user-profile.use-case.ts` não tem referência a audit; confirmado (status, senha, reveal, ativação, remoção auditam).

**(h) Guardas do painel (prévia e histórico) — nenhuma é estrita.** Arquivo: `occurrence-conversation/shared/occurrenceConversationClient.service.ts`.
`readPreview` (:289-318) exige `bodyText`, `subject`, `text`, `suggested` e **ignora o resto** (hoje ignora `html`); `toMessage` (:244-283) exige
`author`, `bodyText`, `channel`, `createdAt`, `direction`, `id`, `status` e ignora chaves extras (precedente da 267: `copy` opcional). Tipos em
`occurrenceConversation.types.ts` (`OccurrenceMailPreview` :144-158, `OccurrenceConversationMessage` :97-109). `occurrenceConversationGuards.validation.ts`
só exporta `isRecord`/`isString`. Sem `hasExactKeys` no módulo. Efeito: a T1.1 é só **tipar e ler** `html`, `fromDisplayName`, `signerKind` (opcionais);
não há risco de "tela quebrada" por chave nova, e **não é preciso publicar o painel antes** da API por causa dessas guardas. O contrato
existente é `test/occurrence-conversation/conversation-client.contract.ts` (e `occurrence-type-mail-parity.contract.ts` para a prévia do tipo). O
histórico hoje **não** devolve `bodyHtml` nem `fromDisplayName` de saída (`occurrence-conversation.query.ts:151` lê `fromDisplayName` só para o remetente de
entrada, :90). O painel já tem precedente de `iframe sandbox="" srcDoc` (CSP `frame-src 'self'`, spec 150 T403).

**(i) Schemas e migration.**

- **Divergência (D9 colide com coluna existente): `contractor_mail_messages.from_display_name` JÁ EXISTE** (spec 183 T406): API
  `database/contractor-mail.schema.ts:475` (`text`, nula) com CHECK `contractor_mail_messages_from_display_name_length_check` (≤ 200, :612-613);
  worker `database/contractor-mail.schema.ts:47`; hoje gravada **só pelo trilho de entrada** (`record-contractor-mail-inbound-message.use-case.ts:233`,
  `drizzle-contractor-mail-inbound-worker.repository.ts:213`) e lida só para a identidade do remetente de entrada
  (`occurrence-conversation.query.ts:90`, :151). A migration D9 **não pode** adicionar `from_display_name` (falharia com coluna duplicada). Decisão
  para a T0.2: **reusar** a coluna para a saída (nula = mensagem antiga; sem novo CHECK, o de 200 já vale; sem leitura de saída hoje, então não há
  conflito semântico — documentar na ADR que na saída é o nome do `De`) **ou** coluna nova `sender_display_name`. Recomendado reusar. As demais
  quatro colunas D9 (`signer_kind`, `signer_user_id`, `layout_version`, `has_inline_logo`) não existem (grep sem ocorrência).
- API: `contractorMailMessages` em `api-transportada/src/database/contractor-mail.schema.ts:462-614` (:462-523 colunas); `userCompanyMemberships` em
  `database/identity.schema.ts:117-140` (sem `job_title`); `company_logos` em `database/company-logo.schema.ts:15` (PK `company_id`).
- Worker (espelho por valor, mínimo): `contractorMailMessages` em `worker-transportada/src/database/contractor-mail.schema.ts:41-65` (tem
  `fromDisplayName`, `bodyHtml`, `transport`; **faltam** as colunas novas); `userCompanyMemberships` em `database/identity.schema.ts:33` (só
  `userId`, `companyId`, `status`; **o worker não lê cargo**, nada a espelhar); `company_logos` **não existe** no worker (schema novo, leitura).
- Migration: última = `drizzle/20261017041702_occurrence_type_contractor_mail/`; 314 pastas; cada pasta tem `migration.sql`, `rollback.sql` e
  `snapshot.json` (gerado). Geração: `bun run db:generate` em `apps/api-transportada` (`drizzle-kit generate --output json`; script :14), checagem
  `db:check`, aplicação `db:migrate`; o teste de migration/rollback é `make migration-test` → `bun run --cwd apps/api-transportada db:test`
  (lista explícita de `./test/*migration*.contract.test.ts`; migration nova ganha o teste dela nessa lista). `rollback.sql` é escrito à mão ao lado
  (padrão das 314 pastas). A 273 (worktree `spec-273`) ainda não tem migration além da `…041702`: conferir de novo antes de publicar.

**(j) Como os testes são listados.**

- **API** (`apps/api-transportada/package.json`): `test` = `bun test ./test/<area>.contract.test.ts …` — **lista explícita** de ~222 entrypoints;
  cada entrypoint fino importa suítes (`test/occurrence-conversation.contract.test.ts` → `import './occurrence-conversation/<x>.contract.js'`, 43 imports; mesmo
  padrão em `user-administration-application.contract.test.ts` e `user-administration-http.contract.test.ts`). Suíte nova em área existente só precisa do
  `import` no entrypoint; entrypoint novo entra na lista do `test`. `test:integration` = `bun --env-file=../../.env.test test --timeout 120000
./test/integration/<x>.integration.ts …` (~300 arquivos explícitos; relevantes hoje: `occurrence-mail-sandbox.integration.ts`,
  `occurrence-mail-template.integration.ts`); `db:test` para migrations. `lint`: `eslint src test … --max-warnings=0`; `typecheck`: `tsc --noEmit`.
- **Worker**: `test` = `bun test --timeout 120000 ./test/<x>.contract.test.ts …` (lista explícita; `./test/contractor-mail.contract.test.ts` importa as suítes
  de `test/contractor-mail/*`: `outbound-message`, `sandbox-outbound`, `resend-mail-gateway`, `outbound-consumer`…); `test:integration` idem
  (`contractor-mail-sandbox-outbound.integration.ts` já está na lista).
- **Painel**: `test` = `bun test ./test/<x>.contract.test.ts …` (lista explícita; nunca `bun test` cru), `test:hooks` para DOM
  (`--preload ./test/trip-hooks/dom.preload.ts`), `lint` = `eslint .`, `typecheck` = `tsc --noEmit`; suítes do módulo em `test/occurrence-conversation/*.contract.ts`
  (entrypoint `test/occurrence-conversation.contract.test.ts`).
- Regra do CLAUDE.md: teste novo que não está na lista do `package.json` **não roda**.

#### Divergências que mudam o plano (para a T0.2)

1. **D8: a rota nova é desnecessária** (d): a prévia existente já é POST, recebe o texto editado e devolve `html`; só passa a devolver o HTML do layout novo.
2. **D9: `from_display_name` já existe** (i): migration só com quatro colunas (`signer_kind`, `signer_user_id`, `layout_version`, `has_inline_logo`) e reuso da coluna existente para a saída.
3. **Reenvio da 248** (c): assinante hoje é quem reenvia, e o assunto do original já traz o prefixo da 272 (risco de prefixo duplo).
4. **Publicação** (f): API → worker é sequencial, não atômico; há janela com imagem do logo quebrada; decidir aceitar ou ligar por variável.
5. **Cargo** (g): `serializeCompanyUser` não monta nada (é `toCompanyUserView`); o caso de uso sempre chama o Keycloak (desviar quando só muda o cargo); a guarda do painel já tolera chave nova (sem fase tolerante para `jobTitle`).
6. **Rótulo do papel** (e): a API não tem rótulos; `operator` é "Operação" no painel (não "Operador"); mapa novo na API com paridade.
7. **Guardas do painel da prévia e do histórico** (h) não são estritas: a Fase 1 (T1.1) reduz-se a tipar/ler; não exige publicar o painel antes.
8. **CNPJ da contratante** já existe em `TripOccurrenceFeedDocument.contractor.taxId` (`trip-occurrence-feed.use-case.ts:76-80`, preenchido em
   `trip-occurrence-feed.query.ts:751`): `findOccurrenceTarget` só precisa repassar `contractorTaxId` (uma linha, :98-104); atenção: pode ser CPF
   (emitente pessoa física), então o rótulo e `formatCnpjForDisplay` (`shared/tax-id.service.ts`) devem tolerar. CNPJ da transportadora é alfanumérico
   (`company_fiscal_profiles_cnpj_check ^[A-Z0-9]{12}[0-9]{2}$`, :168) e é formatado por `formatCnpjForDisplay`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/272-o-email-da-ocorrencia-sai-em-html/ (leia spec.md, plan.md,
tasks.md e evidence.md antes de começar; leia também specs/268-*, 269-*, 271-* (+ ADR-0108) com os evidence.md, e a
spec 273 em ~/personal/transportada-wt/spec-273/specs/273-a-ocorrencia-tem-dono/ para o ponto signer).
Árvore única: ~/personal/transportada-wt/spec-272 (FS do Linux, branch work/spec-272, criada de origin/staging);
nada fora dela. Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus: escrever a ADR-0110 e validar com architect antes de
qualquer código) · Fase 1 → executor model=haiku (T1.3 sonnet) · Fase 2 → executor model=sonnet (T2.1/T2.3/T2.8/T2.9 haiku;
T2.9 antes da T2.4) ·
Fase 3 → executor model=sonnet (T3.3 haiku) · Fase 4 → executor model=sonnet (T4.3 haiku) · Fase 5 → sonnet ·
revisão final → code-reviewer model=sonnet e security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com bun run typecheck + lint por app (cwd na app) + script `test` do
package.json da app (nunca `bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em evidence.md.
Task que toca test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de
apps/api-transportada), ZERO skips. Migration: aplica, reverte e reaplica e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates,
`bunx prettier --check .` na raiz; conferir numeração de spec/ADR/migration contra origin/staging e contra a 273.
Pare e pergunte antes de: qualquer merge em main (T1.3, T5.4 — o painel tolerante vai a produção ANTES da API, e a
272 só vai a main depois de 269 + 270 + 271); qualquer mudança de dados ou consulta que não seja contagem em staging
ou produção; deploy da API sem o worker no mesmo deploy (plan § Publicação passo 2); e qualquer
[NEEDS CLARIFICATION] que surgir.
Decisões já tomadas (evidence.md): o modelo continua texto (271 recusa HTML) e o servidor monta o HTML em volta, com
multipart text+html; cores fixas da plataforma, tabelas e estilos inline, sem biblioteca; logo da transportadora
embutido por cid: lido de company_logos; marcas TransportAdA e Ada por APP_BASE_URL do painel; assunto
"<nome de exibição> · CNPJ <cnpj> — <assunto do modelo>"; resumo Nota fiscal / Partes / Registro; {{linhasItens}} vira
tabela (no manual só se o bloco ficou intacto); faixa de resposta só com Reply-To; assinatura operador / dono (porta
OccurrenceOwnerReader, nula até a 273) / equipe, com o cargo livre do usuário na empresa (job_title na membership,
editado em Usuários por users.manage na rota PATCH /company-users/:id, sem auditoria como o perfil; vazio → rótulo do
papel); "De" por buildSenderDisplayName com o nome de exibição SEMPRE (Resend e sandbox; o sender_name do Resend não
aparece), e a 273 RF7 herda essa regra.
```
