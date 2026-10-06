# Tasks

> Pré-condição: a spec 241 publicada e aplicada (painel e API) — **conferida em 2026-10-06**
> (`origin/staging` `81cd849b6`). A coluna `items_mode` é dela; nenhuma task desta spec a cria.
> Decisões D-a a D-d em `spec.md`; correções em `evidence.md`.

Uma task por vez, na ordem. Cada uma fecha com typecheck, teste e commit isolado, e registra a
evidência em `evidence.md`. **Tasks com `--env-file`:** a integração da API exige
`--env-file=../../.env.test`.

## Pré-requisitos de produção

> **Esta spec não vai a `main` sem duas medições registradas em `evidence.md`, e as duas são do
> usuário** (leitura em produção pede autorização dele):
>
> - **T3.0** — staging e produção: quantas exceções (nas duas tabelas) têm `attachment_mode <>
'required'` sobre tipo `required`. ⚠️ **O afrouxamento das exceções passa a valer no deploy da
>   API**: uma exceção `optional` sobre tipo `required` deixa de ser ignorada pelo servidor assim que a
>   API sobe. Sem a medição, ninguém sabe quantos registros passam a ser aceitos sem foto. Não há
>   variável de ambiente que ligue ou desligue isso — por isso a medição é pré-requisito, não opção.
> - **T1d.0** — produção: `count(*)` de ocorrências com `attachment_object_id` e quantas têm as duas
>   fontes (esperado 0); parada obrigatória antes da migration do backfill de anexos.
>
> Staging pode receber a spec sem elas; a promoção a produção (PR `staging` → `main`) não.

## Fase 1 — O dado passa a carregar a exigência

> 🤖 Modelo: `sonnet` (T1.2 é 🧠 — o backfill é o ponto onde se perde comportamento calado)

- [x] **T1.1** Schema: em `companyOccurrenceTypes`, `note_mode` (`NOT NULL DEFAULT 'optional'`) e
      `signature_mode` (`NOT NULL DEFAULT 'off'`); nas duas tabelas de exceção, `note_mode` e
      `signature_mode` **nulos, sem default** (D-a); `signature_object_id` nas duas tabelas de
      ocorrência, com FK composta `(company_id, signature_object_id) → stored_objects(company_id, id)
ON DELETE RESTRICT` (molde de `trip_document_occurrences_company_object_fk`) —
      `apps/api-transportada/src/database/trip.schema.ts`; corrigir o comentário de `itemsMode`
      (~2621) que cita "spec 239": é a 246. `db:generate` gera a migration.
- [x] **T1.2** 🧠 Migration, **nesta ordem**: `ADD COLUMN` no tipo (default constante) → `ADD
COLUMN` nas exceções sem default → os `UPDATE`s (tipo: `note_mode = 'required'` onde
      `attachment_mode = 'required'`; exceção: `note_mode = CASE WHEN attachment_mode = 'required'
THEN 'required' ELSE 'optional' END` em **toda** linha existente; `signature_mode` das exceções
      fica nulo) → CHECKs nomeadas (`<tabela>_note_mode_check`, `_signature_mode_check`, `IN
(<DELIVERY_PROOF_FIELD_MODES>)`, nomes ≤ 63 caracteres — encurtar os das exceções) → por
      último `signature_object_id` e as FKs. `rollback.sql`: derruba CHECKs, colunas e o registro do
      journal (`DELETE` com `ROW_COUNT = 1`); **não toca `items_mode` nem as CHECKs da 241**;
      registrar o que se perde (`note_mode` gravado). `make migration-test` verde. Validar com
      `architect` antes de implementar.
- [x] **T1.3** Integração que verifica o **valor da coluna** no padrão de
      `contractor-contact-channels.integration.ts` (semear **antes**, reexecutar o `UPDATE` lido do
      `migration.sql`), com os casos: tipo `required` → `required`; tipo `optional` e `off` →
      `optional`; exceção `required` → `required`; exceção `optional` sobre tipo `required` →
      `optional`; `signature_mode` `off` — `test/integration/*.integration.ts`, rodado com
      `--env-file=../../.env.test`, **e** entrada na lista do `test:integration` do `package.json`.
