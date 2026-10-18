# ADR 0110 — O e-mail da ocorrência sai em HTML

- **Status:** proposta (2026-10-18, revisão 2) — reescrita pela mudança de escopo do dono de 2026-10-18; volta a
  "aceita" quando a T0.3 da spec 272 a validar com o `architect`. A revisão 1 (montador em código) foi aceita no mesmo
  dia na T0.2 e está resumida em § Revisão 1 (substituída); o texto integral está no histórico do git (commit
  `d56e8115c`).
- **Data:** 2026-10-18
- **Nasce da spec 272:** o e-mail de ocorrência à contratante sai no desenho aprovado pelo dono (versão 10 do artefato,
  `specs/272-o-email-da-ocorrencia-sai-em-html/desenho-aprovado.html`), com o "De", o assunto e a assinatura
  identificando a transportadora e quem escreveu.
- **Segue a regra global** `email-templates.md` (`~/.claude/rules/rules/email-templates.md`, repositório `ia`): o
  visual do e-mail mora no modelo do módulo de notificação; layout de e-mail em código é proibido.
- **Emenda:** a [ADR-0108](0108-o-modelo-do-email-a-contratante-vem-do-modulo-de-notificacao.md) §3 e a D5 da spec 271
  — **corpo HTML deixa de ser recusado** no modelo de e-mail à contratante; passa a ser recusado só o HTML inseguro
  (§2). O resto da ADR-0108 (o módulo é depósito e renderizador, escolha pela chave, sem modelo sem e-mail, carimbo,
  cópia, destinatários) continua. Emenda também a spec 268 (o "De" do sandbox ganha nome).
- **Consumidora:** a [ADR-0109](0109-a-ocorrencia-tem-dono.md) (spec 273) implementa a porta de dono (§6) e herda a
  regra do "De" (§8).
- **Base factual:** `evidence.md` da 272, § Levantamento, § T0.1 e § Mudança de escopo → Fatos conferidos.

## Contexto

- A revisão 1 desta ADR decidiu um montador de HTML em código (blocos TS com tabelas inline, golden files) em volta do
  texto do modelo. Na mesma tarde o dono descartou esse caminho: **o pacote já tem editor, validação e prévia de HTML
  de e-mail**, e montar layout em código duplica isso, exige deploy para mudar uma cor e cria uma segunda fonte de
  verdade do visual. A decisão virou a regra global `email-templates.md`.
- `@adatechnology/notification-ui` (0.1.0-rc.9 no painel, código igual ao da 0.1.0): no canal e-mail, corpo com tag
  troca o campo por `HtmlCodeField` (`isHtmlBody`, `NotificationSettingsWorkspace.tsx:119-121`, :736-753), que mostra
  os problemas da função `validateEmailHtml` que o host passa (prop opcional, :85); a prévia `TemplatePreview` mostra o
  corpo cru num `<iframe sandbox="" srcDoc>` (`emailHtml`, :784-785; `TemplatePreview.tsx:484-495`).
- `validateEmailHtml` **não é do pacote**: é do painel do TransportAdA
  (`frontend-transportada/src/modules/notification/shared/emailHtml.validation.ts:118`) e não cobre `on*`,
  `javascript:`, `iframe` e `form`.
- O renderer padrão escapa tudo no e-mail (`notification-contracts/src/templateRender.ts:103-121`); a porta
  `TemplateRendererPort` existe para o host trocar (`providers.ts:65-68`; `DefaultTemplateRenderer.ts:4-5`). O e-mail
  à contratante não usa o envio do módulo (ADR-0108 §1): a API lê `notification.templates` e interpola sozinha.
- A 271 recusa HTML em `assessContractorTemplate` (`occurrence-contractor-template.policy.ts:67`, `html_body`, que
  bloqueia o envio) e o worker filtra a fila do automático em SQL (`body !~ HTML_BODY_PATTERN`,
  `drizzle-occurrence-automatic-mail-queue.repository.ts:92`).
- Versões: API/worker `notification-contracts` 0.1.0-rc.2 e `notification-module` 0.1.0-rc.3; painel
  `notification-ui` 0.1.0-rc.9. Tudo o que esta ADR usa já está nelas: sem bump.

