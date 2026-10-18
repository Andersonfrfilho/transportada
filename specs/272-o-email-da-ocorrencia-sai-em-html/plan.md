# Plano — 272 O e-mail da ocorrência sai em HTML

ADR: [**0110 — O e-mail da ocorrência sai em HTML**](../../docs/adr/0110-o-email-da-ocorrencia-sai-em-html.md),
**revisão 2** (proposta, 2026-10-18; a T0.3 valida com `architect`). Regra global que a revisão 2 segue:
`~/.claude/rules/rules/email-templates.md` (no repositório `ia`: `rules/email-templates.md`).

> **Mudança de escopo (dono, 2026-10-18).** A revisão 1 (D1–D13, aceita na T0.2) montava o HTML em código em volta do
> texto do modelo. A revisão 2 tira o montador: **o HTML é o modelo**. Mantêm-se da revisão 1, com o mesmo conteúdo
> já validado pelo `architect`: o prefixo do assunto (D7 antigo), o "De" saneado (D5 antigo, sem o reenvio), o logo
> por `cid:` (D3), as marcas por `APP_BASE_URL` (D4), o cargo (D10), o rótulo do papel (D11), o CNPJ/CPF da
> contratante (D12) e a janela de deploy (D13). O que saiu está em § Substituído na revisão 2 e em `evidence.md` §
> Mudança de escopo.

## Contexto e premissas

Levantamento com arquivo:linha em [`evidence.md`](evidence.md) § Levantamento (revisão 1, conferido na T0.1) e §
Mudança de escopo → Fatos conferidos (revisão 2). Os fatos que moldam a revisão 2:

- **O pacote já edita, valida e pré-visualiza HTML de e-mail.** `@adatechnology/notification-ui` (0.1.0-rc.9 no
  painel, o mesmo código da 0.1.0): `isHtmlBody` (`NotificationSettingsWorkspace.tsx:119-121`) troca o campo do corpo
  por `HtmlCodeField` (:736-753), que mostra os problemas de `validateEmailHtml` quando o host passa a função (prop
  opcional, :85); a prévia `TemplatePreview` recebe `emailHtml` (:784-785) e o mostra num `<iframe sandbox="" srcDoc>`
  (`TemplatePreview.tsx:484-495`), **sem interpolar** (os `{{campo}}` aparecem crus).
- **`validateEmailHtml` não é do pacote**: é do painel (`apps/frontend-transportada/src/modules/notification/shared/emailHtml.validation.ts:118`,
  ligado em `NotificationSettings.page.tsx`). Erros: `<script`, folha de estilo externa, imagem `data:`, tags
  desbalanceadas; avisos: flex/grid/position, URL relativa, imagem sem `alt`, acima de 102 KB. **Não** checa `on*`,
  `javascript:`, `<iframe` nem `<form` (divergência com o pedido do dono; D2).
- **O renderer do pacote escapa tudo no e-mail** (`notification-contracts/src/templateRender.ts:103-121`, por design:
  "quem quer HTML rico troca o renderer"); a porta `TemplateRendererPort` existe (`providers.ts:65-68`) e o
  `DefaultTemplateRenderer` do módulo (`notification-module/src/shared/DefaultTemplateRenderer.ts:4-5`) diz que o
  host injeta o próprio. **O e-mail à contratante não passa pelo envio do módulo** (ADR-0108 §1: o módulo é depósito e
  renderizador; a API lê `notification.templates` e usa `interpolateTemplate`, que não escapa). Logo, o "renderer
  próprio" é uma política pura da API no lugar de `renderContractorMail` + `buildOccurrenceMail`, e não uma injeção
  de `TemplateRendererPort` (a fábrica `notification-module.factory.ts:51-69` não muda).
- **Versões:** API e worker usam `notification-contracts` 0.1.0-rc.2 e `notification-module` 0.1.0-rc.3; o painel,
  `notification-ui` 0.1.0-rc.9. Tudo o que a 272 usa já existe nessas versões (`HtmlCodeField`/`emailHtml` desde a
  rc.6; `interpolateTemplate`/`extractTemplatePlaceholders` na rc.2). **Sem bump.**