- [x] **T1.4** Mutações, cada uma deixa a T1.3 vermelha: (1) tirar o `UPDATE` do tipo; (2) default
      `'off'` em `note_mode`; (3) trocar o `CASE` das exceções por `WHERE attachment_mode =
'required'`. Evidência da execução vermelha de cada uma em `evidence.md`, não só a afirmação.
      A prova de **comportamento** da CA04 está na T2.3b, **depois** da T2.3.

## Fase 1b — O momento vira conjunto

> 🤖 Modelo: `sonnet` (T1b.2 é 🧠 — é onde um papel pode ganhar momento que não é dele)

- [x] **T1b.1** Constante `OCCURRENCE_MOMENTS` (`separation`, `document`, `stop`, `office`) e tabela
      `company_occurrence_type_moments` no padrão de tenant: `company_id → companies`, FK composta
      `(company_id, occurrence_type_id) → company_occurrence_types(company_id, id) ON DELETE
CASCADE`, `UNIQUE (company_id, occurrence_type_id, moment)`, CHECK
      `company_occurrence_type_moments_moment_check` **gerada da constante** (sem lista literal);
      `test/trip-schema/tenant-safety.contract.ts` cobra isso. Backfill fiel a todo leitor
      (`ON CONFLICT DO NOTHING`, tipos inativos entram): `separation` onde `stage='separation'`;
      `document` onde `stage='delivery' AND flow='document'`; `stop` onde `stage='delivery' AND
flow='stop'` **e** onde `stage='separation' AND flow='stop'` (D-c: preserva o comportamento;
      fechar o furo é spec à parte); `office` onde `stage='delivery'`. `rollback.sql` registra o
      preço (tipo com vários momentos perde a informação). `stage` e `flow` permanecem gravadas.
      Registrar que `separation + document` nunca sai do backfill (só do operador) e que os dois
      tipos "Avaria" existentes não são fundidos.
- [x] **T1b.1b** Regra de derivação de `stage`/`flow` para tipo com vários momentos, na escrita:
      `stage='separation'` se e só se `separation ∈ momentos` (mantém a CHECK de
      `leaves_document_behind`); `flow='stop'` se e só se `stop ∈ momentos` e `document ∉`;
      `stop_kind` exigido sempre que houver `stop`. **Leitura tolerante na janela de deploy:** tipo
      sem linha de momento usa os derivados de `stage`/`flow`; `PUT` sem `moments` mantém os
      gravados; `PUT` que muda `stage`/`flow` de tipo com vários momentos → `409`; a API recusa
      `document + stop` juntos até o app deduplicar por id + momento.
- [x] **T1b.2** 🧠 Permissão do **momento do registro**, nunca "o tipo tem algum momento que o papel
      cobre". Cada caso de uso tem o momento **fixo**: `registerTripOccurrence` → `separation`;
      `registerDriverOccurrence` e WhatsApp do motorista → `document`; parada → `stop`; lote do
      escritório → `office`; WhatsApp do operador → `separation`. A guarda é
      `acceptsOccurrenceMoment({ moments, moment })`; a política da rota (`trip.manage` /
      `trip.report` / `trip.report-on-behalf`) **não muda**; **proibido** usar
      `resolveOccurrencePermission` no caminho novo. Pontos de código (reconferir a linha ao
      implementar; plan § Permissão): `register-trip-occurrence.use-case.ts:323`;
      `register-operator-trip-flow-actions.ts:583,628`; `register-driver-occurrence.use-case.ts:105-112`;
      `register-driver-flow-actions.ts:399,445` (a lista do WhatsApp **perde os tipos de parada**);
      `drizzle-driver-field-report.repository.ts:1053`; `office-occurrence-batch.service.ts:35-40`;
      `list-field-occurrence-types.use-case.ts:126,193` (ganha parâmetro `moment`);
      `drizzle-current-driver-trip.repository.ts:781,1045`; `read-settings-resolution.use-case.ts:125`;
      `save-occurrence-type.use-case.ts:96`; `delivery-proof-read.support.ts:846-1110`. Painel:
      `TripOccurrences.component.tsx:136`, `separationOccurrenceButton.service.ts:28`,
      `SettingsResolutionPanel.component.tsx:61`, `OccurrenceTypeCatalogPanel.component.tsx:88`,
      `OccurrenceTypeRow.component.tsx:51,135`, guards de chave exata em
      `tripResponse.validation.ts:1461,1859`. App: `occurrenceRegistration.service.ts:48-51`.
      Validar o desenho com `architect` antes de implementar.
