# Evidência — spec 286 (modelos de mensagem vêm do módulo de Notificações)

Status das etapas no `tasks.md`:

| Etapa | Estado | Evidência |
|---|---|---|
| T1 SDK `adatechnology-packages` | pendente | — |
| T2 contrato e migração aditiva | feito | tabela `company_occurrence_type_client_channels`; `clientChannels` no PUT/GET do tipo; texto livre migrado para `occurrence.client-reply.<id>` |
| T3 envio automático por WhatsApp | feito | SDK `^0.3.0`; trava `claimed_at` (migration `20261029005751_client_whatsapp_automatic`); `occurrence-contractor-reply-client-channels-auto.integration.ts` (6 pass); 82 pass nas integrações de retorno e migration |
| T4 painel "Retorno ao cliente" | pendente | — |
| T5 app do motorista | pendente | — |
| T6 correção de endereço e padrões | feito (RF6, RF8) | modelo `correcao-endereco.padrao` no módulo; `GET /address-corrections/mail-template`; publicação por `scripts/occurrence-mail-templates-publish.ts` (aprovação humana) |
| T7 teste de arquitetura | feito | `apps/api-transportada/test/message-text-boundary/literal-message-text.contract.ts` |
| T8 falas do bot como nós `fala_*` | feito | catálogo `whatsapp-bot-speech.constant.ts`; lista de exceções da T7 zerada |
| T9 docs e Etapa B | docs em andamento; Etapa B aguarda aprovação humana | — |

## Pendências da Etapa B (aprovação humana)

- Remover `forwardEmailSubject` e `forwardEmailBody` do tipo de ocorrência (RF5).
- Remover o CRUD legado da spec 150 no backend. A prévia legada já responde 410.
- Só depois de aprovado: migração destrutiva em staging e, em produção, nova aprovação.
