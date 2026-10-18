# Plano — 272 O e-mail da ocorrência sai em HTML

ADR: [**0110 — O e-mail da ocorrência sai em HTML**](../../docs/adr/0110-o-email-da-ocorrencia-sai-em-html.md)
(escrita na T0.2; a 0109 é da 273). Registra D1–D13 abaixo: montagem no servidor em volta do texto do modelo, logo da
transportadora embutido por `cid:`, marcas do produto por URL pública do painel, ponto `signer` e regra única do "De".
Os itens marcados **Ajustado na T0.2** mudaram pelas divergências da T0.1 (`evidence.md` § T0.1); os marcados
**Ajustado na T0.2 (architect)** vêm da validação do `architect` (`evidence.md` § T0.2 — Validação do architect). A ADR
está **aceita** (2026-10-18).

## Contexto e premissas

Levantamento completo, com arquivo:linha, em [`evidence.md`](evidence.md) § Levantamento (conferido contra
`origin/staging` 68613c0f9). A T0.1 confere as linhas antes de qualquer código. Os fatos que moldam o plano:

- **O e-mail já tem parte HTML, só que sem desenho.** `buildOccurrenceMail` (`occurrence-mail.template.ts:28`) devolve
  `{ html, subject, text }`: cada parágrafo vira `<p>` escapado e a assinatura é `--`/operador/transportadora. A API grava
  `bodyHtml` e `bodyText` em `contractor_mail_messages` (`send-occurrence-mail.use-case.ts:355-373`) e o worker manda
  `html` quando não é nulo e `text` sempre (`send-contractor-mail-outbound-message.use-case.ts:165-169`), no Resend e no
  sandbox. **O transporte multipart já existe**: a 272 troca o que vai em `bodyHtml`.
- **Quem chama o montador hoje:** o envio (`send-occurrence-mail.use-case.ts:321`), a prévia
  (`preview-occurrence-mail.use-case.ts:167`) e o encaminhamento a terceiro (`forward-contractor-reply-by-email.use-case.ts:259`).
  O encaminhamento fica fora (continua no montador de hoje).
- **O texto chega pronto.** `renderContractorMail` devolve `{ subject, bodyText }` (assunto colapsado e cortado em 200,
  corpo em 8000; `linhasItens` = `joinItemLines`, uma linha fixa por item, teto 200 + "e mais N itens"). No manual, o
  painel pede a prévia, o operador pode editar e o `POST` manda o texto pronto; o envio só acrescenta a assinatura.
- **O logo mora no Postgres**, não no bucket: `company_logos` (`content_base64`, `mime_type` png/jpeg, `sha256`, até
  256 KiB). Há a rota anônima `/public/landing-logo`, mas ela serve **só** a empresa da instalação (`config.companyId`),
  não a empresa da ocorrência — uma transportadora pode ter mais de um CNPJ.
- **Já existe e-mail com desenho e marcas**: o e-mail de código do worker (`code-email-template.service.ts`) usa tabelas,
  paleta e as marcas do produto por URL do painel (`APP_BASE_URL` + `/icons/icon-192.png` e `/icons/ada-technology.png`,
  :50-51), e cai para texto quando a URL não existe. A 272 segue o mesmo molde para as marcas.
- **"De":** o worker monta `` `${settings.senderName} <${settings.senderAddress}>` `` no Resend (:163) e manda
  `message.fromAddress` puro no sandbox (:221) — por isso o Mailpit mostra só o endereço (D11 do dono).
- **Dados do resumo:** `readOccurrenceMailValues` já traz valor da nota, motorista, parada, contratante, cliente e data.
  **Falta o CNPJ da contratante**: o feed lê `taxId`, mas `findOccurrenceTarget` descarta
  (`drizzle-occurrence-mail.repository.ts:98-104`). Nome de exibição, razão social, CNPJ, cidade e UF da transportadora
  vêm de `company_fiscal_profiles` (`resolveCompanyDisplayName`, já usado por `findCarrierName`).
- **Operador:** o nome vem de `findOperatorName`; o **papel** não é lido hoje (existe em `roles: CompanyRole[]` do
  `/auth/me`). **Não existe cargo** em lugar nenhum: `identity_user_profiles` (`database/identity-user-profile.schema.ts:19`)
  é por pessoa e tem nome, login, contato, e-mail, telefone e CPF; `user_company_memberships`
  (`database/identity.schema.ts:117-140`) tem só usuário, empresa e status.
