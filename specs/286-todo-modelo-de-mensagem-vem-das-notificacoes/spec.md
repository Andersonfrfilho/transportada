# Feature 286 — Todo modelo de mensagem vem do módulo de Notificações

> Aprovada por Anderson em 29/10/2026 ("pode fazer"). Prévias das telas em `prints/` (feitas com os componentes reais do design system e do SDK). Pedidos de 28/10/2026: "os templates deveriam ficar no nosso SDK de notificações", "todo template deve vir de lá", "a automação de pegar o boleto e repassar ao motorista também deve enviar ao cliente" e "a seleção no tipo de ocorrência deve poder selecionar os canais".
> Specs lidas: 271 + ADR-0108, 272, 274, 281 (T5/T8b), 279, 248 (via código). Inventário feito no código de `staging` (clone de hoje).

## Problema

A ADR-0108 (spec 271) já decidiu: o texto do e-mail à contratante nasce em Notificações → Preferências (`notification.templates`, sintaxe `{{campo}}`). Mas a regra ficou só para **um** texto. Ainda há mensagem escrita fora do módulo, e o WhatsApp do boleto (281 T5) pega emprestado o texto de e-mail do tipo.

## Inventário: onde ainda há texto de mensagem fora do módulo

| # | Onde (código) | O que é | Situação |
|---|---|---|---|
| 1 | `occurrence-conversation/application/forward-contractor-reply-by-email.use-case.ts` `readForwardTexts` + `contractor-reply-configuration.policy.ts` (`forwardEmailSubject`, `forwardEmailBody`) | Assunto e corpo do **boleto/retorno ao cliente e ao destinatário da nota**, digitados no tipo de ocorrência | **Fora do módulo.** Texto livre guardado no tipo. |
| 2 | `forward-contractor-reply-by-whatsapp.use-case.ts` (importa `readForwardTexts`) | Texto do **WhatsApp do boleto** | **Fora do módulo.** Reaproveita o texto de e-mail. Não existe canal `whatsapp` nos modelos. |
| 3 | `occurrence-conversation/.../contractor-reply-client-email-forward.support.ts` (api e worker) | Corpo do envio automático do boleto ao cliente | Usa o item 1. |
| 4 | `frontend-transportada/.../occurrenceTypeMailTemplate.service.ts` (linha ~89) e `occurrenceContractorReplyDraft.service.ts` | Texto padrão "Olá, equipe {{contratante}}..." e rascunhos pré-preenchidos no editor do tipo | **Fora do módulo.** Padrão fixo na tela. |
| 5 | `contractor-mail/domain/mail-template-catalog.constant.ts` + tabela `contractor_mail_templates` (spec 150) | Modelo da **correção de endereço** ("Olá, equipe {contratante}..."), sintaxe `{snake_case}` | **Fora do módulo.** A 271 deixou só este no cadastro antigo; é a segunda sintaxe e o segundo editor. |
| 6 | `whatsapp-commands/**` (`register-driver-flow-actions.ts`, `register-issuance-flow-actions.ts`, `register-operator-trip-flow-actions.ts`, `whatsapp-flow-step.service.ts`, `issuance-flow-prompt.service.ts`, `whatsapp-choice-renderer.service.ts` e as constantes `whatsapp-*-flow.constant.ts`) | Falas do **bot de comandos** pelo WhatsApp (~33 textos: "Você não tem viagem em andamento.", "Toque na nota que você quer…", "O que aconteceu?…"), código de verificação, menus | **Fora do módulo.** Texto em código. Maior volume. Destino certo: nós do grafo de fluxo do SDK de conversas (RF7), não modelo de notificação. |
| 7 | Avisos de chat/linha do tempo: `BODY_PREFIX = 'Boleto enviado para o e-mail: '`, `NOTICE_BODY_PREFIX = 'Boleto enviado por WhatsApp: '`, `WHATSAPP_SENT`, "Enviar o boleto para …?" | Textos que o **sistema escreve na conversa** e confirmações | **Fora do módulo.** São texto interno de interface; ver Q2. |
| 8 | `notification/domain/notification-catalog.constant.ts` | Avisos do sistema (ocorrência, MDF-e, NFS-e, fatura, lote CT-e…) com `subject`/`body` por canal | **Já dentro** do módulo (catálogo semeado). Fica como está; só falta canal `whatsapp` onde fizer sentido. |
| 9 | Modelo de ocorrência da contratante (`contractor_notification_template_key`, 271) | E-mail da ocorrência à contratante | **Já dentro.** |
| — | Fora do escopo por não serem mensagem a pessoa: mensagens de erro de API (`api.constant.ts`), validação de ambiente, logs. | | |

