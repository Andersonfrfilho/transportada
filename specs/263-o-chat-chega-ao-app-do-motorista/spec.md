# Feature 263 — O chat chega ao app do motorista

> Continua a spec **183** (a conversa da ocorrência, T601/T604/T702) e a **189** (o motorista tem app
> própria). Fecha a pendência registrada na spec **248** (§ "Chat do motorista no app do motorista":
> _não existe em `apps/frontend-driver`_). Prévia navegável: [`preview.html`](preview.html).

## Specs do mesmo assunto (lidas contra o código em 2026-10-09)

| Spec                    | O que já decidiu e esta spec **usa sem refazer**                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 183                     | A conversa do motorista na **API** está pronta: `GET /me/trips/current/occurrence-conversations` (lista), `GET/POST .../occurrences/:id/messages`, `POST .../messages/read`, `POST .../uploads`, anexos até 25 MB, status `entregue/lida`, aviso no sino `trip.conversation-message`. Só a **tela** do motorista vive no PWA antigo do painel (`DriverOccurrenceConversations.page.tsx`). |
| 189 / ADR-0075          | O motorista tem app própria; **nenhuma app importa código de outra**. Código reutilizável vai para o **pacote** (`adatechnology-packages`), não para cópia — a cópia por valor da 189 vale para o que é do app (cliente HTTP, fila offline), não para tela de conversa (ADR-0072). O app é offline-first (fila IndexedDB com chave de idempotência).                                      |
| 072 / 051 / 0074 (ADRs) | A tela de conversa vem do `conversations-ui`; o produto compõe e estiliza por `className`/`.cv-*`, **sem Tailwind**; a conversa por participante e a atribuição ficam no produto.                                                                                                                                                                                                         |
| 248                     | Faz do chat do app o canal **principal** com o motorista (o PDF do boleto chega nele). Sem a tela no app novo, esse caminho termina num aviso que não abre nada.                                                                                                                                                                                                                          |
| 257                     | A viagem na rua recebe notas: o escritório muda o conjunto de notas com o motorista já rodando — o assunto mais provável de uma mensagem que não é ocorrência.                                                                                                                                                                                                                            |
| 164                     | **A conversa não decide** (183 D4): nenhuma mensagem muda tratativa, taxa ou acerto. Esta spec herda isso sem exceção.                                                                                                                                                                                                                                                                    |

## Problema e resultado

O motorista que usa o app próprio **não consegue ler nem responder** o escritório. O sino mostra "nova
mensagem sobre a ocorrência X" e o toque não leva a lugar nenhum; para falar, ele cai no WhatsApp
pessoal do operador — fora do produto, sem trilha, sem anexo ligado à ocorrência.

Portar a tela de hoje resolveria isso **para ocorrência**, e só para ela. Mas o escritório fala com o
motorista sobre mais do que ocorrência: "essa nota não está no caminhão?", "o cliente pediu para
adiantar a parada 4", "falta assinar o canhoto da NF 1234". Se tudo cair numa lista única de conversas
por ocorrência, o motorista com uma viagem de 30 paradas **se perde** — não sabe do que a mensagem
fala, nem se é urgente, nem se já respondeu.

**Resultado:** o app do motorista ganha a aba **Conversas**. Cada conversa tem **um assunto** — uma
**ocorrência**, uma **nota** ou a **viagem** — e a lista separa por assunto, mostra primeiro o que
**espera resposta dele**, e cada conversa abre com um cartão do assunto no topo (a nota, a parada, o
motivo) para ele nunca precisar lembrar do que se trata. Funciona offline (mensagem fica na fila e
sai quando a rede volta, sem duplicar).

## Fora do escopo

- **Decidir qualquer coisa pela conversa** (183 D4). Texto livre nunca muda estado.
- **WhatsApp e e-mail do motorista**: ficam como estão (183). Esta spec é o canal `app`.
- **Push nativo**: o PWA continua sem push do sistema operacional; o aviso é o sino + o selo da aba
  (183, fora do escopo; revisitar numa spec própria).
