# 062 — o WhatsApp já está modelado

> **A descoberta que define esta spec:** o WhatsApp não precisa ser construído na transportada. Ele
> já está declarado no modelo, e falta **injetar o driver**. A parte cara é a conversa, não o canal.

## Problema e resultado

Hoje a transportada fala por e-mail e por caixa de entrada interna, e mais nada. O convite de usuário
tem `'whatsapp'` no tipo do canal — `deliver-invitation-code.service.ts:6` — e o gateway lança
`InvitationChannelUnavailableError` para qualquer coisa que não seja e-mail
(`invitation-channel.gateway.ts:27-36`). O `notification-module` conhece cinco canais e recebe um só:
`notification-module.factory.ts:52` injeta `{ email: emailDriver }`. O `evidence.md` da spec 034
registra isso com todas as letras: _"o módulo conhece push, WhatsApp e SMS; nenhum tem driver"_.

Enquanto isso, o motorista fala por WhatsApp o dia inteiro, o cliente combina agendamento por
WhatsApp, e nada disso entra no sistema.

O resultado desta feature é o WhatsApp virando canal de verdade em três frentes, em ordem de custo
crescente: **notificação** (quase de graça), **conversa** (inbox no painel) e **execução** (o
motorista e o cliente respondendo e isso virando estado).

## Auditoria — o que já existe e não precisa ser construído

| Fato                                                  | Onde                                                                                                 | Consequência                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Canal `whatsapp` declarado no contrato de notificação | `@adatechnology/notification-contracts` — `NOTIFICATION_CHANNEL`                                     | Não há enum a criar.                                                      |
| `WhatsAppDriverPort` já definido                      | `notification-module/src/channelDrivers.ts`                                                          | Não há porta a desenhar.                                                  |
| Driver pronto, derivado do módulo Meta                | `createWhatsAppDriverFromChannel()` — `notification-module/src/whatsappDriver.ts`                    | **A ligação é injeção, não integração.**                                  |
| Janela de 24h e rate limit já tratados                | testes em `whatsappDriver` (`strictness.test.ts`)                                                    | O erro mais comum da Cloud API já está resolvido.                         |
| Cliente da Graph API pronto                           | `@adatechnology/meta-whatsapp-provider` — `WhatsAppMessageProvider`, `WhatsAppTemplateProvider`      | Nenhum HTTP a escrever.                                                   |
| Webhook, conversa, flows, realtime                    | `@adatechnology/meta-whatsapp-module` — `src/channel`, `src/flows`, `src/realtime`, `src/migrations` | Nenhum estado de conversa a modelar.                                      |
| UI de inbox, flows e templates                        | `@adatechnology/conversations-ui` — `ConversationsWorkspace`, `FlowsWorkspace`, `MessagesWorkspace`  | Nenhuma tela de conversa a construir.                                     |
| Tema por contrato                                     | `conversations-ui` — prop `theme` → CSS vars `--cv-*` (`src/theme.ts:17-27`)                         | "UI próxima da nossa app" é **preencher um objeto**, não forkar o pacote. |
| Canal já modelado no convite e no reset de senha      | `DELIVERABLE_CHANNELS = ['email','sms','whatsapp']`                                                  | Ligar o driver já habilita esses fluxos.                                  |
| Referência viva de uso                                | `sakura-bot-oficial/apps/api` e `quickcart`                                                          | Há um caminho validado a copiar.                                          |

**Nada disso existe hoje na transportada:** não há dependência `meta-*`, nem variável de ambiente de
WhatsApp no `.env.example`. É o que esta spec adiciona.

## Fora do escopo

- Construir provider, webhook ou modelo de conversa. Tudo isso é pacote publicado.
- Forkar ou reestilizar `conversations-ui` por CSS de fora. Ver D2.
- Bot com IA respondendo cliente. Fluxo determinístico primeiro.
- Portal do cliente — é a **063**.

## Decisões

### D1 — Três frentes, em ordem de custo, e a primeira paga a infraestrutura