- **Onde a 271 recusa HTML hoje:** `HTML_BODY_PATTERN` (`occurrence-contractor-mail.constant.ts:16-17`);
  `assessContractorTemplate` (`occurrence-contractor-template.policy.ts:67`, problema `html_body`; :38-42
  `SEND_BLOCKING_CODES`; :80 `blocksContractorMailSend`). Caminhos que consomem: 400 ao gravar o tipo
  (`save-occurrence-type.use-case.ts:246-247`, `OCCURRENCE_CONTRACTOR_TEMPLATE_INVALID`); 409 no envio
  (`drizzle-occurrence-mail.repository.ts:217` → `send-occurrence-mail.use-case.ts:225`,
  `OCCURRENCE_MAIL_TEMPLATE_MISSING`); aviso "Tipo sem modelo" (`occurrence-mail-template-missing.query.ts:33-44`, :90);
  lista do editor (`main.ts:4014`, `toContractorTemplateView`). **No worker**, a fila do automático filtra em SQL
  `nt."body" !~ HTML_BODY_PATTERN` (`drizzle-occurrence-automatic-mail-queue.repository.ts:92`; cópia em
  `occurrence-automatic-mail-sweep.constant.ts:28`, paridade em `html-body-pattern.contract.ts`).
- **O painel tolera código de problema novo**: `toProblem` (`occurrenceTypeMailClient.service.ts:19-42`) descarta o
  código desconhecido e mantém o modelo com `usable`; sem fase tolerante.
- **Variáveis da 271:** `OCCURRENCE_CONTRACTOR_MAIL_VARIABLES` (`occurrence-contractor-mail.constant.ts:24-49`, 17
  nomes); no painel `OCCURRENCE_MAIL_VARIABLE_NAMES` + `OCCURRENCE_MAIL_SAMPLE_VALUES`
  (`occurrenceTypeMailTemplate.service.ts:9`), descrições em `companySettings.locale.json` (desde :491) e `.en`;
  paridade em `frontend-transportada/test/occurrence-conversation/occurrence-type-mail-parity.contract.ts`. `valorNota`,
  `motorista`, `parada` e `data` **já existem**.
- **Chaves dos modelos:** nenhuma `ocorrencia.*` existe em seed ou migration (a 271 "começa do zero"); as cinco chaves
  vêm do desenho aprovado (`desenho-aprovado.html:495`, :509, :529, :546, :563). Precedente de publicação versionada:
  `apps/api-transportada/scripts/whatsapp-flow-publish.ts` (simula por padrão, grava com `--confirm`).
- O resto do contexto da revisão 1 continua valendo (envio multipart já existe; `from_display_name` já existe;
  logo em `company_logos`; `APP_BASE_URL` só no worker; API e worker no mesmo run, em sequência).

## Decisões de desenho (revisão 2; a T0.3 valida com `architect`)

- **D1 — O HTML é o modelo.** O visual mora no modelo de e-mail do módulo de notificação; a API não monta layout. Corpo
  com tag (detecção pelo `HTML_BODY_PATTERN` de hoje) → caminho HTML; sem tag → caminho de texto de hoje
  (`renderContractorMail` + `buildOccurrenceMail`, com o prefixo e o "De" novos). **Emenda a D5 da 271 / ADR-0108 §3**:
  "corpo texto (não HTML)" vira "corpo texto ou HTML seguro".
- **D2 — HTML inseguro é "não utilizável".** Política pura `occurrence-mail-html-safety.policy.ts` na API, por padrões
  sem diferenciar maiúsculas: `<script`, atributo `on<letra>…=`, `javascript:` em qualquer atributo (também com
  entidade ou espaço no meio), `<iframe`, `<form`. O problema `html_body` da 271 é **trocado** por `unsafe_html`, que
  entra em `SEND_BLOCKING_CODES`: 400 ao gravar o tipo, 409 no manual, o automático pula e o aviso "Tipo sem modelo"
  aparece — os caminhos de hoje, sem código novo de erro. **Divergência com o pedido** ("a mesma regra do pacote"): a
  regra do painel (`emailHtml.validation.ts`) não cobre `on*`, `javascript:`, `iframe` e `form`. Decisão: a API usa as
  cinco regras do dono; o validador do painel **ganha** as quatro que faltam como `error` (o editor avisa o mesmo que
  a API recusa), presos por contrato de paridade com uma tabela de casos copiada nas duas apps. As outras regras do
  painel (folha externa, `data:`, tags desbalanceadas, avisos) continuam só no editor.
  **Worker:** a fila do automático troca `nt."body" !~ HTML_BODY_PATTERN` por `nt."body" !~*
UNSAFE_EMAIL_HTML_PATTERN` (uma expressão POSIX equivalente às cinco regras), cópia por valor com contrato de
  paridade espelhado (mesmo molde de `html-body-pattern.contract.ts`); a API confere de novo no envio (se a fila
  deixar passar algo, o automático pula `no_template_selected`, como hoje).
