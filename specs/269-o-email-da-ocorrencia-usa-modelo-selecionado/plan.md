# Plano — 269 O e-mail da ocorrência usa o modelo selecionado

## Contexto e premissas

O levantamento contra `origin/staging` (e79e26171, 2026-10-16) está em [`evidence.md`](evidence.md) § Levantamento. Os
fatos que moldam o plano:

- **O cadastro da 150 já tem quase tudo:** modelos por tipo de e-mail, variáveis em dois níveis, validação com todos os
  erros, renderização com HTML escapado, prévia por tipo, padrão, arquivamento, teto de 50 e `template_id` na mensagem.
  Falta o tipo `occurrence` (constante + CHECK + renderizador de prévia).
- **A exceção por contratante já existe** (`company_occurrence_type_contractor_overrides`, `trip.schema.ts:3289`; PUT
  `/company-settings/occurrence-types/attachment-overrides`, schema `.strict()`; precedência em
  `src/shared/resolve-with-overrides.policy.ts`) e o painel a edita na aba Tipos (`OccurrenceTypeExceptions`,
  `OccurrenceExceptionForm`). A coluna nova entra nela como as irmãs (nulo herda).
- **O texto do tipo e a máquina `{{camelCase}}` só servem a este e-mail** (e à cópia dele na resposta do registro). A 248
  não os usa. Por isso a máquina sai inteira; fica só a **leitura dos valores** (nota, itens, somas), que passa a
  alimentar as variáveis `{snake_case}`.
- **Guardas estritos no painel** (três): o catálogo e a lista de modelos reprovam `mailType` desconhecido; o tipo de
  ocorrência exige `emailSubject`/`emailBody` e reprova chave desconhecida; a resposta do registro e a prévia do diálogo
  têm forma fixa. **Por isso a Fase 1 (painel tolerante) vai a produção antes da API.**
- **Lacuna do worker:** pulo sem modelo não grava idempotência e a varredura repete a ocorrência. A varredura passa a
  exigir modelo efetivo (tipo ou exceção).

### Ordem com a 268