- **Edição de usuário hoje:** `PATCH /company-users/:id` (`identity/presentation/user-administration.routes.ts:381-407`,
  `USERS_MANAGE_POLICY` = `users.manage`, corpo `.strict()` em `user-administration.schema.ts`), caso de uso
  `update-company-user-profile.use-case.ts` que acha o usuário **pela empresa do token** (:61-62, `CompanyUserNotFoundError`
  → 404) e **não grava auditoria** (status, senha, permissões e grupos gravam; perfil não). Não há rota de perfil
  próprio (`/me/*` só tem viagens, diagnóstico, consentimento e WhatsApp). Tela: `CompanyUserEditDialog.component.tsx`
  em `UserAdministration.page.tsx`; guarda `companyUsersResponse.validation.ts`.
- **Sem biblioteca de e-mail HTML** no repositório (nada de mjml, react-email, juice). Só `nodemailer` no worker.

## Decisões de desenho (a T0.2 valida com `architect`)

- **D1 — O servidor monta, o modelo continua texto.** Um montador puro novo na API,
  `buildOccurrenceMailLayout(view)` → `{ subject, html, text }`, recebe uma `OccurrenceMailView` (empresa, tipo,
  resumo, corpo em texto, itens, assinante, `hasReplyTo`, `hasInlineLogo`, URLs das marcas, ano) e é a única fonte do
  HTML: envio, prévia e reenvio chamam ele. A recusa de corpo HTML da 271 não muda.
- **D2 — Sem biblioteca: funções TS que devolvem string, com tabelas e estilos inline.** mjml e react-email trariam
  dependência pesada (mjml) ou React na API (react-email) para um layout fixo de uma tela; juice resolveria só o inline,
  que escrevemos direto. Cada bloco é uma função pequena (`renderHeader`, `renderSummary`, `renderBody`,
  `renderItemsTable`, `renderReplyHint`, `renderSignature`, `renderFooter`) em arquivos sob 200 linhas. Todo valor
  passa por `escapeMailHtml` (`mail-template-render.policy.ts:85`). `<meta name="color-scheme" content="light only">`
  e cores fixas (RF10). As cores e medidas são constantes em `occurrence-mail-layout.constant.ts`.
- **D3 — Logo da transportadora embutido por `cid:`.** O HTML referencia `cid:company-logo` quando a empresa tem logo
  (`hasInlineLogo`), e o worker anexa o logo como parte inline (`Content-ID`), lido de `company_logos` pela
  `company_id` da mensagem. Trade-offs:

  | Opção                                | A favor                                                                                                                           | Contra                                                                                                                                    |
  | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
  | **`cid:` (escolhida)**               | Logo certo por empresa; aparece sem "carregar imagens" na maioria dos clientes; não depende de domínio público; nada novo exposto | E-mail maior (até 256 KiB a mais); o worker lê `company_logos`; alguns clientes mostram a parte como anexo                                |
  | `/public/landing-logo` (URL pública) | E-mail pequeno; rota e cache já existem; logo é público por natureza (`security.md` §7 permite)                                   | Serve só a empresa da instalação (errado em multi-CNPJ); imagem remota bloqueada por padrão no Outlook; depende da API no ar e do domínio |
  | Rota pública nova por empresa        | Certo por empresa                                                                                                                 | Superfície anônima nova que enumera logos por id; mesmo bloqueio de imagem remota                                                         |
  | `data:` base64 no HTML               | —                                                                                                                                 | Gmail remove; HTML passa do corte de ~102 KB                                                                                              |

  Se o logo sumir entre a gravação e o envio, o worker manda sem a parte inline e o `alt` (nome de exibição) aparece; a
  T0.1 confere no Resend o campo de anexo inline (`content_id`) e no nodemailer o `cid`.

- **D4 — Marcas TransportAdA e Ada por URL pública do painel**, como o e-mail de código: `APP_BASE_URL` (variável nova e
  opcional na API, o worker já tem) + `/icons/icon-192.png` e `/icons/ada-technology.png`. Sem `APP_BASE_URL`, as
  miniaturas saem e o texto "Enviado pelo TransportAdA — uma solução Ada Technology" fica. Nunca base64 no HTML. A T0.1
  confere se o `icon-192.png` é a mesma marca da prévia; se não, entra `public/email/transportada-mark.png` no painel.
