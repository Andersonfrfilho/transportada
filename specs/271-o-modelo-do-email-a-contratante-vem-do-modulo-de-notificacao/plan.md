# Plano — 271 O modelo do e-mail à contratante vem do módulo de notificação

## Contexto e premissas

O levantamento contra `origin/staging` (84c05c96b, 2026-10-17) e contra `adatechnology-packages` está em
[`evidence.md`](evidence.md) § Levantamento. A T0.1 confere as linhas antes de qualquer código. Os fatos que moldam o
plano:

- **O módulo já é um depósito de modelos por empresa.** `notification.templates` (`notification-module`
  `src/schema/schema.ts:29-51`) com identidade `(company_id, key, channel, locale, version)`; a versão ativa mais alta
  vale (`TemplateRepository.findActive`, :24); "remover" desativa todas as versões da chave (`deactivateIdentity`). A
  tabela `templates` é exportada pelo pacote (`index.ts:76`) e mora no mesmo banco: a API a lê na própria transação.
- **O renderizador é puro e compartilhado.** `interpolateTemplate` (`notification-contracts/src/templateRender.ts:34-35`):
  `{{campo}}` → valor; ausente → `''`. `extractTemplatePlaceholders` lista os campos usados. A API já depende de
  `@adatechnology/notification-contracts`.
- **O catálogo de variáveis do módulo é por chave exata** (`TemplateVariableCatalog`, `Template.use-cases.ts:43-49`), e
  só vale se o host passa `templateVariables` — a TMS não passa. Como o dono cria o modelo com a chave que quiser, o
  painel de variáveis do módulo não as mostra: **a TMS valida e mostra as variáveis no editor do tipo** (D4).
- **O corpo de e-mail do módulo pode ser HTML** (o editor troca para código quando o texto tem marcação, `isHtmlBody`).
  O e-mail à contratante é texto (`bodyText`, editável no diálogo). Por isso o modelo com corpo HTML é recusado (D5).
- **A escolha do aviso interno já existe e fica:** `email_template_key` (079/246), validada por `hasActiveEmailTemplate`
  (`save-occurrence-type.use-case.ts:194-201`, `main.ts:4439`), seletor `OccurrenceTypeNotification.component.tsx` +
  `useEmailTemplates.query.ts` (o painel já lista os modelos do módulo pelo `notification-client`).
- **A 269 construiu** (em `staging`, não em produção): `contractor_mail_templates` tipo `occurrence` (catálogo, CHECK,
  prévia), `company_occurrence_types.contractor_mail_template_id`/`_selected_at`, as mesmas colunas na exceção por
  contratante, a política `occurrence-mail-template.policy.ts`, a leitura em `drizzle-occurrence-mail.repository.ts:171-240`
  (`findEffectiveOccurrenceMailTemplateSource`) e o leitor da sugestão (:307), consumida por
  `preview-occurrence-mail.use-case.ts:105-113`, `send-automatic-occurrence-mail.use-case.ts:90-117` e
  `send-occurrence-mail.use-case.ts:208-228` (`resolveTemplateId`), que grava `contractor_mail_messages.template_id`
  (:369). **Staging tem zero modelos `occurrence` e zero escolhas** (verificado): a troca não perde dado.
- **A 267 resolve a cópia** em `resolveEffectiveWatchers` (`contractor-mail/domain/occurrence-watcher.policy.ts`): lista
  da contratante com algum ativo vence, senão a da empresa; `resolveMailCopy` aplica o teto. As candidatas vêm de
  `loadEffectiveWatcherCandidates` (`occurrence-watcher-candidates.query.ts`), que resolve endereço e
  `occurrences.resolve` em lote. As linhas da empresa têm `status` (`active`/`inactive`) e podem ser apagadas
  (`drizzle-occurrence-watcher.repository.ts:195`); `OCCURRENCE_WATCHER_MAX_ACTIVE = 10`.
- **O `To` de hoje:** o automático filtra os contatos `active` + `receives_occurrences` pela etapa
  (`occurrence_stages`, `send-automatic-occurrence-mail.use-case.ts:95`); o diálogo pré-marca os da etapa
  (`preview-occurrence-mail.use-case.ts:158`); o envio manual recebe `contactIds` do cliente e confere que são da
  contratante da nota (`findOccurrenceContacts`). Contato não se apaga (rotas só `POST`/`PATCH`).
- **Guardas estritos no painel:** `isOccurrenceType` (`tripResponse.validation.ts`) reprova chave desconhecida — chave
  nova no tipo exige o painel tolerante antes da API.

## Decisões de desenho (a T0.2 valida com `architect`)

