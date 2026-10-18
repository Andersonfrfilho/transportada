# Feature 272 — O e-mail da ocorrência sai em HTML

> Pedido do dono nas sessões de 2026-10-17 e 2026-10-18 ([`evidence.md`](evidence.md) § Decisões do dono). A prévia
> aprovada é a versão 10 do artefato "Modelos de e-mail de ocorrência" (cópia em
> [`desenho-aprovado.html`](desenho-aprovado.html); a função `render()` e os `TEMPLATES` são o desenho de referência).
> Decisão de arquitetura: [ADR-0110](../../docs/adr/0110-o-email-da-ocorrencia-sai-em-html.md) (revisão 2, proposta
> até a T0.3).
>
> ⚠️ **Mudança de escopo (dono, 2026-10-18), revisão 2 desta spec.** A primeira versão montava o HTML **em código** em
> volta do texto do modelo. O dono trocou: **o HTML vem do próprio modelo do módulo de notificação** (canal e-mail),
> que o pacote já edita, valida e pré-visualiza. Regra global: `~/.claude/rules/rules/email-templates.md`
> (`~/personal/ia/rules/email-templates.md`). O que saiu está em § Substituído na revisão 2 e em `evidence.md` §
> Mudança de escopo.
>
> ⚠️ **Ordem:** a 269, a 270 e a 271 estão em `staging` e **nenhuma está em produção**. A 272 vai a `main` **depois**
> delas. A 273 (a ocorrência tem dono, `work/spec-273`) vem **depois** da 272 e só implementa a porta de dono — ver
> `plan.md` § Coordenação com a 273.

## Specs do mesmo assunto (lidas contra o código em `origin/staging` 68613c0f9, 2026-10-18)

| Spec      | O que já decidiu e esta spec **usa sem refazer** (ou emenda, quando dito)                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 143 / 183 | O e-mail de ocorrência é a mensagem da 143 (`contractor_mail_messages`) mais a da conversa, gravadas numa transação por `send-occurrence-mail`; o worker envia pelo Resend da empresa. `Reply-To` com token traz a resposta para a conversa. Não muda.                                                                                                                                                                                                                      |
| 247       | Itens da ocorrência com código, quantidade, unidade e valor; soma das linhas com arredondamento único. **Usa** os mesmos valores em `{{tabelaItens}}`; nenhum cálculo novo.                                                                                                                                                                                                                                                                                                 |
| 248       | Reenvio do pedido de resposta e encaminhamento a terceiro. **Não muda** (revisão 2): o reenvio continua como hoje — o texto do original com "Reenvio do pedido abaixo." —, só o prefixo do assunto é idempotente para não duplicar.                                                                                                                                                                                                                                         |
| 267       | Responsáveis em cópia, teto 50 em `To`+`Cc`. Não muda.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 268       | Modo sandbox (`transport = 'sandbox_smtp'`, Mailpit, sem `Reply-To`, `From = EMAIL_FROM`). **Emenda:** o "De" do sandbox ganha o nome de exibição da transportadora (D11 do dono).                                                                                                                                                                                                                                                                                          |
| 269       | Assunto saneado (sem quebra de linha) e truncado. **Usa:** o prefixo da 272 entra antes do corte e nunca é cortado.                                                                                                                                                                                                                                                                                                                                                         |
| 270       | Tipo geral ou de contratantes. Não muda.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 271       | (em `staging`) O texto é um modelo do módulo de notificação, variáveis `{{camelCase}}` da lista fechada, escolhido pela chave no tipo. **Emenda a D5 da 271 / ADR-0108 §3:** corpo HTML **deixa de ser recusado**; passa a ser recusado só o HTML **inseguro** (mesma regra do pacote). A lista fechada ganha variáveis (RF5) e o render ganha o renderer próprio (RF2). O resto da 271 (modelo utilizável, aviso, 409, carimbo, cópia, destinatários) **usa sem refazer**. |
| 273       | (em `work/spec-273`) Grava o **dono** da ocorrência; no automático, o dono no "De" e na assinatura (273 RF7). A 272 entrega a porta `OccurrenceOwnerReader` (nula) e a regra única do "De"; a 273 só implementa a porta. A 273 **não** lê `signer_kind`/`signer_user_id` (conferido; `plan.md` § Coordenação).                                                                                                                                                              |