- [x] **T1b.3** Integração da CA00 com os **códigos reais** (conferir cada um no código antes):
      motorista registra tipo só-`separation` na rota de nota → `409 TRIP_DOCUMENT_NOT_REACHABLE`;
      separador registra tipo só-`document` na rota de galpão → `422 OCCURRENCE_TYPE_NOT_SEPARATION`;
      escritório registra `document` sem `office` → `422 OCCURRENCE_TYPE_NOT_FIELD`; conta com os dois
      papéis repete cada caso; `{separation, document}` aparece nas duas listas com o **mesmo id**.
- [x] **T1b.4** Integração da CA00b sobre dado semeado antes da tabela nova: **verifica as linhas da
      tabela de momentos** (os quatro casos da tabela do plan, inclusive `separation + stop` →
      `separation` e `stop`), não só as listas — a leitura tolerante mascararia o backfill arrancado.
- [x] **T1b.5** Mutações: (1) `includes(ROUTE_MOMENT)` → `moments.length > 0`; (2) → "algum momento
      de rua". Cada uma deixa a T1b.3 vermelha; execução vermelha registrada em `evidence.md`.
- [x] **T1b.6** Rejeitar tipo sem nenhum momento, na API e na tela. (API nesta fase; a tela é a T5.3b.)

## Fase 1c — Produtos e quantidade mínima viram dado (RF1, RF1b, RF1c, RF1c2)

> 🤖 Modelo: `sonnet` (T1c.1 é mecânica sobre o molde da Fase 1; aceite por `make migration-test`)

- [x] **T1c.0** Pré-condição conferida: a 241 está em `origin/staging` (`81cd849b6`), migration
      `20261006033752_occurrence_type_items_mode`, com `items_mode` (`DEFAULT 'optional'`), a CHECK de
      vocabulário e `company_occurrence_types_items_off_shape_check`. Registrado em `evidence.md`.
- [x] **T1c.1** Colunas aditivas: no tipo, `photo_minimum_count` (`NOT NULL DEFAULT 1`, CHECK 1–5) e
      `items_minimum_count` (nulo = todos os itens; CHECK ≥ 1 **e** `items_minimum_count IS NULL OR
items_mode = 'required'`); nas duas tabelas de exceção, `items_mode`, `photo_minimum_count` e
      `items_minimum_count` **nulos, sem default** (D-a), com CHECKs que aceitam nulo e
      `items_minimum_count IS NULL OR coalesce(items_mode, '') = 'required'`. O par `items_mode` +
      `items_minimum_count` da exceção vem junto (nulo em `items_mode` herda o par do tipo).
      **Sem** CHECK `off ⇒ unset` nas exceções (a política é do tipo; plan § T1c.1). `trip.schema.ts`,
      `db:generate`, `rollback.sql` que **não** derruba `items_mode` do tipo nem as CHECKs da 241.
- [x] **T1c.2** Backfill sem mudar comportamento: `photo_minimum_count = 1` é o default do tipo.
      `items_mode` do tipo **não é tocado**; as colunas novas das exceções ficam nulas (herdam).
      `make migration-test` roda com a 241 no histórico.