## Decisão

1. **O HTML é o modelo.** O desenho do e-mail mora no modelo de e-mail do módulo de notificação (canal `email`,
   `pt-BR`), editado na tela de Notificações. A API não monta layout. Corpo com tag → caminho HTML (§3); corpo sem tag
   → o caminho de texto de hoje (parágrafos e assinatura de texto). O encaminhamento a terceiro (248) e a correção de
   endereço (150) não mudam.
2. **HTML inseguro é "não utilizável".** Política pura na API, sem diferenciar maiúsculas: `<script`, atributo
   `on*=`, `javascript:` em atributo (também com entidade ou espaço no meio), `<iframe`, `<form`. O problema
   `html_body` da 271 dá lugar a `unsafe_html`, que bloqueia o envio pelos caminhos de hoje (400 ao gravar o tipo, 409
   `OCCURRENCE_MAIL_TEMPLATE_MISSING` no manual, o automático pula, aviso "Tipo sem modelo de notificação"). O
   validador do editor no painel ganha as quatro regras que lhe faltam como erro, e o worker troca o filtro da fila por
   um padrão equivalente; as três cópias ficam presas por uma tabela de casos idêntica (sem `import` entre apps). As
   demais regras do editor (folha externa, `data:`, tags desbalanceadas e os avisos) continuam só no editor.
3. **Renderer próprio, uma passada, escape só nos valores.** Uma varredura única troca cada `{{nome}}` **do modelo**
   pelo valor escapado (`escapeMailHtml`); o texto do modelo nunca é escapado nem reinterpretado. Só as chaves do
   conjunto fechado `OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES` (`logoTransportadora`, `tabelaItens`, `marcasRodape`,
   `faixaResposta`) entram
   sem escape, com valor vindo de um objeto separado que só a API monta — a decisão de não escapar é **pelo nome da
   chave**, nunca pelo conteúdo. O HTML do sistema escapa tudo o que carrega. Um valor que contém `{{…}}` não é
   reinterpretado. É uma política pura da API (não uma injeção de `TemplateRendererPort`, porque o envio do módulo não
   é usado).
4. **Parte texto gerada do HTML** renderizado: sem `<head>`/`<style>`, quebras de bloco preservadas, tags fora,
   entidades decodificadas, sem biblioteca. É o `body_text` gravado e o texto da mensagem na conversa.
5. **Variáveis novas na lista fechada** (catálogo da API e do editor do tipo, com o contrato de paridade da 271): texto
   escapado — `nomeExibicao`, `cnpjTransportadora`, `cnpjContratante` (CNPJ ou CPF formatado, vazio sem documento),
   `assinaturaNome`, `assinaturaCargo`, `assinaturaIniciais`, `cidadeTransportadora`, `razaoSocialTransportadora`;
   HTML do sistema — `faixaResposta` (a faixa "↩ Responda este e-mail" só quando a mensagem sai com `Reply-To`), — `logoTransportadora` (`<img src="cid:company-logo">` com
   logo, iniciais sem logo), `tabelaItens` (até 200 linhas, "e mais N itens", "Total dos itens" com a soma da 247),
   `marcasRodape` (`APP_BASE_URL` + `/icons/icon-192.png` e `/icons/ada-technology.png`; sem a variável, só o texto).
   `valorNota`, `motorista`, `parada` e `data` já existem e não são duplicadas.
6. **Assinante e porta de dono.** `OccurrenceMailSigner` = `{ kind: 'operator' | 'owner', userId, name, jobTitle? }`
   ou `{ kind: 'team' }`. Manual → o operador; automático → o dono pela porta `OccurrenceOwnerReader.findEligibleOwner({
companyId, occurrenceId, kind }) → { userId, name, jobTitle? } | undefined` (implementação nula aqui; a ADR-0109
   implementa a elegibilidade), senão a equipe. `assinaturaNome` = nome ou "Equipe <nome de exibição>";
   `assinaturaCargo` = o cargo (§10) ou o rótulo do papel (§11), por `resolveSignerJobTitle({ jobTitle, directRoles })`.
   O assinante não é gravado na mensagem.
