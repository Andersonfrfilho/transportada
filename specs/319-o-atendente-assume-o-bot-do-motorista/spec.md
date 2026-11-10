# Feature 319 — O atendente assume o bot do motorista e devolve

> Pedido do dono (Anderson), 2026-11-10: "mandar mensagens se passando pelo bot de atendimento ao motorista, assumindo
> o bot e depois devolvendo; nos grupos específicos e individualmente com o motorista; sem ser ocorrência; montar a página".
> Status: aprovada por Anderson em 10/11 ("pode seguir"); as dúvidas abaixo seguem a proposta de cada uma, salvo ajuste dele. Alvo: staging primeiro; o Evolution também está em produção (informado por Anderson em 10/11), então a feature segue para a main só na próxima promoção de staging.

## Problema e resultado

O bot é o número ligado ao Evolution. Hoje o atendente só fala com o motorista por dentro de uma ocorrência, e não há
como entrar numa conversa livre (privado ou grupo) sem o bot responder por cima. Não existe flag de pausa/assumir
(busca em `apps/` sem resultado).

Resultado: uma **caixa de conversas do WhatsApp** no painel, por chat (JID do grupo ou número do motorista), onde o
atendente vê o histórico, **assume** o chat (o bot cala e não avança fluxo), escreve (sai pelo número do bot) e
**devolve** (o bot volta). É um módulo **separado de ocorrências**: telas, rotas e tabelas próprias, sem tocar na conversa da ocorrência.

## O que já existe e será reaproveitado

| Peça | Onde | Uso na 319 |
| --- | --- | --- |
| Grupos cadastrados por motorista | tabela `fleet_driver_whatsapp_groups`, `findGroupDriver` | Lista de grupos da caixa; nada de cadastro novo |
| Motorista pelo telefone | `findDirectDriver` (308), `userWhatsAppPhones` | Nome e vínculo do chat privado |
| Entrada do webhook | `whatsapp-evolution-webhook.use-case.ts`, `routeDirect`, `groupInbound.receive` | Só ganha a guarda de "assumido" |
| Envio pelo número do bot | `groupReplies.send` + `evolution-send-pacer.service.ts` (289) | Envio do atendente, com o mesmo teto |
| Instância e conexão do Evolution | `/company-settings/whatsapp-evolution`, `whatsapp_evolution_settings` | Estado de conexão exibido na caixa |
| Respostas rápidas | `company_quick_replies`, `QuickReplyPicker` | Atalho no campo de envio |
| Modelos de mensagem | notificações (spec 286) | Aviso "voltei" vem do modelo, não de texto fixo (spec 300) |
| Botão Assumir/Devolver | SDK `@adatechnology/conversations-ui`, se já existir lá (Anderson, 10/11; a confirmar no spike T7b) | Usar o do SDK; só se faltar, vira pedido ao SDK e o painel usa uma faixa provisória, como nas faixas da ocorrência |
| Fio, composer, menu, lido | SDK `@adatechnology/conversations-ui` 0.14 + `conversation-contracts` | Tela de conversa |
| Componentes de tela | `src/components/ui/*` (select, filter-pills, count-badge, skeleton, icon, tooltip) | Lista e filtros |
| Quadro de envios (290) | `operations/sent-messages` | O envio do atendente entra na contagem como categoria própria |
| Permissões e auditoria | `settings.manage`/papéis de atendente, auditoria existente | RF7 |

**Realmente novo:** o estado "assumido" por chat, o histórico das mensagens livres do privado e do grupo (hoje o grupo não
guarda conversa visível), as rotas da caixa e a página.

## Fora do escopo

Provedor Meta; fluxo de comandos do bot (menu, parada, ocorrência) além de pausá-lo; qualquer mudança no fluxo de ocorrência; ir direto para a main (não é bug crítico: vai por staging e promoção); atribuição a vários atendentes ao mesmo tempo.

## Histórias priorizadas

### P1 — Assumir e responder no privado
**Given** um motorista conversa com o bot no privado **When** o atendente clica em Assumir e escreve **Then** o motorista
recebe a mensagem do número do bot, e o que ele responder não aciona o bot, só aparece na caixa.

### P1 — Devolver ao bot
**Given** um chat assumido **When** o atendente clica em Devolver (ou o prazo vence) **Then** o bot volta a atender, com um
aviso opcional ("voltei").

### P1 — Grupo do motorista
**Given** um grupo cadastrado **When** o atendente assume **Then** escreve no grupo pelo número do bot; o bot não
responde marcações nem avança fluxo aberto no grupo enquanto assumido.

### P2 — Assumir pelo celular
**Given** a mensagem chega com `fromMe` e não foi enviada pelo painel **When** o webhook a recebe **Then** o chat é
assumido automaticamente pelo prazo padrão (opcional, ver dúvidas).