- **Conversa com a contratante** e inbox geral de WhatsApp (183 / 062).
- **Chat entre motoristas** ou entre motorista e destinatário da carga.
- Remover a tela antiga do painel: segue a Fase 10 da 189 (aprovação humana).

## Decisões

### D1 — O chat do app é um canal do SDK; o app do motorista só o plugue (decisão do dono, 2026-10-09)

> _"Temos mensagens por canal; esse chat por app deveria ficar dentro do nosso SDK de conversations.
> Temos vários canais, esse é mais um. Se precisa plugar em outro app, está pronto."_

**Nada de tela de conversa dentro de `apps/frontend-driver`.** A ADR-0072 e a skill `adatechnology-ui`
já mandam: a tela de conversa vem de `@adatechnology/conversations-ui`, e "falta uma porta" é mudança
**no pacote** (com changeset), nunca cópia no produto. O que o SDK já tem e esta spec **usa**:

| Peça do SDK (`adatechnology-packages`)                                                                                                                                | Estado hoje                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `conversation-contracts`: canal `app` no vocabulário e na capacidade                                                                                                  | ✅ `app`: anexo 25 MB, grava e toca áudio, respostas rápidas, estados `queued/delivered/read`, sem janela |
| `conversation-module`: assunto genérico `subject_type`/`subject_id` + `audience`, único por (assunto, audiência)                                                      | ✅ é o molde do D2 — o assunto é par opaco, sem domínio do TMS dentro                                     |
| `conversations-ui`: `ConversationsProvider` + `ConversationsApi`, `ConversationPane`, composer, `StatusTicks`, `AudioRecorderButton`, respostas rápidas, tema `.cv-*` | ✅ nasceu para operador (desktop); **falta a visão do participante em celular**                           |

O que **falta** e entra no pacote nesta spec (Fase 1): a **visão do participante** — lista de conversas
agrupada por assunto + conversa em tela cheia, mobile-first, para quem **responde** (motorista, portal da
contratante, qualquer app que ligue o canal `app`), sem takeover, templates, envio em massa nem seleção de
canal. Capacidade opcional **por ausência de prop** (skill: nunca flag `hasX`). O app do motorista vira
~100 linhas de fiação: um `ConversationsApi` apontando para as rotas `/me`, `labels` do locale dele e o tema.

O TransportAdA continua com as **tabelas do produto** (ADR-0072: conversa por participante e atribuição
ficam no produto); migrar para o `conversation-module` seria outra ADR e **está fora do escopo**.
O contrato `ConversationsApi` é a costura: trocar o back depois não muda a tela.

### D2 — Conversa tem assunto: `occurrence` · `document` (nota) · `trip`

Hoje `occurrence_conversations` amarra a conversa a uma ocorrência (`occurrence_kind` ∈ `stop`/`document`

- `occurrence_id`). O assunto vira dado de primeira classe:

| Assunto      | Do que fala                                      | Quem abre                                         | Cartão no topo da conversa                                 |
| ------------ | ------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| `occurrence` | uma ocorrência registrada (a conversa da 183)    | escritório (a partir da ocorrência)               | tipo, parada, nota, o que falta                            |
| `document`   | **uma nota** da viagem (NF-e)                    | escritório **ou** o motorista (no cartão da nota) | nº da nota, destinatário, endereço, parada, status da nota |
| `trip`       | a viagem toda (roteiro, horário, socorro, aviso) | escritório **ou** o motorista                     | viagem, data, próxima parada                               |

O SDK não conhece "nota" nem "ocorrência": o assunto é o par opaco `subjectType`/`subjectId` (como no
`conversation-module`) e **o produto** diz, por prop, quais tipos existem, o rótulo, o ícone e a ordem das
seções (`subjectGroups`). Uma conversa por (assunto, participante), como na 183 D1. **Uma mensagem pertence a uma conversa; uma
conversa pertence a um assunto** — mensagem nunca é "solta", e o motorista nunca precisa adivinhar.

