# ADR 0110 — O e-mail da ocorrência sai em HTML

- **Status:** aceita (2026-10-18) — T0.2 da spec 272; validada pelo `architect` (opus), aprovada com ajustes, todos
  aplicados abaixo (registro em `evidence.md` da 272, § T0.2 — Validação do architect).
- **Data:** 2026-10-18
- **Nasce da spec 272:** o e-mail de ocorrência à contratante sai no desenho aprovado pelo dono (versão 10 do artefato,
  `specs/272-o-email-da-ocorrencia-sai-em-html/desenho-aprovado.html`), montado pelo servidor em volta do texto do
  modelo da 271, com o "De" e a assinatura identificando a transportadora e quem escreveu.
- **Mantém:** a [ADR-0108](0108-o-modelo-do-email-a-contratante-vem-do-modulo-de-notificacao.md) inteira — o modelo
  continua texto (corpo HTML recusado), `{{camelCase}}` da lista fechada, `{{linhasItens}}` com formato fixo.
- **Emenda:** a spec 268 (o "De" do sandbox ganha nome; a faixa de resposta some sem `Reply-To`) e a spec 248 (o
  reenvio repete o assinante do original, não quem reenvia).
- **Consumidora:** a [ADR-0109](0109-a-ocorrencia-tem-dono.md) (spec 273, `work/spec-273`) implementa a porta de dono
  que esta ADR cria e herda a regra do "De" (§5).
- **Base factual:** `evidence.md` da 272, § Levantamento e § T0.1 (conferido contra `origin/staging` 68613c0f9).

## Contexto

- O e-mail já é `multipart/alternative`: `buildOccurrenceMail` devolve `{ html, subject, text }`, a API grava
  `body_html`/`body_text` em `contractor_mail_messages` e o worker manda as duas partes, no Resend e no sandbox. Só
  falta o desenho: hoje o HTML é `<p>` escapado com `--`/operador/transportadora.
- O texto chega pronto de `renderContractorMail` (assunto cortado em 200, corpo em 8000, `linhasItens` fixo). No
  manual, o operador pede a prévia, pode editar e o `POST` manda o texto pronto.
- O logo da transportadora mora no Postgres (`company_logos`, até 256 KiB), não no bucket. A rota anônima
  `/public/landing-logo` serve só a empresa da instalação — uma transportadora pode ter mais de um CNPJ.
- O worker já tem um e-mail com desenho (`code-email-template.service.ts`): tabelas, paleta e marcas por
  `APP_BASE_URL` + `/icons/...`. O `icon-192.png` do painel é byte a byte a marca da prévia aprovada.
- A prévia do diálogo (`POST /trip-occurrences/:id/conversations/contractor/mail-preview`, `occurrences.resolve`) já
  aceita o texto editado (`body`) e já devolve `html`/`subject`/`text`. Não tem `rateLimit`.
- `contractor_mail_messages.from_display_name` já existe (spec 183): gravada e lida só no trilho de entrada; a saída
  nunca a escreve e o worker não a lê para enviar.
- O deploy publica API e worker no mesmo run, **em sequência** (`deploy-api` → `deploy-services`), e o worker só sai
  se o diff o tocar. As migrations rodam no `preDeployCommand` da API.
- A API não tem rótulos pt-BR de `CompanyRole`; eles moram em `identity.locale.json` do painel (`operator` é
  "Operação").

## Decisão

1. **O servidor monta; o modelo continua texto.** Um montador puro na API, `buildOccurrenceMailLayout(view)` →
   `{ subject, html, text }`, é a única fonte do HTML: envio manual, automático, reenvio da 248 e prévia chamam ele.
   O encaminhamento a terceiro (248) e a correção de endereço (150) seguem no montador de hoje.
2. **Sem biblioteca.** Funções TS que devolvem string, com tabelas e estilos inline, cada bloco num arquivo sob 200
   linhas; todo valor por `escapeMailHtml`; cores fixas e `color-scheme: light only`. mjml traria dependência pesada,
   react-email traria React à API, juice resolveria só o inline que já escrevemos direto.