| #   | Escolha                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Alternativa rejeitada                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | O tipo aponta para o modelo **pela chave**: `contractor_notification_template_key varchar(128) NULL` em `company_occurrence_types` (mesmo tamanho de `notification.templates.key`), **sem FK** (a identidade do módulo é `(company, key, channel, locale, version)`, sem linha única por chave). A versão ativa mais alta da chave, canal `email`, `pt-BR`, é lida **no envio**. `notification-template.query.ts` lê `notification.templates` com `sql` parametrizado (`NOTIFICATION_SCHEMA`), não com o `templates` exportado do pacote (outra instância de drizzle-orm). O worker idem.                                                                                                                                                                          | Apontar para o `id` de uma versão (editar o texto no módulo cria versão nova, e o tipo ficaria preso no texto velho); copiar o texto para o tipo.                                                     |
| D2  | Carimbo novo `contractor_notification_template_selected_at timestamptz NULL`, gravado com a mesma regra da 269 (`CASE WHEN chave_antiga IS DISTINCT FROM chave_nova THEN now() ELSE carimbo END`; `null` limpa). As colunas da 269 (`contractor_mail_template_id`/`_selected_at`, no tipo e na exceção) **param de ser lidas e escritas na etapa A** e saem na B. Reaproveitar `contractor_mail_template_selected_at` foi rejeitado: o nome mente e a coluna sai junto com o id.                                                                          | Renomear a coluna da 269 na A (rename é destrutivo para o código de `staging` durante o deploy).                                                                                                      |
| D3  | **Lista do seletor** = modelos ativos da empresa, canal `email`, `pt-BR`, chave **fora** de `NOTIFICATION_TEMPLATE_KEY` (avisos do sistema, cujas variáveis são outras). Sem prefixo obrigatório: o dono cria a chave que quiser. A validação da gravação (D4/D5) é a mesma regra.                                                                                                                                                                                                                                                                        | Prefixo obrigatório `ocorrencia.*` (o editor do módulo não sugere prefixo e o dono erraria a chave); listar tudo (escolher `trip.delivery-occurrence` mandaria à contratante um aviso interno vazio). |
| D4  | **Variáveis** em `{{camelCase}}`, lista fechada em `OCCURRENCE_CONTRACTOR_MAIL_VARIABLES` (§ Variáveis). A gravação do tipo recusa modelo com variável fora da lista (`extractTemplatePlaceholders` no assunto e no corpo). Os valores vêm de `occurrence-mail-values.policy.ts` (269), com as chaves renomeadas de `snake_case` para `camelCase`, mais `tipoOcorrencia` e `linhasItens`. O renderizador recebe **todas** as variáveis (`''` quando ausente).                                                                                             | Registrar `templateVariables` no módulo (o catálogo é por chave exata; com chave livre, não acha) — fica como pergunta ao pacote (Q2).                                                                |
| D5  | **Modelo utilizável** = existe versão ativa da chave, canal `email`, `pt-BR`, corpo **não** HTML (mesmo teste `isHtmlBody` do pacote, constante única na API) e assunto não vazio. Gravar o tipo com modelo não utilizável → 400 (todos os problemas juntos). No envio, modelo não utilizável ≡ sem modelo (D9).                                                                                                                                                                                                                                          | Aceitar HTML e tirar as marcas (o texto perderia estrutura sem ninguém ver); bloquear "remover" no módulo (exige mudança no pacote — Q3).                                                             |
| D6  | **Renderização** em `occurrence-contractor-mail-render.policy.ts` (pura): `interpolateTemplate(subject, values)` → colapsa espaço (`/\s+/` → `' '`) e trunca em `OCCURRENCE_MAIL_LIMITS.subject`; `interpolateTemplate(body, values)` → se passar de `OCCURRENCE_MAIL_LIMITS.body`, `linhasItens` é encurtado ("e mais N itens") até caber, e por fim o corpo é truncado. Texto puro; a assinatura continua anexada por `buildOccurrenceMail`. A marcação do WhatsApp (`*negrito*`) sai literal no texto.                                                 | Usar o `renderMailTemplate` da 150 (sintaxe `{snake_case}` — dois dialetos para o mesmo dono).                                                                                                        |
| D7  | A exceção por contratante **perde** o modelo: modelo efetivo = modelo do tipo. Texto próprio de uma contratante = tipo `listed` só dela (270).                                                                                                                                                                                                                                                                                                                                                                                                            | Manter a troca na exceção (o dono: "não precisa ter uma tela para isso").                                                                                                                             |
| D8  | **Rastreio:** `contractor_mail_messages` ganha `notification_template_key varchar(128) NULL` e `notification_template_version integer NULL`. O e-mail de ocorrência grava as duas e `template_id = null`; a correção de endereço segue com `template_id`. O reenvio da 248 copia as duas da mensagem original (ou nulo).                                                                                                                                                                                                                                  | Reusar `template_id` (FK para `contractor_mail_templates`, que não guarda mais modelo de ocorrência).                                                                                                 |
| D9  | **Sem modelo, sem e-mail** (ADR-0106 §3, mantido): 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING` no manual; automático `skipped`/`no_template_selected`; `missingNotificationTemplate` = `kind='document'` ∧ contratante conhecida ∧ `emails_contractor` ∧ **sem modelo utilizável** (chave nula **ou** sem versão ativa `email`/`pt-BR` não HTML), na mesma consulta do feed (`EXISTS` em `notification.templates`). A varredura do worker exige chave não nula, carimbo e o mesmo `EXISTS`, para não pedir de novo a mesma ocorrência.                         | Calcular o aviso no painel; deixar a varredura pegar e pular a cada rodada.                                                                                                                           |
| D10 | **Em cópia do tipo:** tabela `company_occurrence_type_watchers (company_id, occurrence_type_id, user_id)`; FK do tipo `CASCADE`; FK `(company_id, user_id)` → `company_occurrence_watchers (company_id, user_id)` `ON DELETE CASCADE` (só responsável da lista da empresa entra; quem sai da lista da empresa sai do tipo, e o caso de uso de remover da 267 grava na auditoria os tipos afetados, lidos antes do `DELETE`). Até `OCCURRENCE_WATCHER_MAX_ACTIVE` (10) por tipo. Só se escolhe responsável `active`; o inativo já escolhido fica, marcado. | Guardar `user_id` solto (deixaria de bater com a 267); recusar remover da lista da empresa com 409 (atrito para uma escolha que o tipo só herda).                                                     |
| D11 | **Precedência da cópia:** `resolveEffectiveWatchers` ganha `typeWatchers` (candidatas com o `status` da linha da **empresa**): tipo com algum ativo → fonte `occurrence_type`; senão contratante; senão empresa. Resto da 267 igual (removidos, sem e-mail, já no `To`, teto, ordem por nome). `loadEffectiveWatcherCandidates` recebe `occurrenceTypeId` opcional e lê as três listas numa ida (endereços em lote). A correção de endereço não passa `occurrenceTypeId`.                                                                                 | Unir as três listas (o dono definiu precedência, não soma).                                                                                                                                           |
| D12 | **Destinatários do tipo:** tabela `company_occurrence_type_recipients (company_id, occurrence_type_id, contact_id)`; FK do tipo `CASCADE`; FK `(company_id, contact_id)` → `contractor_contacts (company_id, id)` `CASCADE` (contato não se apaga hoje; se um dia se apagar, sai da escolha). Invariante, no caso de uso com o tipo `FOR UPDATE`: escopo `all` ⇒ 0 linha; todo contato é de contratante da lista do tipo. Tirar contratante da lista **apaga** os contatos dela (mesma transação); `all` apaga tudo. Até 50 por tipo.                     | Marcar em vez de apagar (linha que nunca tem efeito confunde o editor); `uuid[]` no tipo.                                                                                                             |
| D13 | **`To` com destinatários** (`occurrence-contractor-recipients.policy.ts`, pura): escolhidos da contratante da nota, `active` ∧ `receives_occurrences`, **ignorando** `occurrence_stages` (a escolha explícita vence a etapa); vazio → regra de hoje. Automático: manda a esses. Manual: o diálogo os pré-marca (`preselected`) no lugar da regra da etapa; o operador continua escolhendo `contactIds`, como na 183. Reenvio da 248: os contatos do envio original, como hoje.                                                                            | Travar o `To` no manual (a 183 deixa o operador escolher; Q4).                                                                                                                                        |
| D14 | **Gravação:** `PUT /company-settings/occurrence-types` ganha `contractorNotificationTemplateKey`, `contractorMailWatcherUserIds`, `contractorMailRecipientContactIds` — opcionais e independentes; ausente não altera (242 RF2); a 270 grava escopo e lista **antes** dos destinatários na mesma transação, e a poda da D12 roda depois. `contractorMailTemplateId` no tipo e na exceção é **aceito e ignorado** até as telas novas estarem em produção, e depois sai (400 por `.strict()`).                                                              | Rota própria para o bloco (o editor salva o tipo inteiro numa chamada).                                                                                                                               |
| D15 | **Auditoria** (`audit_logs`, mesma transação, molde da 267): `occurrence_type.contractor_mail.updated` com ator, tipo e `{ templateKey, watcherUserIds, recipientContactIds }` antes/depois, só quando algo mudou.                                                                                                                                                                                                                                                                                                                                        | Sem auditoria (o dono pediu).                                                                                                                                                                         |

## Revisão de arquitetura (T0.2) — veredito: aprovado com mudanças

Valem sobre o que está acima onde divergir.

1. **D1:** a leitura usa `sql` parametrizado com `NOTIFICATION_SCHEMA`; o worker idem.
2. **Gate do TMS (T2.10):** `POST`/`PUT`/`DELETE` em `/notification-templates*` exigem `settings.manage` antes do roteador do módulo.
3. **Leituras com `settings.manage`:** `GET /company-settings/occurrence-types/contractor-mail-templates` →
   `[{ key, subject, body, version, usable, problems[] }]` (mesma política do `PUT`) e
   `GET /company-settings/occurrence-types/contractor-mail-recipient-candidates?contractorIds=…` (contratante de outra empresa → 404).
   Na T4.1 o campo Modelo usa a primeira, no lugar de `useEmailTemplatesQuery` (o seletor do aviso interno fica como está).
4. **D12/400s:** `OCCURRENCE_TYPE_RECIPIENT_NOT_IN_SCOPE` só para contato **novo** (inativo ou sem `receives_occurrences`);
   o já escolhido fica; `PUT` com `all` e `[]` → 200. Idem nos responsáveis; `OCCURRENCE_TYPE_WATCHER_INACTIVE` separado de `_LIMIT`.
5. **`buildTemplateSelectedAtChange`** generaliza para `is distinct from ${key}` sem cast `::uuid` (varchar); `INSERT` com chave grava `now()`.
6. **`actorUserId`** vem de `main.ts` (~:4427) até `saveOccurrenceType` (`created_by_user_id NOT NULL` e auditoria); a leitura "antes" é depois do `FOR UPDATE` do tipo.
7. **D5:** `HTML_BODY_PATTERN = '</?[A-Za-z][A-Za-z0-9_:-]*[\\s>/]'`, usado em `new RegExp` e em `body !~ $1`; o worker copia com teste de contrato espelhado; também se recusa `{{…}}` que o padrão não capta (`malformed_placeholder`).
8. **Publicação, passo 1:** branch `promote/*` a partir de `origin/main` com **só** os commits do painel tolerante (269 T1.1–T1.3, 270 T1.1, 271 T1.1–T1.2), como o PR #158.
9. **T1.2:** `ccSource` aceita `'occurrence_type'` (`occurrenceConversationClient.service.ts` ~:304, `occurrenceConversation.types.ts` ~:148).
10. **Inventário, acréscimos:** `register-trip-occurrence.use-case.ts:200`, `trip.routes.ts:352`, `occurrence.schema.ts:561,693`, `trip-occurrence-feed.query.ts`; `occurrence-mail-template.policy.ts` está em `trips/domain/`; `recordMail` no repositório ~:713-737.
11. **D9:** o aviso vem de consulta separada em lote, melhor esforço (`occurrence-mail-template-missing.query.ts` com `…OrEmpty`) + uma consulta `IN (chaves)` em `notification.templates`.
12. **Ordem do `PUT`:** modelo validado **antes** da transação (sem trava; `lockUsableOccurrenceMailTemplate` sai; o envio reconfere) → tx: trava o tipo → linha/carimbo → momentos → escopo (270) → responsáveis → destinatários (escopo = entrada ?? guardado) → poda → auditoria.
13. **D13 `To`:** escolhido ∧ ativo ∧ `receives_occurrences` ∧ com e-mail; vazio → regra de hoje.

A poda dos destinatários continua **explícita** (sem FK em cascata sobre o apaga-e-regrava da 270).

## Variáveis (`OCCURRENCE_CONTRACTOR_MAIL_VARIABLES`)

Mesmas origens da 269 (`occurrence-mail-values.policy.ts`); muda o nome da chave. Formato de dinheiro e data o de hoje.

| Variável                 | Origem na 269               | Descrição                                                                                                                                                           |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{numeroNota}}`         | `numero_nota`               | Número da nota com série.                                                                                                                                           |
| `{{numeroNotaSemSerie}}` | `numero_nota_sem_serie`     | Número da nota sem série.                                                                                                                                           |
| `{{razaoSocial}}`        | `razao_social`              | Razão social do destinatário da nota.                                                                                                                               |
| `{{valorNota}}`          | `valor_nota`                | Valor total da nota.                                                                                                                                                |
| `{{contratante}}`        | `contratante`               | Nome da contratante.                                                                                                                                                |
| `{{motorista}}`          | `motorista`                 | Nome do motorista da viagem.                                                                                                                                        |
| `{{parada}}`             | `parada`                    | A parada da nota (sequência e cliente).                                                                                                                             |
| `{{data}}`               | `data`                      | Data da ocorrência.                                                                                                                                                 |
| `{{observacao}}`         | `observacao`                | Observação registrada.                                                                                                                                              |
| `{{tipoOcorrencia}}`     | — (novo)                    | Nome do tipo de ocorrência (um modelo pode servir a vários tipos).                                                                                                  |
| `{{numeroReferencia}}`   | `numero_referencia`         | Número do documento do cliente (247).                                                                                                                               |
| `{{somaItens}}`          | `soma_itens`                | Soma das linhas dos itens (247).                                                                                                                                    |
| `{{valorDeclarado}}`     | `valor_declarado`           | Valor pago declarado (247).                                                                                                                                         |
| `{{itens}}`              | `itens`                     | Os itens num texto só, separados por vírgula.                                                                                                                       |
| `{{codigosItens}}`       | `codigos_itens`             | Os códigos, separados por vírgula.                                                                                                                                  |
| `{{quantidadesItens}}`   | `quantidades_itens`         | As quantidades, separadas por vírgula.                                                                                                                              |
| `{{linhasItens}}`        | — (substitui o `item_text`) | Uma linha por item: `{codigo} – {item} – {quantidade} {unidade} – R$ {valor}` (a linha padrão da 269); teto `OCCURRENCE_ITEM_LINES_LIMIT` (200) e "e mais N itens". |

As variáveis por item da 269 (`{item}`, `{codigo_item}`… dentro do texto do item) deixam de existir: o modelo do módulo
não tem seção que se repete. A linha do item passa a ser fixa (`evidence.md` Q1).

Modelo sugerido, mostrado no editor do tipo para copiar (nunca semeado): assunto
`Ocorrência na nota {{numeroNota}} — {{contratante}}`; corpo
"Olá, equipe {{contratante}},\n\nRegistramos {{tipoOcorrencia}} na nota {{numeroNota}} ({{razaoSocial}}) em
{{data}}.\n\n{{observacao}}\n\n{{linhasItens}}\n\nQualquer dúvida, é só responder este e-mail.".

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

| Camada         | Arquivo (novo ou alterado)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constantes     | `occurrence-conversation/domain/occurrence-contractor-mail.constant.ts` (novo): `OCCURRENCE_CONTRACTOR_MAIL_VARIABLES`, `OCCURRENCE_CONTRACTOR_MAIL_LOCALE = NOTIFICATION_DEFAULT_LOCALE`, `HTML_BODY_PATTERN`, limites de cópia/destinatários                                                                                                                                                                                                                                                                       |
| Domínio        | `occurrence-contractor-mail-render.policy.ts` (pura, nova, D6); `occurrence-contractor-template.policy.ts` (pura, nova: utilizável + variáveis desconhecidas, D4/D5, todos os problemas); `occurrence-contractor-recipients.policy.ts` (pura, nova, D13); `occurrence-watcher.policy.ts` ganha `typeWatchers` (D11)                                                                                                                                                                                                  |
| Valores        | `trips/domain/occurrence-mail-values.policy.ts`: chaves `camelCase`, `tipoOcorrencia`, `linhasItens` (lê as linhas que a 269 monta)                                                                                                                                                                                                                                                                                                                                                                                  |
| Leitura modelo | `occurrence-conversation/infrastructure/notification-template.query.ts` (novo): `findUsableContractorTemplate(executor, { companyId, key })` — versão ativa mais alta, `email`, `pt-BR`, sobre a tabela `templates` exportada pelo pacote; e `listContractorTemplateCandidates` para a validação                                                                                                                                                                                                                     |
| Envio          | `drizzle-occurrence-mail.repository.ts`: `findEffectiveOccurrenceMailTemplate*` lê a chave do tipo e o modelo utilizável (sem exceção); `readSuggestedMail` renderiza pelo D6; `recordMail` grava `notificationTemplateKey`/`Version`; `findOriginalOccurrenceMailTemplate` devolve chave/versão                                                                                                                                                                                                                     |
| Envio          | `send-occurrence-mail.use-case.ts` (`resolveTemplateId` → `resolveTemplate`), `send-automatic-occurrence-mail.use-case.ts` (destinatários D13, cópia D11), `preview-occurrence-mail.use-case.ts` (`preselected` D13, `notificationTemplateKey` no lugar de `templateId`, cópia D11)                                                                                                                                                                                                                                  |
| Cópia          | `contractor-mail/infrastructure/occurrence-watcher-candidates.query.ts` (terceira lista), `resolve-mail-copy.service.ts` (repassa), `drizzle-occurrence-watcher.repository.ts` (remover da empresa: auditoria com os tipos afetados, D10)                                                                                                                                                                                                                                                                            |
| Tipo           | `occurrence.schema.ts` (três chaves novas D14; `contractorMailTemplateId` aceito e ignorado), `save-occurrence-type.use-case.ts` (validação D3–D5, responsáveis D10, destinatários D12), `save-occurrence-type-values.mapper.ts`, `delivery-proof-read.support.ts` (leitura sem N+1, escrita, carimbo D2), `occurrence-mail-template-lock.support.ts` (carimbo por chave)                                                                                                                                            |
| Exceção        | `occurrence-attachment-overrides.use-case.ts`, `drizzle-occurrence-attachment-overrides.repository.ts`, schema e lista: `contractorMailTemplateId` sai da leitura/escrita (aceito e ignorado até a Fase 5)                                                                                                                                                                                                                                                                                                           |
| Feed/detalhe   | `trips/infrastructure/occurrence-mail-template-missing.query.ts` e `trip-occurrence-feed.query.ts`: aviso pela D9                                                                                                                                                                                                                                                                                                                                                                                                    |
| Modelos (150)  | `contractor-mail/domain/mail-template-catalog.constant.ts`: sai `occurrence`; `contractor-mail-templates.use-case.ts` (renderizador de prévia `occurrence`, conferência de uso no arquivar) e `occurrence-mail-template-usage.support.ts` saem                                                                                                                                                                                                                                                                       |
| Schema         | `database/trip.schema.ts` (colunas D1/D2, tabelas D10/D12), `database/contractor-mail.schema.ts` (colunas D8; CHECK volta a `address_correction` só na B) + migration                                                                                                                                                                                                                                                                                                                                                |
| Erros          | Classes em `*.error.ts` (não existe `shared/errors/codes.ts`): `OCCURRENCE_CONTRACTOR_TEMPLATE_INVALID` (400, `details.problems[]`: `not_found`, `system_key`, `html_body`, `empty_subject`, `unknown_variables` com a lista), `OCCURRENCE_TYPE_WATCHER_NOT_FOUND` (404), `OCCURRENCE_TYPE_WATCHER_LIMIT` (400), `OCCURRENCE_TYPE_RECIPIENT_NOT_IN_SCOPE` (400), `OCCURRENCE_TYPE_RECIPIENTS_REQUIRE_LISTED_SCOPE` (400); reusa `OCCURRENCE_MAIL_TEMPLATE_MISSING` (409) e o 404 de contato existente (T0.1 confere) |

### Worker (`apps/worker-transportada`)

- `occurrence-automatic-mail-sweep/infrastructure/drizzle-occurrence-automatic-mail-queue.repository.ts`: a condição da
  269 (`coalesce(x.contractor_mail_template_id, t.contractor_mail_template_id) is not null` e o carimbo da origem efetiva)
  vira `t.contractor_notification_template_key is not null`, `o.created_at >= coalesce(t.contractor_notification_template_selected_at, '-infinity')`
  e `exists (select 1 from notification.templates nt where nt.company_id = o.company_id and nt.key = t.contractor_notification_template_key and nt.channel = 'email' and nt.locale = 'pt-BR' and nt.active and nt.body !~ <padrão HTML>)`.
  O join da exceção sai (a contratante ainda é conferida, como hoje).

### Painel (`apps/frontend-transportada`)

- **Fase 1 (tolerância):** `isOccurrenceType` aceita `contractorNotificationTemplateKey`, `contractorMailWatchers`,
  `contractorMailRecipients` e tolera a ausência de `contractorMailTemplateId`; o guarda da exceção tolera a ausência de
  `contractorMailTemplateId`; a prévia do diálogo tolera `notificationTemplateKey` e a ausência de `templateId`; o
  histórico de mensagens tolera `notificationTemplateKey`/`Version`. O catálogo da 150 sem `occurrence` já é aceito.
- **Fase 4 (telas):**
  - editor do tipo: `OccurrenceTypeContractorMail.component.tsx` vira o bloco **"E-mail à contratante"**: o interruptor
    `emailsContractor` (fica), **Modelo** (`OccurrenceTypeContractorTemplateSelect`, sobre `useEmailTemplatesQuery`,
    filtrado pela D3, com "Nenhum", "Criar modelo em Notificações" → `/notificacoes/preferencias`, prévia com
    `interpolateTemplate` sobre valores de exemplo, lista de variáveis e o modelo sugerido para copiar, aviso do RF9),
    **Em cópia** (`OccurrenceTypeWatchersSelect`, `MultiSelect` sobre a lista da empresa da 267, inativo/sem permissão/
    sem e-mail marcados, teto 10) e **Destinatários** (`OccurrenceTypeRecipientsSelect`, só no `listed`, contatos das
    contratantes do tipo agrupados por contratante, inativos marcados, aviso ao tirar contratante do escopo). O campo do
    aviso interno (`OccurrenceTypeNotification`) fica onde está, com o rótulo "Aviso interno" para não confundir.
  - `OccurrenceTypeMailTemplateSelect.component.tsx` (269) sai; o seletor da exceção
    (`OccurrenceExceptionItem.component.tsx:139-141`) sai.
  - "Modelos" (150): `occurrence` sai de `CONTRACTOR_MAIL_TEMPLATE_TYPES` do painel e do tratamento do 409 de arquivar.
  - diálogo e feed: o link do aviso aponta só para o tipo (sem exceção).

### App do motorista (`apps/frontend-driver`)

- Nada (o retrato não leva os campos do e-mail; a T0.1 confere).

## Inventário — o que sai, o que muda, o que fica

Caminhos relativos a `apps/api-transportada/src/` salvo indicação. A = entrega da feature; B = migration destrutiva com
aprovação humana.

| Item                                                                                                                                                                      | Onde                                                                                                                      | Ação                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Tipo `occurrence` no catálogo da 150 (`CONTRACTOR_MAIL_TEMPLATE_TYPES`, `OCCURRENCE_MAIL_TYPE`, entrada do catálogo)                                                      | `contractor-mail/domain/mail-template-catalog.constant.ts:10,14`                                                          | **remover** (A); a CHECK do banco volta a `('address_correction')` em **B**                 |
| Renderizador de prévia `occurrence` e conferência de uso no arquivar (409 `CONTRACTOR_MAIL_TEMPLATE_IN_USE`)                                                              | `contractor-mail-templates.use-case.ts`, `occurrence-mail-template-usage.support.ts`, `contractor-mail-template.error.ts` | **remover** (A) — o código 409 sai se só servia a isso (T0.1)                               |
| `occurrence-mail-body.policy.ts` (abertura + itens + encerramento, `{snake_case}`)                                                                                        | `occurrence-conversation/domain/`                                                                                         | **substituir** pela D6 (A)                                                                  |
| `occurrence-mail-template.policy.ts` (exceção ?? tipo)                                                                                                                    | `occurrence-conversation/domain/` (T0.1 confirma a casa)                                                                  | **remover** (A): o modelo efetivo é o do tipo                                               |
| `findEffectiveOccurrenceMailTemplateSource`/`findEffectiveOccurrenceMailTemplate`/`findOriginalOccurrenceMailTemplateId`                                                  | `drizzle-occurrence-mail.repository.ts:171-260`                                                                           | **reescrever** pela chave (A)                                                               |
| `occurrence-mail-values.policy.ts`                                                                                                                                        | `trips/domain/`                                                                                                           | **fica**, chaves `camelCase` + 2 variáveis (A)                                              |
| `occurrence-mail-template-lock.support.ts` (`buildTemplateSelectedAtChange`)                                                                                              | `trips/infrastructure/`                                                                                                   | **fica**, aplicado à chave nova; o uso na exceção sai (A)                                   |
| `company_occurrence_types.contractor_mail_template_id` + FK + índice + `contractor_mail_template_selected_at`                                                             | `database/trip.schema.ts:2957-2965,3311-3319`                                                                             | parar de ler/escrever (A); **dropar** (B)                                                   |
| Exceção: `contractor_mail_template_id` + FK + índice + `_selected_at`                                                                                                     | `database/trip.schema.ts:3366-3375,3458-…`; use case, repositório, schema e lista da exceção                              | parar de ler/escrever (A); chave aceita e ignorada até a Fase 5; **dropar** (B)             |
| `contractor_mail_messages.template_id`                                                                                                                                    | `database/contractor-mail.schema.ts`                                                                                      | **fica** (correção de endereço); e-mail de ocorrência grava `null` (A)                      |
| Painel: `OccurrenceTypeMailTemplateSelect`, seletor da exceção, `occurrence` no "Modelos", `contractorMailTemplateErrors.service.ts` (caso do 409)                        | `apps/frontend-transportada/src/modules/{trip,delivery-clients}/**`                                                       | **remover** (Fase 4); guarda tolera ausência desde a Fase 1                                 |
| Painel: `contractorMailTemplateId` em `occurrenceType.types.ts`, `occurrenceTypeUpdate.service.ts`, `occurrenceException.service.ts`, `tripClient.service.ts`, validações | `apps/frontend-transportada/src/modules/trip/shared/**`                                                                   | **remover** (Fase 4)                                                                        |
| Worker: condição da exceção e do id                                                                                                                                       | `drizzle-occurrence-automatic-mail-queue.repository.ts:37-70`                                                             | **reescrever** (A)                                                                          |
| Testes da 269 só do que sai                                                                                                                                               | API, painel e worker (lista na T0.1)                                                                                      | **remover** e tirar do `package.json`/agregador; os de envio/aviso/carimbo são **editados** |
| `email_template_key` (aviso interno), `emails_contractor`, textos da 248                                                                                                  | `trip.schema.ts:2945…`                                                                                                    | **ficam**                                                                                   |
| Migrations da 269/270 já aplicadas                                                                                                                                        | `drizzle/20261016165917_*`, `20261017010529_*`                                                                            | **ficam** (migration aplicada não se edita)                                                 |

Aceite da etapa A (por comando): `rtk proxy grep -rnE "contractorMailTemplateId|contractor_mail_template_id|contractor_mail_template_selected_at|OCCURRENCE_MAIL_TYPE|'occurrence'.*mail" apps/*/src`
só acha o schema Drizzle das colunas que saem na B e a chave aceita-e-ignorada do `PUT` (até a Fase 5).

## Contratos

```ts
// GET /company-settings/occurrence-types — cada tipo ganha
{
  contractorNotificationTemplateKey: string | null,
  contractorMailWatchers: { userId: string; name: string; status: 'active' | 'inactive'; eligible: boolean }[],
  // eligible = vínculo ativo ∧ occurrences.resolve ∧ tem e-mail (sem o endereço)
  contractorMailRecipients: { contactId: string; contractorId: string; name: string; email: string;
                              status: 'active' | 'inactive'; receivesOccurrences: boolean }[],
  missingNotificationTemplate: boolean, // emails_contractor ∧ sem modelo utilizável
}
// e deixa de trazer contractorMailTemplateId (depois do painel tolerante)