### P2 — Histórico
**Given** um chat qualquer **When** o atendente abre a caixa **Then** vê as mensagens recebidas, as do bot e
as do atendente, em ordem, com quem enviou.

## Requisitos funcionais

- **RF1** Estado por chat (`bot` | `atendente`), chave = JID (grupo ou individual) por empresa, com quem assumiu,
  quando, vencimento e motivo da devolução.
- **RF2** Com o chat assumido, os dois trilhos de entrada (privado da 308 e grupo, `evolution-group-inbound`) não
  respondem nem avançam sessão; só gravam a mensagem no histórico. Sem assumir, tudo como hoje.
- **RF3** Envio do atendente (texto; anexo e áudio em fase posterior) pelo Evolution, passando pelo mesmo controle de
  intervalo/teto (spec 289) do bot, e gravado no histórico como `atendente`.
- **RF3b** Prévia antes do envio: ao clicar em Enviar, o atendente vê como o motorista vai receber (texto, remetente = bot, destino = grupo ou privado) e confirma. Mesmo padrão de prévia das telas de comunicação existentes (ex.: `SendToContractorDialog`).
- **RF4** Histórico por chat guardado também para mensagens do bot e do grupo que hoje não ficam visíveis.
- **RF5** (usa o que já existe: o fio de mensagens é o `ConversationThread` do SDK `@adatechnology/conversations-ui` (0.14, visão `operator`, com menu da mensagem e região `aria-live`), e a tela usa só os componentes de `src/components/ui/` (select, filter-pills, count-badge, skeleton, icon, tooltip, botões padrão), no tema e nas regras de `CLAUDE.md` do painel; nada de primitivo cru). Página "Conversas do WhatsApp" no painel: lista de chats (grupos e motoristas), filtro por estado
  (bot/assumidos/não lidos), conversa com campo de envio e botões Assumir/Devolver, indicando quem atende.
- **RF6** Vencimento automático (padrão 30 min sem mensagem do atendente) devolve ao bot; configurável por empresa.
- **RF7** Permissão: papel de atendente da empresa; todo assumir/devolver/envio registrado com usuário e hora.
- **RF8** Separação: nada de ocorrência é lido ou gravado pela caixa (sem atalho, sem tabela compartilhada). A conversa da ocorrência e as "não atribuídas" seguem exatamente como hoje.

## Requisitos não funcionais

- SDK primeiro: onde o SDK já oferece o componente (fio de mensagens, composer, contratos `@adatechnology/conversation-contracts`), usa-se o SDK; só o que o SDK não cobre (lista de chats, faixa de assumir/devolver, prévia de envio) é do painel, e o que faltar ao SDK é registrado como pedido ao SDK, como já se faz na conversa da ocorrência.
- Padrão visual do projeto: só componentes do design system (rótulo em cima, campo/seletor na altura padrão, botões
  padrão), conferido com prints claro/escuro, desktop e celular.
- Sem número, texto ou nome em log. Tenant por empresa em toda consulta.
- Risco de banimento do Evolution (ADR-0112), maior em produção por ser o número real dos motoristas: envio manual respeita o teto e o intervalo, e o teste em produção só após a promoção, com o número do Anderson.

## Casos extremos e falhas

- Dois atendentes assumindo ao mesmo tempo: o segundo recebe "já assumido por X" (assumir é atômico).
- Envio falha ou Evolution desconectado: mensagem fica `falhou` no histórico, com reenvio; o estado não muda.
- Vencimento durante a digitação: o envio reassume ou avisa que o bot voltou (decisão na dúvida 2).
- Mensagem do motorista durante a pausa fica não lida e sobe na lista.
- Grupo não cadastrado ou número desconhecido: não aparece na caixa (privado desconhecido segue em "não atribuídas").

## Critérios de aceite

Contrato com dublês: chat assumido não gera resposta do bot nos dois trilhos (privado e grupo) e grava a mensagem;
devolver/vencer religa; assumir é atômico entre dois atendentes; envio passa pelo pacer e fica no histórico.
Integração do webhook e das rotas. Teste em staging com o número do Anderson e um grupo de teste (roteiro novo).
Prints da página em claro/escuro, desktop e celular.

## Dúvidas (decididas pela proposta)

1. Qualquer atendente assume qualquer chat, ou só o responsável pelo motorista/ocorrência? (proposta: qualquer da empresa)
2. Vencimento padrão 30 min está bom? Ao vencer, o bot avisa "voltei"?
3. Vale o assumir automático quando o atendente digita pelo celular (P2)?
4. O histórico deve guardar mensagens antigas do grupo (só dali em diante é o que dá)?
