# Evidência — 272 O e-mail da ocorrência sai em HTML

## Mudança de escopo (dono, 2026-10-18)

Relayada pela sessão `transportada-2a` em 2026-10-18, depois da T1.2. Vira a **revisão 2** da spec, do plano, das tasks
e da ADR-0110 (status de volta a "proposta" até a T0.3). Regra global criada na mesma decisão:
`~/.claude/rules/rules/email-templates.md` (repositório `ia`, `rules/email-templates.md`).

**O que o dono decidiu:**

- **O HTML vem do próprio modelo do módulo de notificação** (canal e-mail), não de montador ou layout em código. Motivo:
  o pacote já tem editor de código HTML, validação e prévia com moldura; layout em código obriga deploy para mudar o
  visual, duplica a tela do pacote e cria uma segunda fonte de verdade. **Emenda a D5 da 271 / ADR-0108 §3**: corpo
  HTML deixa de ser recusado no modelo de e-mail à contratante.
- A API renderiza com renderer próprio: interpola `{{campos}}` escapando **só os valores**; valida o HTML (sem script,
  `on*`, `javascript:`, `iframe`, `form`) e trata o inválido como "não utilizável" (o caminho de aviso/409 da 271);
  corpo sem tag continua texto em parágrafos; a parte `text/plain` sai do HTML renderizado.
- Variáveis novas (valores escapados, exceto as de HTML montado pelo sistema): `nomeExibicao`, `cnpjTransportadora`,
  `logoTransportadora` (HTML do sistema), `valorNota`, `cnpjContratante`, `parada`, `motorista`, `dataRegistro`,
  `tabelaItens` (HTML do sistema; `linhasItens` continua), `assinaturaNome`, `assinaturaCargo`, `marcasRodape` (HTML do
  sistema). Entram no catálogo da API e do painel, com o teste de paridade.
- **Mantém:** prefixo do assunto (idempotente, nome cortado em 80); "De" com o nome de exibição sempre, saneado na API e
  espelhado no worker; logo por `cid:` de `company_logos` (`has_inline_logo`); cargo livre `job_title` + `PATCH
/company-users/:id` + campo na tela; `OccurrenceOwnerReader` nulo para a 273; publicação em etapas; revisão final com
  `code-reviewer` e `security-reviewer`.
- **Sai:** montador/layout em código e golden files de layout (**substituído**); prévia "Como chega" no diálogo e o que
  a servia — `fullSubject`, `inlineLogo`, balde de rate limit da prévia (**adiado pelo dono em 2026-10-18 — spec
  seguinte**); reenvio da 248 com layout/assinante do original (**adiado pelo dono em 2026-10-18 — spec seguinte**; o
  reenvio continua como hoje). Migration reavaliada (abaixo).
- **Entra:** os cinco modelos HTML como arquivos versionados + script idempotente que grava versão nova por chave;
  rodar em staging é mudança de dados (parar e perguntar). Tasks enxutas (entregar mais rápido) e uma T0.3 🧠 que valida
  a ADR revisão 2 com o `architect`.
- **Complemento (mesma mudança):** alinhar à regra global; a ADR registra a decisão e o motivo citando a regra; a task
  de documentação viva escreve a seção da raiz "E-mail em HTML vem do modelo do módulo de notificação (spec 272,
  ADR-0110)", o detalhe em `apps/api-transportada/CLAUDE.md` e `docs/ai-context/api-transportada.md`, e uma linha no
  `apps/worker-transportada/CLAUDE.md` sobre o logo por `cid:` (T4.4). Nesta revisão os `CLAUDE.md` **não** foram
  tocados — só planejado.

### Fatos conferidos (revisão 2, leitura direta em 2026-10-18)

Pacote em `~/personal/adatechnology-packages/packages/{frontend,backend}/`; TransportAdA relativo à raiz do worktree.

- **`@adatechnology/notification-ui`** (0.1.0): `isHtmlBody` privado em `NotificationSettingsWorkspace.tsx:119-121`
  (`/<\/?[a-zA-Z][\w:-]*(\s|>|\/)/`); `HtmlCodeField` no canal e-mail em :736-753 (exportado em `src/index.ts:43-44`,
  componente em `components/HtmlCodeField.tsx:34`); a prévia recebe `emailHtml: content?.body` em :784-785 — o corpo
  **cru**, sem interpolar; `TemplatePreview.tsx:484-495` renderiza em `<iframe sandbox="" srcDoc>`. Tudo isso entrou no
  commit `3ae555e` (2026-08-24) e foi publicado primeiro na **0.1.0-rc.6**; sem mudança de `src` entre a rc.9 e a HEAD.
- **Divergência 1 — `validateEmailHtml` não é do pacote.** O pacote só declara a prop opcional
  (`NotificationSettingsWorkspace.tsx:85`, tipo `EmailHtmlReport` em :50-57). A implementação é do painel:
  `apps/frontend-transportada/src/modules/notification/shared/emailHtml.validation.ts:118`, ligada em
  `NotificationSettings.page.tsx`. Erros: `<script`, `<link rel=stylesheet>`, `<img src="data:`, tags desbalanceadas;
  avisos: flex/grid/position, URL relativa, imagem sem `alt`, acima de 102 400 bytes. **Não checa `on*`,
  `javascript:`, `<iframe`, `<form`.** Efeito: a API não pode importar a função (nenhuma app importa código de outra) e
  "a mesma regra do pacote" não cobre o que o dono pediu. Decisão proposta (plan D2): as cinco regras do dono na API,
  as quatro que faltam acrescentadas ao validador do painel como erro, tabela de casos idêntica nas três cópias.
- **`notification-contracts`** (0.1.0): `interpolateTemplate` (`templateRender.ts:35`) não escapa; `renderTemplate`
  (:103-121) escapa tudo no e-mail (comentário: "quem quer HTML rico troca o renderer"). `TemplateRendererPort` em
  `providers.ts:65-68`. `DefaultTemplateRenderer` é do **módulo** (`notification-module/src/shared/DefaultTemplateRenderer.ts:4-5`:
  "quem precisa de HTML rico … injeta o próprio `TemplateRendererPort`"), injetável em `NotificationModule.ts:92`. A
  fábrica da API (`notification-module.factory.ts:51-69`) não injeta renderer — e não precisa: o e-mail à contratante
  não passa pelo envio do módulo (ADR-0108 §1). O "renderer próprio" é política pura da API.
- **Divergência 2 — versões usadas (não exige bump).** API e worker: `notification-contracts` 0.1.0-rc.2 e
  `notification-module` 0.1.0-rc.3 (`package.json:45-46` da API, :33-34 do worker); painel e app do motorista:
  `notification-ui` 0.1.0-rc.9 e `notification-client` 0.1.0-rc.3; `bun.lock` resolve as mesmas. A rc.9 da UI já tem
  tudo; a rc.2 de contracts já tem `TemplateRendererPort` e `interpolateTemplate`. Bump só se quisermos as mudanças
  posteriores de `templateRender.ts` (`constraints`, `sanitizeTitle`), que a 272 não usa.