- **D3 — Renderer próprio, uma passada, escape só nos valores.** `renderContractorMailHtml({ bodyTemplate,
subjectTemplate, values, systemHtml })` (pura, na API): uma única varredura troca cada `{{nome}}` do **modelo**
  pelo valor; o valor entra por `escapeMailHtml` (`mail-template-render.policy.ts:85-92`), exceto as chaves do
  conjunto fechado `OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES = ['logoTransportadora', 'tabelaItens', 'marcasRodape']`
  (`as const`, no `*.constant.ts`), cujo valor vem de `systemHtml` — um objeto tipado separado de `values`, que só a
  API preenche e que nunca é montado a partir de entrada de usuário sem escape. **Segurança:** (a) a chave raw é
  decidida pelo **nome no conjunto fechado**, nunca pelo conteúdo do valor; (b) uma passada só — um valor que contém
  `{{logoTransportadora}}` sai escapado, não é reinterpretado; (c) o HTML do sistema escapa tudo o que carrega (nome
  de exibição, iniciais, código, item, unidade); (d) o modelo já passou na D2. Variável desconhecida sai vazia (271).
  O assunto continua texto (colapsado, cortado, sem escape: não é HTML).
- **D4 — Parte texto gerada do HTML.** `htmlToPlainText(html)` pura: remove `<head>`/`<style>`, troca `<br>` e fim de
  `p|div|tr|li|h1-6|table` por quebra, célula por espaço ou tabulação, tira as tags, decodifica as entidades básicas,
  colapsa linhas em branco. Sem biblioteca (sem dependência nova; `code-standart.md` §13). `body_text` gravado = esse
  texto; a mensagem da conversa leva o mesmo texto.
- **D5 — Variáveis novas** (lista fechada da 271, catálogo da API + `OCCURRENCE_MAIL_VARIABLE_NAMES` e exemplos do
  painel + descrições nos dois locales, um contrato de paridade):

  | Variável             | Tipo            | Origem                                                                                                                                                                           |
  | -------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `nomeExibicao`       | texto           | `resolveCompanyDisplayName` (`company_fiscal_profiles`)                                                                                                                          |
  | `cnpjTransportadora` | texto           | `company_fiscal_profiles.cnpj` por `formatCnpjForDisplay`                                                                                                                        |
  | `cnpjContratante`    | texto           | `feed.document.contractor.taxId` repassado por `findOccurrenceTarget`: 11 dígitos → CPF `000.000.000-00`; 14 → CNPJ por `formatCnpjForDisplay`; outro → vazio                    |
  | `assinaturaNome`     | texto           | D6                                                                                                                                                                               |
  | `assinaturaCargo`    | texto           | D6                                                                                                                                                                               |
  | `logoTransportadora` | HTML d. sistema | com logo: `<img src="cid:company-logo" alt="<nome de exibição>" width="48" height="48" style="…">` e `has_inline_logo = true`; sem: quadrado de tabela com as iniciais escapadas |
  | `tabelaItens`        | HTML d. sistema | tabela Código / Item / Qtd. / Valor com "Total dos itens" (soma da 247) e "e mais N itens" acima de 200; vazia sem itens                                                         |
  | `marcasRodape`       | HTML d. sistema | `APP_BASE_URL` + `/icons/icon-192.png` e `/icons/ada-technology.png` com "Enviado pelo TransportAdA — uma solução Ada Technology"; sem a variável, só o texto                    |

  `valorNota`, `motorista`, `parada` e `data` já existem e não são duplicadas (`dataRegistro` = `data`; Q4). Os
  pedidos que o desenho usa e a lista não traz (cidade/UF e razão social da transportadora, iniciais da assinatura,
  faixa "Responda" condicional) são perguntas (Q2, Q3), não variáveis inventadas.