### D3 — A lista separa por assunto e põe o que espera ele primeiro

Seções fixas, nesta ordem: **Espera sua resposta** (última mensagem é da operação e ele não respondeu) →
**Notas** → **Ocorrências** → **Viagem**. Cada linha mostra rótulo do assunto (ícone + texto, nunca só
cor), título humano ("NF 4521 · Casa Verde"), prévia da última mensagem, hora e selo de não lidas. Filtros
por assunto no topo, com contagem de não lidas por filtro. Conversa **encerrada** recolhe para "Encerradas".

### D4 — Quem pode abrir conversa de nota e de viagem

O escritório abre de qualquer assunto (a partir da nota, da ocorrência ou da viagem). O motorista abre
**só nos dois assuntos novos**, pelo botão "Falar com o escritório" no cartão da nota ou no topo da
viagem — nunca cria conversa de ocorrência (ela nasce do registro). Com balde de rate limit próprio.
Conversa de nota/viagem só existe para viagem em que ele está na tripulação (`findMyOccurrence` análogo).

### D5 — Offline: a mensagem espera na fila, com a mesma chave

Enviar sem rede grava a mensagem na fila local (a do app já existe — `offlineQueue.service.ts`) com a
`Idempotency-Key` da mensagem; a bolha aparece como **"na fila · envia quando a rede voltar"** e vira
"enviada" quando o servidor confirma. Reenvio nunca duplica (chave já usada devolve a resposta salva).
Anexo grande segue o upload em duas etapas da 183 T702 e só entra na fila depois de subido.

### D6 — Entradas: aba, cartão e sino levam à conversa certa

Aba **Conversas** com selo de não lidas; botão no cartão da parada/nota/ocorrência abre a conversa daquele
assunto direto; o item do sino (`trip.conversation-message`) abre a conversa — não a lista. Rota
`/conversas/:subjectType/:subjectId` (a seção `conversations` entra em `DriverRouteSection`).

### D7 — O aviso carrega o assunto

O texto do sino passa de "nova mensagem sobre a ocorrência X" para "Nova mensagem · NF 4521" /
"· Ocorrência: avaria · parada 3" / "· Viagem de 09/10". Continua **sem corpo da mensagem** (a mensagem
fica atrás do login, 183 RF11).

### D8 — Toda conversa tem um protocolo legível (decisão do dono, 2026-10-09)

> _"Número — protocolo pode ser formado por data ou id curto."_ O motorista e o operador precisam **citar a
> conversa** por telefone ou WhatsApp sem dizer um UUID.