- **Onde a 271 recusa HTML hoje** (API): `HTML_BODY_PATTERN` em
  `occurrence-conversation/domain/occurrence-contractor-mail.constant.ts:16-17`; `occurrence-contractor-template.policy.ts:34`
  (regex), :67 (`html_body`), :38-42 (`SEND_BLOCKING_CODES`), :80 (`blocksContractorMailSend`), :94-101
  (`toContractorTemplateView`). Consumidores: 400 `OCCURRENCE_CONTRACTOR_TEMPLATE_INVALID`
  (`save-occurrence-type.use-case.ts:246-247`); 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`
  (`drizzle-occurrence-mail.repository.ts:217` → `send-occurrence-mail.use-case.ts:225`); aviso
  (`occurrence-mail-template-missing.query.ts:33-44`, :90); lista do editor (`main.ts:4014`). **Worker**:
  `occurrence-automatic-mail-sweep.constant.ts:28` e `drizzle-occurrence-automatic-mail-queue.repository.ts:92`
  (`nt."body" !~ HTML_BODY_PATTERN`), paridade em `test/occurrence-automatic-mail-sweep/html-body-pattern.contract.ts`
  — **não estava no pedido**; sem mudar o filtro, o automático nunca pegaria modelo HTML (plan D2).
- **Painel tolera código novo de problema:** `toProblem` (`occurrenceTypeMailClient.service.ts:19-42`) descarta código
  desconhecido e mantém o modelo. Locale do `html_body` em `companySettings.locale.json:486-489`.
- **Catálogo da 271:** `OCCURRENCE_CONTRACTOR_MAIL_VARIABLES` (`occurrence-contractor-mail.constant.ts:24-49`, 17
  nomes). **Divergência 3 — quatro das variáveis pedidas já existem:** `valorNota`, `motorista`, `parada` e `data`
  ("Data da ocorrência", a data do registro; `createdAt.toLocaleDateString('pt-BR')`). Não são duplicadas;
  `dataRegistro` seria um segundo nome para `data` (Q4). Painel: `OCCURRENCE_MAIL_VARIABLE_NAMES` e
  `OCCURRENCE_MAIL_SAMPLE_VALUES` (`occurrenceTypeMailTemplate.service.ts:9`), descrições em `companySettings.locale.json`
  (desde :491) e `.en`; paridade em `test/occurrence-conversation/occurrence-type-mail-parity.contract.ts` (o
  `mail-template-variable-parity.contract.ts` citado na revisão 1 é o da 150, `{var}`, não o da 271).
- **Divergência 4 — as chaves `ocorrencia.*` não existem em lugar nenhum** de seed ou migration (a 271 "começa do zero").
  As cinco vêm só do desenho aprovado (`desenho-aprovado.html:495`, :509, :529, :546, :563); `ocorrencia.avaria` também
  aparece em testes da API. O script da T4.3 as cria (versão 1); apontar cada tipo para a chave continua sendo escolha
  na aba Tipos. Precedente de publicação versionada: `apps/api-transportada/scripts/whatsapp-flow-publish.ts`.
- **273** (`~/personal/transportada-wt/spec-273`, spec/plan/tasks/evidence e ADR-0109): **não lê nem escreve
  `signer_kind`/`signer_user_id`/`layout_version`**; só implementa a porta (T2.10 dela; ADR-0109 §8 "Nenhuma coluna de
  assinante própria"). Cita as cinco colunas e o montador como "da 272" em plan:32-33, :113-114, :244 e evidence:272 —
  texto que fica desatualizado e é corrigido quando ela for executada (plan § Coordenação com a 273).

### Migration reavaliada

| Coluna (revisão 1)                   | Revisão 2   | Por quê                                                                                                                                                                       |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `has_inline_logo`                    | **Fica**    | O worker decide se anexa o logo sem interpretar o HTML; o renderer sabe se usou o `cid:`                                                                                      |
| `from_display_name` (já existe)      | **Reusada** | Nome do "De" gravado pela API, lido pelo worker em `outbound`; sem migration                                                                                                  |
| `signer_kind`, `signer_user_id`      | **Saem**    | Serviam ao reenvio da 248 repetindo o assinante (adiado) e ao histórico; a 273 não os usa. O manual já tem autor na mensagem da conversa; o dono fica na ocorrência (273). Q5 |
| `layout_version`                     | **Sai**     | Não há layout em código para versionar; a versão do modelo já é gravada (`notification_template_key`/`_version`, 271)                                                         |
| Três CHECKs da invariante            | **Saem**    | Amarravam `layout_version`, `signer_*` e `from_display_name`; sem essas colunas não há invariante                                                                             |
| `user_company_memberships.job_title` | **Fica**    | Cargo (D13 do dono)                                                                                                                                                           |

### Perguntas ao dono (não bloqueiam até a T4.2, salvo dito)

Padrões adotados e reversíveis; nenhum `[NEEDS CLARIFICATION]` aberto antes da T4.2.

- **Q1 — Envio manual com modelo HTML** (plan D12). Padrão: o diálogo continua editando o texto (gerado do HTML); texto
  mantido → sai o HTML do modelo; editado → sai o texto do operador em parágrafos, sem o desenho. Alternativa: o
  operador não edita quando o modelo é HTML (só envia), ou edita um campo "mensagem do operador" que entra numa
  variável. Afeta a T2.4.
- **Q2 — Faixa "↩ Responda este e-mail" só com `Reply-To`.** O modelo não tem condicional. Opções: (a) variável de HTML
  do sistema `faixaResposta`, vazia no sandbox; (b) a faixa fixa no modelo, aparecendo também no sandbox (só fora de
  produção). Sem resposta, a T4.2 para e pergunta.
- **Q3 — O desenho usa dados que a lista pedida não traz:** cidade/UF e razão social da transportadora (cabeçalho e
  rodapé), as iniciais no avatar da assinatura, e o resumo que esconde linha vazia (sem motorista). Opções: variáveis
  de texto `cidadeTransportadora`, `razaoSocialTransportadora`, `assinaturaIniciais` (escapadas) e linha vazia aceita no
  resumo; ou cortar esses pedaços do desenho. Sem resposta, a T4.2 para e pergunta.
- **Q4 — `dataRegistro`:** já existe `{{data}}` com a data do registro. Padrão: não criar o segundo nome.
- **Q5 — Rastreio de quem assinou cada e-mail:** sem `signer_*`, o automático assinado pelo dono não guarda o assinante
  na mensagem (fica a ocorrência com o dono, 273). Padrão: não gravar; se o dono quiser, coluna em spec seguinte.

### Respostas do dono às perguntas Q1–Q5 (2026-10-18) — decisões D14–D18

Respondidas no relançamento da sessão (trava de git do OMC desligada, prioridade "terminar o mais rápido possível").
Substituem os padrões das perguntas acima; nenhuma volta a ser perguntada.

- **D14 (Q1) — O envio manual nunca perde o desenho.** O modelo HTML é a moldura e tem uma **área de corpo**; o texto
  que o operador vê e edita no diálogo é o conteúdo dessa área. Texto mantido ou editado, sai sempre o HTML do modelo
  com o texto do operador (escapado, em parágrafos) no lugar da área. O diálogo continua editando texto simples.
  **Como foi desenhado (plan D12, ADR §12):** a área é delimitada no modelo por dois comentários HTML,
  `<!-- mensagem -->` … `<!-- /mensagem -->`; o que fica entre eles é o texto padrão do modelo (com `{{variáveis}}`).
  O dono sugeriu "ex.: variável `{{corpo}}`/`{{mensagem}}`"; a variável não serve sozinha porque precisaria de um valor
  padrão para o automático e o modelo só tem assunto e corpo — o par de comentários guarda o texto padrão no próprio
  modelo, é invisível no cliente de e-mail e não colide com `{{…}}`. Modelo HTML sem a área (ou com o par
  desbalanceado) é "não utilizável" (problema `missing_message_area`, bloqueia como `unsafe_html`).
  **Refinamento (Ajustado na T0.3):** "mantido → a área original do modelo, com a formatação dela" refina a Q1, não a
  contradiz: o desenho nunca se perde nos dois casos. O texto do operador é escapado e inserido depois da renderização,
  nunca passa pelo renderer.
- **D15 (Q2) — Faixa "↩ Responda este e-mail"** = variável de HTML do sistema `faixaResposta`, preenchida só quando a
  mensagem sai com `Reply-To` (vazia no sandbox/Mailpit). **Por que não dá para responder no ambiente local:** a
  resposta da contratante volta pelo _inbound_ do Resend (subdomínio de resposta com MX apontado ao Resend + webhook
  `email.received` que a API recebe, spec 183); o Mailpit da 268 só captura o que sai, não tem entrada nem webhook, e
  por isso o sandbox não põe `Reply-To`. **Sugestão de spec seguinte (fora da 272):** um simulador de resposta local
  (ex.: botão no Mailpit/rota de dev que posta no webhook de entrada um e-mail assinado como se viesse do Resend).
- **D16 (Q3)** — variáveis de texto novas `cidadeTransportadora` (`city · state` de `company_fiscal_profiles`, A3),
  `razaoSocialTransportadora` e `assinaturaIniciais` (iniciais do assinante; equipe → iniciais do nome de exibição);
  linha vazia no resumo é aceita (sem motorista, a linha sai com o rótulo e o valor vazio).
- **D17 (Q4)** — não criar `dataRegistro`; os modelos usam `{{data}}`.
- **D18 (Q5)** — o assinante não é gravado na mensagem nesta spec.

## Decisões do dono (sessões de 2026-10-17 e 2026-10-18)

> **Revisão 2:** D1 (texto simples, o sistema monta o HTML) e D7 (`{{linhasItens}}` vira tabela pelo bloco) foram
> **substituídas** pela § Mudança de escopo; D2, D3, D5, D6, D8, D9 e D10 viram conteúdo dos modelos `.html` (T4.2);
> D4, D11, D12 e D13 continuam.

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
exibição>`); o RF7 e o critério 10 da 273 se ajustam quando ela for executada (já ajustados na 273, conferido na T0.2).
- **D13** (2026-10-18, veto da assunção A2 da primeira versão) **Cargo livre na assinatura**: campo de cargo livre por
  usuário na empresa (ex.: "Atendimento — ocorrências"), editável na tela de usuários do painel, exibido abaixo do nome
  do operador/dono na assinatura; sem cargo, o rótulo do papel ("Operador", "Financeiro"). Entra no escopo: migration
  aditiva (coluna anulável, limite de tamanho, saneada), rota/permissão de edição, auditoria se o padrão do módulo de
  usuários audita, tela e locales, contratos negativos de BOLA.