## Problema e resultado

O e-mail de ocorrência à contratante sai em texto puro: sem a marca da transportadora, sem destaque para a nota e o
valor, com os itens em linhas corridas e uma assinatura genérica. A contratante recebe dezenas de e-mails de
transportadoras e não reconhece de quem é. No sandbox (268) o "De" chega sem nome.

**Resultado:** a transportadora escreve o e-mail **em HTML no próprio modelo** em Notificações → Preferências (o editor
de código HTML do pacote já existe). A plataforma entrega cinco modelos prontos no desenho aprovado (arquivos `.html`
versionados, gravados por script). A API renderiza o modelo com um renderer próprio que escapa só os valores, valida o
HTML e gera a parte em texto. Variáveis novas trazem a identidade da transportadora, a contratante, a tabela de itens,
a assinatura com cargo e as marcas do rodapé. O assunto e o "De" passam a identificar a transportadora.

## Requisitos funcionais

- **RF1 — HTML no modelo.** O modelo de e-mail à contratante (canal `email`, `pt-BR`) pode ter corpo HTML. Modelo
  com HTML **inseguro** — `script`, atributo `on*`, URL `javascript:`, `iframe` ou `form` (a regra do pacote,
  `plan.md` D2) — é **não utilizável**: o tipo não o aceita ao gravar (400, problema `unsafe_html`) e o envio o trata
  como sem modelo (409 `OCCURRENCE_MAIL_TEMPLATE_MISSING` no manual, o automático pula), o mesmo caminho da 271.
- **RF2 — Renderer próprio.** Corpo com HTML: `{{campo}}` é trocado pelo valor **escapado**; o texto do modelo nunca é
  escapado nem reinterpretado. Só as variáveis do conjunto fechado "HTML do sistema" (RF5: `logoTransportadora`,
  `tabelaItens`, `marcasRodape`) entram sem escape, e o HTML delas é montado pela API. Corpo sem tag continua como
  hoje (texto em parágrafos, assinatura de texto).
- **RF3 — Duas partes.** Todo e-mail de ocorrência à contratante sai `multipart/alternative`. Corpo HTML: a parte
  `text/plain` é gerada do HTML renderizado (tags fora, quebras de bloco preservadas, entidades decodificadas). Corpo
  texto: as duas partes de hoje.
- **RF4 — Assunto identifica a transportadora.** Assunto = `<nome de exibição> · CNPJ <cnpj> — <assunto do modelo
preenchido>`. O nome de exibição no prefixo é cortado em 80; o corte da 269 vale só para a parte do modelo; o
  prefixo nunca é cortado e nunca é aplicado duas vezes (reenvio, painel antigo).
- **RF5 — Variáveis novas**, na lista fechada da 271 (catálogo da API e do editor do tipo no painel, com o contrato de
  paridade de hoje):
  - Texto, escapado: `nomeExibicao`, `cnpjTransportadora` (formatado), `cnpjContratante` (CNPJ ou CPF formatado;
    vazio se não houver), `assinaturaNome`, `assinaturaCargo`.
  - HTML do sistema (conjunto fechado, `plan.md` D3): `logoTransportadora` (`<img src="cid:company-logo">` com logo;
    as iniciais do nome de exibição num quadrado sem logo), `tabelaItens` (Código, Item, Qtd., Valor; "Total dos
    itens"; até 200 linhas e "e mais N itens"; vazia sem itens), `marcasRodape` (miniaturas TransportAdA e Ada por
    `APP_BASE_URL`; só o texto sem a variável).
  - Já existem na 271 e **não são duplicadas**: `valorNota`, `motorista`, `parada` e `data` (data do registro; o
    `dataRegistro` pedido é o `data` de hoje — `evidence.md` § Perguntas ao dono, Q4). `linhasItens` (texto)
    continua.
- **RF6 — Assinatura.** Envio manual: `assinaturaNome` = o operador; envio automático: o **dono** da ocorrência quando
  a 273 estiver publicada e houver dono elegível, senão "Equipe <nome de exibição>". `assinaturaCargo` = o cargo
  (RF8) ou, vazio, o rótulo do papel na empresa do catálogo do painel ("Operação", "Financeiro"; vários papéis → o
  primeiro na ordem do catálogo); sem cargo e sem papel direto, ou equipe → vazio.
