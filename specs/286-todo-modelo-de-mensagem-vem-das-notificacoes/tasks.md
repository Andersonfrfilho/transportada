# Tasks 286 — Todo modelo de mensagem vem do módulo de Notificações

Modelo por etapa entre parênteses (regra do projeto). Contrato/teste antes da implementação. Tudo passa por `staging`.
Não criar editor nem prévia novos: usar `NotificationSettingsWorkspace`, `TemplatePreview`, `MessageToolbar` (notification-ui) e `FlowsWorkspace` (conversations-ui) — RF1b/RF7.

- [ ] **T1** (sonnet) SDK `adatechnology-packages`: canal `whatsapp` sem `whatsappTemplateName` quando o provedor é Evolution (`channelDispatch.ts`); anexo na moldura do `TemplatePreview` (opcional); changeset; publicar versão.
- [ ] **T2** (opus) API: contrato e migração aditiva — matriz por canal no tipo (chaves de modelo `email`/`whatsapp`, modo por canal, `client_channel` derivado), migração de `forwardEmailSubject/Body` para modelos do módulo (RF5), campos antigos ignorados; contrato de paridade antes.
- [ ] **T3** (opus) Worker/API: envio automático por WhatsApp (RF3) com idempotência por (retorno, anexo, número), todos os destinatários, queda para e-mail e registro (RF4); Reenviar por entrega.
- [ ] **T4** (sonnet) Painel: bloco "Retorno ao cliente" com canais em caixas de marcar, modelo e modo por canal (RF2); eventos de envio por canal com `ChannelIcon`/`StatusTicks` e Reenviar (RF4b); prévia do SDK; print contra a própria tela.
- [ ] **T5** (sonnet) App do motorista: estado de envio por canal e Reenviar, com print.
- [ ] **T6** (sonnet) Correção de endereço e padrões semeados no módulo; sai o cadastro da 150 e a sintaxe `{snake_case}` (RF6, RF8).
- [ ] **T7** (sonnet) Teste de arquitetura que falha o CI com texto literal de mensagem fora de `notification/` (RF9), lista de exceções explícita.
- [ ] **T8** (sonnet, 2ª entrega) Falas do bot (~33 `sendText`) como nós do grafo no `FlowsWorkspace` do SDK de conversas (RF7).
- [ ] **T9** (haiku) Etapa B (remover campos antigos) só com aprovação humana; docs, `CLAUDE.md`, runbook de staging, `evidence.md`.