7. **Assunto com prefixo que não se corta.** `<nome de exibição> · CNPJ <cnpj> — ` + o assunto do modelo cortado em
   `200 − tamanho(prefixo)`; o nome de exibição colapsado e cortado em 80 no prefixo (prefixo ≤ 109). `applySubjectPrefix`
   é idempotente — o reenvio da 248, que manda o assunto gravado, não ganha segundo prefixo.
8. **"De" com o nome de exibição, sempre.** `buildSenderDisplayName({ companyDisplayName, signer })`: equipe →
   `<nome de exibição>`; pessoa → `<nome> — <nome de exibição>`; remove `\p{Cc}`, U+2028/2029, bidi e `<>"\,;`,
   colapsa espaços, corta primeiro o nome da pessoa para caber em 200. Gravado em `from_display_name` (coluna que já
   existe; na saída guarda o nome do "De", o mesmo significado da entrada). O worker usa a coluna só em mensagem
   `outbound` não nula, nos dois transportes, reaplicando o mesmo saneamento; nula → o comportamento de hoje. O
   `sender_name` do Resend deixa de aparecer no "De".
9. **Logo por `cid:`, gravado em uma coluna.** `contractor_mail_messages.has_inline_logo boolean not null default
false`; o worker lê `company_logos` pela empresa da mensagem e anexa a parte inline (`content_id` no Resend, `cid`
   no nodemailer); logo sumido → sai sem a parte (o `alt` aparece). Rejeitados, como na revisão 1:
   `/public/landing-logo` (só a empresa da instalação), rota anônima por empresa (enumerável) e `data:` (Gmail corta).
10. **Cargo livre na membership.** `user_company_memberships.job_title varchar(80)` nula, CHECK `1..80`, saneada por
    política pura; editada por `users.manage` no `PATCH /company-users/:id` existente (`jobTitle?: string | null`),
    gravada por `UPDATE … WHERE user_id = ? AND company_id = ?`; só `jobTitle` não chama o Keycloak; resposta por
    `toCompanyUserView`; sem auditoria, como o perfil; fora de log.
11. **Rótulo do papel na API, igual ao do painel.** `COMPANY_ROLE_LABELS` com `satisfies Record<CompanyRole, string>`,
    cópia de `identity.locale.json` (`operator` = "Operação") + `contractor`/`automation`; paridade por contrato que lê
    o JSON do painel; só papéis diretos, o primeiro na ordem de `COMPANY_ROLES`.
12. **Envio manual com modelo HTML: o desenho nunca se perde.** O modelo marca a área do corpo com
    `<!-- mensagem -->` … `<!-- /mensagem -->`; o texto entre os dois é o padrão. O diálogo segue editando texto: a
    prévia existente devolve o texto gerado só da área e o `html` inteiro. No envio, texto igual ao gerado → a área do
    modelo fica; editado → a área vira o texto do operador escapado em parágrafos. Sempre sai o HTML do modelo. Modelo
    HTML sem a área → `missing_message_area`, que bloqueia como `unsafe_html`. Sem rota nova; a prévia "Como chega"
    foi adiada.
13. **Modelos versionados e publicados por script.** Os cinco modelos (`ocorrencia.prorrogacao-boleto`,
    `.avaria`, `.devolucao`, `.entrega-nao-realizada`, `.recusa`) são arquivos `.html` no repositório
    (`apps/api-transportada/src/occurrence-conversation/occurrence-mail-templates/`), com o assunto num comentário de
    cabeçalho. Um script idempotente (`scripts/occurrence-mail-templates-publish.ts`, molde do
    `whatsapp-flow-publish.ts`) valida todos (§2 e variáveis), compara com a versão ativa mais alta de cada chave e só
    grava versão nova quando mudou; sem `--confirm` só mostra o plano. O arquivo é a fonte; o banco recebe versões.
    Rodar em staging ou produção é mudança de dados com aprovação humana. O script não escolhe o modelo no tipo.
14. **Janela de deploy aceita.** API e worker no mesmo PR e no mesmo run (`deploy-api` → `deploy-services`); nos
    minutos entre os dois, o worker velho manda o HTML sem a parte inline e o "De" antigo. Worker fora do run = parar e
    perguntar.

## Alternativas rejeitadas