## Decisões tomadas nesta spec (padrões; a T0.2 valida)

> **Revisão 2:** a lista abaixo é da revisão 1. Montador puro, D6 (bloco) e D8 (prévia) foram **substituídos** ou
> **adiados** pela § Mudança de escopo; D9 ficou só com `has_inline_logo` (§ Migration reavaliada); o resto continua
> (plan revisão 2, D5–D11, D13).

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
- **Prévia = envio** (D8 do plan), com rota que renderiza o texto editado. **Substituída pela T0.2:** sem rota nova; a
  prévia existente devolve o HTML (ADR-0110 §8).
- **Gravar o que saiu** (D9 do plan): `from_display_name`, `signer_kind`, `signer_user_id`, `layout_version`,
  `has_inline_logo`. **Substituída pela T0.2:** `from_display_name` já existe e é reusada; a migration cria só as
  quatro outras, com os CHECKs da invariante (ADR-0110 §9).
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
  o montador novo com assinatura da equipe. **Emendada pela ADR-0110 §10:** o reenvio de mensagem anterior à 272 sai
  assinado pelo operador que a escreveu (ou pela equipe, se foi automática).
- **A3 — Cidade no cabeçalho** = `city · state` de `company_fiscal_profiles` (endereço fiscal).
- **A4 — Transportadora sem perfil fiscal não bloqueia o envio** (T2.4): assunto sem prefixo, "De" como antes,
  identidade vazia e sem logo no HTML. Alternativa vetável: recusar o envio (fail-closed) até o perfil existir.
- **A5 — O reenvio da 248 ganha o prefixo e o "De" novo** (T2.4), seguindo no caminho de texto.

Nenhum `[NEEDS CLARIFICATION]`: as perguntas acima têm padrão adotado e não bloqueiam.

## Coordenação com a 273

> **Revisão 2:** a 272 deixa de ter montador e de gravar `signer_*`/`layout_version`; a 273 continua só implementando a
> porta e herdando o "De" (impacto em `plan.md` § Coordenação com a 273 e em § Mudança de escopo → Fatos conferidos).
> O parágrafo abaixo é da revisão 1.

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

### T0.2 — ADR-0110 (2026-10-18)

[`docs/adr/0110-o-email-da-ocorrencia-sai-em-html.md`](../../docs/adr/0110-o-email-da-ocorrencia-sai-em-html.md),
status **proposta** até a validação do `architect`. Ajustes em `plan.md` (marcados "Ajustado na T0.2"), `spec.md` (RF8,
RF12, RF14, critérios 4, 10 e 12) e `tasks.md` (T1.1, T1.2, T1.3, T2.1, T2.4, T2.5, T2.6, T2.7, T2.8, T2.10, T4.1, T5.2).
Conferido no código além da T0.1: o worker não lê `from_display_name` na saída (só o schema, `contractor-mail.schema.ts:47`);
o histórico só a usa na entrada (`toAuthor` retorna antes em `outbound`, `occurrence-conversation.query.ts:72-75`); o reenvio
já lê metadado do original (`findOriginalOccurrenceNotificationTemplate`, `send-occurrence-mail.use-case.ts:215-221`); o balde
`OCCURRENCE_CONVERSATION_RATE_LIMIT` é 30/300 s (`occurrence-conversation.routes.ts:52-56`); precedente de paridade entre
apps por caminho relativo no teste: `frontend-transportada/test/delivery-clients/mail-template-variable-parity.contract.ts`.

- **D8 / rota:** sem rota nova; a prévia existente devolve `html` do layout novo, `subject` prefixado e `fromDisplayName`;
  balde próprio `OCCURRENCE_MAIL_PREVIEW_RATE_LIMIT` (120/300 s). T2.7 mantém o ID e passa a ser a prévia.
- **D9 / `from_display_name`:** reusada na saída (mesmo significado: nome do `From`); migration com quatro colunas; worker
  decide pelo `from_display_name` não nulo, API decide reenvio/histórico pelo `layout_version`; invariante entre os dois.
- **Reenvio da 248:** assinante do original (com layout: mesmo `signer_kind`/`signer_user_id`, nome e cargo de agora;
  anterior à 272: autor como `operator`, ou `team` — emenda A2); sem vínculo → `team`; assunto com layout reusado sem
  reaplicar prefixo, sem layout recebe o prefixo; sempre `layout_version = 1`.
- **Deploy:** opção (a), janela de minutos aceita, API e worker no mesmo PR e run; (b) e (c) rejeitadas; worker fora do run
  = parar e perguntar.
- **Cargo:** método novo `updateJobTitle` por `(user_id, company_id)`; só `jobTitle` não chama o Keycloak; resposta por
  `toCompanyUserView`; T1.2 vira só o teste de tolerância (ID mantido).
- **Rótulo do papel:** `COMPANY_ROLE_LABELS` na API com `satisfies`, paridade por teste que lê `identity.locale.json`;
  `operator` = "Operação" (rótulo do catálogo, não "Operador"); só papéis diretos, primeiro na ordem de `COMPANY_ROLES`.
- **CNPJ/CPF da contratante:** `contractor.taxId` repassado; 11 dígitos → "CPF" mascarado, 14 → "CNPJ" por
  `formatCnpjForDisplay`, outro → linha omitida.
- **Fase 1:** guardas já tolerantes; T1.1/T1.2 só provam por teste; sem código mudado, T1.3 vira registro, sem deploy.

#### Validação do architect (opus)

**Veredito: APROVADA COM AJUSTES.** Todos os ajustes obrigatórios aplicados na ADR-0110 (status **aceita
(2026-10-18)**), no `plan.md`, na `spec.md` e no `tasks.md` (marcados "Ajustado na T0.2 (architect)"). T0.1 e T0.2
marcadas concluídas.

Ajustes obrigatórios aplicados:

1. **Prefixo duplicado no manual** (ADR §7, §8; plan D7, D8, Contratos): o diálogo devolve o assunto da prévia no `POST`
   (`SendToContractorDialog.component.tsx:103`) e a prévia o trata como digitado (`preview-occurrence-mail.use-case.ts:110`,
   :119). `subject` continua a parte do modelo, sem prefixo; a prévia ganha `fullSubject` só para exibir;
   `applySubjectPrefix` idempotente. T2.3 (idempotência na tabela), T2.7 (`subject` da prévia reenviado gera um prefixo),
   T4.1 (exibe `fullSubject`).
2. **Logo na prévia** (ADR §8; plan D8; spec RF12): `cid:` não resolve em `srcDoc`, a CSP não aceita `data:`
   (`contentSecurityPolicy.service.ts:161`) e a rota do logo exige `settings.manage`. A prévia sem `body` devolve
   `inlineLogo?`; o painel troca o `cid:` por `blob:` só no `srcDoc`; `html` não muda (critério 12). Fallback:
   `allow-same-origin` sem `allow-scripts`, senão o `alt` (RF12). T2.7 e T4.1 (prova no navegador).
3. **D6 sem marcador** (ADR §6; plan D6): marcador forjável pela `observacao` e incompatível com o corte de 8000.
   `renderContractorMail` devolve `itemLinesBlock`; o parágrafo igual a ele vira a tabela, nos três envios. T2.2/T2.5
   com os testes de observação parecida e de corte com "e mais N".