3. **Logo da transportadora por `cid:`.** Com logo, o HTML referencia `cid:company-logo` e grava
   `has_inline_logo = true`; o worker lê `company_logos` pela `company_id` da mensagem e anexa a parte inline
   (`content_id` no Resend, `cid` no nodemailer). Logo sumido entre gravar e enviar → sai sem a parte, e o `alt` (nome
   de exibição) aparece. Rejeitados: `/public/landing-logo` (só a empresa da instalação; imagem remota bloqueada no
   Outlook), rota anônima nova por empresa (superfície que enumera logos) e `data:` (Gmail remove; passa de ~102 KB).
4. **Marcas TransportAdA e Ada por `APP_BASE_URL`** (variável nova e opcional na API; o worker já tem) +
   `/icons/icon-192.png` e `/icons/ada-technology.png`. Sem a variável, as miniaturas saem e o texto fica. Nunca base64.
5. **Ponto `signer` e uma regra para o "De".** `OccurrenceMailSigner` = `{ kind: 'operator' | 'owner', userId, name,
jobTitle?: string }` ou `{ kind: 'team' }`. Manual → `operator` (o ator); automático → `owner` se a porta
   `OccurrenceOwnerReader` devolver alguém, senão `team` (a 272 entrega a porta com implementação nula; a 0109
   implementa). Contrato da porta: `findEligibleOwner({ companyId, occurrenceId, kind }) → { userId, name, jobTitle?:
string } | undefined`; a elegibilidade (ADR-0109 §7) é da implementação (`kind` já existe em `findOccurrenceTarget`,
   `item.source`). `buildSenderDisplayName({ companyDisplayName, signer })` (pura, na API): `team` →
   `<nome de exibição>`; pessoa → `<nome> — <nome de exibição>`. O nome-base é **sempre** o nome de exibição da
   transportadora (`resolveCompanyDisplayName`), nos dois transportes (D12 do dono): o `sender_name` do Resend sai do
   "De". O endereço não muda (configuração do Resend ou `EMAIL_FROM`). **Saneamento e tamanho** (ajustado na T0.2,
   architect): a função remove todo `\p{Cc}`, U+2028/U+2029, os caracteres bidi (U+202A–U+202E, U+2066–U+2069) e
   `<>"\,;`, colapsa espaços e, para o total caber em 200 (o CHECK de `from_display_name`; `name` e `trade_name` são
   `text` sem limite), corta **primeiro o nome da pessoa** (o nome de exibição só é cortado se sozinho passar de 200);
   a API grava o valor já saneado. O worker reaplica o **mesmo** saneamento, espelhado, com tabela de casos idêntica nas
   duas apps (defesa em profundidade, sem `import` entre apps), e formata (nodemailer `{ name, address }`; Resend
   `"Nome" <endereço>`). Se o Resend não codificar nome não ASCII (RFC 2047) sozinho, o gateway codifica — a T3.1
   confirma na doc oficial e a T5.4 faz um envio real pelo Resend antes de `main`. `jobTitle` = cargo (§12) ou, vazio,
   o rótulo do papel (§11), pela função pura `resolveSignerJobTitle({ jobTitle, directRoles })`, usada por
   `findOperatorSigner` e pelo leitor de dono; sem cargo e sem papel direto → `jobTitle` ausente e a linha do cargo é
   omitida na assinatura.
6. **Tabela de itens pelo bloco exato, sem marcador** (ajustado na T0.2, architect). Um marcador de texto seria
   forjável (a `observacao` do motorista é interpolada no corpo) e quebraria o corte de 8000
   (`occurrence-contractor-mail-render.policy.ts:43-48`). `renderContractorMail` passa a devolver também
   `itemLinesBlock`: o texto exato injetado no lugar de `{{linhasItens}}`, já com as `shown` linhas que sobraram do
   corte. Automático, manual e reenvio usam **uma** regra: o parágrafo do `bodyText` igual a `itemLinesBlock` vira a
   tabela, com as mesmas `shown` linhas e "e mais N itens". Bloco vazio nunca casa. No manual, o bloco vem do mesmo
   leitor da sugestão; se o operador editou o bloco, o texto sai como ele escreveu.