**Frente 1 — notificação (P1).** Ligar `channels.whatsapp` no `notification-module.factory.ts`.
Isso, sozinho, já entrega: convite e reset de senha por WhatsApp (canais já modelados), aviso de
viagem pronta para manifestar (059), aviso de taxa sugerida (060), aviso ao motorista de viagem
despachada. É configuração e injeção — dias, não semanas.

**Frente 2 — conversa (P2).** `ConversationsWorkspace` no painel, com o `meta-whatsapp-module`
guardando as conversas. O escritório passa a falar com motorista e cliente **de dentro do produto**,
com histórico ligado à viagem em vez de espalhado por celulares pessoais.

**Frente 3 — execução (P3).** O que o cliente responde vira estado: confirmar agendamento (060 D3),
confirmar recebimento. É aqui que mora o risco, e é por isso que vem por último — ver D4.

A ordem importa porque a frente 1 instala e valida credencial, número, template aprovado e webhook.
Quando a frente 2 começar, a parte que costuma travar (aprovação de template pela Meta) já foi
atravessada.

### D2 — O tema é o contrato, e o fork é proibido

`conversations-ui` aceita `theme?: ConversationsTheme` — `primaryColor`, `backgroundColor`,
`bubbleSent`, `bubbleReceived`, `textPrimary`, `textSecondary` — convertidos em CSS vars inline
`--cv-*`. Mais `labels` (vocabulário vindo dos nossos locales), slots de render
(`renderFilters`, `renderAboveTranscript`, `extraUtilitiesFor`, `renderDetailHeader`) e callbacks de
negócio.

Então "deixar mais próximo da nossa app" é: preencher `theme` **a partir de
`src/modules/shared/theme/theme.constant.ts`** — as mesmas `COLORS` que o resto do produto usa
(`web.md` §8) — e passar `labels` dos nossos `*.locale.json`.

**O que não se faz:** sobrescrever `--cv-*` por CSS externo, envolver o workspace em seletores para
forçar estilo, ou copiar o pacote para dentro. Todos os três quebram na próxima versão do pacote e
todos os três já aconteceram em produto que consome biblioteca compartilhada. Se um ajuste visual não
couber no contrato, o certo é **abrir prop no pacote** e publicar versão — não contornar no consumidor.

A categoria própria de WhatsApp que você pediu é um workspace no `resolveCurrentWorkspace` de
`src/main.tsx`, ao lado de `/nfe` e `/trips`: `/conversas`, com as abas que o pacote já entrega
(inbox, fluxos, mensagens).

### D3 — Um número, e ele é da empresa

O número de WhatsApp é da transportadora, configurado por empresa (multiempresa por construção). Não
existe número por usuário, e o celular pessoal do funcionário não entra no produto.

Isso resolve a coisa que faz WhatsApp virar caos: hoje a conversa está no aparelho de quem atendeu, e
quando essa pessoa sai de férias a conversa some. Com número da empresa e inbox compartilhada, a
conversa é da operação.

Segredo (token da Cloud API, App Secret, verify token do webhook) só por variável de ambiente
validada no boot, e o webhook valida assinatura HMAC com `rawBody`, rejeita timestamp fora da janela e
guarda nonce contra replay — `security.md` §3, fail-closed: sem segredo, a rota não sobe.

### D4 — O que o cliente responde não vira estado sem confirmação humana — por enquanto

Na frente 3, a tentação é o cliente responder "confirmo" e o agendamento mudar sozinho. O problema é
que conversa livre é ambígua ("pode ser amanhã?" é pergunta ou confirmação?), e um agendamento errado
manda um caminhão para o lugar errado.

Então, na primeira versão: resposta do cliente vira **sugestão de mudança de estado**, visível na
viagem, confirmada por gente com um toque. Quando houver volume medido de acerto, a confirmação
automática vira decisão nova, com número em vez de otimismo.

Isso vale para conversa livre. Resposta a **botão de resposta rápida** é outra coisa — ela é escolha
de uma lista fechada, e essa pode virar estado direto. É por isso que o fluxo usa botão sempre que
couber (`conversation-flow.md` §2: até 3 opções é botão, 4 a 10 é lista).