4. **Saneamento e tamanho do "De" e do prefixo** (ADR §5, §7; plan D5, D7; T2.3, T3.1): `buildSenderDisplayName` remove
   `\p{Cc}`, U+2028/2029, bidi e `<>"\,;`, colapsa espaços, corta o nome da pessoa primeiro para caber em 200; o worker
   reaplica o mesmo saneamento com tabela idêntica; nome de exibição cortado em 80 no prefixo.
5. **Invariante no banco** (ADR §9; plan D9, Dados; T2.1): três CHECKs; `signer_user_id` sem FK de propósito (ADR-0076).
6. **Contrato da porta e cargo** (ADR §5, §11; plan Coordenação; T2.4): `findEligibleOwner({ companyId, occurrenceId,
kind })`; `resolveSignerJobTitle({ jobTitle, directRoles })`; sem cargo e sem papel direto → linha omitida.
7. **Vínculo no reenvio** (ADR §10; plan D9-b; T2.6): pessoa exige membership ativa; `owner` também a elegibilidade
   da 0109 pela porta; senão `team`.
8. **Contradições**: A2 marcada emendada; § Decisões tomadas (prévia por rota nova, cinco colunas) marcadas
   substituídas; linha da 248 na `spec.md` alinhada à ADR §10; ADR § Consequências diz que a 273 já foi ajustada
   (conferido: 273 `spec.md` RF7 e critério 10 já trazem `<nome do dono> — <nome de exibição>`); T0.2 cita D1–D13;
   "Sem backfill" duplicado removido do plan § Dados.
9. **Critério 8** (parada sem nota) marcado como teste do montador (T2.2): num envio real não há contratante nem e-mail
   (`drizzle-occurrence-mail.repository.ts:89`, :99).
10. **Nome não ASCII no Resend**: a T3.1 confirma na doc oficial (context7) se o Resend codifica (RFC 2047) ou se o
    gateway codifica; a T5.4 faz um envio real pelo Resend antes de `main`.

Sugestões opcionais:

- **Adotadas:** o worker confere `direction = 'outbound'` antes de usar `from_display_name` (`findMessageById`,
  `drizzle-contractor-mail-outbound-worker.repository.ts:112-130`; T3.1); leitura do título no reenvio como função pura
  testada com nome contendo "—" (T2.6); bidi também fora do cargo (`company-user-job-title.policy`, T2.9).
- **Registradas:** 272 e 273 geram `snapshot.json` do mesmo pai (`20261017041702_…`), quem chegar depois regenera
  (T5.4, ADR § Consequências); caso de uso interno da prévia sem destinatários/cópia, decisão depois da medição da T5.1
  (T2.7); CSP `img-src` bloqueia as marcas na prévia se `APP_BASE_URL` não for a origem do painel (plan § Riscos, ADR §
  Consequências), sem ação.

Nota aritmética (não decidida aqui): com o nome de exibição cortado em 80, o prefixo chega a 109 caracteres
(`80 + " · CNPJ " (8) + CNPJ formatado (18) + " — " (3)`) e o modelo fica com ao menos 91, não 100. A ADR e o plan
registram o número real; garantir 100 exigiria cortar o nome em 71.

### T1.1 — Tolerância da prévia e do histórico às chaves novas (2026-10-18)

Teste só, sem mudança de código de produção (as guardas de `occurrenceConversationClient.service.ts` já ignoram chave extra).
Arquivo novo: `apps/frontend-transportada/test/occurrence-conversation/mail-layout-tolerance.contract.ts` (6 casos, pelo
cliente `createOccurrenceConversationClient` com `fetch` dublado — `readPreview` e `toMessage` são privadas, então são
exercitadas por `previewContractorMail` e `listConversations`). Registrado em `test/occurrence-conversation.contract.test.ts`
(já listado no `package.json`; nenhuma linha nova no `package.json`).

- Prévia sem as chaves novas (API anterior) passa; com `html`, `fullSubject`, `fromDisplayName` e `inlineLogo` passa; sem `inlineLogo` passa.
- Mensagem do histórico sem `fromDisplayName`/`signerKind` entra; com os dois entra; com os dois `null` entra.

Gates (cwd `apps/frontend-transportada`):

- `bun test ./test/occurrence-conversation.contract.test.ts -t "spec 272"` → 6 pass, 0 fail.
- `bun test ./test/occurrence-conversation.contract.test.ts` → 272 pass, 0 fail (o arquivo inteiro).
- `bun run typecheck` → exit 0.
- `bun run lint` → 0 errors, 16 warnings (todos fora do arquivo novo; 0 no arquivo).
- `bun run test` → exit 0: suíte principal 8344 pass / 0 fail (39 arquivos); `test:hooks` 1406 pass / 0 fail.
- `bunx prettier --write` nos dois arquivos tocados.

Código de produção: nenhum mudou. A guarda aceita as chaves novas sem alteração.

### T1.2 — Tolerância do usuário da empresa ao cargo (`jobTitle`) (2026-10-18)

Teste só, sem mudança de código de produção (`toCompanyUser` lê campos por lista branca e ignora chave extra).
Arquivo novo: `apps/frontend-transportada/test/identity/company-user-job-title-tolerance.contract.ts` (9 casos: 3 variantes
`jobTitle` texto / `null` / ausente × lista, detalhe e PATCH). Lista pelo `createCompanyUsersClient.listUsers` (→
`toCompanyUserPage`); detalhe por `toCompanyUser`; resposta do PATCH pelo `updateProfile` (→ `toCompanyUser`, método `PATCH`).
Registrado em `test/identity.contract.test.ts` (já listado no `package.json`).

Gates (cwd `apps/frontend-transportada`):

- `bun test ./test/identity/company-user-job-title-tolerance.contract.ts` → 9 pass, 0 fail.
- `bun run typecheck` → exit 0.
- `bun run lint` → exit 0, 0 errors, 16 warnings (nenhum no arquivo novo).
- `bun run test` → exit 0: suíte principal 8353 pass / 0 fail (39 arquivos; eram 8344, +9); `test:hooks` 1406 pass / 0 fail.
- `bunx prettier --write` nos dois arquivos tocados.

Código de produção: nenhum mudou.

### T1.3 — Sem deploy da Fase 1 (2026-10-18)

A T1.1 (commit `af99db9ee`) e a T1.2 (commit `2d43e01ca`) só acrescentaram testes; nenhum arquivo de produção mudou
(`git show --stat af99db9ee 2d43e01ca`: só `apps/frontend-transportada/test/**`). **Não há deploy da Fase 1: nada a
publicar.** A Fase 2 não espera produção. Na revisão 2, a guarda da lista de modelos (`toProblem`,
`occurrenceTypeMailClient.service.ts:19-42`) também já descarta o código novo `unsafe_html` sem derrubar o modelo:
continua sem fase tolerante.

### T0.3 — ADR-0110 revisão 2 validada com o `architect` (2026-10-18)

`architect` (opus), leitura contra o código de `work/spec-272` (em dia com `origin/staging`, 0 atrás). **Veredito:
APROVADO COM AJUSTES.** O desenho da revisão 2 se sustenta (modelo HTML no módulo, renderer de uma passada com conjunto
fechado por nome, coluna mínima, porta de dono nula, sem conflito de coluna com a 273). Ajustes obrigatórios, aplicados
na ADR, `plan.md`, `spec.md` e `tasks.md` (marcados "Ajustado na T0.3"):

1. **Texto do HTML × CHECK de 8000** (defeito real): `occurrence_conversation_messages.body_text` tem CHECK ≤ 8000
   (`occurrence-conversation.schema.ts:363-366`) e o envio recusa > 8000 (`send-occurrence-mail.use-case.ts:93-104`);
   com 200 itens a tabela sozinha passa disso → 500. A conversa, o `bodyText` de entrada e a prévia levam o texto da
   **área de mensagem** (com o corte de `linhasItens`); só `contractor_mail_messages.body_text` leva o texto do HTML
   inteiro (ADR §4, plan D4/D12).
2. **Envio manual**: RF10, critério 9, T2.4 e o prompt ainda diziam "editado → texto sem o desenho", contra a Q1/D14.
   Alinhados à área `<!-- mensagem -->`; texto do operador escapado depois da renderização (ADR §12).
3. **Conjunto fechado com quatro chaves** (`faixaResposta` incluída) e **doze variáveis novas** (8 texto + 4 HTML) em
   spec RF2/RF5, T2.3, T4.2, T4.4 e prompt; T4.2 deixa de esperar Q2/Q3 (respondidas).