- **RF7 — "De" com o nome de exibição, sempre (D12).** Automático sem dono → `<nome de exibição>`; manual →
  `<operador> — <nome de exibição>`; automático com dono (273) → `<dono> — <nome de exibição>`. Vale **nos dois
  transportes**: no Resend, o `sender_name` da configuração deixa de aparecer; no sandbox, que hoje manda o endereço
  sem nome, passa a ter nome. O endereço não muda. Saneado na API e de novo no worker.
- **RF8 — Cargo livre (D13).** Cada usuário tem, **na empresa**, um cargo livre até 80 caracteres, saneado (sem
  controle, quebra de linha nem bidi; espaços colapsados; vazio = sem cargo). Editado em Usuários por quem tem
  `users.manage`, pela rota que já edita o perfil (`PATCH /company-users/:id`); usuário de outra empresa → 404.
- **RF9 — Logo embutido.** Com logo cadastrado (`company_logos`), o logo vai como parte inline do e-mail e o HTML o
  referencia por `cid:`; nenhuma rota anônima nova, nenhum `data:`.
- **RF10 — Envio manual com modelo HTML.** O diálogo continua editando **texto**: a prévia devolve o texto gerado do
  HTML (RF3) para editar e o `html` renderizado. Se o operador mantém o texto como veio, sai o HTML do modelo; se
  edita, sai o texto dele em parágrafos (como um modelo texto). Padrão reversível — `evidence.md` § Perguntas ao
  dono, Q1.
- **RF11 — Cinco modelos prontos.** `ocorrencia.prorrogacao-boleto`, `ocorrencia.avaria`, `ocorrencia.devolucao`,
  `ocorrencia.entrega-nao-realizada` e `ocorrencia.recusa`, no desenho aprovado (cabeçalho com logo antes do nome,
  resumo Nota fiscal / Partes / Registro com o valor da nota em linha própria, corpo, tabela de itens, assinatura,
  rodapé com miniaturas; tabelas e estilos inline), como arquivos `.html` versionados e um script idempotente que grava
  versão nova por chave. Rodar em staging ou produção pede aprovação.

## Requisitos não funcionais

- **Segurança do HTML:** valor nenhum entra sem escape fora do conjunto fechado do RF2; o HTML do sistema escapa os
  dados que leva (nome, iniciais, itens). A validação de HTML inseguro roda ao gravar o tipo, ao listar modelos e no
  envio (API) e na fila do automático (worker).
- **Compatível com cliente de e-mail** (nos cinco modelos e no HTML do sistema): tabelas e estilos inline; nada de grid,
  flex, `var(`, `<script`, `@import`. Largura máxima 620 px.
- **Sem PII em log:** ids e contagens; nunca endereço, nome, cargo, assunto ou corpo.
- **Tamanho:** HTML renderizado abaixo de 100 KB com 200 itens (Gmail corta perto de 102 KB).
- **Publicação em etapas (ADR-0081 §9):** API (migrations aditivas) + worker no mesmo run → telas → modelos por script
  (aprovação).

## Fora do escopo

- Layout montado em código, golden files de layout, prévia "Como chega" no diálogo (§ Substituído).
- Reenvio da 248 com o layout ou o assinante do original: continua como hoje.
- E-mail de correção de endereço (150), encaminhamento a terceiro (248), e-mail do sistema e avisos internos.
- Tema escuro, idioma diferente de pt-BR, cores por transportadora.
- Gravar o dono da ocorrência (273). Edição do cargo pelo próprio usuário; cargo no Keycloak.
- Mudar o pacote `@adatechnology/notification-*` (a validação do pacote é espelhada ou importada, `plan.md` D2).

## Substituído na revisão 2 (2026-10-18)

Mantido para rastreio; detalhe em `evidence.md` § Mudança de escopo.

- RF1 antigo (HTML montado em volta do texto; recusa de HTML da 271 mantida) → **substituído** pelos RF1–RF3.
- RF3 (cabeçalho), RF4 (título), RF5 (quadro de resumo), RF6 (corpo e tabela no lugar do bloco), RF9 (rodapé), RF10
  (cores) → **substituídos**: viram conteúdo dos modelos `.html` (RF11) e variáveis (RF5).