- [x] **T1c.3** `allows_multiple_items` entra no `PUT`/`GET` do catálogo (RF1b) — a coluna já existe.
- [x] **T1c.4** A escrita do catálogo (`save-occurrence-type.use-case.ts`, `occurrence.schema.ts`)
      passa a aceitar `itemsMode = 'required'` (a 241 devolve `400`), recusa `items_minimum_count`
      sem `required`, e mantém a recusa `off` + política ≠ `unset` da 241 — contrato primeiro.

## Fase 1d — A foto da rua guarda N anexos (RF1d)

> 🤖 Modelo: `sonnet` (T1d.2 é 🧠 — backfill que copia dado de produção)
>
> Só ocorrência de **nota** (D-d). **Esta fase é um deploy separado da T1.2** (o migrator roda tudo
> numa transação e o `ADD COLUMN signature_object_id` seguraria `ACCESS EXCLUSIVE`).

- [ ] **T1d.0** **Medição em produção — só leitura, pede autorização do usuário; não executar sem
      ela.** `count(*) FROM trip_document_occurrences WHERE attachment_object_id IS NOT NULL`, e
      quantas têm as duas fontes (linha em `trip_document_occurrence_attachments` **e** coluna;
      esperado 0). Registrar em `evidence.md`. Parada obrigatória antes da T1d.2 em produção.
- [x] **T1d.1** **Contrato que prende o que existe** (a leitura já existe desde a 161 T10:
      `trip-occurrence-feed.query.ts` ~781-877, `occurrence-attachment.service.ts` ~118): a leitura da
      ocorrência de rua devolve as fotos de `trip_document_occurrence_attachments` e, na ausência, a
      `attachment_object_id` antiga.
- [x] **T1d.2** 🧠 Migration própria (`db:generate --custom`): `INSERT INTO
trip_document_occurrence_attachments ... SELECT o.company_id, o.id, o.attachment_object_id,
NULL, 1, o.created_at FROM trip_document_occurrences o WHERE o.attachment_object_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM trip_document_occurrence_attachments a WHERE a.company_id =
o.company_id AND a.occurrence_id = o.id) ON CONFLICT ON CONSTRAINT
trip_document_occurrence_attachments_unique_position DO NOTHING`. **`created_at = o.created_at`
      é obrigatório** (a linha do tempo usa o `created_at` do anexo como data do evento de foto);
      o `NOT EXISTS` é o que não duplica (pode haver ocorrência com anexo só na posição 2).
      **`retention_until` não está nesta tabela** — está em `stored_objects.retention_until`, e o
      objeto é o mesmo. `rollback.sql` **não apaga as linhas**, só o registro do journal, com a
      justificativa. Documentar: um objeto servindo N ocorrências (lote do escritório, purpose
      `delivery_proof`) vira N linhas com o mesmo `stored_object_id`, e o expurgo da 161 supõe uma
      linha por objeto (`drizzle-occurrence-attachment-purge-gateway.ts` ~24-34; confirmar o
      caminho); o id do anexo antigo muda (id da ocorrência → id da linha) na linha do tempo e no
      feed. `attachment_object_id` **permanece** gravada. Validar com `architect` antes.
- [x] **T1d.3** Integração sobre dado semeado **antes** do backfill, com as sementes: (a) ocorrência
      de rua com coluna e sem linha; (b) com coluna e uma linha só na posição 2; (c) galpão com duas
      linhas; (d) lote: um objeto em três ocorrências; (e) sem foto. Verifica as **linhas** da
      tabela, `created_at` igual ao da ocorrência, que o leitor devolve **exatamente uma foto** em
      (a) e (b), e que reexecutar dá a mesma contagem.
- [x] **T1d.4** Mutações: (1) arrancar o `INSERT` (casos a e d vermelhos); (2) tirar o `NOT EXISTS`
      (b vira duas fotos); (3) tirar `o.created_at`. Execução vermelha registrada em `evidence.md`.