7. **Assunto com prefixo que não se corta.** `<nome de exibição> · CNPJ <cnpj> — ` + o assunto do modelo cortado em
   `200 − tamanho(prefixo)`. O prefixo é montado só sobre assunto que veio do modelo ou do diálogo (§10 trata o
   reenvio). No prefixo, o nome de exibição passa pelo mesmo colapso de §5 e é cortado em 80 (com o CNPJ formatado, o
   prefixo tem no máximo 109 caracteres e o modelo fica com ao menos 91). `applySubjectPrefix` é **idempotente**:
   assunto que já começa pelo prefixo da empresa não é prefixado de novo (defesa para painel antigo e reenvio; ajustado
   na T0.2, architect).
8. **A prévia é a rota que já existe** (ajustado na T0.2; a rota nova `…/contractor-mail/rendered` do plano caiu). A
   prévia passa a devolver em `html` o HTML do layout novo e ganha `fromDisplayName`, a partir do `body` editado quando
   vier, senão do texto sugerido. O painel chama a mesma rota com atraso ao editar. **Assunto** (ajustado na T0.2,
   architect): o diálogo devolve o assunto da prévia no `POST` (`SendToContractorDialog.component.tsx:103`) e a prévia
   trata o `subject` recebido como digitado (`preview-occurrence-mail.use-case.ts:110`, :119), então `subject` continua
   a parte do modelo (editável, sem prefixo); a prévia ganha `fullSubject` (o assunto como sai) só para exibir; o painel
   nunca devolve `fullSubject`. **Logo na prévia** (ajustado na T0.2, architect): `cid:company-logo` não resolve num
   `iframe` `srcDoc`, a CSP do painel não aceita `data:` (`contentSecurityPolicy.service.ts:161`, `img-src 'self'
blob:`) e `GET /company-settings/logo` exige `settings.manage`. Decisão: a prévia, na primeira chamada (sem `body`),
   devolve `inlineLogo?: { mimeType, contentBase64 }`; o painel cria uma URL `blob:` uma vez e troca
   `cid:company-logo` por ela **só no `srcDoc`** — o `html` devolvido não muda (critério 12: `html` da prévia ==
   `body_html`). Fallback, na ordem: se o `blob:` do pai não carregar no `iframe` de origem opaca, `sandbox` ganha
   `allow-same-origin` **sem** `allow-scripts` (registrar aqui quando adotado); se nem assim, a prévia mostra o `alt`
   (nome de exibição) no lugar do logo, declarado no RF12 da spec. A T4.1 prova no navegador qual caso vale.
   Ganha balde próprio de `rateLimit` (`OCCURRENCE_MAIL_PREVIEW_RATE_LIMIT`, escopo `occurrence-mail-preview`, 120 por
   300 s, `postgres`), separado do de mensagens (30 por 300 s), para que redigir não esgote o envio; o painel guarda o
   último HTML no 429. Os destinatários e a cópia continuam na resposta; se o custo pesar na medição da T5.1, extrai-se
   um caso de uso interno que só monta o HTML (sem buscar destinatários e cópia a cada pausa), sem endpoint novo.
9. **Gravar o que saiu.** Migration aditiva com **quatro** colunas em `contractor_mail_messages`: `signer_kind
varchar(16)` (CHECK `operator`/`owner`/`team`), `signer_user_id uuid`, `layout_version smallint` (1 = 272) e
   `has_inline_logo boolean not null default false`. **`from_display_name` é reusada** (ajustado na T0.2): já existe com
   CHECK ≤ 200, e na saída passa a guardar o nome do "De" — o mesmo significado que tem na entrada (o nome de exibição
   do cabeçalho `From`); a leitura do histórico só a usa para mensagem de entrada (`toAuthor` retorna antes na saída).
   Invariante **no banco** (ajustado na T0.2, architect), três CHECKs na mesma migration, que as linhas atuais passam:
   `direction <> 'outbound' or ((layout_version is null) = (from_display_name is null))`;
   `(layout_version is null) = (signer_kind is null)`; `(signer_kind in ('operator','owner')) = (signer_user_id is not
null)`. `signer_user_id` fica **sem FK de propósito**: o vínculo pode ser apagado (ADR-0076) e a mensagem é
   histórico. **O worker decide pelo `from_display_name`**, e só em mensagem com `direction = 'outbound'` (na entrada a
   coluna é o remetente da contratante; `findMessageById` passa a ler `direction`): não nulo → é o nome do "De"; nulo
   (saída anterior à 272, encaminhamento a terceiro, correção de endereço) → o comportamento de hoje
   (`settings.senderName` no Resend, endereço puro no sandbox). A API decide o reenvio e o histórico pelo
   `layout_version`.
