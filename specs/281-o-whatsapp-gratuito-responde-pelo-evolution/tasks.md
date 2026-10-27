# Tasks 281 — O WhatsApp gratuito responde pelo Evolution API

Nada começa com `[NEEDS CLARIFICATION]` aberto (spec.md § Dúvidas). Modelo por etapa entre parênteses.

- [ ] **T0** (opus) Fechar as dúvidas com o dono; ADR "WhatsApp não oficial como opção gratuita" (R1/R2) e levantamento da
      porta de WhatsApp do SDK e do `meta-whatsapp-module` (o que a porta já cobre).
- [ ] **T1** (opus) Contrato do provedor com Evolution simulado, **antes** da implementação (RF1, paridade de estados).
- [ ] **T1b** (opus) Roteador por custo e risco (D8/D9/D10): política como dado da empresa, orçamento, teto, aquecimento, disjuntor; contrato antes.
- [ ] **T2** (sonnet) SDK: provedor `evolution` (`sendText`, `sendMedia`, `parseWebhook`, estados); changeset; publicar versão.
- [ ] **T3** (sonnet) Infra: serviço Evolution em staging (Postgres/Redis próprios), chave global só no serviço; runbook.
- [ ] **T3b** (opus) Migração aditiva: `client_channel` no tipo (RF8) e `delivery_client_contacts` (RF9), alinhada com a T1 da 279; contrato de paridade.
- [ ] **T4** (sonnet) API: configuração por empresa (RF2), chave cifrada, estado da conexão, QR, teto e intervalo; migration aditiva.
- [ ] **T5** (opus) API: envio de boleto por WhatsApp no trilho de 248/279 (RF3, RF5, RF6), idempotência, fallback, modelo `whatsapp`.
- [ ] **T6** (opus) API: webhook assinado com anti-replay, mensagem entra no fio, fila de não atribuídas (RF4).
- [ ] **T7** (sonnet) Painel: tela de configuração (QR, estado, aviso de risco RF7, provedor padrão) e botão "Enviar por WhatsApp".
- [ ] **T8** (sonnet) App do motorista: contatos do cliente na ocorrência com confirmação e `save` (RF10), "Enviar por WhatsApp" ao lado de "Enviar ao cliente", fila offline; prévia com print.
- [ ] **T9** (haiku) Linha do tempo, docs (`CLAUDE.md` das apps), runbook de staging, `evidence.md`, teste de que log não leva dado.