// PUT /company-settings/occurrence-types — chaves opcionais e independentes (ausente = não mexe)
{
  contractorNotificationTemplateKey?: string | null,          // ≤ 128
  contractorMailWatcherUserIds?: string[],                     // únicos, ≤ 10
  contractorMailRecipientContactIds?: string[],                // únicos, ≤ 50; só com escopo 'listed'
  contractorMailTemplateId?: string | null,                    // aceito e ignorado até a Fase 5
}
// 400 OCCURRENCE_CONTRACTOR_TEMPLATE_INVALID { details: { problems: [{ code, variables? }] } }
//     code ∈ not_found | system_key | html_body | empty_subject | unknown_variables
// 404 OCCURRENCE_TYPE_WATCHER_NOT_FOUND     usuário fora da lista de responsáveis da empresa (ou de outra empresa)
// 400 OCCURRENCE_TYPE_WATCHER_LIMIT         > 10 ou responsável novo inativo
// 400 OCCURRENCE_TYPE_RECIPIENTS_REQUIRE_LISTED_SCOPE   destinatários num tipo 'all'
// 400 OCCURRENCE_TYPE_RECIPIENT_NOT_IN_SCOPE            contato de contratante fora da lista, inativo ou sem receives_occurrences
// 404 <código de contato inexistente da 150/183>        contato de outra empresa ou inexistente

