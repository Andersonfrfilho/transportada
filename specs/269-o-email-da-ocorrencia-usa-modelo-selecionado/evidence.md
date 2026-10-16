# Evidência — 269 O e-mail da ocorrência usa o modelo selecionado

## Decisões do dono (chat, 2026-10-16)

1. O e-mail de ocorrência à contratante usa os modelos com parâmetros de "E-mail com contratantes → Modelos"
   (`contractor_mail_templates`, spec 150), não o `email_subject`/`email_body` fixo do tipo.
2. Seleção: no editor do **tipo** de ocorrência (Ocorrências → aba Tipos), um seletor dos modelos do tipo de e-mail novo
   `occurrence`.
3. Tipo sem modelo selecionado → **nenhum** e-mail sai (automático ou sugerido). Quando o tipo tem "envia e-mail à
   contratante" ligado, a ocorrência mostra o aviso "Tipo sem modelo de notificação" (detalhe e lista do painel, e o
   diálogo de envio).
4. Começa do zero: o texto antigo dos tipos **não** é migrado para modelos; deixa de ser usado.
5. Sem lixo: remover tudo o que ficar desnecessário — o caminho que renderiza o e-mail pelo texto do tipo, a máquina
   `{{camelCase}}` **se** nada mais a usar, as constantes que ficarem mortas, os campos e a ajuda do editor de tipos, os
   testes do código removido, e as colunas `email_subject`/`email_body` (e `email_item_line_template`, se só servir a este
   e-mail). Em duas etapas: (A) o código para de ler e escrever as colunas e o código morto sai, na mesma entrega da
   feature; (B) migration destrutiva separada, com rollback escrito, só depois de (A) em produção e com aprovação humana.

### Respostas do dono às perguntas abertas (chat, 2026-10-16)