Hoje no tipo de ocorrência: `client_channel` (`email`/`whatsapp`/`both`), `forwardToNoteRecipient` (`off|manual|automatic`, **só e-mail**) e `forwardToInformedEmail` (`off|manual`). O WhatsApp do boleto só tem rotas **manuais** (`POST …/contractor-reply/whatsapp-delivery`, `…/client-boleto-whatsapp/send`); as entregas já têm o campo `trigger` (`automatic|operator`).

## Resultado desejado

1. **Regra do projeto:** nenhum texto de mensagem a pessoa mora em código ou em campo livre do tipo. Tudo é um modelo do módulo de Notificações, com chave, canal, idioma, versão, prévia e variáveis.
2. O módulo ganha o canal **`whatsapp`** (texto puro, sem assunto, sem HTML), lado a lado com `email`.
3. O **tipo de ocorrência** passa a escolher, **por canal**, o modelo e o modo de envio.
4. O **boleto aceito** pode sair sozinho ao cliente por **e-mail e/ou WhatsApp**, no mesmo disparo que o repasse ao motorista.

## Requisitos propostos

- **RF1 — Canal `whatsapp` nos modelos (já existe no SDK).** `NOTIFICATION_CHANNEL.WHATSAPP` e `notification.templates` com linhas de canal `whatsapp` já existem no `notification-module` (`whatsappTemplateName` é o modelo aprovado da Meta). Falta só: (a) com o Evolution (281) o canal não exige `whatsappTemplateName` (hoje `channelDispatch.ts` pula com `whatsapp_template_required` fora da janela da Meta); (b) a tela Preferências oferecer o canal com prévia em bolha. O tipo de ocorrência só **seleciona** a chave do modelo.
- **RF1b — Reusar o que o SDK já tem, sem duplicar.** Editor, barra de formatação (`MessageToolbar`/`MessageBodyField`, marcação `*negrito*`/`_itálico_` única para todos os canais) e prévia com moldura do canal (`TemplatePreview`: WhatsApp, e-mail, SMS, push) já existem no `@adatechnology/notification-ui` e são usados pelo `NotificationSettingsWorkspace`. A TMS **não cria** editor nem prévia próprios (nem para o bot: ver RF7, `FlowsWorkspace`/`FlowWhatsAppPreview` do `conversations-ui`): Preferências usa o workspace do SDK e o editor do tipo reusa o `TemplatePreview` do SDK. Única adição no SDK (opcional): mostrar o anexo (PDF do boleto) na moldura.
- **RF2 — Bloco "Retorno ao cliente" do tipo, por canal.** Substitui `forwardEmailSubject`/`forwardEmailBody` e o `client_channel` solto por uma matriz:
  | Canal | Ligado | Modelo (do módulo) | Modo |
  |---|---|---|---|
  | E-mail | sim/não | chave do modelo `email` | `off` / `manual` / `automatic` |
  | WhatsApp | sim/não | chave do modelo `whatsapp` | `off` / `manual` / `automatic` |
  Os canais são **caixas de marcar** (estilo `company_occurrence_type_moments` da 246), não um valor único: "ambos" = os dois marcados, cada um com seu modelo e seu modo; canal futuro (SMS etc.) entra como mais uma caixa. `client_channel` continua gravado e derivado (email+whatsapp=both, nenhum=off) para o painel e o app já publicados não quebrarem. Mesma regra da ADR-0108: sem modelo utilizável no canal, aquele canal não sai (409 `…TEMPLATE_MISSING`) e o editor mostra o aviso.