- **D5 — Ponto `signer` e regra única do "De".** `OccurrenceMailSigner` =
  `{ kind: 'operator' | 'owner', userId, name, jobTitle?: string }` ou `{ kind: 'team' }`, resolvido pela API no momento do envio:
  manual → `operator` (o ator); automático → `owner` se o leitor de dono devolver alguém, senão `team`; reenvio da 248 →
  o assinante do original (regra exata na D9-b, **Ajustado na T0.2**). A 272 entrega o leitor como porta `OccurrenceOwnerReader` com a implementação nula
  (sempre `undefined`); a 273 troca a implementação. O nome do "De" sai de **uma** função,
  `buildSenderDisplayName({ companyDisplayName, signer })`: `team` → `<nome de exibição>`; `operator`/`owner` →
  `<nome> — <nome de exibição>`. **Pela D12 do dono, o nome-base é sempre o nome de exibição da transportadora**
  (`resolveCompanyDisplayName`), nos dois transportes: o `sender_name` da configuração do Resend deixa de aparecer no
  "De" (continua só como dado da configuração). O endereço continua o da configuração (Resend) ou `EMAIL_FROM`
  (sandbox). A API grava o resultado em `from_display_name` (coluna que **já existe**, reusada na saída — D9); o worker
  usa `from_display_name` nos dois transportes quando não nulo e só cai em `settings.senderName` (Resend) ou no endereço
  puro (sandbox) quando é nulo (saída anterior à 272, encaminhamento a terceiro, correção de endereço), sempre
  por um formatador que codifica o nome (nodemailer: `{ name, address }`; Resend: `"Nome" <endereço>`).
  **Saneamento e tamanho (Ajustado na T0.2 (architect)):** `buildSenderDisplayName` (pura, na API) remove todo
  `\p{Cc}`, U+2028/U+2029, bidi (U+202A–U+202E, U+2066–U+2069) e `<>"\,;`, colapsa espaços e corta **primeiro o nome
  da pessoa** para o total caber em 200 (o CHECK de `from_display_name`; `name`/`trade_name` são `text` sem limite); o
  nome de exibição só é cortado se sozinho passar de 200. Grava já saneado. O worker reaplica o mesmo saneamento,
  espelhado, com tabela de casos idêntica nas duas apps. A T3.1 confirma na doc oficial do Resend se o nome não ASCII é
  codificado (RFC 2047) pelo Resend ou se o gateway precisa codificar.
  `jobTitle?` = o cargo da D10 ou, vazio, o rótulo pt-BR do papel na empresa (D11), pela função pura
  `resolveSignerJobTitle({ jobTitle, directRoles })`, usada por `findOperatorSigner` e pelo leitor de dono; sem cargo e
  sem papel direto → ausente, e a linha do cargo é omitida na assinatura (Ajustado na T0.2 (architect)).
- **D6 — Tabela de itens pelo bloco exato, sem marcador (Ajustado na T0.2 (architect)).** O montador recebe o corpo em
  texto, a lista de itens e o bloco. Um marcador de texto seria forjável (a `observacao` do motorista é interpolada) e
  quebraria o corte de 8000 (`occurrence-contractor-mail-render.policy.ts:43-48`). `renderContractorMail` passa a
  devolver também `itemLinesBlock` (o texto exato injetado, já com as `shown` linhas do corte). Automático, manual e
  reenvio usam uma regra: o parágrafo do `bodyText` igual a `itemLinesBlock` vira a tabela, com as mesmas `shown`
  linhas + "e mais N itens". Bloco vazio nunca casa. No manual, o bloco vem do mesmo leitor da sugestão; bloco editado
  → o texto sai como o operador escreveu. Assim o operador continua editando texto, e nada que ele mudou some.
- **D7 — Assunto com prefixo que não se corta.** `subject = prefixo + ' — ' + cortar(assunto do modelo, 200 −
tamanho(prefixo + ' — '))`, com o prefixo `<nome de exibição> · CNPJ <cnpj formatado>`. O corte da 269 (200) fica
  como limite do assunto inteiro. **Ajustado na T0.2 (architect):** no prefixo, o nome de exibição passa pelo colapso
  da D5 e é cortado em 80 (prefixo de no máximo 109 caracteres; o modelo fica com ao menos 91). `applySubjectPrefix` é
  idempotente: assunto que já começa pelo prefixo da empresa não é prefixado de novo (defesa para painel antigo e
  reenvio).
