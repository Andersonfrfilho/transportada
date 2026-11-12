# Feature 287 — Todo chat escolhe o canal

> Pedido do dono em 2026-10-31. Rascunho: nada aqui está implementado.

## Specs do mesmo assunto (lidas)

| Spec    | O que já decidiu e esta spec usa                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| 183     | D2: o canal é **por mensagem**. D9: a conversa mostra a mensagem por qualquer canal.                           |
| 274     | O chat da contratante envia por e-mail (modelo padrão `notification.standard-email`).                          |
| 283     | Chat do cliente só por WhatsApp; **e-mail do cliente fora do escopo** (D4/T5). Esta spec revoga essa exclusão. |
| 281/286 | Evolution e "Retorno ao cliente": matriz por canal (habilitado, off/manual/automático).                        |
| 279     | E-mails do cadastro do cliente e envio do boleto por e-mail.                                                   |

## Problema e resultado

Hoje o composer do cliente só envia por WhatsApp e responde "o cliente não responde por e-mail" quando não há número
aberto. O composer da contratante só envia por e-mail. O motorista só por app. O operador não escolhe o canal, e a
conversa geral não deixa claro por qual canal cada mensagem veio.

**Resultado:** em cada chat (cliente, contratante, motorista) o composer tem o seletor **"Enviar por"** com os canais
que a conversa tem aberto e que o tipo da ocorrência liga. A conversa geral e cada balão mostram o canal de origem
(ícone e nome) em toda mensagem, de entrada e de saída.

## Fora do escopo

Canais novos (SMS, Telegram). Mudar quem decide a tratativa (183 D4).

## Histórias priorizadas

### P1 — Cliente por e-mail

**Given** o cliente com e-mail no cadastro (279) e o canal E-mail ligado no tipo **When** o operador escolhe "E-mail"
no seletor e envia **Then** sai no modelo padrão (274) aos e-mails do cliente e o balão entra na conversa do cliente
com o canal E-mail e os selos de estado.

### P1 — Cliente sem WhatsApp aberto

**Given** só e-mail disponível **When** o operador abre o chat **Then** o composer está aberto no e-mail; o aviso
"só sai pelo WhatsApp" some.

### P2 — Origem em toda mensagem

**Given** a conversa geral **When** carrega **Then** cada mensagem mostra o canal de que veio (WhatsApp, e-mail, app,
portal), também na entrada.

## Canais por participante (decisão do dono, 2026-10-31)

Os canais **não são fixos por chat**: crescem com o tempo, então o seletor lê a lista de canais da conversa, nunca um
conjunto escrito na tela.

| Participante | Hoje             | Previsto                         |
| ------------ | ---------------- | -------------------------------- |
| Cliente      | WhatsApp         | WhatsApp, e-mail, app do cliente |
| Contratante  | e-mail, portal   | + app do cliente                 |
| Motorista    | app do motorista | + WhatsApp                       |

## Requisitos funcionais

- **RF1** `POST /occurrences/:id/client/messages` aceita `channel: 'whatsapp' | 'email'`. No e-mail não há
  `replyTargetId`; os destinatários são os e-mails do cadastro do cliente do tipo configurado (279), mais os
  responsáveis em cópia (267). Idempotente pela chave, como hoje.
- **RF2** Canal desligado no tipo (`clientEmailType = off` ou WhatsApp desabilitado) não aparece no seletor; a API
  recusa com 409 do mesmo jeito.
- **RF3** Seletor "Enviar por" no `ConversationThread` das três abas; um canal só = sem seletor, só o rótulo.
- **RF4** A escolha lembra o último canal usado na conversa; a resposta a uma mensagem recebida sugere o canal dela.
- **RF5** Toda mensagem exibe o canal de origem; o contrato do canal já existe por mensagem (183 D2).
- **RF6b** O catálogo de canais por participante é dado (constante única na API, devolvida na conversa); canal novo
  entra sem mexer na tela do seletor.
- **RF6** Nada de regra por nome de tipo ou de transportadora: o canal vem da configuração do tipo.

## Requisitos não funcionais

Sem endereço em claro em resposta ou log. Mesma permissão de hoje (`occurrences.resolve`). Texto de interface em
`.locale.json`.

## Casos extremos e falhas