- **RF3 — Envio automático por WhatsApp.** Novo `forwardToClientWhatsApp` (`off|manual|automatic`). Dispara quando o worker entrega o boleto aceito ao motorista, só se: canal ligado, instância Evolution da empresa conectada e contato WhatsApp do tipo boleto em `delivery_client_contacts`. Idempotente por (retorno, anexo, número); entrega gravada com `trigger = automatic`; linha do tempo "Boleto enviado por WhatsApp (automático)".
- **RF4b — Eventos de envio mostram o canal.** Na tela da ocorrência (linha do tempo e lista de entregas, painel e app do motorista) cada evento de envio diz **por qual canal** saiu (e-mail ou WhatsApp), o destino mascarado, o disparo (automático ou operador) e o estado (enviado, entregue, lido, falhou), cada um com o botão **Reenviar**. Um envio a vários canais aparece como um evento por canal.
- **RF4 — Queda para o outro canal, nunca em silêncio.** Sem contato WhatsApp ou com instância caída: cai para o e-mail do cliente (se houver e estiver ligado) e registra o motivo na linha do tempo; sem nenhum dos dois, registra "não enviado" e avisa o escritório.
- **RF5 — Migração dos textos existentes.** Cada tipo com `forwardEmailSubject/Body` preenchido vira um modelo `email` do módulo (chave derivada do tipo) e aponta para ele; o campo antigo fica ignorado e sai em etapa B com aprovação humana (mesmo padrão da ADR-0108 §6). Tipos com WhatsApp ligado ganham um modelo `whatsapp` inicial gerado do texto de e-mail (sem HTML), para revisão do dono.
- **RF6 — Correção de endereço (item 5).** Migra para o módulo (chave do sistema com a lista fechada de variáveis), some a sintaxe `{snake_case}` e o cadastro 150.
- **RF7 — Bot do WhatsApp (item 6) vive no fluxo do SDK de conversas, não em modelo de notificação.** O `@adatechnology/conversations-ui` já tem o `FlowsWorkspace` (editor de fluxo com `FlowNodePanel`, `FlowWhatsAppPreview` e validação de limites do WhatsApp) e a TMS já publica o grafo (`WHATSAPP_ROOT_FLOW`, `publish-whatsapp-flow-graph`). Os textos hoje soltos em `register-*-flow-actions.ts` (`sendText` literal, ~33) passam a ser **nós de mensagem do grafo** (`directMessage`/`question`), editáveis no editor de fluxos do SDK com a prévia dele. Mensagem a pessoa **fora de conversa de bot** (aviso, boleto) segue nos modelos de Notificações. Sem criar editor nem prévia novos.
- **RF8 — Padrões semeados.** O texto padrão hoje na tela (item 4) passa a ser semeado como modelo inicial no módulo; a tela só oferece "Criar modelo em Notificações".
- **RF9 — Regra automática de proteção.** Teste de arquitetura que falha o CI se aparecer `sendText`/`sendMedia`/`sendMail` com texto literal fora de `notification/` (lista de exceções explícita).

## Fora do escopo

- Trocar o renderizador ou o editor do módulo; mensagens de erro de API e logs; WhatsApp Meta (só ganha o canal nos modelos).

## Decisões do Anderson (28/10/2026)

- **Q1 — Respondida:** o SDK já tem o canal `whatsapp`; a TMS só seleciona modelos no tipo (ajuste mínimo no SDK, RF1a).
- **Q3 — Respondida:** envia a **todos** os destinatários que existirem (todos os números/contatos do cliente), sem teto artificial além do já existente por ocorrência (`CONTRACTOR_REPLY_*_MAX_PER_OCCURRENCE`).
- **Q4 — Respondida:** deve haver botão **Reenviar** em cada entrega (e-mail e WhatsApp) no painel e no app, para o caso de falha (reaproveita o "Tentar de novo"/"Reenviar" da 281 T5). A queda automática para o e-mail segue como RF4.
- **Q2 — Decidida (padrão recomendado):** falas do bot (item 6, ~33 textos, agora nós do fluxo do SDK de conversas) na primeira ou segunda entrega? Recomendo a segunda.

## Plano de etapas (sugestão, com modelo por etapa)

1. SDK: ajuste do canal `whatsapp` para Evolution (sem `whatsappTemplateName`) + prévia (release do pacote). _Modelo sugerido: Sonnet._
2. Migração `forwardEmail*` → modelos do módulo, matriz por canal no tipo (API + painel tolerante primeiro). _Sonnet._
3. Automático por WhatsApp no worker + fallback + linha do tempo. _Opus (idempotência e concorrência)._
4. Correção de endereço e padrões semeados. _Sonnet._
5. Bot do WhatsApp para chaves do módulo. _Sonnet, em PRs pequenos._
6. Teste de arquitetura (RF9) e etapa B (remover campos antigos), com sua aprovação.

Publicação: staging primeiro; nada vai à main sem sua decisão (não é bug crítico).
