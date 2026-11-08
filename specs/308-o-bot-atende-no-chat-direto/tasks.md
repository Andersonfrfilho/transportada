# Tasks — 308 O bot atende no chat direto

Uma task por vez, PR para staging, merge com CI verde. Contrato: `bun --env-file=../../.env.test test --timeout 120000`;
integração: `bun --env-file=../../.env.test run test:integration` (de dentro de `apps/api-transportada`).

- [x] **T1 🧠** Spike: confirmar que `groupSessions`, `groupReplies`, mídia e áudio aceitam JID individual; listar o que
      exigir grupo cadastrado. Aceite: nota em `evidence.md`.
  > 🤖 Modelo: `opus`
- [x] **T2 🧠** Roteamento no webhook: `chat === 'user'` reconhecido (D2.3) entra no `groupInbound` como grupo de um só,
      sem marcação; citação à conversa da ocorrência e não reconhecido seguem `receiveMessage`. Contratos vermelhos antes.
  > 🤖 Modelo: `opus` (decide o que o bot aceita)
- [x] **T3** Foto, localização e áudio no 1:1 pelo caminho do grupo (RF3).
      Feito: o roteamento da T2 já levava a mídia e o áudio; a T3 prova ponta a ponta em
      `test/whatsapp/direct-chat-media.contract.ts` (passo da localização, "pular" falado, "1"/"2" e "sim"/"não")
      e no webhook (localização e áudio lidos do corpo cru do 1:1).
  > 🤖 Modelo: `sonnet`
- [ ] **T4** Opção "Enviar XML das notas" no menu para quem passa em `findImportSender` (RF4, D2.4).
  > 🤖 Modelo: `sonnet`
- [ ] **T5** Integração do webhook, roteiro de staging e runbook atualizados; teste com o número do Anderson.
  > 🤖 Modelo: `sonnet`