- Cliente sem e-mail e sem WhatsApp: composer fechado com o aviso que diz o que cadastrar.
- E-mail do cliente recusado pelo provedor: balão `Falhou` com "Tentar de novo" (279 T6b).
- Perfil fiscal sem e-mail: o campo ✉ do modelo sai sem a linha, nunca vazio.

## Critérios de aceite

Contrato antes do código (API e painel); integração da rota nova com os dois canais; evidência em `evidence.md`.

## Dúvidas

- Decidido pelo dono em 2026-10-31: o seletor tem **E-mail, WhatsApp e Ambos**; escolher um canal envia só nele.

## Desenho do e-mail ao cliente (2026-11-01)

O envio de e-mail do chat da contratante grava o e-mail no **único fio da ocorrência** (`contractor_mail_threads`, único
por `company_id + subject_type + subject_id`) e o token de resposta desse fio leva a resposta à conversa da contratante.
Mandar ao cliente por esse fio faria a resposta dele cair no chat errado. Logo:

1. **Fio próprio do cliente**: novos `subject_type` (`client_document_occurrence`, `client_stop_occurrence`) no CHECK de
   `contractor_mail_threads` (migration aditiva, com `rollback.sql`), um fio por ocorrência e por participante, com token
   próprio.
2. **Resposta recebida**: o webhook de entrada acha o fio pelo hash do token e grava a mensagem na conversa do
   participante **do fio** (cliente ou contratante), nunca por regra fixa.
3. **Envio**: o mesmo pipeline do chat da contratante (modelo padrão 274, assinatura, Resend), com os e-mails do cadastro
   do cliente (279) e o balão `email` gravado na conversa `client`.
4. **Rota**: `POST /occurrences/:id/client/messages` aceita `channel: 'whatsapp' | 'email' | 'both'`; `both` grava um
   balão por canal, com a mesma `Idempotency-Key` derivada por canal.
5. **Painel**: o seletor "Enviar por" é do SDK (`conversations-ui`); aqui o painel passa a lista de canais e o canal
   escolhido.

Etapas: (1) migration do fio do cliente, (2) resposta recebida roteada por participante, (3) envio e rota com `channel`,
(4) seletor no painel. Cada etapa sai para staging com contrato antes do código.

## Conversa por canal (decisão do dono, 2026-11-01)

O dono decidiu **separar a conversa do cliente por canal** e não juntar tudo em um chat com seletor: **Cliente · WhatsApp** e
**Cliente · E-mail**, cada uma com o seu composer e o seu fio. Isso substitui o seletor "Enviar por" e o "Ambos" para o
cliente (para mandar nos dois canais, escreve-se em cada conversa), e tira a dependência do SDK: cada conversa reaproveita o
`ConversationThread` que já existe.

- A conversa `client` do WhatsApp (283) segue como está.
- A conversa de e-mail do cliente usa o fio `client_*_occurrence` (migration T006) e a mensagem grava `channel = 'email'`.
- A resposta recebida cai na conversa do **canal** por onde veio (RF5 vale por conversa).
- RF1 passa a ser uma rota por conversa de canal; `channel: 'both'` sai do contrato.

## Escopo ampliado (dono, 2026-11-01)

- Vale para **todos** os chats: cliente, motorista (que também passa a poder iniciar conversa por WhatsApp) e contratante.
- A separação por canal só aparece quando o participante tem **mais de um canal disponível**; com um só, o chat segue como hoje.
- Deve ser possível **compartilhar/encaminhar uma mensagem de um canal para o outro** e **ver as conversas por canal lado a lado** (as colunas do painel já permitem várias abertas).

## Layout no SDK (dono, 2026-11-01)

- Os três chats lado a lado, com os canais como **abas** e o botão **▥** que divide o chat em painéis por canal (previews em `/mnt/project-files/mockups/conversa-por-canal-v3.html`), mais o minimizar e o encaminhar entre canais.
- A **mecânica** (abas, divisão, encaminhar, só mostrar com mais de um canal) mora no SDK `conversations-ui` e é **customizável** (slots e tokens de tema). Os previews são só de comportamento: o visual vem do design system do TransportAdA, não do mockup.
- Isso reabre a decisão anterior de "sem dependência de SDK": a parte de layout por canal vai ao SDK; a regra de envio por canal continua na API.
