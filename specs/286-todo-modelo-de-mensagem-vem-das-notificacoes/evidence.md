# Evidência — spec 286 (modelos de mensagem vêm do módulo de Notificações)

Status das etapas no `tasks.md`:

| Etapa                             | Estado                                                   | Evidência                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 SDK `adatechnology-packages`   | pendente                                                 | —                                                                                                                                                                                                                   |
| T2 contrato e migração aditiva    | feito                                                    | tabela `company_occurrence_type_client_channels`; `clientChannels` no PUT/GET do tipo; texto livre migrado para `occurrence.client-reply.<id>`                                                                      |
| T3 envio automático por WhatsApp  | feito                                                    | SDK `^0.3.0`; trava `claimed_at` (migration `20261029005751_client_whatsapp_automatic`); `occurrence-contractor-reply-client-channels-auto.integration.ts` (6 pass); 82 pass nas integrações de retorno e migration |
| T4 painel "Retorno ao cliente"    | pendente                                                 | —                                                                                                                                                                                                                   |
| T5 app do motorista               | pendente                                                 | —                                                                                                                                                                                                                   |
| T6 correção de endereço e padrões | feito (RF6, RF8)                                         | modelo `correcao-endereco.padrao` no módulo; `GET /address-corrections/mail-template`; publicação por `scripts/occurrence-mail-templates-publish.ts` (aprovação humana)                                             |
| T7 teste de arquitetura           | feito                                                    | `apps/api-transportada/test/message-text-boundary/literal-message-text.contract.ts`                                                                                                                                 |
| T8 falas do bot como nós `fala_*` | feito                                                    | catálogo `whatsapp-bot-speech.constant.ts`; lista de exceções da T7 zerada                                                                                                                                          |
| T9 docs e Etapa B                 | docs em andamento; Etapa B, 1ª fatia em staging (PR 441) | —                                                                                                                                                                                                                   |

## Pendências da Etapa B (aprovação humana)

- Remover `forwardEmailSubject` e `forwardEmailBody` do tipo de ocorrência (RF5).
- ~~Remover o CRUD legado da spec 150 no backend~~ (feito na 1ª fatia, veja abaixo).
- Só depois de aprovado: migração destrutiva em staging e, em produção, nova aprovação.

## Etapa B (T9), primeira fatia: CRUD legado da 150 em staging

Aprovada pelo dono em 29/10/2026 (cartão de decisão, opção "Aprovar a Etapa B em staging").

Feito nesta fatia (sem migration):

- Saíram as rotas `/contractor-mail-templates`, `/contractor-mail-templates/catalog` e `/contractor-mail-templates/preview` (com a prévia 410), o caso de uso `createContractorMailTemplatesUseCase`, a fiação em `main.ts` e o erro `ContractorMailTemplateRetiredError`.
- Confirmado antes: o frontend não chama mais essas rotas (o cadastro da 150 saiu da tela na T6); a UI de tipo usa `/company-settings/occurrence-types/contractor-mail-templates`, que não muda.
- Validação: `tsc --noEmit` limpo (com `NODE_OPTIONS=--max-old-space-size=12288`, o padrão estoura o heap), `eslint --max-warnings=0` e `prettier --check` limpos nos arquivos tocados, `bun test` em `contractor-mail`, `occurrence-contractor-mail`, `address-correction-http` e `occurrence-client-channels`: 654 pass, 0 fail.

Ainda não feito (pendente, destrutivo, com migration própria):

- Colunas `forward_email_subject` e `forward_email_body` em `company_occurrence_types`. O fallback de `contractor-reply-client-template.support.ts` (API e worker) ainda lê esse texto quando o tipo não tem modelo, então a remoção depende de decidir o que acontece com tipos sem modelo.
- Tabela `contractor_mail_templates` e as FKs que apontam para ela em `trip.schema.ts` e `contractor-mail.schema.ts`.