A spec 268 (**já em `staging`**, PR #259; esta branch foi rebaseada sobre ela) mexe em `send-occurrence-mail.use-case.ts` e
`drizzle-occurrence-mail.repository.ts` (`recordMail` ganha `transport`) e na aba "E-mail com contratantes". A 269 mexe
nos mesmos arquivos (`recordMail` ganha `templateId`). **Nada a esperar:** a T0.1 confirmou a 268 em `staging` e o mapeamento é por símbolo, não por linha. Conflito esperado: o `values({...})` do insert em `contractor_mail_messages` e o
resumo da aba de e-mail (`MailSendReadinessSummary`).

## Decisões de desenho (a T0.2 valida com `architect`)

| #   | Escolha                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Alternativa rejeitada                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Tipo de e-mail `occurrence` no catálogo da 150, renderizado por `renderMailTemplate`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Manter `{{camelCase}}` e só mover o texto — duas sintaxes para sempre.                                                                                                                                  |
| D2  | `contractor_mail_template_id uuid NULL` em **dois** lugares: `company_occurrence_types` (o modelo do tipo) e `company_occurrence_type_contractor_overrides` (a exceção por contratante, specs 218/246/247/248; nulo herda do tipo, campo a campo, como as colunas irmãs). Cada um com FK composta `(company_id, contractor_mail_template_id)` → `contractor_mail_templates (company_id, id)` `ON DELETE RESTRICT`. **Modelo efetivo = exceção da contratante ?? tipo** (`resolveWithOverrides`, sem camada de destinatário).                                                                                                                                                                     | Tabela de ligação tipo × modelo; exceção por destinatário (o dono quer só por contratante); escopo do tipo por contratante (o dono recusou: o tipo é geral, a exceção acompanha a contratante da nota). |
| D3  | O modelo escolhido (no tipo ou na exceção) precisa ser `occurrence` e `active` — conferido na gravação, com `FOR KEY SHARE` no modelo; arquivar trava o modelo `FOR UPDATE` e responde 409 `CONTRACTOR_MAIL_TEMPLATE_IN_USE` se algum tipo (ativo ou inativo) **ou alguma exceção de contratante** o usa, listando os tipos e os pares tipo/contratante. **Revisão T0.2:** o arquivar faz `SELECT … FOR UPDATE` no modelo dentro da transação existente (depois do advisory lock) e confere o uso nas duas tabelas. Invariante: modelo referenciado ⇒ ativo; a varredura do worker só exige `coalesce(ov.contractor_mail_template_id, t.contractor_mail_template_id) is not null`.               | Arquivar e limpar em silêncio; CHECK por gatilho no banco.                                                                                                                                              |
| D4  | Modelo efetivo nulo = sem e-mail, **nem à mão**: o automático pula, o diálogo fica com o envio desabilitado e a API recusa o envio manual com 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`. Não cai no `is_default` nem no texto antigo. **Exceção (T0.2):** `contractorReplyResend` (248) não passa pelo bloqueio e grava `template_id` da mensagem original (ou nulo).                                                                                                                                                                                                                                                                                                                               | Usar o padrão do tipo `occurrence`; deixar o operador escrever à mão (o dono bloqueou).                                                                                                                 |
| D5  | Corpo = abertura + linhas de item + encerramento, separados por linha em branco; seção vazia some. A assinatura (operador e transportadora) continua sendo anexada por `buildOccurrenceMail`, como hoje — por isso o catálogo `occurrence` **não** tem `{operador}`/`{transportadora}`. **Revisão T0.2:** o assunto renderizado colapsa espaço e quebra de linha (`/\s+/` → `' '`) e trunca em `OCCURRENCE_MAIL_LIMITS.subject`; o corpo trunca as linhas de item ("e mais N itens") para caber em `OCCURRENCE_MAIL_LIMITS.body`; os valores cobrem **todas** as variáveis do catálogo (`Record<nome, string>`, `''` quando ausente), porque `renderMailTemplate` imprime o `{x}` cru se faltar. | Variáveis de assinatura no modelo — o envio automático não tem operador, e a assinatura sairia duplicada.                                                                                               |
| D6  | Variáveis de e-mail que agregam itens têm nome no plural (`{itens}`, `{codigos_itens}`, `{quantidades_itens}`); as de item ficam no singular. O validador da 150 confere variável de item **antes** da de e-mail, então o mesmo nome não pode existir nos dois níveis.                                                                                                                                                                                                                                                                                                                                                                                                                           | Reusar `{item}` nos dois níveis — o validador recusaria `{item}` no assunto.                                                                                                                            |
| D7  | O servidor resolve o modelo efetivo também no envio manual e o grava em `template_id`; o corpo do envio **não** traz `templateId` (o cliente não escolhe o modelo). O operador pode editar o texto sugerido antes de enviar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Aceitar `templateId` do cliente — confiar no cliente para o rastreio; gravar `null` no manual.                                                                                                          |
| D8  | O aviso é um booleano calculado pela API (`missingNotificationTemplate = emails_contractor && modelo efetivo IS NULL`, com a exceção da contratante da nota) no item do feed, no detalhe e na prévia do diálogo. O painel não recalcula. **Revisão T0.2:** `missingNotificationTemplate` = `kind='document'` ∧ contratante conhecida ∧ `emails_contractor` ∧ modelo efetivo nulo, calculado na mesma consulta (LEFT JOIN da exceção). **Nunca** no DTO `isTripOccurrence` (guarda exato).                                                                                                                                                                                                        | O painel ler tipo e exceção e decidir — duplicaria a resolução em três telas.                                                                                                                           |
| D9  | Etapa A remove o código; o schema `.strict()` do `PUT` **aceita e ignora** `emailSubject`/`emailBody`/`emailItemLineTemplate` até a etapa B (o painel antigo, ainda em produção durante a publicação, os manda). A etapa B tira as chaves e as colunas. **Revisão T0.2:** as chaves antigas entram como `z.string().max(…).optional()` sem validar marcador, e são descartadas antes do mapper.                                                                                                                                                                                                                                                                                                  | Tirar as chaves já na A — o painel antigo tomaria 400 ao salvar um tipo durante a janela de publicação.                                                                                                 |

## Revisão de arquitetura (T0.2) — veredito: aprovado com mudanças

Aplicadas nas linhas D2–D9 acima e aqui:

1. **Nomes (D2):** colunas `contractor_mail_template_id` / `contractorMailTemplateId` em `company_occurrence_types` e
   `company_occurrence_type_contractor_overrides`; constraints `company_occurrence_types_mail_template_fk`/`_idx` e
   `occurrence_type_contractor_overrides_mail_template_fk`/`_idx`.
2. **Erros:** gravar tipo/exceção com modelo inexistente, de outra empresa, arquivado ou de outro tipo de e-mail → 409
   `CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE` (código existente). Códigos novos moram em classes `*.error.ts`:
   `CONTRACTOR_MAIL_TEMPLATE_IN_USE` (`contractor-mail-template.error.ts`) e `OCCURRENCE_MAIL_TEMPLATE_MISSING`
   (`occurrence-conversation.error.ts`). Não existe `shared/errors/codes.ts` (substitui a linha "Erros" da tabela de arquivos).
3. **Exceção, gravação:** `contractorMailTemplateId` ausente = não mexe (`toOverrideRequirementUpdate`,
   `occurrence-override-requirement-columns.support.ts:63`); `null` = herda.
4. **Automático:** um 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING` vindo do envio (corrida) vira `skipped`/`no_template_selected`.
5. **Catálogo:** `occurrence` entra **depois** de `address_correction` (o `MailSendReadinessSummary` usa `catalog[0]`);
   `is_default` não tem efeito para `occurrence`, e o painel esconde "Definir como padrão" nele.

### Convivência com a 267 (CC aos observadores)

A 269 só resolve **modelo, assunto, corpo e `templateId`**. Em `executeSend` há um único ponto, logo depois da checagem
de prontidão (substitui o comentário perto de `:230-234`); `templateId` entra em `recordMail` entre `subject` e
`threadId`; o repositório ganha o método de porta `findEffectiveOccurrenceMailTemplate` ao lado dos `find*`. A 269 **não
toca** `fingerprint`, destinatários, `resolveMailCopy`, logger nem `ccAddresses`. Quem mergear depois regenera a própria
migration e o snapshot (`db:generate` → `no_changes`) e reconcilia os dublês de `occurrence-mail.contract.ts` e o
`SendToContractorDialog`.

## Catálogo `occurrence`

Rótulo: "Ocorrência". Variáveis de **e-mail** (assunto, abertura, encerramento e também no item):

| Variável                  | Origem hoje (`{{camelCase}}`)       | Descrição                                                   |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `{numero_nota}`           | `numeroNota`                        | Número da nota com série.                                   |
| `{numero_nota_sem_serie}` | `numeroNotaSemSerie`                | Número da nota sem série.                                   |
| `{razao_social}`          | `razaoSocial`                       | Razão social do destinatário da nota.                       |
| `{valor_nota}`            | `valorNota`                         | Valor total da nota.                                        |
| `{contratante}`           | `contratante`                       | Nome da contratante.                                        |
| `{motorista}`             | `motorista`                         | Nome do motorista da viagem.                                |
| `{parada}`                | `parada`                            | A parada da nota (sequência e cliente).                     |
| `{data}`                  | `data`                              | Data da ocorrência.                                         |
| `{observacao}`            | `observacao`                        | Observação registrada.                                      |
| `{numero_referencia}`     | `numeroReferencia`                  | Número do documento do cliente (247).                       |
| `{soma_itens}`            | `somaItens`                         | Soma das linhas dos itens (247).                            |
| `{valor_declarado}`       | `valorDeclarado`                    | Valor pago declarado (247).                                 |
| `{itens}`                 | `item` (nível ocorrência)           | Os itens da ocorrência num texto só, separados por vírgula. |
| `{codigos_itens}`         | `codigoItem` (nível ocorrência)     | Os códigos dos itens, separados por vírgula.                |
| `{quantidades_itens}`     | `quantidadeItem` (nível ocorrência) | As quantidades, separadas por vírgula.                      |

Variáveis de **item** (só no texto do item, que se repete por item — substitui `{{linhasItens}}`):
`{item}`, `{codigo_item}`, `{quantidade_item}`, `{unidade_item}`, `{valor_unitario_item}`, `{soma_item}`, `{valor_item}`.

Teto de 200 linhas; acima disso, uma linha "e mais N itens" (mesma regra de hoje, `OCCURRENCE_ITEM_LINES_LIMIT`, que muda
de casa). Os valores são os mesmos que `readOccurrenceTemplateValues` produz hoje — a mudança é o nome da chave.

Modelo sugerido (ponto de partida, nunca semeado): assunto `Ocorrência na nota {numero_nota} — {contratante}`, abertura
"Olá, equipe {contratante},\n\nRegistramos uma ocorrência na nota {numero_nota} ({razao_social}) em {data}.\n\n{observacao}",
item `{codigo_item} – {item} – {quantidade_item} {unidade_item} – R$ {valor_item}` (a linha padrão de hoje), encerramento
"Qualquer dúvida, é só responder este e-mail.".

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

| Camada       | Arquivo (novo ou alterado)                                                                                                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo     | `contractor-mail/domain/mail-template-catalog.constant.ts`: `occurrence` em `CONTRACTOR_MAIL_TEMPLATE_TYPES`, `OCCURRENCE_MAIL_TYPE`, entrada do catálogo                                                                                                                               |
| Domínio      | `contractor-mail/domain/occurrence-mail-body.policy.ts` (pura, nova): compõe assunto e corpo (D5) a partir do modelo e dos valores; teto de 200 linhas                                                                                                                                  |
| Domínio      | `trips/domain/occurrence-mail-values.policy.ts` (nova, nasce do que sobra de `occurrence-template.policy.ts` + `occurrence-template-lines.policy.ts`): valores de e-mail e de item em `{snake_case}`                                                                                    |
| Prévia       | renderizador `occurrence` em `previewRenderers` (`contractor-mail-templates.use-case.ts:80`), com valores de exemplo (o `OCCURRENCE_TEMPLATE_PREVIEW_SAMPLE` de hoje, renomeado)                                                                                                        |
| Arquivar     | `contractor-mail-templates.use-case.ts` + repositório: `FOR UPDATE` no modelo, conferir uso no tipo e na exceção, 409 `CONTRACTOR_MAIL_TEMPLATE_IN_USE` com `details.occurrenceTypeNames` e `details.contractorExceptions`                                                              |
| Tipo         | `occurrence.schema.ts` (`contractorMailTemplateId: uuid \| null` opcional, D9), `save-occurrence-type.use-case.ts`, `save-occurrence-type-values.mapper.ts`, `delivery-proof-read.support.ts` (leitura e escrita da coluna; resposta com `contractorMailTemplateId`)                    |
| Envio        | `drizzle-occurrence-mail.repository.ts`: `createOccurrenceSuggestedMailReader` lê o modelo escolhido (join), devolve `{ subject, bodyText, templateId }` ou `null`; `recordMail` grava `templateId`                                                                                     |
| Envio        | `send-automatic-occurrence-mail.use-case.ts`: motivo `no_template` vira `no_template_selected`; passa `templateId`                                                                                                                                                                      |
| Exceção      | `occurrence-attachment-overrides.use-case.ts`, `drizzle-occurrence-attachment-overrides.repository.ts`, schema do `PUT .../attachment-overrides` e `list-occurrence-attachment-overrides.use-case.ts`: `contractorMailTemplateId: uuid \| null` (nulo herda), mesma conferência do tipo |
| Resolução    | `occurrence-mail-template.policy.ts` (pura, nova): modelo efetivo = `resolveWithOverrides({ contractorOverride, general, recipientOverride: null, fallback: null })`                                                                                                                    |
| Envio        | `send-occurrence-mail.use-case.ts`: resolve o modelo efetivo na transação; sem modelo → 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING` (D4); grava `template_id` (D7)                                                                                                                           |
| Diálogo      | `preview-occurrence-mail.use-case.ts`: `templateId` e `missingNotificationTemplate` na resposta                                                                                                                                                                                         |
| Feed/detalhe | item do feed (`GET /trip-occurrences`) e detalhe ganham `missingNotificationTemplate` (D8)                                                                                                                                                                                              |
| Schema       | `database/trip.schema.ts` (coluna + FK + índice parcial), `database/contractor-mail.schema.ts` (CHECK via constante) + migration                                                                                                                                                        |
| Erros        | `shared/errors/codes.ts`: `CONTRACTOR_MAIL_TEMPLATE_IN_USE` (409), `OCCURRENCE_TYPE_EMAIL_TEMPLATE_KIND_INVALID` (400), `OCCURRENCE_MAIL_TEMPLATE_MISSING` (409); reusa `CONTRACTOR_MAIL_TEMPLATE_NOT_FOUND`/`_ARCHIVED` se existirem (T0.1 confere)                                    |

### Só as registradas depois da escolha (decisão de 2026-10-17)

- Gravação: `saveOccurrenceType` (`delivery-proof-read.support.ts`) e `replaceContractorOverrides`
  (`drizzle-occurrence-attachment-overrides.repository.ts`) usam `buildTemplateSelectedAtChange`
  (`occurrence-mail-template-lock.support.ts`): `CASE WHEN id_antigo IS DISTINCT FROM id_novo THEN now() ELSE carimbo END`.
- Plano automático: `findEffectiveOccurrenceMailTemplateSource` devolve também se a ocorrência é anterior ao carimbo da
  origem efetiva; `AutomaticOccurrenceMailPlan.isRegisteredBeforeTemplate` → motivo `registered_before_template`.
- Varredura do worker: `o.created_at >= coalesce(carimbo da origem efetiva, '-infinity')` na própria SQL.
- Painel: o aviso do editor do tipo exige `emails_contractor` ligado (já exigia; teste do caso desligado).

### Worker (`apps/worker-transportada`)

- `drizzle-occurrence-automatic-mail-queue.repository.ts:37-62`: a varredura passa a exigir modelo efetivo —
  `company_occurrence_types.contractor_mail_template_id` **ou** o da exceção da contratante da nota não nulo (lacuna do
  `evidence.md`). A T0.1 confere se a varredura já conhece a contratante; se não, o join vem da mesma leitura do plano
  automático.

### Painel (`apps/frontend-transportada`)

- **Fase 1 (tolerância):**
  - `delivery-clients/shared/contractorMailTemplatesResponse.validation.ts`: catálogo e lista **descartam** entrada com
    `mailType` desconhecido em vez de reprovar a resposta;
  - `trip/shared/tripResponse.validation.ts`: no tipo, `emailSubject`/`emailBody` passam a opcionais e
    `contractorMailTemplateId` e `missingNotificationTemplate` entram nas chaves permitidas; o guarda da exceção por contratante
    tolera `contractorMailTemplateId`; a resposta do registro tolera
    `email` ausente;
  - guarda do feed/detalhe (`tripOccurrenceFeedClient.service.ts`) e da prévia do diálogo
    (`occurrenceConversationClient.service.ts:273-282`) toleram `missingNotificationTemplate` e `templateId`.
- **Fase 4 (telas):**
  - editor do tipo: `OccurrenceTypeContractorMail.component.tsx` fica com o interruptor `emailsContractor` e ganha
    `OccurrenceTypeMailTemplateSelect.component.tsx` (seletor dos modelos `occurrence` ativos + "Nenhum" + prévia +
    "Gerenciar modelos" + aviso);
  - "Modelos": `occurrence` entra em `CONTRACTOR_MAIL_TEMPLATE_TYPES`; o 409 de arquivar mostra os tipos;
  - editor da exceção (`OccurrenceExceptionForm.component.tsx`): o mesmo seletor, com "Herdar do tipo" no lugar de
    "Nenhum";
  - diálogo `SendToContractorDialog.component.tsx`: sem modelo efetivo, o envio fica **desabilitado** com o aviso e o
    link para o tipo/exceção; trata o 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`;
  - feed e detalhe: selo "Tipo sem modelo de notificação" com link para a aba Tipos.

### App do motorista (`apps/frontend-driver`)

- Só limpeza: a tolerância a `emailItemLineTemplate` (`driverTrip.types.ts:501,532,565-566`) sai depois da API parar de
  mandar a chave.

## Inventário — o que fica e o que sai

Caminhos relativos a `apps/api-transportada/src/` salvo indicação. "Etapa" A = mesma entrega da feature; B = migration
destrutiva com aprovação humana.

| Item                                                                                                                                                                                                                                                                                | Onde                                                                                                                                                                                                                                                                                                                              | Usado em outro lugar?                                                                               | Ação                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `renderOccurrenceTemplate`, `unknownTemplatePlaceholders`                                                                                                                                                                                                                           | `trips/domain/occurrence-template.policy.ts:150,173`                                                                                                                                                                                                                                                                              | não (só leitor da sugestão, `renderEmail` do registro e prévia do tipo)                             | **remover** (A)                                                                                                                          |
| `buildOccurrenceItemValues`                                                                                                                                                                                                                                                         | `occurrence-template.policy.ts:189`                                                                                                                                                                                                                                                                                               | `delivery-proof-read.support.ts:1501` (montagem dos valores)                                        | **mover/renomear** para `occurrence-mail-values.policy.ts`, chaves `{snake_case}` (A)                                                    |
| `buildOccurrenceTemplateLines`, `StoredOccurrenceLine`, `OccurrenceTemplateNfeProduct`                                                                                                                                                                                              | `trips/domain/occurrence-template-lines.policy.ts`                                                                                                                                                                                                                                                                                | `delivery-proof-read.support.ts:1487`, `occurrence-template-source.query.ts`                        | **mover/renomear** (as linhas de item continuam necessárias) (A)                                                                         |
| Tipos `OccurrenceTemplateValues`/`Line`/`Item`                                                                                                                                                                                                                                      | `trips/domain/occurrence-template.types.ts`                                                                                                                                                                                                                                                                                       | valores e registro                                                                                  | **renomear** para `OccurrenceMailValues…`; o campo `itemLineTemplate` sai (A)                                                            |
| `readOccurrenceTemplateValues`                                                                                                                                                                                                                                                      | `trips/infrastructure/delivery-proof-read.support.ts:1409`                                                                                                                                                                                                                                                                        | leitor da sugestão; `main.ts:1343,4525` (só para `renderEmail`)                                     | **fica**, renomeado `readOccurrenceMailValues`, sem ler `email_item_line_template`; as ligações do `main.ts` para `renderEmail` saem (A) |
| `readStoredOccurrenceTemplateSource`                                                                                                                                                                                                                                                | `trips/infrastructure/occurrence-template-source.query.ts`                                                                                                                                                                                                                                                                        | só `delivery-proof-read.support.ts:1470`                                                            | **fica** sem a coluna `email_item_line_template` (lê as linhas guardadas) — ou é fundido no leitor (A)                                   |
| Prévia do tipo: `renderOccurrenceEmailPreview`, rota `POST /company-settings/occurrence-types/email-preview` + schema                                                                                                                                                               | `trips/domain/occurrence-template-preview.policy.ts`, `trips/presentation/occurrence-type-email-preview.{routes,schema}.ts`, `main.ts:602,4273`                                                                                                                                                                                   | não                                                                                                 | **remover**; a amostra vira a do renderizador de prévia `occurrence` (A)                                                                 |
| Schemas `emailSubject/emailBody/emailItemLineTemplateSchema`                                                                                                                                                                                                                        | `trips/presentation/occurrence-template-fields.schema.ts`                                                                                                                                                                                                                                                                         | `occurrence.schema.ts:463,570,571`, schema da prévia                                                | **remover** o arquivo; no `PUT` as três chaves ficam aceitas e ignoradas (D9) até B (A)                                                  |
| Constantes `OCCURRENCE_*` de marcador, `OccurrenceTemplateContext`, `OCCURRENCE_DEFAULT_ITEM_LINE_TEMPLATE`                                                                                                                                                                         | `shared/occurrence-template.constant.ts`                                                                                                                                                                                                                                                                                          | só a política e o schema que saem                                                                   | **remover** o arquivo; `OCCURRENCE_ITEM_LINES_LIMIT` muda para o catálogo/política nova (A)                                              |
| `OCCURRENCE_EMAIL_SUBJECT_MAX_LENGTH`, `OCCURRENCE_EMAIL_BODY_MAX_LENGTH`                                                                                                                                                                                                           | `shared/trip-occurrence.constant.ts:238,239`                                                                                                                                                                                                                                                                                      | só o schema que sai                                                                                 | **remover** (A)                                                                                                                          |
| `OCCURRENCE_ITEM_LINE_TEMPLATE_MAX_LENGTH`                                                                                                                                                                                                                                          | `shared/trip-occurrence.constant.ts:242`                                                                                                                                                                                                                                                                                          | CHECK `company_occurrence_types_email_item_line_template_check` (`trip.schema.ts:3191-3193`)        | **remover em B**, junto da coluna e da CHECK                                                                                             |
| `renderEmail` e `RegisterTripOccurrenceResult.email`                                                                                                                                                                                                                                | `trips/application/register-trip-occurrence.use-case.ts:122,500,513-536`; `trip.routes.ts:1877-1880`; `main.ts:1424,4585`                                                                                                                                                                                                         | painel "e-mail pronto" (`TripOccurrences.component.tsx:59,302-306`, locale `occurrence.emailReady`) | **remover** os dois lados; o painel tolera a ausência antes (Fase 1) (A)                                                                 |
| Leitura/escrita de `email_subject`/`email_body`/`email_item_line_template`                                                                                                                                                                                                          | `delivery-proof-read.support.ts:869-871,1040-1042,1239-1240,1255-1257,1363-1365`; `save-occurrence-type*.ts`; `trip.routes.ts:335-351`                                                                                                                                                                                            | não                                                                                                 | **remover** (A); a resposta do tipo deixa de trazer as chaves depois do painel tolerante                                                 |
| Seed e cenários                                                                                                                                                                                                                                                                     | `database/local-occurrence-type-seed.service.ts:75-76`; `scripts/contractor-reply-scenarios/scenario-fixtures.ts:295-296`; `test/fixtures/occurrence-conversation-database.fixture.ts:104-105`                                                                                                                                    | —                                                                                                   | **remover** as chaves (A)                                                                                                                |
| Colunas `email_subject`, `email_body`, `email_item_line_template` + CHECK da linha                                                                                                                                                                                                  | `database/trip.schema.ts:2934-2935,3056,3191-3193`                                                                                                                                                                                                                                                                                | não depois da A                                                                                     | **remover em B** (migration destrutiva, rollback escrito)                                                                                |
| Exceção por contratante: coluna `contractor_mail_template_id` (nova)                                                                                                                                                                                                                | `database/trip.schema.ts:3289` + exceção (use case, repositório, schema, lista)                                                                                                                                                                                                                                                   | —                                                                                                   | **adicionar** (A, aditiva)                                                                                                               |
| `emails_contractor`                                                                                                                                                                                                                                                                 | `trip.schema.ts:2947`                                                                                                                                                                                                                                                                                                             | **sim**: automático, CHECK da 248 (`:3264-3266`), worker, painel                                    | **fica**                                                                                                                                 |
| `driver_reply_template`, `forward_email_subject`/`_body` (248)                                                                                                                                                                                                                      | `trip.schema.ts:3101-3102`                                                                                                                                                                                                                                                                                                        | 248 (texto fixo, sem marcadores)                                                                    | **fica**                                                                                                                                 |
| `notifies`, `email_template_key` (079, aviso interno)                                                                                                                                                                                                                               | `register-trip-occurrence.use-case.ts:564-568`                                                                                                                                                                                                                                                                                    | sim                                                                                                 | **fica**                                                                                                                                 |
| Painel: `OccurrenceTypeMailFields`, `OccurrenceTypeMailMarkers`, `OccurrenceTypeMailPreview`, `occurrenceMailDraft.service.ts`, `useOccurrenceMailDraftStore.hook.ts`, `occurrenceMailTemplate.constant.ts`, `useOccurrenceTypeEmailPreview.query.ts`, `previewOccurrenceTypeEmail` | `apps/frontend-transportada/src/modules/trip/**` (provedor do rascunho em `OccurrenceTypeCatalogPanel.component.tsx:11-13,78,155-168`)                                                                                                                                                                                            | não                                                                                                 | **remover** (A, Fase 4)                                                                                                                  |
| Painel: campos do tipo e do `PUT`                                                                                                                                                                                                                                                   | `occurrenceType.types.ts:40-43`; `occurrenceTypeUpdate.service.ts:38-41,98-112,168-169`; `tripClient.service.ts:966-970`                                                                                                                                                                                                          | não                                                                                                 | **remover** (A, Fase 4); guarda tolera ausência desde a Fase 1                                                                           |
| Painel: locales `occurrenceTypeCatalog.mail.*`                                                                                                                                                                                                                                      | `company-settings/locales/companySettings(.en).locale.json:463-492`                                                                                                                                                                                                                                                               | `title` e `switch` seguem em uso                                                                    | **remover** o resto (A, Fase 4)                                                                                                          |
| Painel: "e-mail pronto" do registro                                                                                                                                                                                                                                                 | `TripOccurrences.component.tsx:59,302-306`; `useTripWorkspace.hook.ts:630,742`; `tripResponse.validation.ts:1194,1202`; locale `occurrence.emailReady`                                                                                                                                                                            | não                                                                                                 | **remover** (Fase 1 já para de ler)                                                                                                      |
| App do motorista: tolerância a `emailItemLineTemplate`                                                                                                                                                                                                                              | `apps/frontend-driver/src/**/driverTrip.types.ts:501,532,565-566` + teste do guarda                                                                                                                                                                                                                                               | não                                                                                                 | **remover** depois da API (Fase 4)                                                                                                       |
| Testes só do código morto                                                                                                                                                                                                                                                           | API: `test/trip-occurrence/{template,occurrence-template-lines,occurrence-type-email-preview,email-template-absent}.contract.ts`; painel: `test/trip-hooks/{occurrence-type-contractor-mail,occurrence-type-mail-draft,occurrence-type-mail-save-failure}.contract.ts`, `test/trip/occurrence-type-mail-touch-target.contract.ts` | —                                                                                                   | **remover** (e tirar da lista do `package.json` e do agregador)                                                                          |
| Testes mistos                                                                                                                                                                                                                                                                       | `test/integration/occurrence-template-values.integration.ts` (reescrever para o modelo), `template-key.contract.ts` (casos do texto), contratos de tipo que montam `emailSubject`/`emailBody`                                                                                                                                     | —                                                                                                   | **editar**, não apagar                                                                                                                   |
| Migrations antigas que citam as colunas                                                                                                                                                                                                                                             | `drizzle/20260903140000_*`, `20260903200000_*`, `20261007033420_*`, `20261012180000_*`                                                                                                                                                                                                                                            | histórico                                                                                           | **ficam** (migration aplicada não se edita)                                                                                              |

Aceite da etapa A (por comando): `rtk proxy grep -rnE "emailSubject|emailBody|emailItemLineTemplate|email_subject|email_body|email_item_line_template|renderOccurrenceTemplate|occurrence-template\." apps/*/src`
só pode achar o schema Drizzle das colunas e o `PUT` que aceita e ignora (D9).

## Contratos/API

### Tipo de ocorrência

`PUT /company-settings/occurrence-types` — o item ganha `contractorMailTemplateId?: string | null` (ausente = não mexe).

Exceção por contratante: `PUT /company-settings/occurrence-types/attachment-overrides` — cada exceção ganha
`contractorMailTemplateId?: string | null` (nulo herda do tipo), com as mesmas respostas de erro abaixo.

```ts
// 200: cada tipo traz contractorMailTemplateId: string | null  (e deixa de trazer emailSubject/emailBody/emailItemLineTemplate
//       só depois de o painel tolerante estar em produção — T3.1)
// 404 CONTRACTOR_MAIL_TEMPLATE_NOT_FOUND       modelo de outra empresa ou inexistente
// 400 OCCURRENCE_TYPE_EMAIL_TEMPLATE_KIND_INVALID  modelo que não é `occurrence`
// 409 CONTRACTOR_MAIL_TEMPLATE_ARCHIVED        modelo arquivado
```

### Modelos

- `GET /contractor-mail-templates/catalog`: entrada `occurrence` (§ Catálogo).
- `POST/PATCH /contractor-mail-templates`, `POST /contractor-mail-templates/preview`: valem para `occurrence`.
- Arquivar modelo em uso (tipo ou exceção):
  `409 { error: { code: 'CONTRACTOR_MAIL_TEMPLATE_IN_USE', details: { occurrenceTypeNames: string[], contractorExceptions: Array<{ occurrenceTypeName: string, contractorName: string }> } } }`.

### E-mail de ocorrência

- Prévia do diálogo: a resposta ganha `templateId: string | null` e `missingNotificationTemplate: boolean`.
  `suggested` continua.
- Envio manual: corpo **sem** campo novo; o servidor resolve o modelo efetivo e o grava (D7). Sem modelo efetivo →
  `409 OCCURRENCE_MAIL_TEMPLATE_MISSING` (D4).
- Automático: `skipped` com `reason: 'no_template_selected'` (antes `no_template`).
- Feed (`GET /trip-occurrences`) e detalhe: `missingNotificationTemplate: boolean` por item.

## Dados, migration e rollback

**Migration A (aditiva), na Fase 2:** (decisão de 2026-10-17: as duas tabelas ganham também
`contractor_mail_template_selected_at timestamptz NULL`, carimbada no gravar — troca para id não nulo = `now()`, mesmo id
mantém, `null` limpa; editada no lugar, com rollback e snapshot)

```sql
ALTER TABLE contractor_mail_templates DROP CONSTRAINT contractor_mail_templates_mail_type_check;
ALTER TABLE contractor_mail_templates ADD CONSTRAINT contractor_mail_templates_mail_type_check
  CHECK (mail_type IN ('address_correction', 'occurrence'));
ALTER TABLE company_occurrence_types ADD COLUMN contractor_mail_template_id uuid NULL;
ALTER TABLE company_occurrence_types ADD CONSTRAINT company_occurrence_types_mail_template_fk
  FOREIGN KEY (company_id, contractor_mail_template_id) REFERENCES contractor_mail_templates (company_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX company_occurrence_types_mail_template_idx
  ON company_occurrence_types (company_id, contractor_mail_template_id) WHERE contractor_mail_template_id IS NOT NULL;
ALTER TABLE company_occurrence_type_contractor_overrides ADD COLUMN contractor_mail_template_id uuid NULL;
ALTER TABLE company_occurrence_type_contractor_overrides
  ADD CONSTRAINT occurrence_type_contractor_overrides_mail_template_fk
  FOREIGN KEY (company_id, contractor_mail_template_id) REFERENCES contractor_mail_templates (company_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX occurrence_type_contractor_overrides_mail_template_idx
  ON company_occurrence_type_contractor_overrides (company_id, contractor_mail_template_id) WHERE contractor_mail_template_id IS NOT NULL;
```

Rollback A: nas duas tabelas, `DROP INDEX`, `DROP CONSTRAINT` da FK e `DROP COLUMN contractor_mail_template_id`; e a CHECK volta a
`('address_correction')` **como `NOT VALID`** (modelos `occurrence` já gravados ficam; nenhum dado de outra feature se
perde). Sem backfill: começa do zero (RF8).

**Migration B (destrutiva), na Fase 6, com aprovação humana e só depois da etapa A em produção:**

```sql
ALTER TABLE company_occurrence_types DROP CONSTRAINT company_occurrence_types_email_item_line_template_check;
ALTER TABLE company_occurrence_types DROP COLUMN email_subject;
ALTER TABLE company_occurrence_types DROP COLUMN email_body;
ALTER TABLE company_occurrence_types DROP COLUMN email_item_line_template;
```

Rollback B (escrito no `rollback.sql`): recria as três colunas `text NOT NULL DEFAULT ''` e a CHECK de tamanho da linha.
**O texto é descartado de propósito** (decisão do dono, "começa do zero"); o rollback devolve a forma, não o conteúdo.
Antes da B, a T6.1 registra a contagem de tipos com texto não vazio (sem conteúdo) no `evidence.md`.

## Segurança e tenant

- O modelo escolhido é conferido na mesma empresa (FK composta e leitura com `company_id` do token). Contrato negativo:
  modelo de outra empresa → 404.
- O texto do modelo é do operador; os valores vêm da nota (XML de terceiro). HTML escapado depois de substituir (150).
- O assunto do modelo não aceita quebra de linha (CHECK da 150) — fecha a injeção de cabeçalho também para ocorrência.
- Logs do envio: só `occurrenceId`, `templateId` e motivo.

## Idempotência e concorrência

- Envio automático continua com `occurrence-auto-mail:<id>`; a varredura do worker não pede mais ocorrência sem modelo.
- Gravar tipo ou exceção × arquivar modelo: a gravação trava o modelo `FOR KEY SHARE`; arquivar trava `FOR UPDATE` e confere o uso
  depois do lock. Ordem única: modelo → tipo.

## Observabilidade

- O log do hook automático passa a contar `no_template_selected`.
- Nenhum texto de e-mail em log.

## Estratégia de testes

| Camada        | Teste                                                                                                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo      | contrato do catálogo `occurrence`; validação (`{codigo_item}` no assunto → erro; `{itens}` no assunto ok; nome inexistente → erro)                                                                                                                                                                         |
| Política pura | `occurrence-mail-body.policy.contract.ts`: abertura + itens + encerramento, sem itens, `item_text` vazio, 201 itens → "e mais 1 item", HTML escapado; `occurrence-mail-template.policy.contract.ts`: exceção vence tipo, exceção nula herda, os dois nulos → nulo                                          |
| Valores       | `occurrence-mail-values.policy.contract.ts`: mesmos valores de hoje com chaves `{snake_case}` (tabela espelhada da 247 para dinheiro)                                                                                                                                                                      |
| Rotas         | `PUT` do tipo e da exceção com `contractorMailTemplateId` (200, 404 outra empresa, 400 tipo errado, 409 arquivado; exceção nula herda); arquivar em uso por tipo ou por exceção → 409 com os nomes; prévia com `templateId`/flag; envio manual sem modelo efetivo → 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING` |
| Integração    | `occurrence-mail-template.integration.ts`: automático com modelo do tipo, com modelo da exceção vencendo o do tipo, exceção nula herdando, sem modelo efetivo (`no_template_selected`); manual sem modelo → 409; `template_id` gravado; corrida gravar × arquivar; migration A                             |
| Worker        | contrato da varredura: tipo sem modelo não entra                                                                                                                                                                                                                                                           |
| Painel        | guardas tolerantes (Fase 1); seletor + prévia + aviso no editor do tipo e da exceção; envio desabilitado com aviso no diálogo; aviso no feed e detalhe; 409 de arquivar com tipos e contratantes                                                                                                           |
| Limpeza       | `grep` do aceite da etapa A; listas de teste do `package.json` sem arquivo removido                                                                                                                                                                                                                        |

Integração da API: `bun --env-file=../../.env.test run test:integration` (de `apps/api-transportada`). Migration:
`make migration-test` ou aplicar, reverter e reaplicar num Postgres descartável, e `db:generate` com `no_changes`.

## Riscos

| Risco                                                                     | Mitigação                                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| O painel antigo quebra com `occurrence` no catálogo ou campo novo no tipo | Fase 1 publicada antes, aceite 7 do spec                                                               |
| No deploy, nenhum tipo envia e-mail (RF8)                                 | Decisão do dono; aviso no tipo e na ocorrência; T5.4 mede quantos tipos e avisa o dono antes de `main` |
| Conflito com a 268 no envio                                               | Rebase sobre a 268 antes da Fase 2 (§ Ordem com a 268)                                                 |
| Drop das colunas perde texto                                              | Intencional; etapa B separada, contagem registrada, aprovação humana                                   |
| Painel antigo salvando tipo com as chaves antigas                         | D9: `PUT` aceita e ignora até a etapa B                                                                |