- [x] **T1d.5** A escrita da ocorrência de rua grava nas duas tabelas até a leitura nova estar em
      produção, **sem** usar `trip_occurrence_attachment` para o lote; `photo_minimum_count` é
      conferido contra a quantidade de anexos (RF8). A assinatura **não** vira linha de anexo (RF9).
- [x] **T1d.6** O demonstrativo de ocorrências ao cliente
      (`drizzle-occurrence-statement.repository.ts` ~255-310) mostra a foto de rua e a resposta da
      correção, e **não** mostra a assinatura como foto — contrato primeiro (CA09, RF14).

## Fase 2 — A API resolve e cobra os campos do tipo

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Contrato primeiro: `listFieldOccurrenceTypes` devolve os quatro modos resolvidos em
      três camadas, **campo a campo, com nulo da exceção herdando**, por `resolveWithOverrides` —
      teste antes da implementação.
- [x] **T2.2** Implementar a projeção (inclusive `document.occurrenceTypes` do snapshot, mesma
      função) e a leitura de `read-settings-resolution.use-case.ts` (RF12).
- [x] **T2.3** `register-driver-occurrence.use-case.ts` (a regra está em `:146-152`): a exigência
      vira leitura dos modos **do tipo**; sai o `if (attachmentMode === 'required')` com a nota
      embutida. Erro estável da assinatura em `trip.error.ts`. (As exceções entram na Fase 3.)
- [x] **T2.3b** **Comportamento da CA04**, depois da T2.3: semear tipo sem exceção com foto
      `required` **antes** das colunas novas, rodar a migration, e o registro sem nota volta
      `TRIP_OCCURRENCE_NOTE_REQUIRED`. Mutação: tirar o `UPDATE` da T1.2 deixa este teste vermelho —
      execução vermelha registrada em `evidence.md`.
- [x] **T2.4** `PUT` do catálogo e das exceções aceita os quatro modos (nulo = herda nas exceções);
      `signatureObjectId` aceito e conferido contra empresa/viagem/motorista (RF2b da 179).
- [x] **T2.4b** A projeção, a cobrança (RF8) e a verificação (RF12) incluem `itemsMode`,
      `photoMinimumCount` e `itemsMinimumCount`; erro estável por campo em `trip.error.ts`.
      `itemsMode = required` recusa registro sem produto, e "todos os itens" recusa seleção parcial.
- [x] **T2.5** Prova de que a assinatura da ocorrência não aparece em `trip_delivery_proofs`, na
      pontualidade, na nota do motorista **nem como linha de anexo de foto** (CA06, RF9, regra da 209).
- [x] **T2.6** Contrato do WhatsApp do motorista (RF13): tipo com assinatura `required` registrado
      por esse canal devolve o erro estável da assinatura; a lista **não** é filtrada por exigência.
- [x] **T2.7** (lacuna achada na 1d) A rota do motorista aceita uma **lista** de anexos
      (`attachmentObjectIds`, 1–5), retrocompatível com o campo único: cada objeto é conferido contra
      empresa/viagem/motorista, grava as linhas 1..N de `trip_document_occurrence_attachments` e a
      coluna antiga leva a primeira, e `photo_minimum_count` é conferido contra a quantidade. Contrato
      primeiro e vermelho; integração `driver-occurrence-attachment-list`. Evidência em
      `evidence.md` § "T2.7 (lacuna achada na 1d)".

## Fase 3 — O servidor cobra a exceção (RF6, CA02, CA03)

> 🤖 Modelo: `sonnet`
>
> O snapshot já entrega o tipo resolvido por nota ao app (218 follow-up) e **não** se manda
> `contractorId`/`recipientTaxId` por URL (`security.md` §3). Esta fase faz o **registro** ler os
> mesmos modos efetivos. **Efeito:** hoje o servidor ignora as exceções e exige pelo tipo; uma
> exceção **menos estrita** que o tipo passa a afrouxar de verdade.