- **D6 — Assinante.** `OccurrenceMailSigner` = `{ kind: 'operator' | 'owner', userId, name, jobTitle? }` ou
  `{ kind: 'team' }`. Manual → `operator` (o ator); automático → `owner` se a porta `OccurrenceOwnerReader`
  (`findEligibleOwner({ companyId, occurrenceId, kind }) → { userId, name, jobTitle? } | undefined`, implementação
  nula na 272; a 273 implementa) devolver alguém, senão `team`. `assinaturaNome` = `name` ou "Equipe <nome de
  exibição>"; `assinaturaCargo` = `jobTitle` ou vazio. `jobTitle` por `resolveSignerJobTitle({ jobTitle, directRoles })`:
  o cargo (D10) ou o rótulo do primeiro papel direto na ordem de `COMPANY_ROLES` (D11); nenhum → ausente. O
  assinante **não é gravado** (D9).
- **D7 — Assunto com prefixo que não se corta** (mantida da revisão 1). `<nome de exibição> · CNPJ <cnpj> — ` + o
  assunto do modelo cortado em `200 − tamanho(prefixo)`; nome de exibição colapsado e cortado em 80 no prefixo (prefixo
  ≤ 109); `applySubjectPrefix` idempotente (assunto que já começa pelo prefixo da empresa não ganha outro — reenvio
  da 248 e painel antigo).
- **D8 — "De" saneado** (mantida da revisão 1, sem o reenvio). `buildSenderDisplayName({ companyDisplayName, signer })`:
  `team` → `<nome de exibição>`; pessoa → `<nome> — <nome de exibição>`. Remove `\p{Cc}`, U+2028/2029, bidi
  (U+202A–U+202E, U+2066–U+2069) e `<>"\,;`, colapsa espaços, corta **primeiro o nome da pessoa** para caber em 200
  (CHECK de `from_display_name`). Grava em `from_display_name` (coluna que já existe, spec 183). O worker usa
  `from_display_name` só em `direction = 'outbound'` e não nulo, nos dois transportes, reaplicando o mesmo saneamento
  (tabela de casos idêntica); nulo → o comportamento de hoje (`settings.senderName` no Resend, endereço puro no
  sandbox). Nome não ASCII no Resend: a task do worker confirma na doc oficial se o Resend codifica (RFC 2047).
- **D9 — Migration mínima.** `contractor_mail_messages.has_inline_logo boolean not null default false` (o worker sabe
  se anexa o logo sem ler o HTML) e `user_company_memberships.job_title varchar(80)` nula + CHECK `1..80` (D10).
  `from_display_name` é reusada. **Saem** da revisão 1 `signer_kind`, `signer_user_id`, `layout_version` e os três
  CHECKs da invariante: serviam ao reenvio da 248 repetindo o original (fora) e ao histórico por layout (fora); a 273
  **não** os lê nem escreve (conferido em `spec-273` plan:32-33, :113-114, :244 e ADR-0109 §8 — ela só implementa a
  porta). O manual continua rastreado por `occurrence_conversation_messages` (autor); o dono do automático fica na
  ocorrência (273). Se o dono quiser saber "quem assinou" por mensagem, é coluna de spec seguinte (Q5).
- **D10 — Cargo livre na membership** (mantida da revisão 1). `job_title varchar(80)` nula; política pura
  `company-user-job-title.policy.ts` (controle, quebra de linha e bidi fora, espaços colapsados, `trim`, vazio →
  `null`, mais de 80 → 400). `PATCH /company-users/:id` (`users.manage`) ganha `jobTitle?: string | null` (ausente não
  altera; conta para o "ao menos um campo"); gravação por método novo `updateJobTitle` com `UPDATE … WHERE user_id = ?
AND company_id = ?`; corpo só com `jobTitle` não chama o Keycloak; resposta por `toCompanyUserView`
  (`MEMBERSHIP_COLUMNS` → `CompanyUserRecord`); sem auditoria, como o perfil; fora de log. Tela: campo "Cargo" em
  `CompanyUserEditDialog.component.tsx`, cargo abaixo do nome na lista.