4. **HTML inseguro com forma testável** (ADR §2, plan D2): tags `script|iframe|form|object|embed`, eventos
   `[\s/"']on[a-z]+\s*=` sem ancorar, esquema `javascript|vbscript` em cópia com entidades decodificadas, e
   **placeholder dentro de tag** = `unsafe_html`. Escopo: bloqueio de conteúdo ativo, não sanitizador. API e painel com a
   mesma tabela; o worker é filtro grosso nunca mais estrito (coluna `worker` na tabela).
5. **Renderer**: padrão do pacote `\{\{\s*([a-zA-Z0-9_]+)\s*\}\}`, busca só por `Object.hasOwn` (`{{constructor}}`
   imprimiria função), `has_inline_logo` só com `{{logoTransportadora}}` e logo.
6. **Parte texto**: entidades numa passada (`&amp;` por último); remove comentários, `<head>`, `<style>`, `<title>`.
7. **Porta de dono**: `jobTitle` já resolvido por `resolveSignerJobTitle`, opcional (ADR §6).
8. **Script dos modelos**: grava pelo `TemplateRepository` do pacote (INSERT de versão, nunca UPDATE), valida com
   `assessContractorTemplate`; plano `create`/`same`/`differs`, `--confirm` aplica só `create`, `differs` exige
   `--overwrite <chave>` (não apaga personalização feita na tela).

Opcionais adotados: CHECK `not has_inline_logo or direction = 'outbound'` (T2.1); cargo e "De" tiram também U+200E,
U+200F, U+061C e largura zero; HTML renderizado > 524288 bytes é problema do modelo, não 500; chave de HTML do sistema
dentro da área é problema do modelo; `RETOMADA.md` sai na T5.2. Não adotado aqui: anotar no `evidence.md` da 273 que
`signer_*`/`layout_version` não existirão (fora da árvore; fica para a sessão da 273).

WIP `727d6dbe1`: migrations aditivas, rollbacks, schemas e cadeia de `snapshot.json` (pai `20261017041702`, o mesmo da
273, que ainda não tem migration) corretos; **defeito**: caracteres bidi literais no fonte da política do cargo e do
contrato (Trojan Source) → trocados por escapes na T2.1.

Aceite: `grep -n "Status:\*\* aceita" docs/adr/0110-o-email-da-ocorrencia-sai-em-html.md` → linha 3.
`bunx prettier --check` nos quatro documentos → limpo.

### T2.1 — Migrations do logo embutido e do cargo, política do cargo (2026-10-18)

Fecha o WIP `727d6dbe1` (feito antes da formatação da máquina, sem gates). Executor `haiku`, sem escalada.

- **Migrations** (aditivas): `20261018173511_contractor_mail_message_inline_logo` (`has_inline_logo boolean not null
default false` + CHECK `contractor_mail_messages_has_inline_logo_direction_check`: `not has_inline_logo or direction =
'outbound'`, opcional adotado na T0.3) e `20261018173526_user_company_membership_job_title` (`job_title varchar(80)`
  nula + CHECK `char_length 1..80`). `rollback.sql` de cada uma no molde (`lock_timeout`, guarda do journal). Schemas
  Drizzle da API conferem; o espelho do worker só declara a coluna `hasInlineLogo` (`direction` já existia).
  `snapshot.json` das duas com o CHECK novo; pai `20261017041702`, o mesmo da 273.
- **Política do cargo** `company-user-job-title.policy.ts`: tira controle, quebra de linha, bidi (U+202A–U+202E,
  U+2066–U+2069) e, por ajuste da T0.3, U+200B–U+200F, U+061C e U+FEFF; apara; vazio → `null`; 80 aceito, 81 recusado
  (conta por `[...s].length`, coerente com `char_length`). **Trojan Source corrigido:** o WIP tinha os caracteres bidi
  **literais** no fonte da política e do contrato; viraram escapes `\u{...}` (`grep -nP` sem nenhum literal).
- **Teste antes:** a política e o contrato entraram juntos no WIP, então não há prova de vermelho para os casos
  originais. Os 7 casos novos (U+200E, U+200F, U+061C, U+200B, U+200C, U+200D, U+FEFF) deram **7 fail / 26 pass** antes
  do ajuste da política e **33 pass / 0 fail** depois.
- `test/database-migration/static-migration.contract.ts`: as duas pastas novas entraram na lista exata de migrations
  (o `make migration-test` acusou a falta: 1 fail / 225 pass antes, 226 pass / 0 fail depois).

Gates (cwd `apps/api-transportada`, salvo dito):

- `bun run typecheck` → exit 0; worker `bun run typecheck` → exit 0.
- `bun --env-file=../../.env.test test ./test/user-administration-application.contract.test.ts` → 168 pass / 0 fail.
- `make migration-test ENV_FILE=.env.test` (raiz) → 226 pass / 0 fail, 8 arquivos.
- `bun run db:generate` → `{"status":"no_changes"}`.
- Ciclo manual em banco descartável no Postgres do `.env.test` (o `db:test` não exercita rollback de migration sem
  asserção própria): aplica (`job_title`=1, `has_inline_logo`=1, CHECK=1, journal=2) → os dois `rollback.sql` em ordem
  inversa (tudo 0) → reaplica (tudo de volta). `pg_get_constraintdef` confere os dois CHECKs.
- `bunx eslint` e `bunx prettier --check` nos arquivos TS tocados → limpos.

### T2.5 — Cargo no `PATCH /company-users/:id` (2026-10-18)

Executor `sonnet`, em paralelo com a T2.2 (arquivos disjuntos). Reusa a política da T2.1.

- Schema `.strict()` aceita `jobTitle`, normalizado por `normalizeCompanyUserJobTitle` (`transform` + `addIssue`; 81 →
  400). O caso de uso confia no valor já saneado (`string | null`, ou ausente = não altera).
- `updateJobTitle` no `DrizzleCompanyUserRepository`: `UPDATE … WHERE user_id AND company_id`, `companyId` do contexto.
  `jobTitle` em `MEMBERSHIP_COLUMNS`/`toRecord`; a view (`toCompanyUserView`) devolve sempre `jobTitle: string | null`.
- PATCH só com `jobTitle`: grava e devolve a view sem `updateProfile`, `findIdentitySubject` nem gateway do Keycloak.
  Prova: gateway falso que registra toda chamada fica `[]`; com `jobTitle` + `phone`, o fluxo do perfil segue e
  `updateAttributes` é chamado. Sem auditoria (como o perfil).
- Testes novos: `test/user-administration-http/job-title.contract.ts` (11), `test/user-administration-application/
job-title-update.contract.ts` (6), `test/integration/company-user-job-title.integration.ts` (3; entrou no
  `test:integration` do `package.json`).

Gates (cwd `apps/api-transportada`):

- Teste antes: os dois agregadores `user-administration-http` + `user-administration-application` → **236 pass / 12
  fail** antes da implementação; **248 pass / 0 fail** (827 `expect`) depois.
- Integração `./test/integration/company-user-job-title.integration.ts` → 3/3, sem skip (outra empresa não grava; o
  CHECK do banco recusa 81). `company-user-listing.integration.ts` (mesmo repositório) → 10/10.
- `bun run typecheck` → sem erro nos arquivos da T2.5; `bunx eslint` e `bunx prettier --check` nos tocados → limpos.

Incidente: o executor rodou `git stash` na árvore compartilhada com a T2.2 em andamento; restaurou os arquivos tracked e
o executor da T2.2 foi avisado para conferir os seus. Regra para os próximos executores: nada de `stash`/`checkout`/
`reset` na árvore.

### T2.2 — Renderer, HTML inseguro e parte texto (2026-10-18)

Executor `sonnet`. Políticas puras novas em `apps/api-transportada/src/occurrence-conversation/domain/`:
`occurrence-mail-html-safety.policy.ts`, `occurrence-mail-html-render.policy.ts`, `occurrence-mail-plain-text.policy.ts`.
Constantes novas em `occurrence-contractor-mail.constant.ts`: `OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES` (as quatro chaves),
`OCCURRENCE_MAIL_MESSAGE_AREA` e `OCCURRENCE_MAIL_HTML_MAX_BYTES` (524288). `assessContractorTemplate`: `html_body` sai;
`unsafe_html` e `missing_message_area` entram em `SEND_BLOCKING_CODES`.