- [ ] **T3.0** **Medição — só leitura, em staging e em produção; pede autorização do usuário, não
      executar sem ela.** Quantas exceções (nas duas tabelas) têm `attachment_mode <> 'required'`
      sobre um tipo `required`:
      `SELECT count(*) FROM <tabela de exceção> o JOIN company_occurrence_types t ON t.company_id =
o.company_id AND t.id = o.occurrence_type_id WHERE t.attachment_mode = 'required' AND
o.attachment_mode <> 'required'`. Registrar os números em `evidence.md`. **A Fase 3 só ativa em
      produção depois desta medição registrada** — é a parada obrigatória (ver Prompt de execução).
- [x] **T3.1** Contrato primeiro: o registro resolve a exigência da nota por **tipo + exceção de
      contratante + exceção de destinatário**, campo a campo, com `resolveWithOverrides`;
      destinatário vence contratante vence tipo; exceção menos estrita afrouxa; mais estrita
      endurece; tipo sem exceção cobra exatamente o que cobrava (CA04). Contratante e destinatário
      lidos **da nota no servidor**, nunca do payload.
- [x] **T3.2** Implementar em `register-driver-occurrence.use-case.ts` (e o repositório que lê as
      exceções do tipo), reutilizando o resolvedor do snapshot — **nenhuma segunda implementação** —
      no lugar do `attachmentMode` do tipo só. Inclui `itemsMode` e os mínimos efetivos
      (`assertOccurrenceTypeAcceptsProducts` passa a ler o modo efetivo).
- [x] **T3.3** Integração provando CA02 e CA03: mesmo tipo, `required` numa nota e `optional` noutra,
      **no snapshot e no registro**; o que o app mostra é o que o servidor cobra (paridade).

## Fase 4 — O motorista captura o que foi pedido

> 🤖 Modelo: `sonnet`

- [x] **T4.1** `DriverOccurrenceRegistrationForm`: botão desabilitado enquanto faltar campo
      `required`; `SignaturePad` montado só quando a assinatura é pedida. Sem rede no caminho. O
      app **não** passa a mandar `contractorId`/`recipientTaxId`: lê `document.occurrenceTypes`.
- [x] **T4.1b** O formulário também bloqueia por `itemsMode` (produtos marcados, ou todos os itens
      da nota) e por `photoMinimumCount` (fotos capturadas ≥ mínimo) — RF7, RF1c, RF1c2.
- [x] **T4.2** A assinatura entra no item de fila que já existe, nunca num item novo (209 D1).
- [x] **T4.3** Contrato do app cobrindo CA05, e o caminho offline.

## Fase 5 — O cadastro muda de endereço

> 🤖 Modelo: `haiku` para a mudança mecânica, `sonnet` para T5.3

- [x] **T5.1** `<Tabs>` em `TripOccurrencesWorkspace.page.tsx`, no molde de `TripWorkspace`.
      _Feita; evidência em `evidence.md` § "T5.3 (1ª metade)" (a aba monta o painel) e § "Correções da revisão final (painel)" M8 (a aba some sem permissão e vai para a URL)._
- [x] **T5.2** Reler a árvore (a 241 já está publicada; os subcomponentes que ela deixou são os que
      existem agora) e mover, sem reescrever, o painel que a 241 já alterou, a seção de exceções, o
      hook, as consultas e as traduções de `modules/company-settings` para `modules/trip`; atualizar
      `SETTINGS_PANEL_PLACEMENT`, `SETTINGS_PANEL_MODULES` e `COMPANY_SETTINGS_TAB_IDS`.
      _Feita; evidência em `evidence.md` § "T5.3 (1ª metade)" e na limpeza da sobra de `CompanySettings.page.tsx` (§ "T5.3 (2ª metade)"); o contrato de posicionamento do painel está em `test/company-settings`._