- **D11 — Rótulo do papel na API** (mantida). `COMPANY_ROLE_LABELS` em `identity/domain/company-role-label.constant.ts`
  (`satisfies Record<CompanyRole, string>`), cópia de `identity.locale.json` `role.*` + `contractor`/`automation`;
  `operator` = "Operação"; paridade por contrato que lê o JSON do painel por caminho relativo no teste.
- **D12 — Envio manual com modelo HTML** (padrão reversível; Q1). A prévia existente
  (`POST …/conversations/contractor/mail-preview`) devolve, sem `body`, `bodyText` = texto gerado do HTML (D4) e
  `html` = o HTML renderizado; o diálogo continua editando texto. No `POST`, a API renderiza de novo o modelo com os
  mesmos valores e compara o texto recebido com o gerado (normalizado: fim de linha e espaços nas pontas): **igual** →
  sai o HTML do modelo; **diferente** → sai o texto do operador pelo caminho de texto (parágrafos), sem o HTML do
  modelo. Sem rota nova, sem `fullSubject`, sem `inlineLogo`, sem balde próprio (a prévia "Como chega" foi adiada).
- **D13 — Janela de deploy** (mantida). API e worker no mesmo PR e no mesmo run (`deploy-api` → `deploy-services`);
  nos minutos entre os dois, o worker velho manda o HTML sem a parte inline (o `alt` aparece) e o "De" antigo. Worker
  fora do run = parar e perguntar.
- **D14 — Modelos versionados + script por chave.** Cinco arquivos em
  `apps/api-transportada/src/occurrence-conversation/occurrence-mail-templates/<chave>.html` (nome = chave sem o
  prefixo `ocorrencia.`, ex.: `avaria.html`), com o assunto num comentário de cabeçalho
  `<!-- subject: … -->` lido pelo script (um arquivo por modelo, assunto e corpo juntos). Desenho: `render()` e
  `TEMPLATES` de `desenho-aprovado.html` traduzidos para tabelas e estilos inline, cores fixas (asfalto `#10222c`,
  cobre `#d58a47`, névoa `#f0f2ee`, ardósia `#5a6b74`, tinta `#1d2b33`), `color-scheme: light only`, largura 620 px.
  Script `apps/api-transportada/scripts/occurrence-mail-templates-publish.ts --company <uuid> [--confirm]` (molde do
  `whatsapp-flow-publish.ts`): lê os arquivos, valida cada um pela D2 e pelas variáveis da lista fechada (recusa
  tudo se um falhar), compara com a versão ativa mais alta da chave (canal `email`, `pt-BR`) e só grava **versão
  nova** se assunto ou corpo mudaram (idempotente: rodar duas vezes grava uma); sem `--confirm` só mostra o plano
  (chave, versão atual, ação). Grava pela API do módulo (`notification-module`) ou pelo mesmo `INSERT` versionado que
  a tela usa — a task confere qual o módulo expõe; nunca `UPDATE` de versão existente. Não escolhe o modelo no tipo
  (isso é do operador, na aba Tipos). Rodar em staging ou produção é mudança de dados: **parar e perguntar**.

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

