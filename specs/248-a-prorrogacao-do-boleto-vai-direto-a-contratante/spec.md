# Feature 248 — A prorrogação do boleto vai direto à contratante, e o boleto atualizado responde o motorista

## Problema e resultado

No balcão, o cliente pede ao motorista para prorrogar o vencimento do boleto. Hoje o motorista
registra "Cliente pediu prorrogação do boleto" (tipo semeado pela 241,
`occurrence-type-catalog.constant.ts:52`), e daí em diante tudo depende de alguém no escritório:
escrever à contratante, esperar o boleto novo, achá-lo na caixa de e-mail e mandá-lo ao motorista.
O motorista fica parado na frente do cliente sem saber se o boleto vem.

O SAC da contratante já disse o formato do pedido (arquivo `Template de ocorrências.md`, recebido em
2026-10-06):

```text
Assunto: OCORRÊNCIA -SPANI - NF - 717795 -MOT - JOSE BENTO - MOTIVO - PRORROGAÇÃO

Bom dia,

O cliente está solicitando a prorrogação do boleto.

MOTORISTA:  JOSÉ BENTO
RAZÃO SOCIAL:. MERCADO FONTE NOVA TURMALINA
NOTA FISCAL: 717795
VALOR DA NOTA:
```

O que o usuário pediu, nas palavras dele (2026-10-06):

- _"a prorrogação deve ir diretamente para a Spani e devemos observar o retorno do boleto atualizado
  e já responder o motorista"_;
- _"tem ocorrências de pedido de alteração de vencimento de boleto que não interferem em nada na
  entrega"_;
- _"geralmente é entre 5 – 6 horas de resposta; se não responder nesse tempo, ir alarmando a
  operação"_;
- _"vai automático, com opções de enviar para o e-mail do cliente que está cadastrado na nota e também
  opções de encaminhar o boleto atualizado por e-mail informado"_;
- _"vamos utilizar mais nosso chat próprio"_; antes disso, sobre o WhatsApp: _"não vamos precisar de
  modelo, pois só vamos trabalhar com a sessão ligada às 24 horas"_ e _"sempre será iniciado pelo
  motorista"_;
- e a regra que vale para tudo: _"isso deve ser tudo configuração na criação do tipo de ocorrência"_.

Ao fim:

1. O motorista registra a prorrogação (no app ou pelo WhatsApp), sem foto, sem produtos, sem soltar a
   nota e sem tratativa.
2. O e-mail sai sozinho à contratante **da nota**, no formato do SAC.
3. A contratante devolve o boleto **respondendo ao e-mail com o PDF anexo** — ou escrevendo com o PDF
   no **portal** dela, que vale igual.
4. Se ela não responde no prazo do tipo (6 h no roteiro), a operação é **alertada de novo a cada
   intervalo** até a resposta chegar, a ocorrência ser encerrada ou alguém marcar "tratado".
5. O PDF chega ao motorista **na conversa da ocorrência no chat do próprio produto**, sozinho, e o
   WhatsApp é canal opcional do tipo.
6. Da página da ocorrência, o operador pode mandar o boleto **ao e-mail do cliente que está na nota**
   e **a um e-mail que ele informa**.
7. A linha da ocorrência mostra em que pé está cada coisa.

Protótipo das três telas (aba Tipos, painel do retorno, chat do motorista) em [`preview.html`](preview.html),
no tema real do painel e com os seletores copiados do `Select` da aplicação.

## O que já existe, o que falta

Levantado no código de `origin/staging` (`221b58400`), 2026-10-06. Linhas e detalhe em `plan.md`.

