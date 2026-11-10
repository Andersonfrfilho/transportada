# Plano técnico — 319

## Contexto e premissas
- Evolution em staging e em produção (a feature entra por staging e chega à produção na promoção; runbook de produção atualizado junto). O webhook (`whatsapp-evolution-webhook.use-case.ts`) separa `chat === 'user'` (308, `routeDirect`)
  e `'group'` (`groupInbound.receive`); ambos ignoram `fromMe`.
- O envio do bot é `groupReplies.send` (main.ts), com pacer (`evolution-send-pacer.service.ts`).
- A conversa da ocorrência (`occurrence_conversation_*`) fica intocada: a caixa nova é por chat, em módulo e tabelas próprios, sem leitura nem escrita nas de ocorrência.

## Arquitetura e arquivos afetados
- Novo módulo `whatsapp-inbox` na API (domínio: estado do chat e vencimento; aplicação: assumir/devolver/enviar/listar;
  infraestrutura: Drizzle).
- Guarda `chatTakenOver(companyId, jid)` consultada no início de `routeDirect` e de `groupInbound.receive`; se assumido,
  grava a mensagem e retorna `taken_over`.
- Envio do atendente reaproveita `groupReplies.send` + pacer.
- Frontend: módulo `whatsapp-inbox` com a página, lista, conversa e ações. Fio e composer vêm do SDK `@adatechnology/conversations-ui` (`ConversationThread`, visão `operator`, adaptador próprio sobre as rotas novas); lista e filtros com `src/components/ui/` (select, filter-pills, count-badge, skeleton, icon). Um contrato em `test/design-system/` garante que não entra primitivo cru.

## Contratos/API/eventos
- `GET /whatsapp-inbox/chats` (filtros), `GET /whatsapp-inbox/chats/:chatId/messages`,
  `POST …/take-over`, `POST …/release`, `POST …/messages`, `POST …/read`.
- Evento de atualização para a lista (polling na 1ª versão; tempo real depois).

## Dados, migration e rollback
- Grupos e motoristas vêm das tabelas existentes (`fleet_driver_whatsapp_groups`, telefone do motorista); só entra o que falta:
- `whatsapp_chats` (empresa, jid, tipo, estado, assumido_por, assumido_em, vence_em).
- `whatsapp_chat_messages` (chat, direção, autor: motorista/bot/atendente, texto, id do provedor, status, criado_em).
- Migration aditiva; rollback = remover as tabelas e a guarda (sem efeito nas existentes).

## Segurança e tenant
- Permissão de atendente; `companyId` em toda consulta; auditoria de assumir/devolver/enviar; sem PII em log.

## Idempotência e concorrência
- Assumir com `UPDATE … WHERE estado = 'bot'` (atômico). Mensagem do provedor deduplicada por `provider_message_id`.
- Vencimento por job (padrão dos crons existentes) e checagem na leitura.

## Observabilidade
- Contadores de assumir/devolver/vencer/envio falho; logs sem número ou texto.

## Estratégia de testes
- Contrato (dublês) para guarda nos dois trilhos, atomicidade, pacer; integração do webhook e das rotas;
  Playwright da página em claro/escuro, desktop e celular; roteiro em staging.

## Riscos
- Banimento do número (mitigação: pacer); histórico do grupo só dali em diante; volume de mensagens de grupo grande
  (guardar só grupos cadastrados).