| Camada     | Arquivo (novo ou alterado)                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constantes | `occurrence-contractor-mail.constant.ts`: variáveis novas, `OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES`, `UNSAFE_EMAIL_HTML_PATTERNS`; `occurrence-mail-html.constant.ts` (novo): cores, `COMPANY_LOGO_CONTENT_ID`, caminhos das marcas                                                                                                                                                                                    |
| Domínio    | `occurrence-mail-html-safety.policy.ts` (D2), `occurrence-mail-html-render.policy.ts` (D3), `occurrence-mail-plain-text.policy.ts` (D4), `occurrence-mail-system-html.policy.ts` (logo, tabela, marcas — D5), `occurrence-mail-sender-name.policy.ts` (D8), `occurrence-mail-subject.policy.ts` (D7), `resolveSignerJobTitle` — todos puros; `occurrence-contractor-template.policy.ts` (`html_body` → `unsafe_html`) |
| Leitura    | `drizzle-occurrence-mail.repository.ts`: `findOccurrenceTarget` com `contractorTaxId`; `findCarrierIdentity` (nome de exibição, CNPJ, `hasLogo`) no lugar de `findCarrierName`; `findOperatorSigner` (nome + `job_title` + papéis diretos); leitor da sugestão com os valores novos                                                                                                                                   |
| Porta      | `occurrence-conversation/application/occurrence-owner-reader.port.ts` (novo, implementação nula)                                                                                                                                                                                                                                                                                                                      |
| Casos      | `send-occurrence-mail.use-case.ts` (caminho HTML ou texto, D12, prefixo, "De", `from_display_name`, `has_inline_logo`), `send-automatic-occurrence-mail.use-case.ts` (`owner`/`team`), `preview-occurrence-mail.use-case.ts` (`bodyText` gerado e `html` do modelo)                                                                                                                                                   |
| Config     | `config/environment.schema.ts`: `APP_BASE_URL` opcional                                                                                                                                                                                                                                                                                                                                                               |
| Usuários   | `identity.schema.ts` (`jobTitle`), `company-user-job-title.policy.ts`, `user-administration.schema.ts`, `update-company-user-profile.use-case.ts`, repositório (`updateJobTitle`, `MEMBERSHIP_COLUMNS`), `company-user.port.ts`, `company-user.policy.ts`, `company-role-label.constant.ts`; OpenAPI                                                                                                                  |
| Schema     | `contractor-mail.schema.ts` (`hasInlineLogo`) + duas migrations aditivas + `rollback.sql`                                                                                                                                                                                                                                                                                                                             |
| Modelos    | `occurrence-conversation/occurrence-mail-templates/*.html` (5) e `scripts/occurrence-mail-templates-publish.ts` (D14)                                                                                                                                                                                                                                                                                                 |

`buildOccurrenceMail` (montador de hoje) continua para o caminho de texto, o encaminhamento a terceiro e a correção de
endereço; ganha só a assinatura de texto com `assinaturaNome`/`assinaturaCargo` no lugar do operador cru (texto).

### Worker (`apps/worker-transportada`)

- `contractor-mail.schema.ts`: `hasInlineLogo` e `direction` lidos (espelho); schema mínimo de `company_logos`.
- `send-contractor-mail-outbound-message.use-case.ts`: "De" por `from_display_name` (D8); parte inline do logo quando
  `has_inline_logo` (porta `CompanyLogoReader`, `drizzle-company-logo.reader.ts`); logo sumido → envia sem a parte e
  loga só `messageId` e o motivo.
- `resend-mail.gateway.ts` (`content_id` no anexo), `sandbox-smtp-mail.gateway.ts` (`from: { name, address }`, `cid`).
- `occurrence-automatic-mail-sweep`: `UNSAFE_EMAIL_HTML_PATTERN` no lugar de `HTML_BODY_PATTERN` (D2), contrato
  espelhado.

### Painel (`apps/frontend-transportada`)

- `occurrenceTypeMailTemplate.service.ts`: variáveis novas e exemplos (os de HTML do sistema com exemplo fixo
  escapado); locales pt-BR/en das descrições; paridade.
- Código `unsafe_html` em `PROBLEM_CODES` e no locale (no lugar de `html_body`); a prévia do tipo, com corpo HTML,
  mostra o modelo renderizado com os exemplos num `<iframe sandbox="" srcDoc>` (precedente da 150; CSP `frame-src
'self'`), sem `allow-scripts`.
- `emailHtml.validation.ts`: as quatro regras que faltam (D2) como `error`, com a tabela de paridade.
- `CompanyUserEditDialog.component.tsx`: campo "Cargo"; `UserAdministration.page.tsx`: cargo abaixo do nome; locales.

### Infra

- `.railway/railway.ts`: `APP_BASE_URL` na API como `preserve()`. `.env.example`.

## Coordenação com a 273

Conferido em `~/personal/transportada-wt/spec-273` (spec/plan/tasks/evidence e ADR-0109) em 2026-10-18.