| Ponta                                          | Existe                                                                                                                                                                                                                                                                                                    | Falta                                                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipo sem itens, sem foto, sem soltar a nota    | 241 (`items_mode = off` ⇒ `redelivery_policy = unset`), 246 (exigências por campo); `unset` não abre tratativa (`occurrence-case.policy.ts:23`)                                                                                                                                                           | nada                                                                                                                                                                         |
| Registro pelo WhatsApp do motorista            | menu → nota → tipo → observação (`whatsapp-commands/application/register-driver-flow-actions.ts:393-532`), tipos do momento `document` (`:597-599`), mesmo `registerDriverOccurrence` do app; a prorrogação (sem foto, sem produtos) é registrável por ali                                                | nada                                                                                                                                                                         |
| E-mail automático à contratante da nota        | 183: `emails_contractor` + `email_subject`/`email_body`, hook depois do commit (`automatic-occurrence-mail.hook.ts:48-86`), contatos de `contractor_contacts`                                                                                                                                             | o editor na tela (**247**); o hook é em memória — processo que cai entre o commit e o hook perde o e-mail                                                                    |
| Resposta por e-mail, com anexo                 | 143/183: webhook Svix, token por conversa (`reply-token.policy.ts:31-52`), worker grava a mensagem `inbound` e os anexos conferidos pelos bytes (`inbound-mail-attachments.service.ts`)                                                                                                                   | reagir à resposta                                                                                                                                                            |
| Resposta pelo portal da contratante, com anexo | `POST /client/me/occurrence-conversations/:ref/messages` com `attachmentIds` (`client-occurrence-conversation.routes.ts:107-139`), grava `channel 'portal'`, `inbound` (`drizzle-contractor-portal-conversation.repository.ts:244-262`)                                                                   | reagir à resposta; avisar o operador (hoje ninguém é avisado, `contractor-portal-conversation.use-case.ts:163-170`)                                                          |
| Chat do motorista no produto (API)             | conversa `driver` com canal `app`, anexos até 25 MB (documento), aviso no sino `trip.conversation-message` (`driver-conversation.use-case.ts:69-161`; `driver-conversation-notifier.gateway.ts:33-49`); rotas `/me/trips/current/occurrences/:id/messages` (`me-occurrence-conversation.routes.ts:28-33`) | levar o anexo da conversa da contratante à do motorista (só existe o sentido inverso, `forwardDriverAttachments`, `contractor-portal-message.use-case.ts:142-153`)           |
| Chat do motorista no **app do motorista**      | **não existe** em `apps/frontend-driver`: a conversa só está no PWA antigo dentro do painel (`frontend-transportada/src/modules/driver-trip/pages/DriverOccurrenceConversations.page.tsx`), e o motorista redirecionado ao app próprio (`frontend-transportada/src/main.tsx:451-490`) não a vê            | a tela de conversa da ocorrência no app do motorista                                                                                                                         |
| WhatsApp ao motorista                          | `SendMessageUseCase` do pacote `meta-whatsapp-module` 0.8.0 com `sendMedia` e `assertWithinWindow` de 24 h (`dist/index.js:1029-1033`); provider 0.4.0 com `sendMedia` (documento) e `WhatsAppWindowExpiredError`; última inbound por número em `meta_whatsapp.sessions.last_inbound_at`                  | o produto não chama nada disso: gateway só `sendText`/`sendTemplate` (`meta-whatsapp-sending.gateway.ts:35-51`); nenhum gatilho entrega pendência quando o motorista escreve |
| E-mail do cliente da nota                      | **não existe**: o parser não expõe `<dest><email>` (`fiscal-provider` 0.3.2, `types.d.ts:816-822`, `NfeXmlParty` sem e-mail), `nfe.schema.ts` não tem coluna, e `delivery_clients` não guarda contato (ADR-0048 §2)                                                                                       | guardar o e-mail que a NF-e já traz                                                                                                                                          |
| E-mail a endereço livre                        | **não existe**: os destinatários só saem de `contractor_contacts` (`drizzle-occurrence-mail.repository.ts:410-428`)                                                                                                                                                                                       | o envio a terceiro, com validação e auditoria                                                                                                                                |
| Alarme repetido ao operador                    | sino (`notification` com INBOX e EMAIL), aviso a quem despachou a viagem (`occurrence-notifier.gateway.ts:32-83`); dedupe **permanente** por chave (`notification.notifications`, índice único `(company_id, dedupe_key)`)                                                                                | job de prazo; chave por alerta para repetir                                                                                                                                  |
| Auditoria da ação automática                   | rastro nas mensagens (`automatic = true`)                                                                                                                                                                                                                                                                 | `audit_logs.actor_user_id` é `NOT NULL` (`fiscal-operation.schema.ts:37-63`): ação sem usuário não cabe                                                                      |

## Tudo é configuração do tipo

A prorrogação é **uma linha** de `company_occurrence_types`, criada ou editada na aba Tipos. Nenhum
código pergunta pelo nome. O nome do catálogo (`BILL_EXTENSION_OCCURRENCE_TYPE_NAME`) só serve ao
bootstrap de empresa vazia e continua assim. Contraexemplo que **não** se repete: a migration da 241
casou a segunda via por nome exato (`20261006033752_occurrence_type_items_mode/migration.sql:14`).

### Campos novos do tipo (`company_occurrence_types`)

| Campo                                     | Vocabulário                                            | Default             | O que governa                                                                                            |
| ----------------------------------------- | ------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------- |
| `contractor_reply_mode`                   | `off` · `forward_after_approval` · `forward_automatic` | `off`               | o que fazer com a resposta: nada além de mostrá-la; levar ao motorista depois de um toque; levar sozinho |
| `contractor_reply_attachment_kind`        | `pdf` · `pdf_or_image`                                 | `pdf`               | qual anexo da resposta vale como retorno                                                                 |
| `driver_reply_channel`                    | `app_chat` · `whatsapp` · `both`                       | `app_chat`          | por onde o motorista recebe                                                                              |
| `driver_reply_window_closed_action`       | `fallback_app_chat` · `wait_for_driver`                | `fallback_app_chat` | com `whatsapp` e a janela de 24 h fechada: entregar no chat do app, ou esperar o motorista escrever      |
| `driver_reply_template`                   | texto, 1–1000, marcadores da lista fechada (079/247)   | `''`                | a mensagem que acompanha o PDF ao motorista                                                              |
| `contractor_reply_wait_hours`             | inteiro 1–168, ou nulo                                 | nulo                | prazo de espera; nulo = sem prazo                                                                        |
| `contractor_reply_alert_mode`             | `off` · `alert_operator`                               | `off`               | se o atraso alarma a operação                                                                            |
| `contractor_reply_alert_interval_minutes` | inteiro 15–1440                                        | `60`                | de quanto em quanto tempo o alarme repete                                                                |
| `contractor_reply_alert_max_count`        | inteiro 1–96                                           | `24`                | teto de alertas por ocorrência (protege o sino de enchente)                                              |
| `forward_to_note_recipient`               | `off` · `manual` · `automatic`                         | `off`               | mandar o boleto ao e-mail do cliente que está na nota                                                    |
| `forward_to_informed_email`               | `off` · `manual`                                       | `off`               | mandar o boleto a um e-mail que o operador informa                                                       |
| `forward_email_subject`                   | texto, 0–200, marcadores                               | `''`                | assunto do e-mail ao cliente / ao e-mail informado                                                       |
| `forward_email_body`                      | texto, 0–4000, marcadores                              | `''`                | corpo desse e-mail                                                                                       |

