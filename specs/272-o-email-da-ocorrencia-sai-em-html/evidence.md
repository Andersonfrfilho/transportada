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

## Assunções (reversíveis; o dono pode vetar sem bloquear a execução)

- **A1 — Nome do remetente no Resend.** No Resend, o nome-base do "De" continua o configurado pela empresa
  (`contractor_mail_settings.sender_name`), que é o que a contratante já vê; o nome de exibição da empresa só entra no
  sandbox (D11). Alternativa: trocar também no Resend pelo nome de exibição. Mudar depois é uma linha em
  `buildSenderDisplayName`. Compatível com a 273 RF7 ("`<dono> — <nome do remetente da empresa>`").
- **A2 — Papel na assinatura** = rótulo pt-BR do papel da empresa (`CompanyRole`, ex.: "Operador", "Financeiro"). Não
  existe cargo livre ("Atendimento — ocorrências", como na prévia); criar seria cadastro novo, fora do escopo.
- **A3 — Encaminhamento a terceiro (248) continua em texto/HTML simples** (`buildOccurrenceMail` de hoje).
- **A4 — Mensagens anteriores à 272 não são reprocessadas**: o histórico as mostra como hoje; o reenvio de uma delas usa
  o montador novo com assinatura da equipe.
- **A5 — Cidade no cabeçalho** = `city · state` de `company_fiscal_profiles` (endereço fiscal).

Nenhum `[NEEDS CLARIFICATION]`: as perguntas acima têm padrão adotado e não bloqueiam.

## Coordenação com a 273

Ver `plan.md` § Coordenação com a 273. Em resumo: a 272 vai antes; ela cria `OccurrenceMailSigner` (com `owner`), a
porta `OccurrenceOwnerReader` (implementação nula) e `buildSenderDisplayName`; a T3.3 da 273 passa a ser "implementar a
porta". A 273 não precisa tocar no montador nem no "De".

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

### Bibliotecas e ambiente

- Sem mjml, react-email, juice ou handlebars; só `nodemailer ^7.0.9` (`worker-transportada/package.json:47`).
- API: `CONTRACTOR_MAIL_SANDBOX_SMTP` :296, `EMAIL_FROM` :300, regras :380-395, mapeamento :415-416
  (`api-transportada/src/config/environment.schema.ts`). Worker: `EMAIL_FROM` :74, `CONTRACTOR_MAIL_SANDBOX_SMTP` :76,
  `RESEND_API_KEY` :81, `SMTP_URL` :150.

### Numeração

- Spec 272: livre em `origin/staging` (273 em `work/spec-273`).
- ADR: a última em `docs/adr/` é a 0108; a 273 reservou a 0109 (escrita na T0.2 dela); a 272 usa a **0110**.

## Registro das tasks

(preencher por task)

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/272-o-email-da-ocorrencia-sai-em-html/ (leia spec.md, plan.md,
tasks.md e evidence.md antes de começar; leia também specs/268-*, 269-*, 271-* (+ ADR-0108) com os evidence.md, e a
spec 273 em ~/personal/transportada-wt/spec-273/specs/273-a-ocorrencia-tem-dono/ para o ponto signer).
Árvore única: ~/personal/transportada-wt/spec-272 (FS do Linux, branch work/spec-272, criada de origin/staging);
nada fora dela. Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus: escrever a ADR-0110 e validar com architect antes de
qualquer código) · Fase 1 → executor model=haiku (T1.2 sonnet) · Fase 2 → executor model=sonnet (T2.1/T2.3/T2.8 haiku) ·
Fase 3 → executor model=sonnet (T3.3 haiku) · Fase 4 → executor model=sonnet (T4.2 haiku) · Fase 5 → sonnet ·
revisão final → code-reviewer model=sonnet e security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com bun run typecheck + lint por app (cwd na app) + script `test` do
package.json da app (nunca `bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em evidence.md.
Task que toca test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de
apps/api-transportada), ZERO skips. Migration: aplica, reverte e reaplica e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates,
`bunx prettier --check .` na raiz; conferir numeração de spec/ADR/migration contra origin/staging e contra a 273.
Pare e pergunte antes de: qualquer merge em main (T1.2, T5.4 — o painel tolerante vai a produção ANTES da API, e a
272 só vai a main depois de 269 + 270 + 271); qualquer mudança de dados ou consulta que não seja contagem em staging
ou produção; deploy da API sem o worker no mesmo deploy (plan § Publicação passo 2); e qualquer
[NEEDS CLARIFICATION] que surgir.
Decisões já tomadas (evidence.md): o modelo continua texto (271 recusa HTML) e o servidor monta o HTML em volta, com
multipart text+html; cores fixas da plataforma, tabelas e estilos inline, sem biblioteca; logo da transportadora
embutido por cid: lido de company_logos; marcas TransportAdA e Ada por APP_BASE_URL do painel; assunto
"<nome de exibição> · CNPJ <cnpj> — <assunto do modelo>"; resumo Nota fiscal / Partes / Registro; {{linhasItens}} vira
tabela (no manual só se o bloco ficou intacto); faixa de resposta só com Reply-To; assinatura operador / dono (porta
OccurrenceOwnerReader, nula até a 273) / equipe; "De" por buildSenderDisplayName, com nome também no sandbox.
```