| Ponto                   | A 272 (revisão 2) entrega                                                                        | A 273 faz depois                                                | Impacto da revisão 2                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assinatura              | `OccurrenceMailSigner` com `owner`, porta `OccurrenceOwnerReader` nula, `assinaturaNome`/`Cargo` | Implementa a porta (T2.10 da 273); elegibilidade da ADR-0109 §7 | Nenhum no contrato da porta. A assinatura passa a ser **variável do modelo**, não bloco montado: o modelo precisa usar `{{assinaturaNome}}`/`{{assinaturaCargo}}` (os cinco da D14 usam)                                                      |
| "De"                    | `buildSenderDisplayName` e `from_display_name`                                                   | Nada (RF7 herda)                                                | Nenhum                                                                                                                                                                                                                                        |
| Cargo                   | `job_title` + `resolveSignerJobTitle`                                                            | O leitor de dono devolve `jobTitle` pela mesma função           | Nenhum                                                                                                                                                                                                                                        |
| Colunas                 | `has_inline_logo`, `job_title`, `from_display_name` reusada                                      | Nenhuma                                                         | **Saem** `signer_kind`, `signer_user_id`, `layout_version`. A 273 cita as cinco colunas como "da 272" (plan:32-33, :113-114, :244; evidence:272) mas não as usa: a 273 corrige o texto quando for executada (registrar no `evidence.md` dela) |
| Montador / layout       | Nenhum (removido)                                                                                | Nada                                                            | A 273 plan:113 ("O montador, o `buildSenderDisplayName` e a gravação de … `signer_*` são da 272") fica desatualizada: só `buildSenderDisplayName` e `from_display_name` continuam                                                             |
| Critério 10 da 273      | "De" e `{{assinaturaNome}}`/`{{assinaturaCargo}}` do dono                                        | Prova com o modelo da 272 que usa as variáveis                  | O critério continua passando se o modelo escolhido no tipo usar as variáveis de assinatura                                                                                                                                                    |
| Dono em cópia (273 RF8) | Não mexe                                                                                         | `resolve-mail-copy.service.ts`                                  | Nenhum                                                                                                                                                                                                                                        |

**Ordem de publicação:** 269 + 270 + 271 → **272** → 273. A 272 e a 273 geram `snapshot.json` do mesmo pai
(`20261017041702_…`): quem chegar depois a `staging` regenera migration e snapshot.

## Contratos

- `PUT /company-settings/occurrence-types/:id` e a lista de modelos do editor: o problema `html_body` sai e entra
  `unsafe_html` (modelo HTML seguro passa a ser utilizável).
- `POST /trip-occurrences/:id/conversations/contractor/mail-preview` (existente, `occurrences.resolve`): com modelo
  HTML, `bodyText`/`text` = texto gerado e `html` = o HTML do modelo renderizado; corpo `.strict()` `{ body?, subject? }`
  não muda; `subject` continua a parte do modelo, sem prefixo.
- `POST …/conversations/contractor/messages` (envio manual): sem mudança de corpo; a decisão HTML × texto é do
  servidor (D12).
- `PATCH /company-users/:id` (`users.manage`): `jobTitle?: string | null`; 400 acima de 80; 404 outra empresa; 403
  sem permissão; respostas de usuário ganham `jobTitle: string | null`.

## Dados, migration e rollback

Migration aditiva `contractor_mail_message_inline_logo`: `has_inline_logo boolean not null default false`. Migration
aditiva `user_company_membership_job_title`: `job_title varchar(80) null` + CHECK `job_title is null or
length(job_title) between 1 and 80`. `rollback.sql` de cada uma: `DROP CONSTRAINT` + `DROP COLUMN`. Sem backfill.
Aplica, reverte, reaplica; `db:generate` → `no_changes`.

Modelos: dado em `notification.templates`, gravado só pelo script (D14), versão nova por mudança; rollback = gravar a
versão anterior de novo pelo mesmo script a partir do arquivo do commit anterior (o módulo não apaga versão).

## Testes (antes da implementação)

- D2: tabela de casos do HTML inseguro (cada regra, maiúsculas, `on` em texto comum não casa, `javascript:` com
  entidade/espaço, HTML seguro passa), idêntica na API, no painel (`emailHtml.validation`) e no padrão do worker.
- D3: valor com `<b>x</b> & "y"` escapado e o HTML do modelo intacto; chave do conjunto raw só pelo nome; valor
  contendo `{{logoTransportadora}}` não é reinterpretado; variável desconhecida vazia; o HTML do sistema escapa nome
  e itens.
- D4: HTML dos cinco modelos → texto sem tag, com quebras; entidades decodificadas.
- D5: tabela 200 itens < 100 KB e 201 com "e mais 1 item"; sem logo → iniciais e `has_inline_logo = false`; sem
  `APP_BASE_URL` → só o texto das marcas; CPF/CNPJ/sem documento.