CHECKs (todas geradas de constantes; escrita fora delas → `422` com código estável por regra):

- `contractor_reply_mode <> 'off'` exige `emails_contractor = true` e `btrim(driver_reply_template) <> ''`.
- `contractor_reply_alert_mode <> 'off'` exige `contractor_reply_wait_hours IS NOT NULL`.
- `forward_to_note_recipient = 'automatic'` exige `contractor_reply_mode <> 'off'` (sem retorno
  reconhecido não há o que mandar sozinho).
- `forward_to_note_recipient <> 'off' OR forward_to_informed_email <> 'off'` exige
  `btrim(forward_email_subject) <> ''` e `btrim(forward_email_body) <> ''`.
- **Mandar ao cliente da nota sozinho é sempre escolha explícita**: o default é `off`, e nenhuma
  migration liga isso em tipo existente.

### Campos que já existem e esta spec usa (sem duplicar)

`emails_contractor`, `email_subject`, `email_body` (183/079, editáveis na tela pela 247),
`items_mode = off`, `attachment_mode = off`, `note_mode`, momentos (246), `redelivery_policy =
unset` (164/241).

### Exceção por contratante (camada da 246)

A exceção declara **o que muda**, nula herda do tipo (`resolve-with-overrides.policy.ts`). **Decidido
por delegação em 2026-10-06 — reversível:** entram na exceção **por contratante**
(`company_occurrence_type_contractor_overrides`), nulas e sem default:

- `contractor_reply_mode` e `contractor_reply_wait_hours` — o comportamento do retorno é da
  contratante (uma devolve em 5–6 h com PDF, outra não devolve por e-mail);
- `forward_to_note_recipient` — uma contratante pode querer que o cliente receba o boleto sozinho e
  outra não.

**Não entram:** a exceção por **destinatário** (quem responde é a contratante), os textos, o canal
do motorista, o tipo de anexo e a cadência do alarme — seriam segundo mecanismo. Custo de reverter:
colunas nulas, migration aditiva.

## O que é o momento

Mesma explicação da [spec 247](../247-a-devolucao-soma-os-itens-linha-por-linha/spec.md) § "O que é o
momento": o momento diz **quem registra e sobre o quê**. A prorrogação é registrada pelo **motorista,
numa nota** (hoje rotulado "Entrega da nota", proposta da 247: "Motorista, numa nota") e, se a
operação quiser, pelo **escritório, pelo motorista**.

## Decisões do usuário (fechadas em 2026-10-06)

| #   | Pergunta                                               | Resposta                                                                                                                                                                                                  | O que ela substitui                                                                                                                                                          |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Como a contratante devolve o boleto?                   | **Respondendo ao e-mail com o PDF anexo.**                                                                                                                                                                | link no corpo, outro canal                                                                                                                                                   |
| Q2  | Prazo e o que fazer sem resposta?                      | **5–6 h; passado isso, alarmar a operação repetidamente.** Roteiro: 6 h, alerta a cada 60 min, até 24 alertas (decidido por delegação, abaixo).                                                           | lembrete único                                                                                                                                                               |
| Q3  | O boleto vai sozinho ao motorista?                     | **Sim, automático**, com as **opções** de mandar ao e-mail do cliente que está na nota e a um e-mail informado.                                                                                           | aprovação do operador                                                                                                                                                        |
| Q4  | Canal ao motorista                                     | **O chat do próprio produto é o principal** ("vamos utilizar mais nosso chat próprio"); o WhatsApp é opcional e **sem modelo da Meta**, só mensagem livre dentro da janela de 24 h aberta pelo motorista. | WhatsApp como canal principal, com modelo aprovado pela Meta. Custo de reverter: a fase de modelo (submissão à Meta, `sendTemplate` fora da janela) — nada desta spec impede |
| Q6  | O motorista só mostra ou o produto repassa ao cliente? | **O produto manda ao cliente por e-mail** (resposta da Q3).                                                                                                                                               | o motorista compartilhar do aparelho                                                                                                                                         |

**Q5** (texto do modelo da Meta) **deixa de existir**: sem modelo, não há texto a submeter nem passo
humano na Meta, e esta spec **não depende** da 183 T002/T503.