- **D8 — Prévia igual ao envio, pela rota que já existe (Ajustado na T0.2).** Sem rota nova: a prévia
  `POST /trip-occurrences/:id/conversations/contractor/mail-preview` (`occurrences.resolve`) já aceita o texto editado
  (`body`) e já devolve `html`/`subject`/`text`. Passa a devolver em `html` o HTML do layout novo e ganha
  `fromDisplayName`, a partir do `body` quando vier, senão do texto sugerido. O diálogo chama a mesma rota com atraso
  de 400 ms e mostra o HTML num `iframe` com `sandbox` (sem script).
  **Assunto (Ajustado na T0.2 (architect)):** o diálogo devolve o assunto da prévia no `POST`
  (`SendToContractorDialog.component.tsx:103`, `setSubject(preview.subject)`) e a prévia trata o `subject` recebido como
  digitado (`preview-occurrence-mail.use-case.ts:110`, :119). Por isso `subject` continua a parte do modelo (editável,
  sem prefixo); a prévia ganha `fullSubject` (o assunto como sai) só para exibir; o painel nunca devolve `fullSubject`.
  **Logo (Ajustado na T0.2 (architect)):** `cid:company-logo` não resolve em `iframe` `srcDoc`, a CSP do painel não
  aceita `data:` (`contentSecurityPolicy.service.ts:161`, `img-src 'self' blob:`) e `GET /company-settings/logo` exige
  `settings.manage`. A prévia, na primeira chamada (sem `body`), devolve `inlineLogo?: { mimeType, contentBase64 }`;
  o painel cria uma URL `blob:` uma vez e troca `cid:company-logo` só no `srcDoc`; `html` não muda (critério 12).
  Fallback: se o `blob:` do pai não carregar na origem opaca, `sandbox="allow-same-origin"` sem `allow-scripts`
  (registrado na ADR); senão, a prévia mostra o `alt` (RF12 da spec). A rota ganha balde
  próprio `OCCURRENCE_MAIL_PREVIEW_RATE_LIMIT` (escopo `occurrence-mail-preview`, 120 por 300 s, `postgres`) — o de
  mensagens (30 por 300 s) esgotaria o envio enquanto o operador digita; no 429 o painel mantém o último HTML.
  Destinatários e cópia continuam na resposta; se pesar na medição da T5.1, extrair caso de uso interno que só monta o
  HTML (sem buscar destinatários e cópia a cada pausa), sem endpoint — decisão depois da medição.
- **D9 — Gravar o que saiu (Ajustado na T0.2).** Quatro colunas novas em `contractor_mail_messages` (migration
  aditiva): `signer_kind varchar(16)` com CHECK (`operator`,`owner`,`team`), `signer_user_id uuid`, `layout_version
smallint` (1 = 272) e `has_inline_logo boolean not null default false`. **`from_display_name` já existe** (spec 183,
  `text` com CHECK ≤ 200, gravada só na entrada) e é **reusada** na saída com o mesmo significado (nome do `From`); a
  leitura do histórico só a usa na entrada. Invariante: saída com `layout_version = 1` ⇔ `from_display_name` não nulo.
  **Ajustado na T0.2 (architect):** a invariante vai ao banco, em três CHECKs da mesma migration (as linhas atuais
  passam): `direction <> 'outbound' or ((layout_version is null) = (from_display_name is null))`;
  `(layout_version is null) = (signer_kind is null)`; `(signer_kind in ('operator','owner')) = (signer_user_id is not
null)`. `signer_user_id` sem FK de propósito: o vínculo pode ser apagado (ADR-0076) e a mensagem é histórico.
  O worker decide pelo `from_display_name`, só em `direction = 'outbound'` (`findMessageById` em
  `drizzle-contractor-mail-outbound-worker.repository.ts:112-130` passa a ler `direction`; sugestão do architect
  adotada); a API decide reenvio e histórico pelo `layout_version`. `body_html` já existe e passa a guardar o HTML
  novo.
  - **D9-b — Reenvio da 248.** `findOriginalRequest` lê também `layout_version`, `signer_kind`, `signer_user_id` e o
    autor da mensagem original; o reenvio passa o assinante ao envio (o ator continua quem reenvia, para a trilha).
    Assinante: original com layout → mesmo `signer_kind`/`signer_user_id`, nome e cargo lidos no reenvio; original
    anterior à 272 → o autor da mensagem original como `operator`, ou `team` se automático (emenda a assunção A2);
    **Vínculo (Ajustado na T0.2 (architect)):** o assinante pessoa exige membership ativa; se o original é `owner`,
    também a elegibilidade da ADR-0109 (pela porta); senão → `team`. Assunto: original com `layout_version = 1` → o
    gravado, **como está** (já prefixado; nada reaplicado nem recortado), título = trecho depois do primeiro `—` que
    segue ` · CNPJ <cnpj formatado>` (ou o assunto inteiro), por uma função de leitura pura testada com nome de exibição
    que contém "—"; original sem layout → prefixo pela D7 (idempotente). O reenvio sai sempre no layout novo, com
    `has_inline_logo` do momento.