10. **Reenvio da 248 repete o original** (ajustado na T0.2). `findOriginalRequest` passa a ler também
    `layout_version`, `signer_kind`, `signer_user_id` e o autor da mensagem original, e o reenvio passa o assinante ao
    envio (o ator continua sendo quem reenvia, para a trilha e a autoria da mensagem na conversa):
    - **Assinante:** original com layout → o mesmo `signer_kind`/`signer_user_id`, com nome e cargo lidos no reenvio
      (a pessoa é a mesma; o texto do cargo é o de hoje); `team` → `team`. Original anterior à 272 → o autor da
      mensagem original como `operator`, ou `team` se foi automático (emenda a assunção A2, que dizia sempre `team`:
      o RF8 pede "a assinatura do envio original", e o e-mail de antes já saía assinado pelo operador). **Vínculo**
      (ajustado na T0.2, architect): o assinante pessoa exige membership ativa na empresa; se o original é `owner`,
      também a elegibilidade da ADR-0109 (pela porta `OccurrenceOwnerReader`); senão → `team`. O "De" sai de
      `buildSenderDisplayName` com esse assinante.
    - **Assunto:** original com `layout_version = 1` → o assunto gravado é reusado **como está** (já tem o prefixo;
      nada é reaplicado nem recortado); o título do HTML é o trecho depois do primeiro `—` que segue
      ` · CNPJ <cnpj formatado>`, ou o assunto inteiro se o padrão não casar — uma função de leitura pura, testada com
      nome de exibição que contém "—". Original sem layout → o assunto gravado é do modelo: recebe o prefixo pela §7,
      como um envio novo (a idempotência da §7 impede prefixo duplo também aqui).
    - **Layout:** o reenvio sempre sai no layout novo (`layout_version = 1`), com `has_inline_logo` do momento.
11. **Rótulo do papel na API, igual ao do painel.** `COMPANY_ROLE_LABELS` (`identity/domain/company-role-label.constant.ts`,
    `satisfies Record<CompanyRole, string>`, papel novo reprova o typecheck) copia os rótulos de `identity.locale.json`
    (`role.*`) e acrescenta `contractor: 'Contratante'` e `automation: 'Automação'`, que o painel não rotula e nenhuma
    assinatura humana alcança. **O rótulo é o do catálogo do painel** — `operator` assina "Operação", não "Operador"
    (o "Operador" da spec era exemplo do dono; dois nomes para o mesmo papel confundiriam quem lê a tela e o e-mail).
    Paridade por teste de contrato que lê o JSON do painel por caminho relativo dentro do teste, sem `import` de código
    entre apps (precedente: `frontend-transportada/test/delivery-clients/mail-template-variable-parity.contract.ts`).
    Vários papéis → o primeiro na ordem de `COMPANY_ROLES`; só papéis diretos da membership (`membership_roles`), não
    os herdados de grupo. Sem cargo e sem papel direto → a linha do cargo é omitida (§5).
12. **Cargo livre na membership** (D13 do dono). `user_company_memberships.job_title varchar(80)` nula, CHECK
    `1..80`; saneado por política pura (controle, quebra de linha e caracteres bidi — U+202A–U+202E, U+2066–U+2069 —
    fora, espaços colapsados, `trim`, vazio → `null`, mais de 80 → 400; bidi adotado da sugestão do architect). Editado por `users.manage` no `PATCH /company-users/:id` existente (`jobTitle?: string | null`;
    ausente não altera; conta para o "ao menos um campo"). Gravado por **método novo** do repositório, `UPDATE …
WHERE user_id = ? AND company_id = ?` (o `updateProfile` de hoje filtra só por pessoa e escreve o perfil). Corpo só
    com `jobTitle` **não chama o Keycloak** (o cargo não é atributo de identidade; o caso de uso hoje sempre sincroniza
    e falharia com o Keycloak fora). A resposta sai de `toCompanyUserView` (`company-user.policy.ts`), não de
    `serializeCompanyUser`. Sem auditoria, como o resto do perfil. Fora de log.