- RF7 (faixa "Responda" só com `Reply-To`) → **substituído**: o modelo não tem condicional (Q2).
- RF8 (assinatura com reenvio da 248 repetindo o original) → **substituído** pelo RF6; o reenvio fica como hoje.
- RF12 (prévia "Como chega" no diálogo, `fullSubject`, `inlineLogo`, balde próprio) → **adiado pelo dono em
  2026-10-18 — spec seguinte**; a tela de Notificações do pacote já pré-visualiza o HTML.
- RF13 (rastreio do assinante e do layout) → **substituído**: grava-se o nome do "De" e se o logo vai embutido.
- RF14 (cargo) → mantido como RF8.

## Critérios de aceite

1. Modelo `ocorrencia.avaria` em HTML com `{{logoTransportadora}}`, `{{nomeExibicao}}`, `{{tabelaItens}}` e
   `{{observacao}}`; ocorrência "Avaria" de NF 48.213-1 com dois itens e observação `<b>x</b> & "y"`: o automático
   sai com assunto "Tapete Mágico Transportes · CNPJ 12.345.678/0001-90 — Avaria no transporte na entrega — NF
   48.213-1", parte HTML com o HTML do modelo intacto, a observação escapada, a tabela com 2 linhas e "Total dos
   itens", e parte texto sem tag.
2. Gravar o tipo com modelo que tem `<script>`, `onclick=`, `href="javascript:…"`, `<iframe>` ou `<form>` (maiúsculas
   e minúsculas) → 400 com `unsafe_html`; o mesmo modelo virando inseguro depois da escolha → envio manual 409, o
   automático pula e o aviso "Tipo sem modelo de notificação" aparece. Modelo HTML seguro → aceito.
3. Valor de `observacao` contendo `{{logoTransportadora}}` sai como texto escapado, nunca como o HTML do logo (uma
   passada só).
4. Modelo **texto** (sem tag): o e-mail sai igual ao de hoje, mais o prefixo do assunto e o "De" novo.
5. Empresa sem logo: `{{logoTransportadora}}` vira as iniciais, sem `<img>`, e a mensagem grava `has_inline_logo =
false`. Com logo: `cid:company-logo` no HTML, a parte inline no e-mail, nenhum `data:` nem link de API.
6. Envio manual de Ana Lima com cargo "Atendimento — ocorrências": "De" `Ana Lima — Tapete Mágico Transportes <…>`,
   `{{assinaturaNome}}` "Ana Lima" e `{{assinaturaCargo}}` o cargo; sem cargo, "Operação" para `operator`. Automático
   sem dono: "De" `Tapete Mágico Transportes <…>` e `{{assinaturaNome}}` "Equipe Tapete Mágico Transportes".
7. Resend com `sender_name = "TMT Ocorrências"`: o "De" é `Tapete Mágico Transportes <endereço do Resend>`.
8. Sandbox (268), no Mailpit: "De" `Tapete Mágico Transportes <EMAIL_FROM>`, as duas partes e o logo inline.
9. Envio manual com modelo HTML: texto mantido → sai o HTML do modelo; texto editado → sai o texto do operador em
   parágrafos, sem o HTML do modelo.
10. 200 itens: HTML abaixo de 100 KB; 201 itens → "e mais 1 item" na tabela.
11. Assunto do modelo com 300 caracteres: o prefixo fica inteiro; reenvio da 248 de um e-mail já prefixado não ganha
    segundo prefixo.
12. Com dono Carla injetado na porta (antes da 273): o automático sai "De" `Carla — Tapete Mágico Transportes` e
    `{{assinaturaNome}}` "Carla".
13. Cargo: `PATCH /company-users/:id` com `jobTitle` de 81 caracteres → 400; com quebra de linha → gravado sem ela;
    `null` ou `""` limpa; sem `users.manage` → 403; usuário de outra empresa → 404; a lista de usuários devolve
    `jobTitle`.
14. O script dos modelos, rodado duas vezes sobre o mesmo arquivo, grava uma versão só; sem `--confirm` não grava.
15. O editor do tipo e a tela de Notificações listam as variáveis novas (contrato de paridade API ↔ painel).