- **Montador de layout em código (revisão 1 desta ADR):** o pacote já tem editor, validação e prévia de HTML; o layout
  em código obriga deploy para mudar o visual, duplica a tela do pacote e cria uma segunda fonte de verdade. Proibido
  pela regra global `email-templates.md`.
- **Manter a recusa de HTML da 271:** obrigaria o layout em código.
- **Injetar `TemplateRendererPort` no módulo:** o e-mail à contratante não passa pelo envio do módulo (ADR-0108 §1);
  uma política pura chamada pela API resolve sem tocar a fábrica do módulo.
- **Importar `validateEmailHtml`:** não é exportado pelo pacote e mora no painel; nenhuma app importa código de
  outra. Cópia com tabela de casos idêntica.
- **Chave raw decidida pelo conteúdo** (ex.: "valor que começa com `<`"): um valor de usuário viraria HTML.
- **Gravar o assinante (`signer_kind`/`signer_user_id`) e `layout_version`:** serviam ao reenvio repetindo o original
  e ao histórico por layout, os dois fora; a 273 não os usa.
- **Prévia "Como chega" no diálogo:** adiada pelo dono para spec seguinte; a tela de Notificações já pré-visualiza.
- **Condicional no modelo** (para a faixa "Responda"): o renderer não ganha linguagem de controle; a faixa é variável de
  HTML do sistema (§5).
- **Envio manual editado sai em texto, sem o desenho** (padrão da revisão 2 antes da resposta do dono): vetado (D14).
- **Variável `{{mensagem}}` para o corpo editável:** precisaria de um valor padrão fora do modelo para o automático;
  o par de comentários guarda o padrão no próprio modelo.

## Consequências

- Mudar o visual do e-mail é editar o modelo (na tela ou no arquivo + script), sem deploy. A empresa pode estragar o
  desenho editando o HTML; o arquivo versionado é o caminho de volta.
- O HTML é dado de usuário que vai à contratante: a segurança depende da validação (§2) nas três cópias e do escape
  por valor (§3). Revisão de segurança obrigatória antes da publicação.
- Toda variável nova precisa entrar no catálogo da API, do editor do tipo e dos locales, ou o editor não a mostra.
- O e-mail fica maior com o logo inline (até 256 KiB; teto do Resend 40 MB).
- O reenvio da 248 de um e-mail HTML sai como hoje, em texto ("Reenvio do pedido abaixo." + o texto gravado).
- A 0109 só implementa a porta (§6) e herda o "De" (§8); o texto da 273 que cita `signer_*`, `layout_version` e o
  montador como "da 272" fica desatualizado e é corrigido quando ela for executada.
- 272 e 273 geram `snapshot.json` do mesmo pai (`20261017041702_…`): quem chegar depois a `staging` regenera.

## Revisão 1 (substituída em 2026-10-18)

Aceita na T0.2 (validação do `architect`, `evidence.md` § T0.2), substituída na mesma data pela mudança de escopo.
Resumo do que decidia e do que aconteceu com cada ponto:

| Revisão 1                                                                         | Na revisão 2                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| §1 servidor monta, modelo continua texto; §2 sem biblioteca, blocos TS            | **Substituídas** por §1–§4                                        |
| §3 logo por `cid:`; §4 marcas por `APP_BASE_URL`                                  | **Mantidas** como §9 e §5 (`marcasRodape`)                        |
| §5 ponto `signer` e "De"                                                          | **Mantida** como §6 e §8                                          |
| §6 tabela pelo bloco exato (`itemLinesBlock`)                                     | **Substituída** por `tabelaItens` (§5) e §12                      |
| §7 prefixo do assunto                                                             | **Mantida** como §7                                               |
| §8 prévia com HTML do layout, `fullSubject`, `inlineLogo`, balde próprio          | **Adiada pelo dono — spec seguinte**                              |
| §9 quatro colunas e três CHECKs; §10 reenvio repete o original                    | **Substituídas** por §9 (só `has_inline_logo`); reenvio como hoje |
| §11 rótulo do papel; §12 cargo; §13 CNPJ/CPF da contratante; §14 janela de deploy | **Mantidas** como §11, §10, §5 e §14                              |