### D5 — O texto do fluxo segue a regra que já existe

Todo fluxo desta spec obedece `~/.claude/rules/rules/conversation-flow.md`, e ele é bloqueante em
code review: teto de 20 caracteres em título de botão e 24 em linha de lista, **validado na
publicação do fluxo, não no envio** (a Meta recusa a mensagem inteira, e o cliente vê silêncio); emoji
em todo botão; `fallbackMessage` em todo nó de escolha; todo caminho terminando em fim ou handoff; ids
sem acento e estáveis.

E o §6 da mesma regra manda no conteúdo: o bot pede **o mínimo**. Nada de CPF, data de nascimento ou
endereço num fluxo automatizado — e o que o cliente digita **nunca vai para log**, em nenhum nível.

## Histórias priorizadas

**P1 — o convite chega por WhatsApp**
_Dado_ um motorista sendo cadastrado,
_quando_ o convite é enviado com canal `whatsapp`,
_então_ ele chega — e não lança `InvitationChannelUnavailableError`.

**P1 — a viagem despachada avisa o motorista**
_Dado_ uma viagem indo a `dispatched`,
_quando_ a transição ocorre,
_então_ o motorista recebe a mensagem com o link do PWA e o resumo da viagem.

**P1 — a taxa sugerida avisa o escritório**
Notificação quando a fila de sugestões da 060 tem item novo.

**P2 — falar de dentro do produto**
_Dado_ um cliente que mandou mensagem,
_quando_ o operador abre `/conversas`,
_então_ vê a inbox no visual do produto, responde, e o histórico fica.

**P2 — a conversa está ligada à viagem**
_Dado_ uma conversa com um destinatário,
_quando_ aberta,
_então_ mostra as viagens e notas daquele documento — é o que faz a inbox valer mais que o celular.

**P3 — o cliente agenda por WhatsApp**
_Dado_ uma parada de cliente com `requires_scheduling` (060 D3),
_quando_ o fluxo oferece janelas em botão,
_então_ a escolha vira agendamento `confirmed` com protocolo. Resposta livre vira sugestão (D4).

**P3 — aviso de entrega a caminho**
Mensagem ao destinatário quando a viagem entra em `in_transit`, com a posição na fila de paradas.

## Requisitos funcionais

1. Dependências: `meta-whatsapp-contracts`, `meta-whatsapp-provider`, `meta-whatsapp-module`,
   `meta-graph-core` na API e no worker; `conversations-ui` no frontend. Versões alinhadas com
   quickcart (a mais nova em uso).
2. Configuração por empresa e por ambiente, validada por schema no boot (`nodejs.md`): phone number
   id, token, app secret, verify token, versão da Graph API.
3. `channels.whatsapp` injetado em `notification-module.factory.ts` via
   `createWhatsAppDriverFromChannel()`.
4. `invitation-channel.gateway.ts` passa a atender `whatsapp`.
5. Migrations do `meta-whatsapp-module` aplicadas na cadeia de migration da transportada.
6. Rota de webhook com validação HMAC, janela de timestamp e nonce (D3).
7. Workspace `/conversas` com `ConversationsWorkspace`, `FlowsWorkspace` e `MessagesWorkspace`,
   tematizados por `theme.constant.ts` e `labels` dos locales (D2).
8. Ligação conversa ↔ viagem/nota pelo documento do participante.
9. Fluxo de agendamento (P3) com botões, respeitando `conversation-flow.md`, e caminho de
   republicação versionada.
10. Notificações novas: viagem despachada, taxa sugerida, viagem pronta para manifestar, entrega a
    caminho — todas respeitando quiet hours (`INTRUSIVE_CHANNELS` já inclui `whatsapp`).

## Requisitos não funcionais

- **Nenhum conteúdo de mensagem de cliente em log, em nenhum nível** (`security.md` §1). Telefone
  mascarado por função central de redação; `conversationId` opaco é a forma de rastrear.