- **D10 — Cargo livre por usuário na empresa (D13 do dono).** Coluna `user_company_memberships.job_title varchar(80)
null` (o cargo é **na empresa**: a mesma pessoa pode ter cargos diferentes em dois CNPJs; o perfil de identidade é por
  pessoa e é sincronizado com o Keycloak, o cargo não). Saneamento numa política pura (`company-user-job-title.policy.ts`):
  tira caractere de controle, quebra de linha e bidi (U+202A–U+202E, U+2066–U+2069; Ajustado na T0.2 (architect)),
  colapsa espaços, `trim`; vazio → `null`; mais de 80 → 400. CHECK no
  banco `job_title is null or (length(job_title) between 1 and 80)`.
  - **Quem edita:** quem tem `users.manage`, pela rota que já edita o perfil (`PATCH /company-users/:id`, campo
    opcional `jobTitle: string | null`; ausente não altera, `null`/`""` limpa). É o padrão existente: todo dado da ficha
    do usuário é editado pelo administrador nessa rota, e não há rota de perfil próprio — criar uma só para o cargo
    abriria superfície nova (e a pergunta de quem edita nome e contato) por um campo. Edição pelo próprio usuário fica
    fora do escopo.
  - **Isolamento:** o caso de uso já acha o usuário pela empresa do token → usuário de outra empresa é 404 (contrato
    negativo novo cobrindo o `jobTitle`). O `UPDATE` de `job_title` filtra por `(user_id, company_id)`.
  - **Auditoria:** não grava, seguindo o padrão do módulo para o perfil (`update-company-user-profile.use-case.ts` não
    audita; status, senha, permissões e grupos auditam). O cargo é texto de ficha, não acesso.
  - **Leitura (Ajustado na T0.2):** a resposta sai de `toCompanyUserView` (`company-user.policy.ts`), não de
    `serializeCompanyUser` (que só espalha): `jobTitle: string | null` entra em `MEMBERSHIP_COLUMNS`,
    `CompanyUserRecord`, `CompanyUserViewSource` e `toCompanyUserView`. `findOperatorSigner` (e o leitor de dono da 273) leem `job_title` da membership ativa na mesma consulta do nome.
  - **Gravação (Ajustado na T0.2):** método novo no repositório, `updateJobTitle({ companyId, userId, jobTitle })`,
    `UPDATE` em `user_company_memberships` por `(user_id, company_id)` (o `updateProfile` de hoje filtra só por pessoa).
    Corpo só com `jobTitle` **não chama o Keycloak** (o caso de uso hoje sempre sincroniza e falharia com ele fora).
  - **Painel (Ajustado na T0.2):** a guarda `toCompanyUser` ignora chave extra; não há fase tolerante para `jobTitle`
    — a T1.2 vira só o teste que prova a tolerância.
  - **Log:** o cargo não entra em log (texto livre pode ter nome de pessoa).
- **D11 — Rótulo do papel (Ajustado na T0.2).** A API não tem rótulos pt-BR de `CompanyRole`. Mapa
  `COMPANY_ROLE_LABELS` em `identity/domain/company-role-label.constant.ts` (`satisfies Record<CompanyRole, string>`),
  copiado de `identity.locale.json` (`role.*`) do painel, mais `contractor: 'Contratante'` e `automation: 'Automação'`.
  `operator` = **"Operação"** (o rótulo do catálogo; "Operador" na spec era exemplo do dono). Paridade por contrato que
  lê o JSON do painel por caminho relativo dentro do teste (precedente `mail-template-variable-parity.contract.ts`).
  Vários papéis → o primeiro na ordem de `COMPANY_ROLES`; só papéis diretos (`membership_roles`), não os de grupo.
  Sem cargo e sem papel direto → linha do cargo omitida (`resolveSignerJobTitle`, D5).
- **D12 — CNPJ ou CPF da contratante (Ajustado na T0.2).** De `feed.document.contractor.taxId`, repassado por
  `findOccurrenceTarget`. 11 dígitos → "CPF" `000.000.000-00`; 14 caracteres → "CNPJ" por `formatCnpjForDisplay`
  (alfanumérico); vazio ou outro tamanho → a linha não aparece.
- **D13 — Janela de deploy aceita (Ajustado na T0.2).** API e worker no mesmo PR e no mesmo run (`deploy-api` →
  `deploy-services`, sequencial). Nos minutos entre os dois, o worker velho manda o HTML novo sem a parte inline (o `alt`
  com o nome de exibição aparece) e o "De" antigo: só visual. Rejeitadas: variável que liga o `cid` na API (duas
  publicações e uma variável que vira lixo) e worker antes (lê colunas que a migration da API cria). Job do worker
  vermelho = parar e perguntar (regra do dono).

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