- [x] **T5.3** Exceções à vista (RF11, RF11c): contagem e lista sem acordeão, **uma consulta em
      lote por tela**. Os quatro modos e as quantidades mínimas editáveis por exceção, **com a
      quarta opção Igual ao tipo** (nulo, herda) — estado inicial de exceção nova.
      _1ª metade feita (2026-10-06, `evidence.md` § "T5.3 (1ª metade)"):_ tipos/guard/cliente tolerantes,
      consulta e cliente em lote, `buildOccurrenceTypeUpdate`, seletores de três estados e mínimos na linha do
      tipo, painel montado na aba Tipos. **2ª metade feita (2026-10-06, `evidence.md` § "T5.3 (2ª metade) e T5.3c"):** tipos recolhidos com a
      linha-resumo, lista de exceções à vista lida da consulta em lote, "Igual ao tipo" e os dois mínimos por exceção.
- [x] **T5.3-api** A rota em lote que a RF11c exige: `GET /company-settings/occurrence-types/attachment-overrides`
      (`settings.manage`, só leitura, sem migration), exceções de TODOS os tipos da empresa agrupadas por tipo,
      três consultas fixas. Contrato HTTP (roteador real, sem colisão com `/:occurrenceTypeId/...`),
      integração com duas empresas e contagem de `select`, mutação do filtro de empresa vermelha. Evidência em
      `evidence.md` § "T5.3-api". A tela (T5.3) consome esta rota.
- [x] **T5.3b** Seletor múltiplo de momentos por tipo (`MultiSelect`), recusando o conjunto vazio
      (T1b.6), recusando `document + stop` juntos, com a nota de que os campos valem só nos momentos
      de rua (RF1h).
- [x] **T5.3c** Destinatário da exceção escolhido em `SearchableSelect` por nome ou CNPJ entre os
      clientes cadastrados, nunca digitado (RF1f).
- [x] **T5.3d** Aviso ao contratante na aba: `notifies`, seleção do modelo de e-mail com o conteúdo
      visível, `redeliveryPolicy` (RF1e). _Evidência: `evidence.md` § "T5.3d, T5.3e e T5.4"._
- [x] **T5.3e** Busca (tipo, nome ou CNPJ de exceção) e filtros-pílula combináveis: momento,
      ativo/inativo, exigência, avisa/não avisa, tem exceção — no molde de
      `TripOccurrenceFilters` (RF11b). Desenho em `preview.html`. _Evidência: `evidence.md` § "T5.3d, T5.3e e T5.4"._