**Consequência derivada da Q4 (regra, não pergunta):** a janela de 24 h abre quando o motorista
**manda mensagem** ao número da empresa, não quando registra no app. Por isso:

- O chat do app (`app_chat`) não tem janela: o PDF fica na conversa e o motorista é avisado no sino.
  É o default e o valor do roteiro.
- Com `whatsapp` ou `both`, o envio só sai se a última mensagem do motorista ao número tiver menos de
  24 h (`meta_whatsapp.sessions.last_inbound_at`, por número). O registro **pelo WhatsApp** abre a
  janela; o registro **pelo app** não. Com a resposta da contratante em 5–6 h, o registro pelo
  WhatsApp chega folgado; uma resposta depois de 24 h (fim de semana) encontra a janela fechada.
- Janela fechada: com `fallback_app_chat` o PDF vai ao chat do app na hora (e ao WhatsApp quando ele
  escrever); com `wait_for_driver` a entrega fica **pendente**, o estado diz "aguardando o motorista
  escrever no WhatsApp", e o alarme da operação vale para esse estado também. Em ambos, **quando o
  motorista escrever de novo** ao número, o gatilho da mensagem recebida entrega o pendente na hora,
  uma vez só.
- Alternativa descartada: modelo aprovado pela Meta para abrir a conversa (decisão do usuário). Custo
  de reverter: a fase de modelo, com submissão do texto à Meta.

**Consequência derivada do chat próprio:** a resposta da contratante pelo **portal**, com PDF, vale
como a resposta por e-mail — mesma regra de anexo, mesmo estado. O retorno principal continua sendo a
resposta ao e-mail (Q1).

## Fora do escopo

- Pagar, emitir, calcular ou validar boleto; ler linha digitável ou vencimento de dentro do PDF.
- Mudar a regra da tratativa (164): a prorrogação não abre tratativa e não muda o estado da nota.
- Interpretar o texto da resposta (183 D4: a conversa não decide). O retorno é reconhecido pelo
  **anexo** na conversa certa, nunca por palavra.
- Modelo de WhatsApp aprovado pela Meta (Q4).
- O canal WhatsApp **à contratante** (183 T002).
- Contato do cliente de entrega em `delivery_clients` (ADR-0048 §2 continua: o cliente não vira CRM).
  O e-mail usado é **o que está na NF-e**, dado do documento fiscal.
- Antivírus (D6).
- Aviso ao operador para toda mensagem do portal (só a resposta que mexe no retorno avisa).

## Histórias priorizadas

### P1 — O pedido sai sozinho, no formato do SAC

**Given** o tipo de prorrogação com `emails_contractor` ligado e o modelo do SAC
**When** o motorista registra a prorrogação da NF 717795, no app ou pelo WhatsApp
**Then** o e-mail sai à contratante da nota sem ninguém no escritório tocar
**And** a ocorrência mostra **"Aguardando a contratante · responde até 16:40"**
**And** a nota continua na viagem, sem tratativa e sem foto.

### P2 — Passou do prazo, a operação é alarmada até resolver

**Given** prazo de 6 h, alerta a cada 60 min, teto 24
**When** passam 6 h sem resposta
**Then** a ocorrência vira **"Atrasada · 1 alerta"** e quem despachou a viagem recebe o alerta no sino
(e por e-mail interno, como os avisos de ocorrência)
**And** a cada 60 min sai um novo alerta, com o selo contando ("Atrasada · 3 alertas")
**And** o alarme para quando a resposta chega, quando a ocorrência é cancelada ou encerrada, quando
alguém toca **"Marcar como tratado"**, ou no teto
**And** no painel o operador tem **"Reenviar o pedido à contratante"**, os contatos dela (e-mail e
telefone já cadastrados em `contractor_contacts`) para ligar, e **"Marcar como tratado"** com uma nota.

### P3 — O boleto chega ao motorista no chat do app

**Given** o tipo com `forward_automatic` e canal `app_chat`
**When** a contratante responde ao e-mail (ou escreve no portal) com um PDF
**Then** a ocorrência passa a **"Boleto recebido"** e, em seguida, **"Enviado ao motorista pelo chat"**
**And** o motorista recebe o aviso no sino do app, abre a conversa da ocorrência e baixa o PDF.

### P4 — O operador manda ao cliente da nota e a um e-mail informado