| Camada     | Arquivo (novo ou alterado)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constantes | `occurrence-conversation/domain/occurrence-mail-layout.constant.ts` (novo): cores, `COMPANY_LOGO_CONTENT_ID`, caminhos das marcas, `OCCURRENCE_MAIL_LAYOUT_VERSION = 1`, `SIGNER_KINDS`                                                                                                                                                                                                                                                                                 |
| Tipos      | `occurrence-conversation/types/occurrence-mail-layout.types.ts` (novo): `OccurrenceMailView`, `OccurrenceMailSigner`, `BuildOccurrenceMailLayoutResult`                                                                                                                                                                                                                                                                                                                 |
| Domínio    | `occurrence-mail-layout.policy.ts` (montador, D1/D2), `occurrence-mail-layout-blocks.policy.ts` (cabeçalho, resumo, assinatura, rodapé), `occurrence-mail-items-table.policy.ts` (tabela e D6), `occurrence-mail-sender-name.policy.ts` (D5), `occurrence-mail-subject.policy.ts` (D7), `resolveSignerJobTitle` (D5/D11) — todos puros                                                                                                                                  |
| Leitura    | `drizzle-occurrence-mail.repository.ts`: `findOccurrenceTarget` devolve o CNPJ da contratante; `findCarrierIdentity` (nome de exibição, razão social, CNPJ, cidade, UF, `hasLogo`) no lugar de `findCarrierName`; `findOperatorSigner` (nome + `job_title` da membership, senão o rótulo do papel, numa consulta)                                                                                                                                                       |
| Porta      | `occurrence-conversation/application/occurrence-owner-reader.port.ts` (novo, implementação nula; a 273 substitui)                                                                                                                                                                                                                                                                                                                                                       |
| Casos      | `send-occurrence-mail.use-case.ts` (assinante, view, `from_display_name`, colunas D9), `send-automatic-occurrence-mail.use-case.ts` (assinante `owner`/`team`), `preview-occurrence-mail.use-case.ts` (`html` do layout novo, `fromDisplayName`), reenvio da 248 (`resend-contractor-reply-request.use-case.ts` + `drizzle-contractor-reply-resend.repository.ts`: assinante e layout do original, D9-b)                                                                |
| Rotas      | `occurrence-conversation.routes.ts`: balde `OCCURRENCE_MAIL_PREVIEW_RATE_LIMIT` na prévia (D8); OpenAPI da prévia                                                                                                                                                                                                                                                                                                                                                       |
| Config     | `config/environment.schema.ts`: `APP_BASE_URL` opcional (URL https ou localhost)                                                                                                                                                                                                                                                                                                                                                                                        |
| Usuários   | `database/identity.schema.ts` (`jobTitle`), `identity/domain/company-user-job-title.policy.ts` (novo, puro), `user-administration.schema.ts` (`jobTitle` opcional), `update-company-user-profile.use-case.ts` (só `jobTitle` → sem Keycloak), repositório (`updateJobTitle` por `(user_id, company_id)`, `MEMBERSHIP_COLUMNS`), `company-user.port.ts`, `toCompanyUserView` (`company-user.policy.ts`), `identity/domain/company-role-label.constant.ts` (D11); OpenAPI |
| Schema     | `database/contractor-mail.schema.ts` + migration aditiva + `rollback.sql`                                                                                                                                                                                                                                                                                                                                                                                               |

O montador de hoje (`buildOccurrenceMail`) fica só para o encaminhamento a terceiro (248).

### Worker (`apps/worker-transportada`)

- `database/contractor-mail.schema.ts`: as colunas D9 (espelho); schema mínimo de `company_logos` (leitura).
- `send-contractor-mail-outbound-message.use-case.ts`: "De" por `from_display_name` (D5) nos dois transportes; parte
  inline do logo quando `has_inline_logo` (porta `CompanyLogoReader`).
- `resend-mail.gateway.ts`: anexo inline com `content_id`; `sandbox-smtp-mail.gateway.ts`: `from: { name, address }` e
  anexo com `cid`.
- `infrastructure/drizzle-company-logo.reader.ts` (novo).

### Painel (`apps/frontend-transportada`)

- Guardas da prévia (`html`, `fromDisplayName`), do histórico (`fromDisplayName`, `signerKind`) e de usuário
  (`companyUsersResponse.validation.ts`, `jobTitle`) já ignoram chave extra (Ajustado na T0.2): a Fase 1 só prova com
  teste; tipar e ler as chaves entra com as telas (Fase 4).