- **Formato:** `AAMMDD-XXXX` — a data de criação (fuso `America/Sao_Paulo`) + 4 caracteres de um alfabeto sem
  ambíguos (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`, sem `0 O 1 I L`). Ex.: `261009-K7M2`. São ~920 mil combinações por dia
  e por empresa; colisão é recusada pelo índice único e o servidor sorteia de novo (até 5 vezes).
- **Gerado pelo servidor, uma vez, na criação da conversa; imutável.** Nunca pelo cliente. Único por empresa
  (`unique (company_id, protocol)`). Conversas já existentes ganham protocolo por backfill, com a data de criação
  delas, na mesma migration aditiva (Fase 2).
- **Aparece em:** cabeçalho da conversa (abaixo do título), linha da lista, painel do escritório (conversa da
  ocorrência/nota/viagem) e na linha do tempo da viagem. Tocar/clicar copia (com aviso acessível). Não vai em log
  com mensagem; é identificador opaco, não PII.
- **Busca:** a lista do motorista aceita digitar o protocolo para achar a conversa (parcial, sem traço, sem caixa).
- **No SDK:** campo **opcional** `protocol?: string` em `ParticipantConversationSummary` (aditivo, minor); o pacote
  só exibe e copia — **não gera** protocolo e não conhece o formato (é do produto). Capacidade por ausência: sem o
  campo nada é desenhado.

### D9 — Cada item da lista mostra os canais da conversa e o ícone do assunto (pedido do dono, 2026-10-09)

> _"Nos itens do chat teremos os canais que estão interagindo na conversa e também os ícones das ocorrências."_

- **Canais:** a linha da lista (e o cabeçalho da conversa) mostram um selo por canal que **já trocou mensagem** na
  conversa — `app`, `whatsapp`, `email`, `portal`, `webchat` (vocabulário do `conversation-contracts`). Ícone **e
  texto** (cor nunca sozinha; o texto vai em `cv-p-sr-only`). Vem do servidor (`channels`: canais distintos das
  mensagens da conversa), nunca deduzido no cliente. Sem o campo, nada é desenhado.
- **Ícone do assunto:** na ocorrência é o `iconName` do **tipo** (spec 255, catálogo fechado: `alert`, `camera`,
  `clipboard-list`, `clock`, `document`, `invoice`, `message`, `money`, `package`, `truck`; nulo = sem ícone). O
  SDK não conhece o catálogo: recebe `iconName?: string` opaco no resumo e delega o desenho ao produto por
  `renderSubjectIcon?(conversation)`; ausente, cai no ícone do grupo (`subjectGroups`). Nota e viagem usam o ícone
  do grupo.
- **Fora desta decisão:** selo de canal **por mensagem** na bolha (183 D2) — evolução posterior.

### D10 — A conversa segue o desenho do WhatsApp, no estilo do app (pedido do dono, 2026-10-09)

> _"Se inspire no design que temos do WhatsApp, mas voltado para o nosso estilo da aplicação."_ Resultado aprovado pelo dono:
> _"foi o melhor resultado de design"._ (Visão do participante do SDK `conversations-ui` 0.7.0; só `/participant`.)

- **Cabeçalho:** seta de voltar **só ícone** (sem caixa, toque 44×44) → tile 40×40 com o **ícone do assunto** (o mesmo da lista) →
  título em 1 linha → meta com **protocolo + copiar em ícone + canal inline**. Sem título repetido em cartão; o eyebrow do grupo só
  aparece quando não há tile.
- **Corpo:** fundo com padrão pontilhado sutil (CSS puro, `--cv-p-wallpaper`), **pílula de dia** centralizada, bolhas com **rabinho** no
  canto inferior (esquerdo na recebida, direito na própria), **hora e ticks** no pé da bolha, **avatar de iniciais** do autor (o SDK não
  tem foto; o host pode passar uma por `renderAuthorAvatar`).
- **Compositor:** clipe de anexo, campo que cresce até ~4 linhas, enviar com ícone; `Enter` quebra linha (teclado virtual).
- **Fora:** RTL no rabinho (limitação conhecida), foto de usuário (não existe no cadastro), selo de canal por mensagem.

### D11 — As mensagens prontas do motorista são configuradas pela empresa (decisão do dono, 2026-10-09)

> _"Onde estão os balões de mensagens prontas?"_ → escolha: **configuráveis pela empresa**.

Os chips acima do campo de texto do app (tocar **preenche**, nunca envia — 183 D4) hoje não existem no app do motorista: o SDK os
desenha (`quickReplies`), mas o app não passa nenhum e a API só tem respostas rápidas **do escritório** (`company_quick_replies`, público
`contractor`|`driver` = a quem o escritório escreve, cadastro em `/company-settings/quick-replies`, `settings.manage`).

- **Novo público `driver_reply`** (respostas do **motorista** ao escritório): o `CHECK` de `audience` ganha o valor (migration aditiva,
  rollback recusa se houver linha `driver_reply`); as consultas do escritório filtram por público e **não mudam**.
- **Rota do motorista** `GET /me/trips/current/quick-replies` (`trip.read`, `no-store`): respostas ativas do público `driver_reply`, na
  ordem do cadastro, `{ data: [{ id, text }] }`. Sem cadastro, lista vazia ⇒ nenhum chip (capacidade por ausência).
- **App:** busca com a sessão, guarda a **última lista** para uso offline (stale-while-revalidate) e a entrega ao pacote em `quickReplies`.
- **Painel:** (a) configurações ganham a seção "Respostas do motorista" no cadastro que já existe; (b) a conversa do escritório por
  assunto passa a oferecer as respostas do público `driver` (as que já existem) no compositor, hoje ausentes ali.
- **SDK:** nada novo — o `QuickReply` e os chips já existem.

## Histórias priorizadas

### P1 — Ler e responder o escritório sobre uma ocorrência

**Given** o escritório escreveu na ocorrência da parada 3 **When** o motorista toca no aviso do sino **Then**
abre a conversa **daquela ocorrência**, com o cartão da ocorrência no topo, as mensagens, e ele responde
com texto, foto ou documento; as mensagens da operação ficam `lidas`.

### P1 — Não se perder: a lista separa por assunto

**Given** 3 conversas de nota, 2 de ocorrência e 1 da viagem, 2 delas esperando resposta **When** abre
Conversas **Then** vê "Espera sua resposta" (2) no topo e depois as seções por assunto; cada linha diz do que
fala sem abrir.

### P1 — Responder sem rede

**Given** o motorista sem sinal **When** envia "Entreguei, sem canhoto" **Then** a bolha fica "na fila" e,
voltando a rede, sai uma única vez.

### P2 — Falar sobre uma nota

**Given** o motorista no cartão da NF 4521 **When** toca "Falar com o escritório" e envia a pergunta **Then**
nasce a conversa de assunto `document` com a nota no cartão; o operador a vê na viagem, na nota.

### P2 — O escritório abre conversa de nota

**Given** o operador no detalhe da viagem **When** escolhe uma nota e "Falar com o motorista" **Then** a
mensagem chega ao motorista na conversa daquela nota, com aviso no sino citando a nota.

### P3 — Encerrar e recolher

**Given** o assunto resolvido **When** o operador encerra a conversa **Then** ela sai da lista principal do
motorista e fica em "Encerradas" (ainda legível).

## Requisitos funcionais

- **RF1** O app tem a seção `conversations` (aba, lista, conversa), atrás do mesmo login e do mesmo
  gate de `trip.read`/`trip.report` das rotas `/me`.
- **RF2** A lista agrupa por assunto (D3), ordena por última mensagem dentro do grupo e mostra não lidas.
- **RF3** Abrir uma conversa marca lidas as mensagens da operação daquele assunto (T604 da 183) — e só
  dele, nunca "todas".
- **RF4** Resposta com texto até o limite do `OCCURRENCE_MAIL_LIMITS.body`, até 5 anexos de até 25 MB,
  upload em duas etapas (183 T702), `Idempotency-Key` por mensagem.
- **RF5** Estados da bolha: `na fila`, `enviada`, `entregue`, `lida`, `falhou — tocar para reenviar`.
- **RF6** Rascunho **por conversa** em memória do app (não perde ao voltar para a lista; não vaza entre
  conversas).
- **RF7** Respostas rápidas (`quick-replies`, 183) disponíveis como chips acima do campo, as da empresa
  para o motorista.
- **RF8** Conversas de `document` e `trip` (D2/D4): criação, listagem e leitura pelas rotas `/me` e pelo
  painel; o assunto vai na lista (`subjectType`, `subjectId`, `subjectLabel`, `tripId`).
- **RF9** O aviso do sino carrega o assunto (D7) e o item abre a conversa (D6).
- **RF10** Todo texto novo em `pt-BR` e `en`: o do SDK por `labels` (default em inglês + mapa recebido do
  produto); o do app em `.locale.json`. Nenhuma string de domínio no código do pacote.
- **RF14** Toda conversa tem protocolo `AAMMDD-XXXX` gerado pelo servidor (D8), único por empresa, exibido no
  cabeçalho e na lista do app, copiável por toque, e buscável na lista; o escritório o vê no painel.
- **RF15** Cada item da lista e o cabeçalho da conversa mostram os selos dos canais que participaram (D9) e, na
  ocorrência, o ícone do tipo (`iconName`); o servidor devolve `channels` e `iconName`.
- **RF13** (plugar em outro app) A visão do participante recebe **só** um `ConversationsApi`, `labels`,
  `subjectGroups` e o tema. Provado por um segundo consumidor real: o portal da contratante
  (`apps/frontend-client`) abre a conversa dele com o mesmo componente, sem mudar o pacote.
- **RF11** Acessibilidade: lista e bolhas navegáveis por teclado/leitor de tela, `aria-live` para mensagem
  nova, alvo de toque ≥ 44 px, assunto sempre por **ícone + texto** (cor é reforço).
- **RF12** O escritório vê, na nota e na viagem, o botão "Falar com o motorista" e a conversa do
  assunto (painel) — mesma conversa que o motorista vê.

## Requisitos não funcionais

- Resposta `no-store` em toda rota de conversa (já é na 183). Sem PII nos logs; corpo de mensagem nunca
  em log nem em evento.
- Autorização **por objeto**: a conversa de nota/viagem só é alcançável por quem está na tripulação da
  viagem (BOLA); `companyId` do contexto autenticado, nunca do payload.
- Lista paginada por cursor se passar de 50 conversas; carga inicial < 1 s em 4G com 30 conversas.
- Migration aditiva, com `rollback.sql`; conversa de ocorrência existente é preenchida sem perda.

## Casos extremos e falhas

- **Motorista troca no meio da viagem** (ADR-0097): a conversa de nota/viagem acompanha o motorista
  principal atual (`retarget`, como a 183 T903 C1); o anterior deixa de vê-la.
- **Nota sai da viagem** (cancelada/liberada): a conversa de `document` fica legível e vira "Encerrada";
  não aceita resposta nova do motorista.
- **Mensagem chega com o app aberto na conversa**: aparece sem recarregar e é marcada lida só se a conversa
  está em foco.
- **Mesma mensagem enviada duas vezes** (rede ruim): a chave devolve a resposta salva — uma bolha só.
- **Anexo maior que 25 MB / tipo não permitido**: recusa clara antes de subir, sem esvaziar o rascunho.
- **Sessão expirada no meio do envio**: a mensagem fica na fila e sai depois do login (mesmo caminho da
  fila de eventos).

## Critérios de aceite

- A1 O motorista toca no aviso e cai na conversa certa (ocorrência, nota ou viagem).
- A2 A lista tem as quatro seções de D3 e nenhuma conversa aparece em duas.
- A3 Enviar offline não duplica ao reconectar (teste com a mesma chave duas vezes).
- A4 O motorista de outra viagem recebe `404` na conversa de nota/viagem (contrato negativo).
- A5 Nenhuma mensagem altera tratativa, taxa ou acerto (mutação: remover a barreira reprova teste).
- A6 `make check` verde nas três apps tocadas; `make migration-test` verde.
- A9 Duas conversas nunca têm o mesmo protocolo na mesma empresa (teste de colisão forçada: o servidor sorteia de novo); o protocolo é imutável; aparece no app e no painel.
- A8 O pacote publica com changeset e passe de revisão `opus`; os três consumidores
  (`frontend-driver`, `frontend-transportada`, `frontend-client`) ficam **na mesma versão** do
  `conversations-ui`; o portal da contratante renderiza a visão do participante (RF13).
- A7 Revisão de design: print do app contra a `preview.html`, lado a lado (web.md §15).

## Dúvidas

Nenhuma bloqueante. As decisões D2 (três assuntos), D3 (ordem das seções) e D4 (motorista abre nota e
viagem, não ocorrência) foram tomadas por delegação; o usuário pode emendar na revisão da prévia.