- [x] **T5.4** Atualizar os quatro contratos que afirmam o endereço antigo:
      `test/company-settings/tabs.contract.ts`, `occurrence-type-catalog-panel.contract.ts`,
      `occurrence-type-attachment-mode.contract.ts`,
      `occurrence-type-catalog-template-select.contract.ts`, e os dois guards de chave exata em
      `tripResponse.validation.ts`.
      ⚠️ Arquivo de teste novo não roda se não entrar na lista do `package.json` da app.

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet`; revisão final com `code-reviewer` em `opus`

- [x] **T6.1** Revisão de design e usabilidade da aba nova, com print nas três larguras (CA08).
      **Comparar o `preview.html` com a tela real, lado a lado**, em 375, 768 e 1280: abrir o
      protótipo e a tela implementada com os mesmos dados, e registrar em `evidence.md` uma tabela
      "elemento → preview → tela real → veredito" (rótulos, ordem dos campos, estados vazio, erro e
      desabilitado, espaçamento, contraste, foco). Toda diferença é defeito da implementação, a
      menos que o `evidence.md` registre por que o protótipo estava errado; corrigir e refazer o
      print. Verificação por texto primeiro (`read_page`, geometria, contraste); print só como prova.
- [x] **T6.1b** Revisão independente de funcionalidade, usabilidade e design por `code-reviewer`
      (`opus`), numa passada separada da autoria: fluxo ponta a ponta no navegador (criar tipo,
      exceção por CNPJ, registrar na rua com a exigência, ver o que a conferência mostra), mais a
      leitura do código. Achados por severidade; reprovado se houver bloqueante ou alto, e então
      corrige e repete a passada. O veredito entra em `evidence.md`.
      _Três passadas, as três reprovadas e corrigidas; vereditos em `evidence.md` § "Veredito das passadas"._
- [x] **T6.2** Atualizar `CLAUDE.md` da raiz e `apps/*/CLAUDE.md` tocados, e
      `docs/ai-context/` das apps afetadas.
- [x] **T6.3** Gates completos: `bun run typecheck`, `make check`, `make migration-test`, e a
      integração da API em primeiro plano com `--env-file=../../.env.test` (contrato e integração
      são dois comandos; nenhum cobre o outro).
      _Evidência: `evidence.md` § "T6.3"._
- [x] **T6.4** `evidence.md` consolidado.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/246-a-exigencia-da-ocorrencia-chega-na-rua/
(leia spec.md, plan.md, tasks.md e a seção "Correções da spec antes de implementar (2026-10-06)" do
evidence.md antes de começar). Uma task por vez, na ordem do tasks.md.
Pré-condição: a spec 241 está em origin/staging (81cd849b6, items_mode existente) — T1c.0 já está
marcada; se a coluna sumir, pare e avise. Nenhuma task cria items_mode.
Decisões fechadas (não reabrir): colunas novas das exceções são NULAS (nulo herda do tipo); o servidor
cobra a exigência efetiva da nota (nada de contractorId/recipientTaxId por URL); backfill de momentos
mapeia separation+stop para stop; só ocorrência de nota guarda N fotos e a assinatura fica em
signature_object_id, nunca como linha de anexo.
Modelos: Fases 1, 1b, 1c, 1d, 2, 3, 4 e 6 → executor model=sonnet · Fase 5 → executor model=haiku,
exceto T5.3* → sonnet · T1.2, T1b.2 e T1d.2 🧠 → opus, validadas com architect antes de implementar ·
revisão final → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Ordem de publicação (ADR-0081 §9): painel tolerante antes de API/banco; a migration só depois do
painel que lê os campos novos como opcionais. A Fase 1d (backfill de anexos) é deploy SEPARADO da T1.2.
Gates de cada task: typecheck + teste + commit isolado, evidência em evidence.md. Na API, contrato
e integração são dois comandos e nenhum cobre o outro; a integração exige --env-file=../../.env.test.
Ao fechar a spec: make check, make migration-test (há migration com rollback.sql) e, depois de
git fetch + rebase + bun install --frozen-lockfile, db:generate = no_changes.
T1.4, T1b.5, T1d.4, T2.3b e as demais tasks de mutação só fecham com a execução vermelha registrada.
Antes de fechar (T6.1): compare o preview.html com a tela real, lado a lado, em 375, 768 e 1280, e
registre a tabela de diferenças em evidence.md; corrija o que divergir. Depois (T6.1b): passada
independente de funcionalidade, usabilidade e design com code-reviewer model=opus, fluxo ponta a
ponta no navegador; reprovou, corrige e repete. Só então T6.2–T6.4.
Rode as tasks das Fases 1 a 6 sem parar entre fases; só interrompa nas condições abaixo.
PARADAS OBRIGATÓRIAS (pedem autorização do usuário; as medições são só leitura e NÃO se executam sem ela):
 - T1d.0: contagem em produção de ocorrências com attachment_object_id (e das com as duas fontes);
 - T3.0: em staging e produção, quantas exceções têm attachment_mode <> 'required' sobre tipo
   required — a Fase 3 só ativa em produção depois dessa medição registrada em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, produção, qualquer [NEEDS CLARIFICATION].
```

## Prompt de execução restante

Nenhum. Não sobra task de código: só **T1d.0** e **T3.0** seguem `[ ]` (medições do usuário) e a publicação em etapas
(`evidence.md` § "Ordem de publicação em etapas"), que é do orquestrador. Pare e pergunte antes de deploy, migration em
produção e a etapa 3.