- `CompanyUserEditDialog.component.tsx`: campo "Cargo" (texto, até 80, contador, ajuda "Aparece na assinatura dos
  e-mails de ocorrência"), enviado no `PATCH` existente; lista de usuários mostra o cargo abaixo do nome. Locales.
- Diálogo de envio manual: aba/área "Como chega" com o HTML num `iframe sandbox` (D8), alimentado pela prévia existente
  com atraso (no 429, mantém o último HTML); o texto editável continua como está. Locales pt-BR/en.

### Infra

- `.railway/railway.ts`: `APP_BASE_URL` na API como `preserve()` (o worker já tem). `.env.example`.

## Coordenação com a 273

| Ponto de colisão                         | A 272 entrega                                                                                                                                                                                                                                       | A 273 faz depois                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assinatura                               | `OccurrenceMailSigner` com `kind: 'owner'` já desenhado e testado por injeção; porta `OccurrenceOwnerReader.findEligibleOwner({ companyId, occurrenceId, kind }) → { userId, name, jobTitle?: string } \| undefined` (Ajustado na T0.2 (architect)) | Implementa a porta; a elegibilidade (ADR-0109 §7) é da implementação — nenhuma mudança no montador                                                                                                                                                                                                     |
| "De"                                     | `buildSenderDisplayName` (`<nome> — <nome de exibição>`) e `from_display_name` gravado                                                                                                                                                              | Nada: o RF7 da 273 sai da mesma função ao devolver o dono. **Colisão resolvida (D12):** a 273 RF7 dizia `<nome do dono> — <nome do remetente da empresa>`; passa a herdar a regra da 272, `<nome do dono> — <nome de exibição>`. O RF7 e o critério 10 da 273 **já foram atualizados** (273 `spec.md`) |
| Cargo na assinatura                      | `job_title` na membership (D10) lido junto do nome; `resolveSignerJobTitle` pura                                                                                                                                                                    | O leitor de dono devolve `jobTitle` pela mesma função                                                                                                                                                                                                                                                  |
| Template (`occurrence-mail.template.ts`) | Deixa de ser usado no envio de ocorrência (só no encaminhamento)                                                                                                                                                                                    | Não toca no template; a T3.3 da 273 vira "passar o dono ao `signer`"                                                                                                                                                                                                                                   |
| Dono em cópia (273 RF8)                  | Não mexe na cópia                                                                                                                                                                                                                                   | Mexe em `resolve-mail-copy.service.ts`, fora dos arquivos da 272                                                                                                                                                                                                                                       |

**Ordem de publicação:** 269 + 270 + 271 (juntas) → **272** → 273. Se a 273 ficar pronta antes da 272 chegar a
`staging`, a 273 rebaseia sobre a 272 e a T3.3 dela se reduz à porta. A ADR-0110 cita a 0109 como consumidora do ponto
`signer`. Registrar esta tabela também no `evidence.md` da 273 quando ela for executada.

## Contratos

- `POST /trip-occurrences/:id/conversations/contractor/mail-preview` (existente, `occurrences.resolve`; **Ajustado na
  T0.2**, sem rota nova): `html` passa a ser o HTML do layout novo; `subject` continua a parte do modelo, sem prefixo
  (Ajustado na T0.2 (architect)); ganha `fromDisplayName: string`, `fullSubject: string` (o assunto como sai, só para
  exibir; o painel nunca o devolve) e, na chamada sem `body`, `inlineLogo?: { mimeType, contentBase64 }`; corpo
  `.strict()` `{ body?, subject? }` não muda. Balde próprio de `rateLimit` (429).
  Ocorrência de outra empresa → 404; sem permissão → 403; não grava nada.
- Histórico de mensagens da conversa: ganha `fromDisplayName`, `signerKind` (opcionais; painel tolerante antes).
- `PATCH /company-users/:id` (existente, `users.manage`): corpo ganha `jobTitle?: string | null` (`.strict()` continua);
  mais de 80 caracteres depois do saneamento → 400 com o erro de validação de sempre; usuário de outra empresa → 404;
  sem `users.manage` → 403. Respostas de usuário (lista, detalhe, `PATCH`) ganham `jobTitle: string | null`.

## Dados, migration e rollback

Migration aditiva `contractor_mail_message_layout`: as **quatro** colunas da D9 (`from_display_name` já existe; Ajustado
na T0.2); CHECK `signer_kind IN ('operator','owner','team')` e os três CHECKs da invariante da D9 (Ajustado na T0.2
(architect)); `signer_user_id` sem FK. `rollback.sql`: `DROP CONSTRAINT` + `DROP COLUMN` das quatro. Sem backfill
(mensagens antigas ficam com nulos e são mostradas como hoje).

Migration aditiva `user_company_membership_job_title` (D10): `job_title varchar(80) null` + CHECK de tamanho.
`rollback.sql`: `DROP CONSTRAINT` + `DROP COLUMN`. Sem backfill (todos começam sem cargo e caem no rótulo do papel).
Aplica, reverte, reaplica; `db:generate` → `no_changes`.

## Testes (antes da implementação)

- Montador: golden file do HTML para o critério 1 (automático, Resend, com logo) e variantes (sem logo, sandbox, manual,
  parada sem nota — critério 8, só no montador: num envio real, sem nota não há contratante nem e-mail —, sem
  `APP_BASE_URL`); teste de forma (sem `display:grid|flex`, `var(`, `<script`, `@import`); escape
  com `<b>x</b> & "y"`; 200 itens < 100 KB; 201 itens com "e mais 1 item".
- D5: tabela de casos de `buildSenderDisplayName` (team/operator/owner; nome com `<`, `"`, `\`, `,`, `;`, quebra de
  linha, U+2028, bidi; total acima de 200 corta o nome da pessoa primeiro), idêntica no worker; `resolveSignerJobTitle`
  (cargo, papel, nenhum → ausente); o
  `sender_name` da configuração do Resend **nunca** aparece no "De" de mensagem da 272 (critério 5 da spec); mensagem
  com `from_display_name` nulo (anterior à 272, encaminhamento, correção de endereço) cai no comportamento de hoje.
- D9-b: reenvio de original com layout não duplica o prefixo do assunto; reenvio de original anterior à 272 prefixa;
  assinante do original (operador, dono, equipe, pessoa sem vínculo → equipe, dono não mais elegível → equipe); leitura
  do título com nome de exibição contendo "—".
- D11: contrato de paridade dos rótulos de papel com `identity.locale.json`; vários papéis → primeiro do catálogo.
- D12: contratante com CPF, com CNPJ alfanumérico e sem documento.
- D10: tabela de casos do saneamento (quebra de linha, controle, espaços, 80 e 81 caracteres, vazio → `null`);
  contratos do `PATCH` (ausente não altera, `null` limpa, 400, 403, 404 de outra empresa); assinatura com cargo e sem
  cargo (rótulo do papel).
- D6: bloco intacto → tabela; bloco editado → texto; observação com texto parecido com o bloco não vira tabela; bloco
  vazio não casa; corte com "e mais N itens" mantém as mesmas `shown` linhas.
- D7: assunto do modelo com 300 caracteres; nome de exibição acima de 80 cortado no prefixo; `applySubjectPrefix`
  idempotente (assunto já prefixado não ganha segundo prefixo); o `subject` da prévia reenviado ao `POST` gera
  exatamente um prefixo.
- D9: os três CHECKs recusam linha incoerente e aceitam as atuais.
- Worker: Resend recebe `from` com nome, anexo inline com `content_id` quando `has_inline_logo`; sandbox idem pelo
  nodemailer dublê; logo ausente → envia sem a parte inline.
- Integração: envio manual e automático gravam as colunas D9; reenvio da 248 repete layout e assinante.
- Critério 12: o `html` da prévia é igual (string) ao `body_html` gravado para o mesmo texto e o mesmo ator.

## Publicação

1. Painel tolerante: as guardas da prévia, do histórico e de usuário já ignoram chave extra (T0.1 (g)/(h)); a Fase 1
   escreve os testes que provam isso. Verde sem mudar código → não há deploy da Fase 1 (T1.3 vira registro); vermelho →
   tolerância → `staging` → `main` com aprovação humana.
2. API + worker + as duas migrations aditivas, **no mesmo PR e no mesmo run** (`deploy-api` → `deploy-services`,
   sequencial — Ajustado na T0.2, D13). Janela de minutos aceita: o worker velho manda o HTML novo sem a parte inline
   (aparece o `alt`) e o "De" antigo. A T5.4 confere os dois jobs verdes; worker fora do run = parar e perguntar.
3. Telas (prévia no diálogo e campo "Cargo" em Usuários) → `staging`.
   Antes de `main`, a T5.4 faz um envio real pelo Resend (nome não ASCII no "De") (Ajustado na T0.2 (architect)). 272 e
   273 geram `snapshot.json` do mesmo pai (`20261017041702_…`): quem chegar depois a `staging` regenera migration e
   snapshot.
4. Produção só com aprovação humana, na mesma ordem, depois de 269 + 270 + 271.

## Riscos

- **Outlook e imagens**: miniaturas do rodapé (URL remota) bloqueadas até o usuário liberar; o texto fica. Aceito (como
  o e-mail de código).
- **E-mail maior** com o logo inline: até 256 KiB por mensagem; o teto do Resend é 40 MB. Aceito.
- **Cliente que mostra a parte inline como anexo** (alguns webmails): aceito; o `Content-Disposition: inline` reduz.
- **Prévia do painel com HTML de terceiros**: o HTML é nosso e escapado, e o `iframe` tem `sandbox` sem script.
- **Marcas na prévia** (registro do architect, sem ação): se `APP_BASE_URL` não for a origem do painel, a CSP `img-src`
  do painel bloqueia as miniaturas na prévia; no e-mail elas aparecem.