- Falha de envio de WhatsApp **nunca** derruba a operação que a originou: notificação é efeito
  lateral, vai por fila, e falha vira alerta.
- Janela de 24h expirada e rate limit tratados pelo driver (já são), com fallback declarado para
  template ou para e-mail.
- Rate limit próprio na rota de webhook, e ela é pública — logo, alvo (`security.md` §3).
- Segredo com `VITE_*` é proibido: o token nunca chega ao frontend.
- Multiempresa: número e credencial por empresa, com teste negativo de isolamento.

## Casos extremos e falhas

| Caso                                  | Comportamento                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Motorista sem telefone cadastrado     | Notificação cai para e-mail, e a ausência aparece no cadastro.                            |
| Janela de 24h expirada                | Driver usa template aprovado; sem template, a notificação vai por outro canal e registra. |
| Cliente responde fora do fluxo        | `fallbackMessage`; após 2 tentativas, handoff para pessoa (`conversation-flow.md` §5).    |
| Webhook sem segredo configurado       | A rota **não sobe**. Fail-closed.                                                         |
| Webhook duplicado pela Meta           | Idempotente por id de mensagem — o módulo já trata.                                       |
| Número da empresa bloqueado pela Meta | Notificações caem para e-mail; alerta em destaque.                                        |
| Template reprovado                    | O fluxo que depende dele fica indisponível com aviso claro, não com falha silenciosa.     |
| Cliente pede para não receber mais    | Opt-out respeitado e persistido — e vale para todos os fluxos, não só o que originou.     |

## Critérios de aceite

- [ ] Teste de que o convite por `whatsapp` não lança `InvitationChannelUnavailableError`.
- [ ] Teste de validação de assinatura do webhook: payload adulterado é rejeitado.
- [ ] Teste fail-closed: sem segredo, a rota não registra.
- [ ] Teste de idempotência de webhook duplicado.
- [ ] Teste de que nenhum conteúdo de mensagem aparece em log (contrato de redação).
- [ ] Teste de que falha de envio não reverte a transição de viagem que a originou.
- [ ] Validação de fluxo na publicação: título de botão acima de 20 caracteres **reprova** (§5 de
      `conversation-flow.md`).
- [ ] Teste negativo de tenant no número/credencial.
- [ ] Contrato de tema: nenhum CSS externo sobrescrevendo `--cv-*`, nenhum fork do pacote (D2).
- [ ] `tsc --noEmit` + `make validate`.
- [ ] ADR (**0048**) sobre adoção do trio `meta-*` + `conversations-ui`, tema por contrato, e a
      regra de "abrir prop no pacote em vez de contornar no consumidor".

## Dúvidas

- `[NEEDS CLARIFICATION: as variáveis de ambiente que você vai passar — número, WABA, token. Preciso delas para a frente 1; até lá escrevo o schema de configuração e deixo o boot falhando com mensagem clara.]`
- `[NEEDS CLARIFICATION: o número é um só para toda a operação, ou existe (ou vai existir) número por filial? A 054 está reservada para filial, e isso muda a chave da configuração.]`
- `[NEEDS CLARIFICATION: o motorista responde pelo WhatsApp ou só recebe? Se responde, a frente 3 inclui o motorista, e o contrato canal-agnóstico da 057 D2 passa a ter dois consumidores — que é exatamente o que ele foi desenhado para suportar.]`
- `[NEEDS CLARIFICATION: quem atende a inbox? Se for a mesma pessoa que monta viagem, `/conversas` entra no mesmo perfil; se for atendimento dedicado, precisa de papel próprio.]`

## 🤖 Modelo

| Etapa                                                     | Modelo    |
| --------------------------------------------------------- | --------- |
| Adoção dos pacotes, segurança do webhook, ADR-0048        | `opus` 🧠 |
| Desenho do fluxo de agendamento (grafo e handoff)         | `opus` 🧠 |
| Injeção do driver, configuração, migrations, notificações | `sonnet`  |
| Workspace, tema, labels                                   | `sonnet`  |
| Texto das mensagens, emoji, corte de título               | `haiku`   |