- **Q1 → bloquear.** Sem modelo efetivo, o operador **também não** envia à mão: no painel o envio fica desabilitado com
  o aviso "Tipo sem modelo de notificação" (+ link para o editor do tipo/exceção), e a API recusa o envio manual sem
  modelo efetivo com 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING`.
- **Q2 → sim, pela exceção por contratante que já existe** (`company_occurrence_type_contractor_overrides`, specs
  218/246/247/248; resolução tipo → contratante → destinatário já usada pelo app e pelo painel): a exceção ganha
  `contractor_mail_template_id uuid NULL` (nulo herda o modelo do tipo, campo a campo como as colunas irmãs; FK composta
  `company_id`; precisa ser `occurrence` e ativo). Modelo efetivo = modelo da exceção da contratante ?? modelo do tipo.
  O editor da exceção na aba Tipos ganha o mesmo seletor. **Sem exceção por destinatário** (só contratante). O tipo
  continua geral — o dono recusou restringir tipo a contratante: "se na ocorrência vamos definir já se é de uma
  contratante X o modelo vai acompanhar isso".
- **Q3 → bloquear o arquivamento** enquanto o modelo estiver escolhido por algum tipo **ou** alguma exceção de
  contratante (409 listando os nomes dos tipos e das contratantes).

## Levantamento contra `origin/staging` (e79e26171, 2026-10-16)

Feito por leitura direta e uma busca paralela, só de leitura. A T0.1 confere as linhas antes de qualquer código.

### Cadastro de modelos (150)

- `CONTRACTOR_MAIL_TEMPLATE_TYPES = ['address_correction']`
  (`apps/api-transportada/src/contractor-mail/domain/mail-template-catalog.constant.ts:9`); o cabeçalho do arquivo diz
  que a ocorrência "entra depois, aqui". `MAIL_TEMPLATE_CATALOG` (:65-106) com `mailVariables`, `itemVariables` e
  `suggestedTemplate`.
- CHECK `contractor_mail_templates_mail_type_check` gerada da constante (`src/database/contractor-mail.schema.ts:372`):
  tipo novo exige migration.
- Unicidade: nome ativo por `(company, mail_type)` e um `is_default` ativo por `(company, mail_type)`; teto de 50 ativos
  por tipo. Arquivar é `status = 'archived'` pela atualização do modelo.
- Validação e renderização (`mail-template-render.policy.ts:41-93`): sintaxe `{nome}` (`/^[a-z_]+$/`), variável de item só
  em `itemText`, todos os erros de uma vez; HTML escapa depois de substituir.
- Prévia por tipo de e-mail: `previewRenderers` injetados em `createContractorMailTemplatesUseCase`
  (`contractor-mail-templates.use-case.ts:80`) — o tipo novo precisa do seu.
- `contractor_mail_messages.template_id` (FK composta para o modelo) existe; o e-mail de ocorrência **não** o preenche
  hoje (`drizzle-occurrence-mail.repository.ts:543-556`).
- **Painel estrito:** `contractorMailTemplatesResponse.validation.ts:57,78` reprova o catálogo e a lista inteiros com um
  `mailType` desconhecido (`isOneOf(..., CONTRACTOR_MAIL_TEMPLATE_TYPES)`; constante copiada em
  `contractorMailTemplates.types.ts:7`). Um `occurrence` vindo da API derruba a seção "Modelos" → a tolerância vai a
  produção antes da API.

### E-mail de ocorrência hoje (079/183/247)

- Sugestão: `createOccurrenceSuggestedMailReader` (`drizzle-occurrence-mail.repository.ts:178-241`) lê
  `email_subject`/`email_body`; assunto vazio → `null`; renderiza com `renderOccurrenceTemplate` (`{{camelCase}}`,
  `trips/domain/occurrence-template.policy.ts:150`).
- Automático: `send-automatic-occurrence-mail.use-case.ts:82-85` — `not_document`, `type_off` (`emails_contractor`
  desligado), `no_template` (sugestão nula), `no_recipient`, `mail_not_ready`. O plano lê a sugestão só com
  `emails_contractor` ligado (`drizzle-occurrence-mail.repository.ts:309`).
- Diálogo: `preview-occurrence-mail.use-case.ts:65-73` usa a sugestão quando o operador não digitou; `suggested: boolean`
  na resposta.
- Registro: `register-trip-occurrence.use-case.ts:513-536` (`renderEmail`) também renderiza o texto do tipo e devolve
  `email` na resposta do registro.
- Variáveis (`src/shared/occurrence-template.constant.ts:13-49`): de ocorrência `numeroNota`, `numeroNotaSemSerie`,
  `razaoSocial`, `valorNota`, `contratante`, `motorista`, `parada`, `data`, `item`, `codigoItem`, `quantidadeItem`,
  `observacao`, `numeroReferencia`, `somaItens`, `valorDeclarado`; só no corpo `linhasItens`; só na linha `unidadeItem`,
  `valorUnitarioItem`, `somaItem`, `valorItem`. Teto de 200 linhas; linha padrão quando o tipo não escreve a sua.
- **Painel estrito no tipo:** `tripResponse.validation.ts:1882-1885` exige `emailBody` e `emailSubject` em cada tipo, e
  a lista de chaves permitidas (:1956-1990) reprova chave desconhecida. Tirar os campos da API ou mandar
  `contractorMailTemplateId` antes do painel tolerante derruba a aba Tipos.
- **Exceção por contratante** (`company_occurrence_type_contractor_overrides`, `trip.schema.ts:3289`): colunas
  anuláveis que herdam do tipo (`note_mode`, `items_mode`, `reference_number_mode`, `contractor_reply_mode`…); gravada
  por `PUT /company-settings/occurrence-types/attachment-overrides` (`trip.routes.ts:224`, schema `.strict()`); precedência
  em `src/shared/resolve-with-overrides.policy.ts` (destinatário ?? contratante ?? geral ?? padrão). Painel:
  `OccurrenceTypeExceptions`/`OccurrenceExceptionForm`. A T0.1 confere se o guarda da exceção no painel reprova chave
  desconhecida.
- `emails_contractor` **fica**: a 248 exige o par (`trip.schema.ts:3266`, `contractor_reply_mode <> 'off'` →
  `emails_contractor`) e o automático o lê.

### O que a 248 usa (e por isso fica) — e o que é código morto

- `driver_reply_template` é enviado como texto fixo, só aparado (`contractor-reply-driver-delivery.support.ts:58-62`);
  `forward_email_subject`/`forward_email_body` só são aparados e escapados
  (`forward-contractor-reply-by-email.use-case.ts:139-140`, `contractor-reply-note-recipient-forward.support.ts:103-114`).
  **Nenhum importa `occurrence-template*`.** O aviso interno (`notifies` + `email_template_key`,
  `register-trip-occurrence.use-case.ts:564-568`) também não.
- Logo, a máquina `{{camelCase}}` inteira serve só ao e-mail à contratante, à prévia do tipo e à cópia do e-mail na
  resposta do registro (`RegisterTripOccurrenceResult.email` → painel "e-mail pronto", `TripOccurrences.component.tsx:59,302-306`,
  locale `occurrence.emailReady`). Tudo isso é morto depois desta spec. O inventário por item está em `plan.md`.
- `email_item_line_template`: único leitor é a expansão de `{{linhasItens}}` (`occurrence-template.policy.ts:130-132`).
  Morto. O `frontend-driver` só tolera a chave na resposta (`driverTrip.types.ts:501,532,565-566`).
- **Lacuna do worker:** a varredura do aviso automático pega ocorrência com `emails_contractor = true` e sem registro de
  idempotência (`worker-transportada/.../drizzle-occurrence-automatic-mail-queue.repository.ts:37-62`) e não olha o
  assunto. Um pulo `no_template` não grava idempotência, então a mesma ocorrência volta a cada rodada até a janela
  fechar. Com o RF8 (todo tipo sem modelo no deploy) isso viraria carga contínua → a varredura passa a exigir
  modelo efetivo (tipo ou exceção da contratante) (T2.6).

## Perguntas ao dono

Nenhuma aberta. Q1–Q3 respondidas em 2026-10-16 (ver "Respostas do dono" acima).

## Medições pedidas antes de `main`

- T5.4 (repetida na T6.1 antes da etapa B): quantos tipos por empresa têm `emails_contractor = true` (ficam sem e-mail no deploy, RF8) e quantos têm texto
  não vazio em `email_subject` (texto descartado na etapa B). Só contagem, sem conteúdo.

## Registro das tasks

### T0.1 / T0.2 — revisão de arquitetura (2026-10-16)

- 268 já em `staging` (PR #259, `338ef615d`); a branch está rebaseada sobre ela. Linhas do plano são aproximadas:
  o mapeamento é por símbolo.
- Veredito do architect: **aprovado com mudanças**, aplicadas em `plan.md` (§ Revisão de arquitetura e § Convivência com a
  267), `tasks.md` e na ADR-0106 (agora "aceita com mudanças").

### T3.1 / T3.2 / T3.3 — etapa A, o código morto sai (2026-10-16)

- API: `tsc --noEmit` limpo; `eslint src test` limpo; contrato (`bun --env-file=../../.env.test test --timeout 120000`):
  11844 pass, 25 skip (já `test.skip` no contrato), 0 fail; integração dos 24 arquivos tocados: 91 pass, 0 skip, 0 fail.
- Testes do código removido saíram (prévia do tipo, marcadores `{{camelCase}}` do texto do tipo, e-mail montado do registro);
  `configuration-decides` (contrato e integração) ficaram com a exigência, o gravado e a soma, sem o e-mail.
- T3.2: seed sem as chaves; os cenários da 248 criam um modelo `occurrence` (prefixo `[TESTE 248]`, apagado pelo `--reset`)
  e o tipo aponta para ele; `occurrence-template-values.integration.ts` já lê o modelo do cadastro (T2.6).
- T3.3 — `grep -rnwE "emailSubject|emailBody|emailItemLineTemplate|email_subject|email_body|email_item_line_template|renderOccurrenceTemplate" apps/*/src`
  na API só acha o schema Drizzle das colunas (`trip.schema.ts:2935,2936,3063,3200`) e o `PUT` que aceita e ignora
  (`occurrence.schema.ts:462,569-571`). Nenhum arquivo removido está na lista do `package.json`. O painel e o app do
  motorista ainda citam as chaves — saem na Fase 4 (T4.1, T4.5, T4.6).

### T4.1–T4.6 — telas (2026-10-16)

- Painel: `tsc --noEmit` limpo; `bun run lint` sem erro (16 avisos antigos); `bun run test` 8254 pass e 1 fail (a sonda CSP do
  Chromium, conhecida e local); `bun run test:hooks` 1370 pass, 0 fail. `frontend-driver`: lint limpo, `bun run test` 2096 pass.
- T4.1/T4.1b: `OccurrenceTypeMailTemplateSelect` no tipo e na exceção por contratante ("Herdar do tipo" = `null`); saíram os campos, a ajuda de
  marcadores, o rascunho, a prévia antiga e `previewOccurrenceTypeEmail`. T4.2: `occurrence` em "Modelos"; o 409 `CONTRACTOR_MAIL_TEMPLATE_IN_USE` lista tipos e
  exceções. T4.3: diálogo desabilitado com o aviso e o caminho. T4.4: selo no feed (célula e cartão) e no detalhe. T4.5: locales e CSS mortos fora.
  T4.6: o app do motorista perdeu a tolerância a `emailItemLineTemplate`.

### T5.2 — revisão (code-reviewer e security-reviewer, 2026-10-16)

- Segurança: nenhum achado alto ou médio; tenant, cabeçalho do assunto, escape do HTML, PII em log e o 409 conferidos.
  **L1** (assunto digitado à mão no envio manual não tira CR/LF; caminho antigo da 183, não novo) e **L2** (`readSuggestedMail` e
  `findEffectiveOccurrenceMailTemplate` sem filtro `status = 'active'`; sem impacto hoje, a escolha só vale com modelo ativo) ficam **registrados, não corrigidos**.
- Código, corrigidos: **M1** o aviso do feed (`listMissingNotificationTemplates`) agora é refinamento isolado de falha, dentro do `Promise.all`
  (`listMissingNotificationTemplatesOrEmpty`, teste `occurrence-mail-template-missing-read-failure.contract.test.ts`); **M2** o painel
  tolera e ignora o texto antigo (`emailBody`/`emailSubject`/`emailItemLineTemplate`) até a etapa B (rollback da API); 409
  `CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE` com mensagem própria; campo morto `missingNotificationTemplate` do tipo saiu; chave da lista de uso.
- Registrados, **não corrigidos**: o `template_id` gravado pelo envio automático pode diferir do que gerou o texto se o tipo trocar de modelo entre o plano
  e o envio (janela de milissegundos); o link "Abrir tipos de ocorrência" aparece também a quem não tem `settings.manage` (a aba cai no feed); o diálogo
  de envio segue desabilitado depois do 409 até reabrir. Perguntas ao dono: a varredura do worker manda, no dia da escolha do modelo, os e-mails das
  ocorrências ainda dentro da janela; o aviso do tipo ignora exceções por contratante (D8).

### T5.3 — auditoria §15 e gates (2026-10-16)

- N+1 no feed: nenhum (uma leitura fixa por página das exceções). `Promise.all`: o novo da prévia/arquivar (`assertOccurrenceMailTemplateIsUnused`) lê duas
  tabelas que decidem a mesma resposta (as duas são necessárias); o do feed passou a isolado.
- API: `tsc` limpo, `bun run lint` limpo, contrato 11844 pass / 25 skip (`test.skip` antigos) / 0 fail; integração dos 24 arquivos tocados + 3 do feed: 0 skip, 0 fail;
  `db:generate` → `no_changes`. Worker: `tsc` e lint limpos; `bun run test` 2641 pass e 2 fail e integração (`transportada_worker_integration`) 343 pass, 4 skip
  (OSRM opt-in), 3 fail — todos do decodificador de canhoto (conhecido e local). `bunx prettier --check .` na raiz: limpo.
- Não feitos aqui: **T5.1** (conferência no navegador: pede a stack inteira com Keycloak e API apontando para um banco; as portas e os bancos locais em uso são de outras
  sessões), **T5.4** (medição em staging e produção) e **T5.5** (publicação) — os dois últimos dependem do dono.