**Tabela de casos (fonte das cópias do painel na T4.1 e do worker na T3.1):** `OCCURRENCE_MAIL_UNSAFE_HTML_CASES` em
`occurrence-mail-html-safety.policy.ts`, 35 casos `{ html, name, rules, worker }` (`rules` vazia = seguro; `worker`
`'bloqueia'` | `'deixa para a API'`). O contrato exige ≥ 30 casos e que todo caso `bloqueia` seja inseguro na API (o
worker nunca é mais estrito).

Decisões do executor (o plan não fixava; dentro do contrato da ADR):

1. As regras de HTML inseguro e `missing_message_area` só valem quando o corpo casa `HTML_BODY_PATTERN` (é modelo HTML);
   texto puro como "online = sim" segue o caminho de texto e não é falso positivo.
2. Chave de HTML do sistema dentro da área de mensagem → código `unsafe_html` (sem código novo).
3. Tamanho: o renderer devolve `{ html, subject, tooLarge }`; a T2.4 converte `tooLarge` em problema do modelo.
4. `findMessageArea` e `hasSystemHtmlKeyInMessageArea` exportados pela política de segurança (marcadores exatos); a
   extração/substituição da área (D12) fica na T2.4. A parte texto da T2.2 é só `htmlToPlainText`.
5. Assunto renderizado só com `values`, sem escape; chave de HTML do sistema no assunto sai vazia.
6. Entidades nomeadas `&colon;`, `&tab;`, `&newline;` só com `;`; numéricas com ou sem.
7. `eslint-disable no-control-regex` pontual no `[\u0000-\u0020]`, com a justificativa da ADR.

Gates (cwd `apps/api-transportada`):

- Teste antes: agregador `occurrence-contractor-mail` → vermelho (0 pass, 1 fail, 1 error: módulos inexistentes); os
  três contratos antigos alterados → 24/6, 5/1 e 10/1 (pass/fail). Verde: agregador **136 pass / 0 fail** (296
  `expect`); avulsos `html-safety` 41, `html-render` 9, `plain-text` 6, `template-policy` 30, `type-template-key` 6,
  `template-routes` 11, todos 0 fail.
- Integração `./test/integration/occurrence-type-contractor-template.integration.ts` → 5 pass / 0 fail, sem skip
  (modelo HTML sem área → `missing_message_area`; inseguro → `unsafe_html`).
- `bun run typecheck` → exit 0; `bunx eslint` e `bunx prettier --check` nos 13 arquivos tocados → limpos.

### T2.3 — Variáveis e leituras (2026-10-18)

Executor `sonnet`. API: leituras novas no `drizzle-occurrence-mail.repository.ts` (`findOccurrenceTarget` com
`contractorTaxId`; `findCarrierIdentity` numa consulta, `hasLogo` por `exists` sem carregar o logo; `findOperatorSigner`
numa consulta com `left join` em `membership_roles` e vínculo ativo, devolvendo `jobTitle` já resolvido); porta
`OccurrenceOwnerReader` + `NULL_OCCURRENCE_OWNER_READER`; `occurrence-mail-signer.policy.ts` (`resolveSignerJobTitle`,
iniciais), `occurrence-mail-carrier-values.policy.ts` (CPF/CNPJ do contratante), `occurrence-mail-system-html.policy.ts`
(logo por `cid:` ou quadrado com iniciais, tabela de itens até 200 linhas + "e mais N item(ns)" + total — 200 linhas ≈ 84
KB, marcas do rodapé por `APP_BASE_URL` só http(s), `faixaResposta` só com Reply-To); `COMPANY_ROLE_LABELS` com paridade
contra `users.role` de `identity.locale.json`; `APP_BASE_URL` opcional no env (`appBaseUrl?`). As **12 variáveis novas**
no catálogo da API e no painel (`occurrenceTypeMailTemplate.service.ts` + locales pt-BR/en), paridade nas duas apps:
`nomeExibicao`, `cnpjTransportadora`, `cnpjContratante`, `assinaturaNome`, `assinaturaCargo`, `assinaturaIniciais`,
`cidadeTransportadora`, `razaoSocialTransportadora` (texto) e `logoTransportadora`, `tabelaItens`, `marcasRodape`,
`faixaResposta` (HTML do sistema).

Defeito pego pela integração nova: o `exists(...)` do `hasLogo` saía sem prefixo de tabela e dava `true` para qualquer
empresa; corrigido com colunas qualificadas.

Decisões do executor: `findCarrierName`/`findOperatorName` ficam na porta até a T2.4 trocar os chamadores e removê-los;
`buildSystemHtml` devolve `hasInlineLogo` = "há logo" (o "modelo usa `{{logoTransportadora}}`" é da T2.4);
`contractor` = "Contratante" e `automation` = "Automação" sem rótulo no JSON do painel; exemplos das 4 variáveis de HTML
no painel em texto sem marcação (travado por contrato); o corte de nomes longos é da D7 (T2.4), não desta task.

Correção de lacuna da T2.1 (achada aqui): `test/identity-schema.contract.test.ts` não conhecia `job_title` nem o CHECK
`user_company_memberships_job_title_check` → 2 fail; expectativas atualizadas → 7 pass / 0 fail. A T2.1 rodou só os
arquivos tocados; o script `test` completo da API passa a rodar antes de cada commit desta fase.

Gates:

- Teste antes: agregador `occurrence-contractor-mail` da API → vermelho (módulos inexistentes) → **186 pass / 0 fail**
  (eram 136). Painel `occurrence-conversation.contract.test.ts` → 272/2 → **274 pass / 0 fail**.
- Integração `./test/integration/occurrence-mail-reads.integration.ts` (nova, em `test:integration`) → 3/3, sem skip;
  vizinhas `occurrence-conversation-mail`, `occurrence-mail-template`, `occurrence-automatic-mail`,
  `occurrence-template-values` → 21 pass.
- Script `test` completo da API (com o `identity-schema` corrigido) → 12199 pass / 0 fail / 25 skip (213 arquivos).
- `bun run typecheck` API e painel → limpos; `bunx eslint`/`prettier --check` nos tocados → limpos; script `test` do
  painel → verde.

### T2.4 — Envio manual e automático pelo modelo HTML (2026-10-19)

Executor `sonnet`. Políticas novas em `src/occurrence-conversation/domain/`: `occurrence-mail-subject.policy.ts`
(prefixo idempotente; o nome de exibição só encolhe abaixo de 80 quando o prefixo passaria de 160, e a parte do modelo
nunca fica abaixo de 40), `occurrence-mail-sender-name.policy.ts` (**tabela do "De"**: `SENDER_DISPLAY_NAME_CASES`, 29
casos, e `SENDER_DISPLAY_NAME_MAX`; controles e U+2028/2029 viram espaço; bidi, invisíveis e `<>"\,;` saem; escapes
`\u{…}` no fonte), `occurrence-mail-html-compose.policy.ts` (`composeOccurrenceMailHtml`, usada por envio, prévia e
leitor do automático) e `occurrence-mail-text.policy.ts` (`collapseLine`, `truncateText` sem partir par substituto). A
porta ganhou `findOccurrenceMailHtmlSource` (`null` para modelo de texto); `findCarrierName`/`findOperatorName` saíram.

Comportamento: corpo que casa `HTML_BODY_REGEX` → caminho HTML; senão, texto como hoje. Gravado em
`contractor_mail_messages`: `body_html`, `body_text` = texto do HTML inteiro, `from_display_name`, `has_inline_logo`
(modelo usa `{{logoTransportadora}}` **e** há logo). A conversa e o `bodyText` de entrada levam o texto da área. Manual
(D12): texto igual → área do modelo; editado → texto do operador escapado em parágrafos, inserido depois da
renderização. Modelo sem área ou HTML > 524288 bytes → `OccurrenceMailTemplateMissingError` (409); no automático vira
"sem modelo"; na prévia cai no texto em branco.

Decisões do executor (assunções reversíveis, § Assunções):

1. **Sem perfil fiscal: não recusa.** Assunto sem prefixo, `from_display_name` nulo (o worker segue como antes),
   identidade vazia e sem logo no HTML. A recusa fail-closed (sugestão do `architect` na revisão 1) não chegou a virar
   decisão na ADR; recusar quebraria os fixtures `seedMailScenario`. Mudar para recusa é uma linha em
   `send-occurrence-mail.use-case.ts`.
