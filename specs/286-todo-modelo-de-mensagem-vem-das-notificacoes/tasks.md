# Tasks 286 — Todo modelo de mensagem vem do módulo de Notificações

Modelo por etapa entre parênteses (regra do projeto). Contrato/teste antes da implementação. Tudo passa por `staging`.
Não criar editor nem prévia novos: usar `NotificationSettingsWorkspace`, `TemplatePreview`, `MessageToolbar` (notification-ui) e `FlowsWorkspace` (conversations-ui) — RF1b/RF7.

- [ ] **T1** (sonnet) SDK `adatechnology-packages`: canal `whatsapp` sem `whatsappTemplateName` quando o provedor é Evolution (`channelDispatch.ts`); anexo na moldura do `TemplatePreview` (opcional); changeset; publicar versão.
- [x] **T2** (opus) API: contrato e migração aditiva — matriz por canal no tipo (chaves de modelo `email`/`whatsapp`, modo por canal, `client_channel` derivado), migração de `forwardEmailSubject/Body` para modelos do módulo (RF5), campos antigos ignorados; contrato de paridade antes.
  - Feito: tabela `company_occurrence_type_client_channels`, `clientChannels` no `PUT`/`GET` do tipo, `client_channel` derivado, texto livre migrado para `occurrence.client-reply.<id>`. O envio segue lendo `forwardEmail*` até a T3; a subida do SDK para 0.3.0 e o `acceptsFreeText` do Evolution ficam na T3.
- [x] **T3** (opus) Worker/API: envio automático por WhatsApp (RF3) com idempotência por (retorno, anexo, número), todos os destinatários, queda para e-mail e registro (RF4); Reenviar por entrega.
  - Feito: SDK em `^0.3.0`; envio pelo modelo de cada canal (legado sem matriz); WhatsApp automático em reserva + despacho com trava `claimed_at` (migration `20261029005751_client_whatsapp_automatic`); queda para e-mail com motivo; Reenviar lê o gatilho. Evidência: `occurrence-contractor-reply-client-channels-auto.integration.ts` (6 pass) e 82 pass nas integrações de retorno e migration. `acceptsFreeText` não ligado: o TMS não tem driver Evolution no módulo de notificação.
- [ ] **T4** (sonnet) Painel: bloco "Retorno ao cliente" com canais em caixas de marcar, modelo e modo por canal (RF2); eventos de envio por canal com `ChannelIcon`/`StatusTicks` e Reenviar (RF4b); prévia do SDK; print contra a própria tela.
- [ ] **T5** (sonnet) App do motorista: estado de envio por canal e Reenviar, com print.
- [~] **T6** (sonnet) Correção de endereço e padrões semeados no módulo; sai o cadastro da 150 e a sintaxe `{snake_case}` (RF6, RF8).
  - Feito (RF6): modelo `correcao-endereco.padrao` no módulo (`{{camelCase}}`, `blocosEnderecos` montado pela API), publicado por `scripts/occurrence-mail-templates-publish.ts` (rodar em staging/produção pede aprovação humana); `GET /address-corrections/mail-template`; o envio, o diálogo e o resumo de prontidão leem do módulo; o painel de cadastro da 150 saiu da tela. O CRUD legado da 150 no backend segue até a etapa B (T9), porque a política de renderização é compartilhada com o e-mail de ocorrência; a prévia legada responde 410.
  - Falta (RF8): o texto semeado do editor do tipo de ocorrência (`occurrenceTypeMailTemplate.service.ts`, `occurrenceContractorReplyDraft.service.ts`) ainda mora no painel.
- [x] **T7** (sonnet) Teste de arquitetura que falha o CI com texto literal de mensagem fora de `notification/` (RF9), lista de exceções explícita.
  - Feito: `apps/api-transportada/test/message-text-boundary/literal-message-text.contract.ts`; exceções = 4 arquivos de falas do bot até a T8, e a lista falha se um arquivo ali ficar limpo (só encolhe).
- [ ] **T8** (sonnet, 2ª entrega) Falas do bot (~33 `sendText`) como nós do grafo no `FlowsWorkspace` do SDK de conversas (RF7).
- [ ] **T9** (haiku) Etapa B (remover campos antigos) só com aprovação humana; docs, `CLAUDE.md`, runbook de staging, `evidence.md`.