// PUT /company-settings/occurrence-types/attachment-overrides
// contractorMailTemplateId: aceito e ignorado até a Fase 5; depois, 400 (.strict()).

// Prévia do diálogo: sai templateId, entra notificationTemplateKey: string | null; recipients[].preselected segue a D13.
// Envio manual: corpo inalterado. Sem modelo utilizável → 409 OCCURRENCE_MAIL_TEMPLATE_MISSING.
// Automático: skipped { reason: 'no_template_selected' } também para modelo não utilizável.
// Histórico de mensagens: notificationTemplateKey / notificationTemplateVersion por mensagem (opcional para o painel).
// GET /contractor-mail-templates/catalog: sem 'occurrence'.
```

## Dados, migration e rollback

**Migration A (aditiva), Fase 2**, carimbo posterior a `20261017010529`:

```sql
ALTER TABLE company_occurrence_types
  ADD COLUMN contractor_notification_template_key varchar(128) NULL,
  ADD COLUMN contractor_notification_template_selected_at timestamptz NULL;
ALTER TABLE company_occurrence_types
  ADD CONSTRAINT company_occurrence_types_contractor_notification_template_key_check
  CHECK (contractor_notification_template_key IS NULL OR length(btrim(contractor_notification_template_key)) > 0);

CREATE TABLE company_occurrence_type_watchers (
  company_id uuid NOT NULL,
  occurrence_type_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_occurrence_type_watchers_pk PRIMARY KEY (company_id, occurrence_type_id, user_id),
  CONSTRAINT company_occurrence_type_watchers_type_fk FOREIGN KEY (company_id, occurrence_type_id)
    REFERENCES company_occurrence_types (company_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT company_occurrence_type_watchers_company_watcher_fk FOREIGN KEY (company_id, user_id)
    REFERENCES company_occurrence_watchers (company_id, user_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX company_occurrence_type_watchers_user_idx ON company_occurrence_type_watchers (company_id, user_id);

CREATE TABLE company_occurrence_type_recipients (
  company_id uuid NOT NULL,
  occurrence_type_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_occurrence_type_recipients_pk PRIMARY KEY (company_id, occurrence_type_id, contact_id),
  CONSTRAINT company_occurrence_type_recipients_type_fk FOREIGN KEY (company_id, occurrence_type_id)
    REFERENCES company_occurrence_types (company_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT company_occurrence_type_recipients_contact_fk FOREIGN KEY (company_id, contact_id)
    REFERENCES contractor_contacts (company_id, id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX company_occurrence_type_recipients_contact_idx ON company_occurrence_type_recipients (company_id, contact_id);

ALTER TABLE contractor_mail_messages
  ADD COLUMN notification_template_key varchar(128) NULL,
  ADD COLUMN notification_template_version integer NULL;
```

Rollback A (`rollback.sql`): `DROP TABLE` das duas tabelas, `DROP CONSTRAINT` e `DROP COLUMN` das quatro colunas. Perde
as escolhas novas de propósito. Sem backfill: começa do zero (staging tem zero escolhas da 269 para levar).

**Migration B (destrutiva), Fase 6, com aprovação humana e só depois da A e das telas em `staging`** (pode ir a `main`
na mesma promoção, com aprovação — produção nunca teve código que lê essas colunas):

```sql
-- pré-condição conferida pelo executor e registrada: SELECT count(*) FROM contractor_mail_templates WHERE mail_type = 'occurrence' = 0
-- e zero linhas com contractor_mail_template_id não nulo nas duas tabelas; senão, PARA e pergunta.
DROP INDEX company_occurrence_types_mail_template_idx;
ALTER TABLE company_occurrence_types DROP CONSTRAINT company_occurrence_types_mail_template_fk;
ALTER TABLE company_occurrence_types DROP COLUMN contractor_mail_template_id, DROP COLUMN contractor_mail_template_selected_at;
DROP INDEX occurrence_type_contractor_overrides_mail_template_idx;
ALTER TABLE company_occurrence_type_contractor_overrides DROP CONSTRAINT occurrence_type_contractor_overrides_mail_template_fk;
ALTER TABLE company_occurrence_type_contractor_overrides
  DROP COLUMN contractor_mail_template_id, DROP COLUMN contractor_mail_template_selected_at;
ALTER TABLE contractor_mail_templates DROP CONSTRAINT contractor_mail_templates_mail_type_check;
ALTER TABLE contractor_mail_templates ADD CONSTRAINT contractor_mail_templates_mail_type_check
  CHECK (mail_type IN ('address_correction'));
```

Rollback B: recria as colunas (nulas), FKs e índices com os nomes da 269 e a CHECK com `('address_correction',
'occurrence')`. Os nomes exatos vêm do schema na T0.1. As colunas `email_subject`/`email_body`/`email_item_line_template`
são da etapa B da **269** e não entram aqui.

## Publicação

Nada da 269, da 270 nem da 271 está em produção. Ordem (cada passo com aprovação humana):

1. **Painel tolerante** das três specs (269 T1.4, 270 T1.2, 271 Fase 1) → `staging` → `main`.
2. **API + worker** com a migration A, contendo 269 + 270 + 271 juntas → `staging` → conferir → `main`. A API da 269
   **não** vai sozinha a produção (o dono configuraria modelos `occurrence` no cadastro da 150 que a 271 descarta).
3. **Telas** (Fase 4) → `staging` → `main`; depois, a Fase 5 tira a chave aceita-e-ignorada.
4. **Migration B** (Fase 6) → `staging` → `main`.

A 269 T5.4 (medir tipos com `emails_contractor` sem modelo antes de `main`) passa a medir pela chave nova.

## Riscos

- **Modelo desativado no módulo sem ninguém ver:** o pacote não sabe que o tipo usa a chave. Mitigado pelo aviso do
  RF9 (editor, feed, detalhe, diálogo); bloquear de verdade exige mudança no pacote (Q3).
- **Dono escreve variável errada depois da escolha** (edita no módulo): sai vazia no e-mail. A validação só roda ao
  salvar o tipo; o editor do tipo mostra as variáveis desconhecidas do modelo atual como aviso (Q2).
- **Linha do item fixa:** perde a linha configurável da 269 (Q1).
- **Conflito com 269/270 nos mesmos arquivos:** a 271 nasce sobre `staging`, que já as contém.