2. Automático: usa sempre a área do modelo; a conversa leva `input.bodyText.trim()`. Operador sem vínculo ativo assina
   como `team`.
3. **Reenvio da 248:** segue o caminho de texto, mas ganha o prefixo (idempotente) e o "De" novo.
4. Critério 10: com linhas longas, 200 itens deram 117 KB na integração (lá se asserta só ≤ 524288); os < 100 KB
   seguem medidos na T2.3 com linhas curtas (~84 KB).

**Correção da sessão principal — prévia ≠ envio na faixa de resposta:** a prévia compunha com `hasReplyTo: true`
fixo, então no sandbox mostrava a faixa "Responda este e-mail" que o e-mail enviado não leva (fere o critério 12). A
prévia passou a ler `findMailSettings` (função extraída no repositório, reusada pelo método da transação) e decidir por
`resolveMailSendReadiness(...).ready`, como o envio. Teste novo "a faixa de resposta segue o envio" (sandbox sem faixa,
Resend pronto com faixa).

Desvio do TDD: só as políticas (assunto, "De", composição) tiveram vermelho antes; os testes de caso de uso (envio e
prévia) vieram depois da implementação.

Gates: agregador `occurrence-contractor-mail` 0/1 fail/1 error → 245 pass (eram 186); `occurrence-mail.contract.ts` 74
pass (eram 58); integração nova `occurrence-mail-html-send.integration.ts` 8/8 (manual e automático, HTML e texto,
Resend e sandbox, dono injetado, 200 itens: conversa ≤ 8000 e `body_text` do e-mail > 8000); 21 integrações de envio,
modelo, watchers, recipients, reply e sandbox → 107 pass, nenhum skip; script `test` da API 12274 pass / 0 fail / 25
skip; depois da correção da prévia, `occurrence-conversation.contract.test.ts` 693 pass / 0 fail.

### T4.1 — Painel: cargo, `unsafe_html`, prévia em iframe e validação (2026-10-19)