- D6/D11: `resolveSignerJobTitle` (cargo, papel, nenhum); paridade dos rótulos; dono injetado na porta (critério 12).
- D7/D8: tabelas de casos do prefixo (300 caracteres, nome > 80, idempotência) e do "De" (controle, U+2028, bidi,
  `<>"\,;`, > 200 corta a pessoa), espelhada no worker; `sender_name` nunca no "De".
- D12: texto mantido → HTML; editado → texto; prévia sem `body` devolve `bodyText` gerado.
- D10: política do cargo e contratos do `PATCH` (critério 13).
- Worker: Resend com `from` nomeado e anexo `content_id`; sandbox com `{ name, address }` e `cid`; logo ausente → sem a
  parte; fila do automático aceita modelo HTML seguro e recusa inseguro (integração com Postgres descartável).
- D14: o script em dry-run não grava; com `--confirm` grava versão 1; segunda rodada não grava; arquivo inválido →
  nenhuma chave gravada. Os cinco arquivos passam na D2, usam só variáveis da lista e passam no teste de forma (sem
  `display:grid|flex`, `var(`, `<script`, `@import`).
- Integração: manual e automático com modelo HTML gravam `body_html`, `body_text` gerado, `from_display_name` e
  `has_inline_logo`; modelo texto sai como hoje.

## Publicação

1. Painel tolerante: já tolerante (T1.1/T1.2; o código de problema novo é descartado pela guarda) — sem deploy (T1.3).
2. API + worker + as duas migrations aditivas, **no mesmo PR e no mesmo run** (D13). Worker fora do run = parar e
   perguntar.
3. Telas (cargo, variáveis no editor do tipo, validador do editor de Notificações) → `staging`.
4. Modelos: o script em `staging` (com aprovação) → conferir no Mailpit de staging → um envio real pelo Resend (nome
   não ASCII no "De", logo inline) antes de `main`.
5. Produção só com aprovação humana, na mesma ordem, depois de 269 + 270 + 271; o script em produção é outra
   aprovação.

## Riscos

- **A empresa pode estragar o desenho** editando o HTML na tela: é o preço de o visual morar no modelo (regra global);
  o arquivo versionado e o script são o caminho de volta.
- **Outlook e imagens:** miniaturas do rodapé (URL remota) bloqueadas até liberar; o texto fica. Aceito.
- **E-mail maior** com o logo inline (até 256 KiB). Aceito.
- **Modelo HTML sem `{{assinaturaNome}}`** sai sem assinatura: a validação não obriga variável; os cinco modelos a têm.
- **Painel sem `blob:` para `cid:`** na prévia do editor do tipo: o logo não aparece na prévia (o `alt` sim); o e-mail
  enviado não muda.

## Substituído na revisão 2 (2026-10-18)

Mantido para rastreio; detalhe em `evidence.md` § Mudança de escopo.

| Revisão 1                                                                          | Situação                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| D1 (servidor monta, modelo texto) e D2 (montador sem biblioteca, blocos em código) | **Substituídas** pelas D1–D4 (o HTML é o modelo; renderer próprio)                                       |
| D3 (logo `cid:`) e D4 (marcas por `APP_BASE_URL`)                                  | **Mantidas**, viraram as variáveis `logoTransportadora` e `marcasRodape` (D5)                            |
| D5 (signer + "De")                                                                 | **Mantida** sem o reenvio (D6, D8)                                                                       |
| D6 (tabela pelo bloco exato `itemLinesBlock`)                                      | **Substituída** pela variável `tabelaItens` (D5) e pela D12                                              |
| D7 (prefixo)                                                                       | **Mantida** (D7)                                                                                         |
| D8 (prévia com HTML, `fullSubject`, `inlineLogo`, balde próprio)                   | **Adiada pelo dono em 2026-10-18 — spec seguinte**; sobra só o `html`/`bodyText` da prévia de hoje (D12) |
| D9 (quatro colunas + três CHECKs) e D9-b (reenvio repete o original)               | **Substituídas** pela D9 (só `has_inline_logo`); reenvio continua como hoje                              |
| D10–D13                                                                            | **Mantidas** (D10, D11, D5 `cnpjContratante`, D13)                                                       |
