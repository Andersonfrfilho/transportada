# Tasks — 319 O atendente assume o bot

Uma task por vez, PR para staging, merge com CI verde. Contratos vermelhos antes do código.

- [ ] **T1 🧠** Spike: confirmar que `groupReplies`/pacer enviam texto livre a JID de grupo e individual, e como o webhook
      entrega `fromMe` do celular. Aceite: nota em `evidence.md`.
  > 🤖 Modelo: `opus`
- [ ] **T2 🧠** Domínio e migration: `whatsapp_chats`, `whatsapp_chat_messages`, assumir atômico, vencimento. Contratos.
  > 🤖 Modelo: `opus`
- [ ] **T3 🧠** Guarda nos dois trilhos (privado 308 e grupo): chat assumido não responde nem avança fluxo, só grava.
  > 🤖 Modelo: `opus`
- [ ] **T4** Registrar no histórico as mensagens do motorista, do bot e do grupo cadastrado.
  > 🤖 Modelo: `sonnet`
- [ ] **T5** Rotas: listar chats, mensagens, assumir, devolver, ler; permissão e auditoria.
  > 🤖 Modelo: `sonnet`
- [ ] **T6** Envio do atendente pelo Evolution com pacer, status e reenvio.
  > 🤖 Modelo: `sonnet`
- [ ] **T6b** Prévia de confirmação antes de enviar ao motorista (RF3b), no padrão do diálogo de envio existente.
  > 🤖 Modelo: `sonnet`
- [ ] **T7** Job de vencimento e devolução (aviso "voltei" conforme decisão).
  > 🤖 Modelo: `sonnet`
- [x] **T7b 🧠** Spike do SDK: o que o `conversations-ui` 0.14 já cobre para um chat por JID (fio, composer, menu, lido/enviado) e o que falta; incluindo se o botão Assumir/Devolver já existe (e qual é o contrato dele); lista de pedidos ao SDK. Aceite: nota em `evidence.md`.
  > 🤖 Modelo: `opus`
- [ ] **T8** Página "Conversas do WhatsApp": lista, filtros, conversa, campo de envio, Assumir/Devolver, com o `ConversationThread` do SDK e os componentes de `src/components/ui/`.
      Prints claro/escuro, desktop e celular; comparar com outra tela do painel.
  > 🤖 Modelo: `sonnet`
- [ ] **T9** (P2) Assumir automático por `fromMe` do celular, se aprovado.
  > 🤖 Modelo: `sonnet`
- [ ] **T10** Anexo e áudio do atendente (fase posterior).
  > 🤖 Modelo: `sonnet`
- [ ] **T11** Integração, roteiro de staging, runbook (`evolution-staging.md`) e teste real com o número do Anderson (staging; produção após a promoção, documentando no runbook de produção).
  > 🤖 Modelo: `sonnet`