**Given** o tipo com `forward_to_note_recipient = manual` e `forward_to_informed_email = manual`
**When** o operador abre a ocorrência com o boleto recebido
**Then** vê **"Enviar ao cliente da nota"** com o e-mail mascarado (`f***@m***.com.br`), ou o botão
indisponível com o motivo "a nota não traz e-mail do destinatário"
**And** vê **"Encaminhar para um e-mail"** com um campo de **um** endereço
**And** cada envio aparece na linha do tempo ("Enviado ao cliente por e-mail", "Enviado a e-mail
informado"), com quem enviou e quando; repetir o toque não manda duas vezes.

### P5 — WhatsApp com janela fechada não perde o boleto

**Given** canal `whatsapp` com `wait_for_driver`, e o motorista registrou pelo app há 30 h
**When** o boleto chega
**Then** a ocorrência mostra **"Boleto recebido · aguardando o motorista escrever no WhatsApp"** e o
alarme da operação vale
**And** quando o motorista manda qualquer mensagem ao número, o boleto sai na hora, uma vez só.

### P6 — O que dá errado aparece com o motivo

**Given** a resposta não traz PDF, ou traz dois
**When** ela chega
**Then** o estado vira **"Precisa do operador"** com o motivo, nada vai sozinho, e o operador escolhe o
anexo ou responde à contratante.

## Requisitos funcionais

- **RF1** Os campos do tipo (tabela acima), com CHECKs, validação no `PUT
/company-settings/occurrence-types`, leitura nos `GET`, e o bloco **"Retorno da contratante"** na aba
  Tipos, dentro de "E-mail à contratante" (247), habilitado só com o e-mail ligado. Os seletores são
  o `Select` da aplicação, como na 246/247.
- **RF2** O pedido é o aviso automático da 183, sem segundo caminho. Um **varredor**
  (`occurrence.automatic-mail.sweep`, cron) reenvia pela mesma chave de idempotência
  (`occurrence-auto-mail:<id>`) a ocorrência de tipo com `emails_contractor` sem mensagem automática
  10 minutos depois do registro.
- **RF3** Toda ocorrência de tipo com `contractor_reply_mode` **efetivo** `<> off` ganha, na mesma
  transação do envio do pedido, um **retorno** (`awaiting_contractor`) com a configuração efetiva
  **copiada** (modo, prazo, canal, alarme, encaminhamentos) e `deadline_at`. Um por ocorrência.
- **RF4** **Entrada da resposta, por dois caminhos com a mesma regra.** Depois de gravada uma
  mensagem `inbound` na conversa da contratante — por e-mail (worker, depois de
  `recordOccurrenceConversationMailReply`) ou pelo portal (API, depois do commit de
  `contractor-portal-conversation.use-case.ts`) —, a política pura `decideContractorReply` decide
  sobre o retorno aberto:
  - exatamente **um** anexo do tipo aceito → `reply_received`, e então entrega automática ou
    `awaiting_operator`;
  - **nenhum** anexo aceito → `needs_operator` / `no_accepted_attachment` (o alarme de atraso para;
    o operador recebe **um** alerta);
  - **mais de um** → `needs_operator` / `multiple_attachments`;
  - retorno já entregue → nada muda; a resposta fica na conversa (RF9).
    O tipo é o **conferido pelos bytes** (`conversation-attachment.policy.ts:121-154`), nunca o nome nem
    o `Content-Type` declarado.
- **RF5** **Alarme escalonado.** O job `occurrence.contractor-reply.alert` passa o retorno vencido a
  `overdue` e manda um alerta a cada `alert_interval_minutes`, até `alert_max_count`, enquanto o
  retorno estiver em `overdue` (ou em entrega pendente de janela, RF7). Cada alerta:
  - incrementa `alert_count` e grava evento;
  - notifica pelo módulo de notificações (sino + e-mail interno) **quem despachou a viagem** — a
    mesma regra de destinatário do aviso interno (`occurrence-notifier.gateway.ts:24-27`) —, com
    template novo `trip.occurrence-contractor-reply-overdue` e `dedupeKey` que inclui o número do
    alerta (o dedupe do módulo é permanente por chave);
  - viagem sem despacho: só o selo e o filtro "Atrasadas" na lista de ocorrências.
    Para quando: resposta chega (RF4), ocorrência cancelada (240) ou encerrada, **"Marcar como
    tratado"** (`handled`, com nota e autor), ou teto. Job rodando duas vezes não manda alerta duplicado
    (transição condicional por `alert_count`).
- **RF6** **Ações do operador no alarme** (`occurrences.resolve`): **Reenviar o pedido à contratante**
  (resposta na mesma conversa de e-mail, texto do produto "Reenvio do pedido abaixo.", no máximo uma
  vez por intervalo de alarme); **Marcar como tratado** (nota obrigatória, 1–500); a lista de contatos
  da contratante com e-mail e telefone já cadastrados, para ligar.
- **RF7** **Entrega ao motorista**, caso de uso único `deliverContractorReplyToDriver`:
  - `app_chat`: mensagem na conversa **do motorista**, canal `app`, com `driver_reply_template`
    renderizado e o **mesmo `stored_object`** do anexo da resposta (referência, como o encaminhamento
    do portal já faz, `drizzle-contractor-portal-message.repository.ts:111-137`), e o aviso no sino que
    já existe (`trip.conversation-message`).
  - `whatsapp`: `SendMessageUseCase.sendMedia` do pacote `meta-whatsapp-module` (documento, com a
    janela conferida pelo próprio pacote), ao telefone verificado do motorista
    (`user_whatsapp_phones.verified_at`); a mensagem também fica gravada na conversa do motorista,
    canal `whatsapp`. Janela fechada → `driver_reply_window_closed_action`.
  - `both`: os dois; o estado é "enviado" quando o primeiro sai.
    Idempotente por `(retorno, alvo)`.
- **RF8** **Retomada pelo motorista.** O gatilho da mensagem recebida no WhatsApp
  (`createOccurrenceConversationWhatsAppHook`, que fica antes do despachante de comandos,
  `main.ts:1688-1695`) passa a consultar, para o motorista daquele telefone, entregas
  `pending_window`, e as entrega na hora — **sem consumir** a mensagem (ela segue para a conversa ou
  para o fluxo de comandos, como hoje). Trava por linha (`FOR UPDATE SKIP LOCKED`) e transição
  condicional: duas mensagens seguidas não mandam o boleto duas vezes.
- **RF9** **Encaminhar à mão.** O operador pode levar **qualquer** anexo da conversa da contratante à
  do motorista pelo mesmo caso de uso (`occurrences.resolve`): cobre resposta duplicada, resposta
  depois da entrega, `needs_operator` e `awaiting_operator`.
- **RF10** **Ao cliente da nota.** `nfe_documents` passa a guardar `recipient_email` (o
  `<dest><email>` da NF-e; o parser do pacote fiscal passa a expô-lo — mudança no
  `adatechnology-packages`). Com `forward_to_note_recipient`:
  - `manual`: botão na página da ocorrência;
  - `automatic`: sai junto com a entrega ao motorista;
  - **sem e-mail na nota** (ou nota importada antes da coluna): o botão fica indisponível com o
    motivo à vista; no automático, o envio vira `skipped` / `note_without_recipient_email` na linha do
    tempo, **nunca** falha calada e **nunca** cai para outro endereço.
    Nota antiga: um job de backfill (`nfe.recipient-email.backfill`, molde de `identity.document.backfill`)
    relê o XML original guardado e preenche — só com autorização do usuário em produção.
- **RF11** **A um e-mail informado.** Com `forward_to_informed_email = manual`, um campo de **um**
  endereço: `trim`, ≤ 254, `z.string().email()`, recusa de `\r`, `\n`, `,`, `;`, `<`, `>` (injeção de
  cabeçalho e lista — o envio da 183 já recusa `/[\r\n,<>]/u`, `send-occurrence-mail.use-case.ts:44`).
  Nunca automático (D10).
- **RF12** **Envio de e-mail a terceiro.** Novo trilho no outbox de e-mail da 143 (Resend pelo
  worker), **sem** thread de conversa e **sem** token de resposta (resposta do cliente não pode cair
  na conversa da contratante): remetente da empresa, `Reply-To` = endereço de contato da empresa
  quando houver, assunto e corpo de `forward_email_subject`/`forward_email_body`, o PDF **como anexo**
  (base64, como o worker já faz, `send-contractor-mail-outbound-message.use-case.ts:157-180`; teto do
  canal e-mail 10 MB por arquivo, `conversation-attachment.policy.ts:44`: PDF maior vira `failed` /
  `attachment_too_large_for_email`). Idempotência por chave do cliente (`Idempotency-Key`) e por
  `(retorno, alvo, endereço normalizado)` no automático.
- **RF13** **Estado e linha do tempo.** Selo na lista e no detalhe: Aguardando a contratante (prazo) ·
  Atrasada · N alertas · Boleto recebido · Aguardando o operador · Precisa do operador (motivo) ·
  Enviado ao motorista pelo chat · Enviado ao motorista pelo WhatsApp · Aguardando o motorista escrever
  no WhatsApp · Enviado ao cliente por e-mail · Enviado a e-mail informado · Falhou (motivo) · Tratado.
  No app do motorista: "Pedido enviado à contratante" e, depois, a conversa com o PDF.
- **RF14** **Chat no app do motorista.** `apps/frontend-driver` ganha a conversa da ocorrência: lista
  das conversas da viagem com não lidas, leitura, resposta com anexo e download do anexo por URL
  assinada, sobre as rotas `/me/...` que já existem; o aviso do sino (`trip.conversation-message`)
  abre a conversa. Sem cache offline de API (o `sw.ts` não tem): sem rede, a tela diz isso.
- **RF15** **Histórico imutável:** cada transição e cada envio gravam evento
  (`occurrence_contractor_reply_events`) com `actor_kind` `system` | `user`, `actor_user_id` nulo só
  quando `system`. É a auditoria da ação automática e do envio a terceiro.
- **RF16** O retorno nunca escreve na tratativa nem na nota (183 D4; contrato
  `conversation-never-decides.contract.ts` estendido).

## Requisitos não funcionais

- **Segurança do PDF** (entrada não confiável): tipo pelos bytes, tetos da 183, bucket privado, chave
  opaca (`occurrence-conversations/<token>`) sem CNPJ, e-mail ou nome; download por URL assinada de
  300 s com `Content-Disposition: attachment`; nunca aberto, convertido ou executado no servidor;
  nenhum byte no banco.
- **Dado pessoal de terceiro (LGPD, security.md §1):** o e-mail do cliente da nota e o informado são
  guardados só onde a auditoria precisa (`recipient_email` na nota; o endereço do envio na linha de
  entrega). **Nunca** em log, nome de objeto, URL ou métrica: log leva o id e o endereço **mascarado**
  pela função central (`maskEmailAddress`, hoje privada em `identity/domain/company-user.policy.ts:177`,
  promovida a `shared/`). Tela mostra mascarado até o operador abrir o detalhe.
- **Permissão:** encaminhar, reenviar, marcar tratado e mandar a terceiro exigem `occurrences.resolve`
  (company-admin, finance, operator, `authorization.policy.ts:110`); ver exige `fleet.read`. Nenhuma
  permissão nova.
- **Limite de taxa** (store `postgres`, por `companyId:userId`): envio a terceiro 10 / 3600 s
  (escopo próprio); reenvio do pedido e encaminhamento usam o escopo da conversa da 183 (30 / 300 s).
  Por ocorrência, no máximo 5 envios a e-mail informado (regra no caso de uso, com erro estável).
- `companyId` vem do contexto (rotas) ou do webhook já conferido (worker); toda busca é por
  `(company_id, …)`. Contratos negativos entre empresas.
- Idempotência: resposta por `provider_email_id` (existe); transição condicional por estado; entrega
  por `(retorno, alvo)`; envio manual por `Idempotency-Key`.
- Migration aditiva com `rollback.sql`; sem ENUM nativo; CHECKs nomeadas ≤ 63.
- Ordem de publicação (ADR-0081 §9): painel e apps tolerantes → banco, worker, API e cron → telas.

## Casos extremos e falhas

| Caso                                                       | Comportamento                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Contratante sem contato que receba ocorrências             | pedido não sai (`no_recipient`, 183); retorno não é criado; selo "Pedido não enviado: sem contato" |
| E-mail da empresa não configurado                          | idem, `mail_not_ready`                                                                             |
| Resposta sem anexo aceito                                  | `needs_operator`; o alarme de atraso para; um alerta                                               |
| Vários PDFs                                                | `needs_operator` / `multiple_attachments`; o operador escolhe (RF9)                                |
| PDF > 10 MB pelo e-mail                                    | a 183 já descarta; vira "sem anexo aceito"                                                         |
| PDF > 10 MB pelo portal (até 25 MB)                        | vai ao motorista; envio a terceiro por e-mail falha com `attachment_too_large_for_email`           |
| Resposta duplicada                                         | idempotente por `provider_email_id`                                                                |
| Segunda resposta depois da entrega                         | fica na conversa; RF9                                                                              |
| Resposta de outra ocorrência / token inválido              | o token é por conversa; o worker descarta o desconhecido (`token_unknown`, 143)                    |
| Motorista sem conta                                        | `failed` / `driver_without_account`                                                                |
| Canal WhatsApp e motorista sem telefone verificado         | `fallback_app_chat` → chat; `wait_for_driver` → `failed` / `driver_unreachable`                    |
| Janela fechada (> 24 h da última mensagem do motorista)    | RF7/RF8: chat na hora ou pendente até ele escrever                                                 |
| Meta recusa por janela mesmo dentro do cálculo             | `WhatsAppWindowExpiredError` → mesmo tratamento de janela fechada                                  |
| Nota sem e-mail do destinatário                            | botão indisponível com motivo; automático vira `skipped`, nunca outro endereço                     |
| E-mail informado inválido, múltiplo ou com quebra de linha | `400` com código estável; nada sai                                                                 |
| Ocorrência cancelada (240)                                 | retorno `cancelled`; alarme para; entrega pendente é descartada                                    |
| Tipo reconfigurado no meio                                 | vale a cópia do retorno; a mudança vale para as próximas                                           |

## Critérios de aceite

- **CA01** Registro do tipo configurado (pelo app e pelo fluxo de WhatsApp) → e-mail com o assunto e o
  corpo do SAC renderizados, e retorno `awaiting_contractor` com prazo — integração.
- **CA02** Resposta com um PDF, por e-mail **e** pelo portal → entregue ao motorista no chat
  referenciando o mesmo `stored_object` — integração do worker e da API.
- **CA03** `decideContractorReply` cobre a tabela de casos, idêntica na API e no worker — contrato,
  com mutações.
- **CA04** **Só a configuração decide:** dois tipos de mesmo nome com campos diferentes se comportam
  diferente; a exceção por contratante muda modo, prazo e encaminhamento só para ela — contrato e
  integração, com mutação (`if` pelo nome).
- **CA05** Alarme: o primeiro alerta no prazo, um por intervalo, nenhum duplicado com o job em dobro,
  parada nas quatro condições e no teto — integração.
- **CA06** Janela: com `wait_for_driver`, a entrega fica pendente e sai **uma vez** quando o motorista
  escreve, mesmo com duas mensagens seguidas — integração com o pacote dublê.
- **CA07** Envio a terceiro: e-mail informado inválido/múltiplo/com cabeçalho recusado; nota sem
  e-mail deixa a opção indisponível; repetir com a mesma `Idempotency-Key` não duplica; limite de
  taxa responde `429` — contrato e integração.
- **CA08** Nenhum log com e-mail, nome de arquivo, CNPJ ou número de nota nos arquivos novos — contrato
  de parede **e** mutação.
- **CA09** Empresa B não vê nem move retorno da A — integração.
- **CA10** `make migration-test` verde com `rollback.sql`.
- **CA11** Revisão de design e usabilidade com print em 375, 768 e 1280, comparando com o
  `preview.html`.
- **CA12** Passada independente de funcionalidade, usabilidade e design por `code-reviewer`.

## Modelo do SAC (valores exatos do roteiro)

Dado que o operador digita na aba Tipos — nada disso entra no código, seed ou migration.

- Tipo: o que a empresa já tem, "Cliente pediu prorrogação do boleto" (241), ou um criado na tela.
- Momentos: **Motorista, numa nota** (+ **Escritório, pelo motorista**, se quiser).
- Foto **Desligado** · Observação **Opcional** · Assinatura **Desligado** · Produtos **Desligado** ·
  sem política de reentrega.
- Mandar e-mail à contratante ao registrar: **ligado**.
- Assunto:
  `OCORRÊNCIA -{{contratante}} - NF - {{numeroNotaSemSerie}} -MOT - {{motorista}} - MOTIVO - PRORROGAÇÃO`
- Corpo:

  ```text
  Bom dia,

  O cliente está solicitando a prorrogação do boleto.

  MOTORISTA: {{motorista}}
  RAZÃO SOCIAL: {{razaoSocial}}
  NOTA FISCAL: {{numeroNotaSemSerie}}
  VALOR DA NOTA: R$ {{valorNota}}
  ```

- Retorno da contratante: **Levar ao motorista sozinho**, anexo **PDF**.
- Motorista recebe por: **Chat do app**.
- Mensagem ao motorista: `Boleto atualizado da NF {{numeroNotaSemSerie}} ({{razaoSocial}}). Mostre ao
cliente; se ele quiser por e-mail, avise o escritório.`
- Prazo: **6 h** · Alarmar a operação: **ligado** · a cada **60 min** · até **24** alertas.
- Mandar ao cliente da nota: **manual** · Encaminhar a e-mail informado: **manual**.
- Assunto ao cliente: `Boleto atualizado – NF {{numeroNotaSemSerie}}`
- Corpo ao cliente:

  ```text
  Olá,

  Segue o boleto atualizado da nota fiscal {{numeroNotaSemSerie}}, conforme pedido de prorrogação.

  Em caso de dúvida, responda a este e-mail.
  ```

## Decididas por delegação em 2026-10-06 — o usuário pode reverter antes da execução

| #   | Decisão                                                                                                                                                                                       | Alternativa descartada                    | Custo de reverter                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| D1  | O retorno é reconhecido pelo **anexo** na conversa da ocorrência (token da 143 ou portal), nunca por assunto ou texto                                                                         | casar pelo assunto; ler o PDF             | ler texto contraria a 183 D4                                                           |
| D2  | Estado do retorno em tabela própria, com entregas e eventos                                                                                                                                   | reaproveitar `trip_occurrence_cases`      | alto: a prorrogação não abre tratativa (`occurrence-case.policy.ts:23`)                |
| D3  | Varredor do pedido não enviado (RF2)                                                                                                                                                          | outbox transacional no registro           | médio: mexe nos cinco caminhos de registro (`apps/api-transportada/CLAUDE.md:491-496`) |
| D4  | O PDF vai ao motorista por **referência** ao mesmo `stored_object`                                                                                                                            | copiar                                    | baixo                                                                                  |
| D5  | Auditoria em `occurrence_contractor_reply_events`                                                                                                                                             | afrouxar `audit_logs.actor_user_id`       | médio                                                                                  |
| D6  | **Sem antivírus**: o produto nunca abre o arquivo; ele sai como download de 300 s ou anexo de e-mail, o mesmo arquivo que a contratante mandaria por fora; risco aceito em `docs/SECURITY.md` | ClamAV em container                       | médio: serviço novo no compose e no Railway                                            |
| D7  | Exceção por contratante para modo, prazo e envio ao cliente da nota                                                                                                                           | tudo por exceção; nada                    | baixo                                                                                  |
| D8  | A configuração efetiva é copiada no retorno no registro                                                                                                                                       | reler o tipo a cada passo                 | baixo                                                                                  |
| D9  | Alarme vai a **quem despachou a viagem** (regra do aviso interno), com chave por alerta                                                                                                       | todos com `occurrences.resolve`           | baixo: troca o destinatário no gateway                                                 |
| D10 | E-mail informado é **só manual**                                                                                                                                                              | automático com endereço fixo no tipo      | médio: guardaria endereço de terceiro na configuração                                  |
| D11 | E-mail do cliente = `<dest><email>` da NF-e, guardado na nota; sem contato em `delivery_clients`                                                                                              | contato no cadastro do cliente de entrega | alto: contraria a ADR-0048 §2                                                          |
| D12 | E-mail a terceiro **sem** token de resposta                                                                                                                                                   | responder pela conversa                   | médio                                                                                  |
| D13 | Valores do roteiro: 6 h, 60 min, 24 alertas, chat do app, envios manuais                                                                                                                      | 5 h; 30 min; sem teto                     | baixo: configuração                                                                    |
| D14 | A conversa da ocorrência entra no app do motorista nesta spec                                                                                                                                 | spec à parte                              | médio: sem ela o chat próprio não chega ao motorista que usa o app novo                |