13. **CNPJ ou CPF da contratante.** Vem de `feed.document.contractor.taxId` (o `findOccurrenceTarget` passa a
    repassá-lo). Normalizado com 11 dígitos → rótulo "CPF", máscara `000.000.000-00`; 14 caracteres → rótulo "CNPJ",
    `formatCnpjForDisplay` (aceita o alfanumérico); vazio ou outro tamanho → a linha não aparece.
14. **Janela de deploy aceita** (ajustado na T0.2; opção (a) da T0.1). API e worker vão no **mesmo** PR e no mesmo
    run (`deploy-api` → `deploy-services`), com o diff tocando `apps/worker-transportada` para o job do worker rodar.
    Nos minutos entre os dois, o worker velho manda o HTML novo sem a parte inline (aparece o `alt` com o nome de
    exibição) e o "De" antigo. Só visual, sem perda de e-mail nem de dado. O worker não pode ir antes: lê colunas que a
    migration da API cria. Se o job do worker falhar, a janela deixa de ser de minutos: a T5.4 confere os dois jobs
    verdes antes de dar o passo por concluído, e a regra do dono vale — **API sem o worker no mesmo run é parar e
    perguntar**.

## Alternativas rejeitadas

- **HTML escrito pela empresa no modelo:** a 271 recusa, e o desenho deixaria de ser da plataforma.
- **Rota nova de renderização para a prévia:** a prévia existente já recebe o texto editado e já devolve `html`.
- **Coluna nova `sender_display_name`:** `from_display_name` tem o mesmo significado (nome do `From`) e o CHECK certo.
- **Reenvio assinado por quem reenvia (hoje):** contraria o RF8; a contratante veria outra pessoa no mesmo pedido.
- **Ligar o `cid` por variável de ambiente na API** (opção (b)): fecha a janela, mas exige duas publicações e uma
  variável que vira lixo depois; o defeito evitado é visual e de minutos.
- **Worker antes da API** (opção (c)): o worker leria colunas que ainda não existem.
- **Rótulo "Operador" só no e-mail:** o mesmo papel com dois nomes entre tela e e-mail.
- **Cargo no perfil de identidade:** o perfil é por pessoa e sincronizado com o Keycloak; o cargo é por empresa.

## Consequências

- Um montador só para tudo o que a contratante vê da ocorrência (prévia, envio, reenvio); o painel não reimplementa.
- O e-mail fica maior com o logo inline (até 256 KiB); o teto do Resend é 40 MB.
- `from_display_name` ganha dois usos com o mesmo significado; `direction` separa quem a escreve.
- O reenvio passa a ler o original (assinante e layout) como já lê o modelo (`findOriginalOccurrenceNotificationTemplate`).
- Papel novo em `COMPANY_ROLES` exige o rótulo na API (typecheck) e no painel (contrato de paridade).
- A 0109 só implementa a porta de dono (contrato da §5) e herda o "De"; o RF7 e o critério 10 da 273 já foram
  ajustados (`specs/273-a-ocorrencia-tem-dono/spec.md`, RF7 e critério 10).
- Uma janela de minutos com e-mail sem logo a cada publicação que mude o layout e o worker juntos.
- O saneamento do "De" existe em duas cópias (API e worker), presas por tabela de casos idêntica.
- A prévia carrega o logo da empresa (até 256 KiB) uma vez por abertura do diálogo, para quem tem
  `occurrences.resolve`; é o mesmo logo que vai à contratante.
- Se `APP_BASE_URL` não for a origem do painel, a CSP `img-src` do painel bloqueia as miniaturas das marcas na prévia
  (no e-mail elas aparecem); registrado, sem ação.
- 272 e 273 geram `snapshot.json` a partir do mesmo pai (`20261017041702_…`): quem chegar depois a `staging` regenera
  a migration e o snapshot (T5.4).