Executor `sonnet`. Cargo: campo em `CompanyUserEditDialog.component.tsx` (até 80, contador na dica, ajuda "Aparece na
assinatura dos e-mails de ocorrência"; `resolveJobTitleChange`: `undefined` não altera, `null` limpa) no `PATCH`
existente; o cargo aparece abaixo do nome em `CompanyUserTable.component.tsx` (a página não renderiza o nome).
`jobTitle` opcional em `CompanyUser` (obrigatório quebraria dezenas de fixtures). `unsafe_html` e
`missing_message_area` no lugar de `html_body` (tipos, cliente, locales). Prévia do tipo com corpo HTML em
`<iframe sandbox="" srcDoc>`. Validação: cópia por valor da tabela (`emailHtmlUnsafeCases.constant.ts`, 35 casos) e da
lógica em `emailHtml.validation.ts` (`findUnsafeHtmlRules`); `<script` mantém o código `EMAIL_HTML_SCRIPT`; códigos novos
`UNSAFE_TAG`, `UNSAFE_EVENT`, `UNSAFE_SCHEME`, `PLACEHOLDER_IN_TAG`, todos `error`. Contrato
`test/notification/email-html-unsafe.contract.ts` confere os nomes contra o fonte da API e o mesmo veredito por caso.
`contentSecurityPolicy.service.ts`: `https://x.com` dos casos declarado em `NON_FETCH_ORIGIN`.

**Correção da sessão principal — escopo das regras novas:** o `validateEmailHtml` é o do editor de Notificações, que
serve a **todos** os modelos; do jeito que veio, um `<a href="{{url}}">` legítimo de outra notificação passaria a ser
recusado. As quatro regras novas agora só valem quando o HTML tem a área `<!-- mensagem -->` (o que identifica o modelo
do e-mail da ocorrência, ADR §12); `<script` segue recusado em qualquer modelo. Teste antes: o caso "outra notificação
com link `{{url}}`" deu 1 fail / 40 pass; depois 41 pass / 0 fail.

Gates (executor): `bun run test` 8398 pass / 0 fail; `test:hooks` 1407 / 0; typecheck limpo; lint 0 erros (16 avisos
antigos); prettier limpo. Não há teste de renderização do diálogo e da tabela (só fonte e locale).

### T4.2 — Os cinco modelos `.html` (2026-10-19)

Executor `haiku`. `apps/api-transportada/src/occurrence-conversation/occurrence-mail-templates/{prorrogacao-boleto,
avaria,devolucao,entrega-nao-realizada,recusa}.html` a partir de `desenho-aprovado.html`: `<!-- subject: … -->` na
linha 1, logo antes do nome de exibição, resumo, área `<!-- mensagem -->` com o texto do `TEMPLATES`, `{{tabelaItens}}`
fora da área em avaria, devolução e recusa, `{{faixaResposta}}`, assinatura e `{{marcasRodape}}`; tabelas e estilo
inline, 620 px. No desenho a tabela ficava no meio do corpo (em `{{linhasItens}}`); com uma área só, ela ficou logo
depois da área. A sessão principal tirou um `· {{data}}` que o executor acrescentou ao rodapé (não está no desenho).
Teste `test/occurrence-contractor-mail/mail-templates-files.contract.ts`: vermelho 5 errors (arquivos ausentes) → 45
pass / 0 fail; a linha do assunto é separada antes de validar (o `{{…}}` dela acusaria `placeholder_in_tag`).

### T4.3 — Script que publica os modelos (2026-10-19)

Executor `sonnet`. `apps/api-transportada/scripts/occurrence-mail-templates-publish.ts --company <uuid> [--confirm]
[--overwrite <chave>]` (fino) + `src/occurrence-conversation/application/occurrence-mail-templates-publish.service.ts`
(lógica). Chave = `ocorrencia.<arquivo>` (plan D14, ADR §13), canal `email`, `pt-BR`. Separa a linha do assunto e valida
o resto com `assessContractorTemplate`; um inválido → nada é gravado e sai com código 1. Grava pelo `TemplateRepository`
do pacote (INSERT de versão, nunca UPDATE). Plano `create`/`same`/`differs`; `--confirm` aplica só `create`;
`differs` só com `--overwrite <chave>`; imprime só chave, versão e veredito. Testes:
`mail-templates-publish.contract.ts` (vermelho → 10 pass) e `test/integration/occurrence-mail-templates-publish.
integration.ts` (3/3, sem skip; pegou um defeito do próprio executor: com `--confirm` e arquivo inválido devolvia
`invalid: []`). Os dois testes entraram no agregador `occurrence-contractor-mail` e em `test:integration` (agregador:
300 pass / 0 fail).

### T3.1 — Worker: "De", logo inline e filtro da fila (2026-10-19)

Executor `sonnet`. **"De"** por `from_display_name` em `outbound` nos dois transportes: Resend `"Nome" <endereço>` com o
nome cru em UTF-8 entre aspas (a API já tira `" \ < > , ;`); sandbox `{ name, address }` (o nodemailer codifica).
Saneamento copiado em `src/contractor-mail/domain/sender-display-name.policy.ts`, paridade pela fixture com os 29
casos da API. Nulo ou esvaziado pelo saneamento → comportamento de hoje. **Logo inline** quando `has_inline_logo`:
`drizzle-company-logo.reader.ts` lê `company_logos` pela `company_id` da própria mensagem; parte inline `logo.png`/
`logo.jpg` com Content-ID `company-logo` (`COMPANY_LOGO_CONTENT_ID`, igual ao da API); logo ausente → sem a parte e log
warn `contractor_mail_inline_logo_missing` só com `{ messageId, reason }`. **Fila do automático:** `!~*
UNSAFE_EMAIL_HTML_PATTERN` = `<(script|iframe|form|object|embed)\y|[\s/"']on[a-z]+\s*=|(javascript|vbscript):|<[^>]*\{\{`
(`\y` porque `\b` é backspace no POSIX do Postgres) no lugar de `!~ HTML_BODY_PATTERN`; a integração roda os 35 casos
da tabela contra o Postgres e exige bloqueio exatamente quando `worker === 'bloqueia'`.

Pendências registradas (não bloqueiam staging, conferir no envio real da T5.2):

- **Resend:** a doc oficial (context7, resend.com/docs/llms-full.txt) documenta `from` como `"Name <email>"` e o campo
  "content id" do anexo para `<img src="cid:…">`, mas não fala de RFC 2047 nem mostra o nome REST `content_id`
  (deduzido do snake_case dos outros campos do anexo). O envio real em staging prova os dois.
- **Grant:** não há papel de banco próprio do worker no repositório; o worker usa o mesmo usuário da API, então o
  SELECT em `company_logos` vale por consequência. Conferir no papel real do deploy.
- `HTML_BODY_PATTERN` ficou sem uso no worker (com o contrato); remoção fica para depois.

Gates (cwd `apps/worker-transportada`): fila vermelha antes (export inexistente) → 8/8; `bun run test` 2721 pass / 0
fail (109 arquivos); integrações tocadas (fila, sandbox-outbound, outbound-outbox, reply-email-delivery,
outbound-attachments) 22 pass / 0 fail / 0 skip, num banco descartável migrado pelo `db:migrate` da API; typecheck e
`lint --max-warnings=0` limpos. A sessão principal formatou `src/database/contractor-mail.schema.ts` (o WIP da T2.1
deixou uma linha fora do prettier). Os contratos de "De" e logo foram escritos antes do código, mas o vermelho deles não
foi rodado isolado.

### T4.4 — Documentação viva (2026-10-19)

Executor `haiku`. Seções novas: `CLAUDE.md` da raiz ("E-mail em HTML vem do modelo do módulo de notificação"),
`apps/api-transportada/CLAUDE.md` e `docs/ai-context/api-transportada.md` (variáveis, políticas, `unsafe_html`, "De",
prefixo, cargo, área de mensagem e CHECK de 8000; a seção da 271 trocou `html_body` por `unsafe_html`/
`missing_message_area`), `apps/worker-transportada/CLAUDE.md` e `docs/ai-context/worker-transportada.md` (logo `cid:`,
"De", filtro da fila). **Não há OpenAPI** nesta API (o `CLAUDE.md` da API já dizia); o `jobTitle` ficou documentado
apontando para `user-administration.schema.ts`. `APP_BASE_URL` já existia no `.env.example` e no worker do
`.railway/railway.ts`: entrou `APP_BASE_URL: preserve()` na API e o comentário do `.env.example` cita o rodapé. Gates:
`env-example` 5/5; contratos que leem `railway.ts` 81/81; `deploy.contract.test.ts` 202/202; prettier limpo.

**Atenção para a T5.2:** `preserve()` mantém o valor que o serviço já tem; se a API de staging não tiver `APP_BASE_URL`, o
rodapé sai só em texto. Conferir/definir a variável na API de staging antes do teste.
Feito em 2026-10-19 com autorização do dono: `railway variables -s api -e staging --set APP_BASE_URL=… --skip-deploys`
(mesmo valor do worker, `https://app.staging.fernandes-transportadora.com.br`); vale no próximo deploy da API.

### T5.1 — Revisão de código e de segurança, correções e gates (2026-10-19)

`code-reviewer` e `security-reviewer` (sonnet) em paralelo sobre `git diff origin/staging` (inclui o não commitado).
**Os dois: APROVADO COM AJUSTES, nenhum CRÍTICO/ALTO.** Corrigidos por um executor `sonnet`, teste antes em cada item:

- **Fila do worker mais estrita que a API para corpo de texto** (código, MÉDIO — regressão silenciosa): o filtro novo
  valia para todo corpo; modelo de texto com `NF <{{numeroNota}}>`, `online = sim` ou `javascript:` sumia da fila do
  automático. Agora `(body !~ HTML_BODY_PATTERN or body !~* UNSAFE_EMAIL_HTML_PATTERN)`, como a API (só HTML).
- **Valor multilinha perdia as quebras no HTML** (código, MÉDIO): `\n` do valor vira `<br>`; ida e volta pela parte texto.
- **Placeholder em tag burlável** (segurança, BAIXO): `<a title=">" href="{{x}}">` e `{{x}}` dentro de `<style>`. A regra
  ficou ciente de aspas e ganhou o ramo `<style>`; nas três cópias, com 7 casos novos (tabela agora com **42** casos na
  API, no painel e no worker; o POSIX do worker segue nunca mais estrito).
- **Modelo relido sem reavaliação** (segurança, BAIXO): `readTemplateSource` reavalia o corpo
  (`blocksContractorMailSend(assessContractorTemplate(...))`) e devolve `null` se bloquear — vale também para a sugestão
  do automático.
- **Assunto** sem controles/invisíveis (`cleanSubjectText`: `[\p{Cc}\p{Cf}]`); **"De"** com `\p{Cf}` na API e no worker (4
  casos novos; tabela do "De" com 33 casos).
- Entidade que vira NUL/substituto solto/> U+10FFFF decodifica para `''` (o Postgres recusaria); corte da área por
  `truncateText` (não parte par substituto); **cargo gravado só depois do perfil/Keycloak** (falha do gateway não grava);
  prévia do painel por `Object.hasOwn`; a tabela deixou de usar `https://x.com`, e a exceção saiu do CSP do painel.

Não corrigidos (registrados): `ADD CONSTRAINT … CHECK` sem `NOT VALID` (tabelas pequenas; o padrão do repositório faz
igual); a prévia lê o envelope cifrado só para a prontidão (não é devolvido nem logado); o painel aplica as regras novas
só com a área `<!-- mensagem -->` — escolha deliberada (o editor serve a todos os modelos; a API reavalia em todo uso);
a prévia mostra o assunto sem o prefixo ("Como chega" adiada pelo dono).

Vermelhos medidos por item (A5, W3 e P2 por reversão parcial/cálculo, não por rodada limpa). Gates depois das correções:
API typecheck/lint limpos, `test` **12348 pass / 0 fail**, integrações de e-mail 29 + cargo 3; worker typecheck/lint limpos,
`test` **2726 / 0**, integrações 18 / 0 / 0 skip; painel typecheck limpo, lint 0 erros (16 avisos antigos), `test` **8408 +
1407 / 0**; prettier limpo.

**Integração completa da API** (depois das correções): `bun --env-file=../../.env.test run test:integration` →
**1715 pass / 0 fail / 8 skip** (2943 s). Os 8 pulados **não são da 272**: a CI do último merge em `staging` (PR #266) já
tinha 4 + 1 + 3 = 8 pulados (`integration-api` partes 2, 7 e 8); um deles é o teste que exige MinIO
(`trip-occurrence-upload-confirm`, `isStorageReachable`). Os arquivos de integração da 272 rodaram todos (0 skip). O relator
JUnit do Bun 1.3.14 trava, então a lista nominal não saiu.

**Desvio do Mailpit local:** o `make dev` exige o MinIO do pacote privado do GHCR (sem cache nesta máquina nova) e o
Keycloak; a verificação no Mailpit (um manual e um automático, lidos pela API do Mailpit) passa a ser feita no **Mailpit
de staging** (268), antes de qualquer envio real pelo Resend.

### T5.2 — Publicação em staging (2026-10-19, em andamento)

- PR #269 (`work/spec-272 → staging`): 21 checks da CI verdes (gate com integração da API em 8 partes, worker, smokes).
  Merge `2483d6e6f` autorizado pelo dono ("deixe correta e completa até chegar em staging").
- Run de deploy `39201818918`: `deploy-api`, `deploy-services (worker)`, `deploy-services (cron)`, `deploy-frontend`,
  `deploy-client`, `deploy-driver` e `mark-deployed` com sucesso — API e worker no mesmo run (D13).
- **Fato, não sinal:** `GET https://api.staging.fernandes-transportadora.com.br/health/ready` →
  `{"dependencies":{"database":"up","identity":"up","migrations":"up"},"revision":"2483d6e",…}`.
- `APP_BASE_URL` na API de staging definido antes do deploy (§ T4.4).
- Pendente: chave do host no primeiro `railway ssh` (passo do dono), consulta do `companyId` de staging e dry-run do
  script dos modelos — **aprovação do dono antes de cada um**; depois `--confirm`, envio no Mailpit de staging e um envio
  real pelo Resend antes de `main`.

## Prompt de execução

O prompt vigente está em `tasks.md` § Prompt de execução (uma cópia só; a daqui divergia). Revisões anteriores
no histórico do git.

W2 em staging (`2483d6e`). Aguardando o dono: aceitar a chave do host no `railway ssh` e aprovar a consulta do `companyId` + o dry-run do script dos modelos.
