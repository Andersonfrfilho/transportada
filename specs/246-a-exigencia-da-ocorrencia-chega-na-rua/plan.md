# Plano técnico

## Pré-requisitos de produção

**A 246 não vai a `main` sem a medição T3.0 (e a T1d.0), as duas pendentes do usuário** — leitura em
produção pede autorização dele. O afrouxamento das exceções (RF6) **passa a valer no deploy da API**,
sem chave de ambiente: uma exceção `optional` sobre tipo `required` deixa de ser ignorada assim que a
API sobe, e só a medição T3.0 diz quantos registros isso passa a aceitar sem foto. A T1d.0 é a parada
antes do backfill de anexos. Detalhe e consultas em `tasks.md` ("Pré-requisitos de produção") e
`evidence.md`.

## Contexto e premissas

A peça central já existe e está correta: `listFieldOccurrenceTypes` resolve o `attachmentMode` em
três camadas, a rota `GET /me/trips/current/occurrence-types` aceita `contractorId` e
`recipientTaxId` (`me-trip.routes.ts`), e — o que o primeiro rascunho desta spec não via — o
**snapshot do motorista já resolve os tipos de nota por contratante e destinatário**
(`drizzle-current-driver-trip.repository.ts`, `toDriverDocument`, ~1022-1045; lido no app por
`occurrenceRegistration.service.ts` ~30-52, `resolveOccurrenceTypesForDocument`). O app **não manda**
os identificadores por URL **de propósito** — `security.md` §3 — e o código o recusa em
`driverTripClient.service.ts` (~203-207). Por isso esta spec **não** toca o cliente nem o snapshot
para carregar `contractorId`/`recipientTaxId`.

O que falta é (1) **ampliar** a resolução de um campo para quatro, (2) fazer o **registro no
servidor** ler os modos efetivos por nota — hoje ele lê só o `attachmentMode` do tipo e **ignora as
exceções** — e (3) a tela.

Premissas conferidas no código em 2026-10-06 (árvore `origin/staging` `81cd849b6`):

- `company_occurrence_types.attachment_mode` é `varchar(16) not null default 'off'`, sobre
  `DELIVERY_PROOF_FIELD_MODES` (`trip.schema.ts:2594`).
- As duas tabelas de exceção existem e guardam só `attachment_mode`, `NOT NULL DEFAULT 'optional'`
  (`trip.schema.ts:2685` contratante e `:2737` destinatário).
- A regra "foto `required` exige também a observação" está **no caso de uso**, não no dado
  (`register-driver-occurrence.use-case.ts:146-152`).
- `resolveWithOverrides` é `recipient ?? contractor ?? general ?? fallback`
  (`src/shared/resolve-with-overrides.policy.ts`): **nulo herda**. É o que sustenta D-a.
- `company_occurrence_types.items_mode` existe (241): `trip.schema.ts:2624`, CHECKs `:2665` e
  `:2674`. O comentário do campo cita "spec 239" — é a **246**; corrigir ao tocar o arquivo.
- O app do motorista já tem captura de assinatura: `SignaturePad.component.tsx` e
  `signatureCapture.service.ts`. É reaproveitável porque é apresentacional — o que **não** se
  reaproveita é `ProofCaptureFields`, que enfileira para `/documents/:id/proof` e recriaria o
  defeito da 209.
- `report-stop-occurrence.use-case.ts` **não** lê `attachment_mode`: a exigência é só de nota (D-d).
- A tabela de anexos da ocorrência **não tem `retention_until`**: a retenção está em
  `stored_objects.retention_until` (`storage.schema.ts:66`), e o objeto é o mesmo.

## Arquitetura e arquivos afetados

**API** (`apps/api-transportada`)

- `src/database/trip.schema.ts` — em `companyOccurrenceTypes`: `note_mode` (`NOT NULL DEFAULT
'optional'`), `signature_mode` (`NOT NULL DEFAULT 'off'`), `photo_minimum_count`,
  `items_minimum_count`. Nas duas tabelas de exceção: `note_mode`, `signature_mode`, `items_mode`,
  `photo_minimum_count`, `items_minimum_count`, **todas nulas, sem default**. `signature_object_id`
  nas duas tabelas de ocorrência. Tabela `company_occurrence_type_moments`.
- `src/shared/trip-occurrence.constant.ts` — constante `OCCURRENCE_MOMENTS` (fonte da CHECK) e a
  guarda `acceptsOccurrenceMoment`.
- `src/trips/application/list-field-occurrence-types.use-case.ts` — a projeção passa de um modo
  para quatro, resolvidos campo a campo por `resolveWithOverrides`; ganha o parâmetro `moment`.
- `src/trips/application/register-driver-occurrence.use-case.ts` — a exigência vira dado: lê os
  modos efetivos em vez do `if (attachmentMode === 'required')` com a nota embutida (Fase 2: do
  tipo; Fase 3: da nota, com exceções).
- `src/trips/application/read-settings-resolution.use-case.ts` — devolve os campos resolvidos.
- `src/trips/domain/trip.error.ts` — erro da assinatura ausente (ao lado de
  `TripOccurrenceAttachmentRequiredError` e `TripOccurrenceNoteRequiredError`).
- `src/trips/presentation/occurrence.schema.ts`, `me-trip.routes.ts`, `company-settings` do
  catálogo — `PUT` dos modos, no tipo e nas duas exceções; `moments` no catálogo.
- `src/delivery-clients/infrastructure/drizzle-occurrence-statement.repository.ts` (~255-310) — o
  demonstrativo ao cliente mostra a foto de rua e a resposta da correção (CA09).

**App do motorista** (`apps/frontend-driver`) — **não** muda o que o cliente envia na consulta de tipos.

- `src/modules/driver-trip/shared/driverTrip.types.ts` — o tipo resolvido ganha `noteMode`,
  `signatureMode`, `itemsMode`, `photoMinimumCount`, `itemsMinimumCount`.
- `src/modules/driver-trip/components/DriverOccurrenceRegistrationForm.component.tsx` — habilita o
  botão só com o exigido capturado; monta `SignaturePad` quando a assinatura é pedida.
- `occurrenceRegistration.service.ts` (~30-52) — já resolve por nota via `document.occurrenceTypes`;
  o item de fila carrega a assinatura junto da foto.

**Painel** (`apps/frontend-transportada`)

- `src/modules/trip/pages/TripOccurrencesWorkspace.page.tsx` — ganha `<Tabs>` no molde de
  `TripWorkspace.page.tsx:139`.
- O painel do catálogo e a seção de exceções mudam de módulo (**movendo o painel que a 241 já
  alterou**, ver § Dependência da spec 241): de `modules/company-settings/components/` para
  `modules/trip/components/`, como o `TripDeliveryProofSettingsPanel` já faz. Hook, consultas e
  chaves de tradução vão junto.
- `src/modules/company-settings/shared/companySettingsTabs.service.ts` — módulo novo em
  `SETTINGS_PANEL_MODULES`; `occurrenceTypeCatalog` muda de endereço; `occurrenceTypes` sai de
  `COMPANY_SETTINGS_TAB_IDS`.
- Modelo de e-mail, `redeliveryPolicy`, `SearchableSelect` de destinatário, busca e filtros-pílula
  entram na mesma aba (RF1e, RF1f, RF11b). Na exceção, o seletor tem a quarta opção **Igual ao tipo**.
- As exceções deixam o acordeão: a lista por tipo vem numa consulta só (RF11c).

## Contratos/API/eventos

| Rota                                                                    | Mudança                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me/trips/current/occurrence-types`                                | devolve `photoMode`, `noteMode`, `signatureMode`, `itemsMode` resolvidos; `attachmentMode` permanece no corpo por um ciclo, igual a `photoMode`, para o app antigo; aceita `moment` |
| `GET /me/trips/current`                                                 | `document.occurrenceTypes` (já resolvido por nota) passa a trazer os quatro modos e os mínimos. **Nenhum campo novo de identificador**                                              |
| `GET`/`PUT /company-settings/occurrence-types`                          | os quatro modos, os mínimos e `moments` por tipo                                                                                                                                    |
| `GET`/`PUT /company-settings/occurrence-types/:id/attachment-overrides` | os quatro modos e os mínimos por exceção, **nulo = herda**; substituição total, como hoje                                                                                           |
| `GET /company-settings/settings-resolution`                             | os campos resolvidos por tipo                                                                                                                                                       |
| `POST .../occurrences` (nota)                                           | aceita `signatureObjectId?`, conferido como o anexo (RF2b da 179); o servidor resolve a exigência efetiva da nota (Fase 3)                                                          |

Nenhum evento novo. O item de fila do app ganha a assinatura dentro do item que já existe — item
novo multiplicaria aviso para um fato só (209 D1).

## Dados, migration e rollback

São **quatro migrations**, em ordem, cada uma com `rollback.sql`: **T1.2** (colunas de exigência e
`signature_object_id`), **T1b.1** (momentos), **T1c.1** (produtos e mínimos) e **T1d.2** (backfill
de anexos, **em deploy separado**).

### T1.2 — `note_mode`, `signature_mode`, `signature_object_id`

A ordem **é** a decisão:

```sql
-- 1. tipo: default CONSTANTE (não reescreve a tabela)
ALTER TABLE company_occurrence_types
  ADD COLUMN note_mode varchar(16) NOT NULL DEFAULT 'optional',
  ADD COLUMN signature_mode varchar(16) NOT NULL DEFAULT 'off';
-- 2. exceções: NULAS, sem default (D-a: nulo herda do tipo)
ALTER TABLE company_occurrence_type_contractor_overrides
  ADD COLUMN note_mode varchar(16), ADD COLUMN signature_mode varchar(16);
ALTER TABLE company_occurrence_type_recipient_overrides
  ADD COLUMN note_mode varchar(16), ADD COLUMN signature_mode varchar(16);
-- 3. backfill
UPDATE company_occurrence_types SET note_mode = 'required' WHERE attachment_mode = 'required';
UPDATE company_occurrence_type_contractor_overrides
   SET note_mode = CASE WHEN attachment_mode = 'required' THEN 'required' ELSE 'optional' END;
UPDATE company_occurrence_type_recipient_overrides
   SET note_mode = CASE WHEN attachment_mode = 'required' THEN 'required' ELSE 'optional' END;
-- 4. CHECKs nomeadas, só depois do dado conforme (<= 63 caracteres: encurtar as das exceções)
--    <tabela>_note_mode_check / _signature_mode_check, IN (<DELIVERY_PROOF_FIELD_MODES>)
--    (nas exceções a CHECK aceita nulo: a expressão `IN` com nulo passa)
-- 5. por último
ALTER TABLE trip_document_occurrences ADD COLUMN signature_object_id uuid;
ALTER TABLE trip_stop_occurrences    ADD COLUMN signature_object_id uuid;
-- FK composta (company_id, signature_object_id) -> stored_objects(company_id, id) ON DELETE RESTRICT,
-- nas duas, no molde de `trip_document_occurrences_company_object_fk` (trip.schema.ts:2191)
```

**Por que o tipo nasce `optional`, não `off`:** a observação hoje é **sempre opcional**; `off` a
esconderia em todo tipo que não tem foto obrigatória. O `UPDATE` do tipo só **sobe** para `required`
onde a foto é `required` (a regra da 179 RF3 tirada do código). **Por que a exceção recebe o
`CASE` em TODA linha existente:** uma exceção `attachment_mode = 'optional'` sobre um tipo
`required` precisa seguir com nota `optional` — se o `note_mode` ficasse nulo, herdaria o `required`
do tipo e endureceria o que hoje é opcional. `signature_mode` das exceções fica nulo (o tipo nasce
`off`, nada a preservar).

`attachment_mode` **não** é renomeada: o nome fica, o significado ("a foto") passa a estar
documentado.

**`rollback.sql`:** derruba as CHECKs, as colunas novas e o registro do journal (`DELETE` com
`ROW_COUNT = 1`); **não toca `items_mode` nem as CHECKs da 241**. O que se perde: o `note_mode`
gravado (volta a regra fixa da 179 apenas se o código antigo estiver publicado) e a referência de
`signature_object_id` nas ocorrências já gravadas — o preço aceito de um rollback, registrado de
propósito.

### T1b.1 — Momentos

O momento vira **tabela filha**, não colunas booleanas: o conjunto é fechado hoje mas cresce, e
coluna por momento transforma cada momento novo em migration de schema.

```sql
CREATE TABLE company_occurrence_type_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  occurrence_type_id uuid NOT NULL,
  moment varchar(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_occurrence_type_moments_type_fk
    FOREIGN KEY (company_id, occurrence_type_id)
    REFERENCES company_occurrence_types (company_id, id) ON DELETE CASCADE,
  CONSTRAINT company_occurrence_type_moments_unique UNIQUE (company_id, occurrence_type_id, moment),
  CONSTRAINT company_occurrence_type_moments_moment_check
    CHECK (moment IN (<OCCURRENCE_MOMENTS>))  -- gerada da constante, sem lista literal
);
```

`test/trip-schema/tenant-safety.contract.ts` cobra o padrão de tenant (FK a `companies`, FK composta,
unicidade com `company_id`).

**Backfill fiel a todo leitor** (tipos inativos entram; `ON CONFLICT DO NOTHING`):

| Momento gravado | Quando                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- |
| `separation`    | `stage = 'separation'`                                                                       |
| `document`      | `stage = 'delivery' AND flow = 'document'`                                                   |
| `stop`          | `stage = 'delivery' AND flow = 'stop'`, **e** `stage = 'separation' AND flow = 'stop'` (D-c) |
| `office`        | `stage = 'delivery'`                                                                         |

O quarto momento (`office`) existe porque o lote do escritório
(`office-occurrence-batch.service.ts`) lê `stage = 'delivery'`, seja `document` ou `stop`. Daí um
tipo `delivery + document` vira **dois** momentos (`document`, `office`), e `delivery + stop`
também (`stop`, `office`). A linha `separation + stop` vira `separation` **e** `stop` — preserva
o que todo leitor já faz; que isso seja um furo é problema de outra spec (D-c). O backfill **nunca
gera** `separation + document` (só o operador monta); os dois tipos "Avaria" existentes **não** são
fundidos.

**`stage` e `flow` permanecem**, gravadas junto com o conjunto, como a 218 fez com
`trip_stop_occurrences.kind`: são a rede de segurança do rollback e o que todo leitor atual usa.
Regra de derivação quando o tipo tem vários momentos:

- `stage = 'separation'` **se e só se** `separation ∈ momentos` (mantém a CHECK
  `company_occurrence_types_leaves_document_behind_check`);
- `flow = 'stop'` se e só se `stop ∈ momentos` e `document ∉ momentos`; senão `document`;
- `stop_kind` exigido sempre que houver `stop`;
- **API recusa `document + stop` juntos** até o app deduplicar por id + momento.

**Leitura tolerante na janela de deploy:** tipo **sem** linha de momento usa os momentos derivados
de `stage`/`flow`; `PUT` sem `moments` mantém os gravados; `PUT` que muda `stage`/`flow` de tipo com
vários momentos devolve `409`. O preço do rollback fica registrado: tipos com vários momentos perdem
a informação ao voltar para o par `stage`/`flow`.

### Permissão (T1b.2)

⚠️ **`stage` decide permissão hoje** (`trip-occurrence.constant.ts`, `occurrence.policy.ts:28`,
ADR-0043). Com o conjunto, a permissão **continua sendo da rota**, e a guarda é do **momento da
escrita**: cada caso de uso tem um momento **fixo** e a política da rota não muda
(`trip.manage` / `trip.report` / `trip.report-on-behalf`). **Proibido** calcular permissão a partir
dos momentos do tipo; `resolveOccurrencePermission` **não** entra no caminho novo.

| Caso de uso                          | Momento fixo | Política da rota (inalterada) |
| ------------------------------------ | ------------ | ----------------------------- |
| `registerTripOccurrence` (separador) | `separation` | `trip.manage`                 |
| `registerDriverOccurrence`           | `document`   | `trip.report`                 |
| WhatsApp do motorista (nota)         | `document`   | —                             |
| registro de parada                   | `stop`       | `trip.report`                 |
| lote do escritório                   | `office`     | `trip.report-on-behalf`       |
| WhatsApp do operador                 | `separation` | —                             |

Pontos de código que mudam (conferidos nesta árvore; **reconferir os números ao implementar**):

| Arquivo                                                                | Linha(s)   | Hoje                                                        |
| ---------------------------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `trips/application/register-trip-occurrence.use-case.ts`               | 323        | `stage !== separation` → `OccurrenceTypeNotSeparationError` |
| `trips/application/register-driver-occurrence.use-case.ts`             | 105-112    | `stage`/`flow` → `TripDocumentNotReachableError`            |
| `whatsapp-commands/application/register-operator-trip-flow-actions.ts` | 583, 628   | `stage === 'separation'`                                    |
| `whatsapp-commands/application/register-driver-flow-actions.ts`        | 399, 445   | `stage === delivery` (a lista **perde os tipos de parada**) |
| `trips/infrastructure/drizzle-driver-field-report.repository.ts`       | 1053       | `flow = stop`                                               |
| `trips/application/office-occurrence-batch.service.ts`                 | 35-40      | `stage !== delivery` → `OccurrenceTypeNotFieldError`        |
| `trips/application/list-field-occurrence-types.use-case.ts`            | 126, 193   | `stage === delivery` (ganha parâmetro `moment`)             |
| `trips/infrastructure/drizzle-current-driver-trip.repository.ts`       | 781, 1045  | `stage === delivery` / `flow === 'document'`                |
| `trips/application/read-settings-resolution.use-case.ts`               | 125        | `stage: delivery` fixo                                      |
| `trips/application/save-occurrence-type.use-case.ts`                   | 96         | `leavesDocumentBehind` exige `stage = 'separation'`         |
| `trips/infrastructure/delivery-proof-read.support.ts`                  | 846-1110   | seleção e gravação de `stage`/`flow`                        |
| `frontend-transportada/.../TripOccurrences.component.tsx`              | 136        | tipos `separation`                                          |
| `frontend-transportada/.../separationOccurrenceButton.service.ts`      | 28         | idem                                                        |
| `frontend-transportada/.../SettingsResolutionPanel.component.tsx`      | 61         | `stage === delivery`                                        |
| `frontend-transportada/.../OccurrenceTypeCatalogPanel.component.tsx`   | 88         | agrupa por `stage`                                          |
| `frontend-transportada/.../OccurrenceTypeRow.component.tsx`            | 51, 135    | `stage` decide o que aparece                                |
| `frontend-transportada/.../tripResponse.validation.ts`                 | 1461, 1859 | guards de chave exata em `stage`                            |
| `frontend-driver/.../occurrenceRegistration.service.ts`                | 48-51      | deduplica/filtra por `flow`                                 |

### T1c.1 — Produtos e quantidade mínima

**Pré-condição: a spec 241 aplicada** — **conferida**: `items_mode` (`DEFAULT 'optional'`, CHECK de
vocabulário, `company_occurrence_types_items_off_shape_check`) existe em `origin/staging`
(`81cd849b6`), migration `20261006033752_occurrence_type_items_mode`. Esta migration **não** faz
`ADD COLUMN items_mode` na tabela de tipos e **não** a derruba no rollback.

```sql
ALTER TABLE company_occurrence_types
  ADD COLUMN photo_minimum_count smallint NOT NULL DEFAULT 1,
  ADD COLUMN items_minimum_count smallint,           -- nulo = todos os itens
  ADD CONSTRAINT company_occurrence_types_photo_minimum_count_check CHECK (photo_minimum_count BETWEEN 1 AND 5),
  ADD CONSTRAINT company_occurrence_types_items_minimum_count_check CHECK (items_minimum_count >= 1),
  ADD CONSTRAINT company_occurrence_types_items_minimum_shape_check
    CHECK (items_minimum_count IS NULL OR items_mode = 'required');
-- exceções (as duas): colunas NULAS, sem default
--   items_mode varchar(16), photo_minimum_count smallint, items_minimum_count smallint
-- CHECKs: vocabulário de items_mode (aceita nulo); photo 1..5; items >= 1;
--   items_minimum_count IS NULL OR coalesce(items_mode, '') = 'required'
```

**Resolução nas exceções.** `photo_minimum_count` nulo herda o do tipo (sem ambiguidade: no tipo
nunca é nulo). **`items_mode` e `items_minimum_count` vão como par:** exceção com `items_mode` nulo
herda o par do tipo; exceção com `items_mode` declarado usa o próprio par, e `items_minimum_count`
nulo ali significa "todos os itens" — igual ao tipo. Sem o par, uma exceção não saberia dizer "todos
os itens" sobre um tipo que pede "pelo menos 2".

**A CHECK `off ⇒ redelivery_policy = 'unset'` da 241 não cobre exceção** (a política de reentrega
é do **tipo**, não da exceção). **Decisão: sem CHECK equivalente nas exceções.** Uma exceção com
`items_mode = 'off'` sobre um tipo com política `allowed` faz a nota daquele CNPJ registrar sem
produtos, e a tratativa continua a que o **tipo** manda; o que o cadastro precisa garantir é só que
o tipo não seja `off` com política ≠ `unset` (a 241 já garante).

`photo_minimum_count = 1` é o que preserva o comportamento da foto `required`. **O default de
`items_mode` do tipo é `optional`, não `off`:** a 246 não reescreve nenhuma linha de `items_mode`.
O **rollback** derruba só o que a 246 criou aqui; `items_mode` do tipo e as CHECKs da 241 ficam.

### T1d.2 — Backfill de anexos da rua (migration própria, deploy próprio)

Migration **própria** (`db:generate --custom`), em **deploy separado** da T1.2: o migrator roda tudo
numa transação, e o `ADD COLUMN signature_object_id` seguraria `ACCESS EXCLUSIVE` em
`trip_document_occurrences` durante o `INSERT` do backfill.

```sql
INSERT INTO trip_document_occurrence_attachments
  (company_id, occurrence_id, stored_object_id, thumbnail_object_id, position, created_at)
SELECT o.company_id, o.id, o.attachment_object_id, NULL, 1, o.created_at
FROM trip_document_occurrences o
WHERE o.attachment_object_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM trip_document_occurrence_attachments a
    WHERE a.company_id = o.company_id AND a.occurrence_id = o.id)
ON CONFLICT ON CONSTRAINT trip_document_occurrence_attachments_unique_position DO NOTHING;
```

- **`created_at = o.created_at` é obrigatório:** a linha do tempo usa o `created_at` do anexo como a
  data do evento de foto.
- O **`NOT EXISTS`** é o que não duplica: pode existir ocorrência com anexo só na posição 2.
- **`retention_until` não está nesta tabela** — está em `stored_objects.retention_until`; o objeto é
  o mesmo, então a retenção acompanha sem cópia.
- **Medir antes, em produção** (só leitura, **pede autorização do usuário**, não executar sem ela):
  `count(*) WHERE attachment_object_id IS NOT NULL` e quantas têm as duas fontes (esperado 0).
- **Um objeto servindo N ocorrências** (lote do escritório, purpose `delivery_proof`) vira N linhas
  com o mesmo `stored_object_id`, e o expurgo da 161 supõe uma linha por objeto
  (`drizzle-occurrence-attachment-purge-gateway.ts` ~24-34, conforme o architect — **confirmar o
  caminho** na T1d.2): **documentado, não resolvido aqui**. A escrita dupla da T1d.5 **não** usa
  `trip_occurrence_attachment` para o lote.
- **O id do anexo antigo muda** (id da ocorrência → id da linha) na linha do tempo e no feed:
  registrado como mudança conhecida.
- **A leitura "anexo novo, senão coluna antiga" já existe** desde a 161 T10
  (`trip-occurrence-feed.query.ts` ~781-877; `occurrence-attachment.service.ts` ~118): a T1d.1 é
  contrato que **prende o que existe**, não implementação.
- `rollback.sql` **não apaga as linhas** (não há como distinguir o que o backfill criou do que a
  escrita nova criou depois); só remove o registro do journal, com essa justificativa.
- `attachment_object_id` permanece gravada até a leitura nova estar em produção.
- **Implementado** em `drizzle/20261006205232_street_occurrence_attachment_backfill/` (T1d.2), SQL
  igual ao acima. O **expurgo** confirmado está em
  `apps/worker-transportada/src/trip-occurrence-attachment-purge/infrastructure/drizzle-occurrence-attachment-purge-gateway.ts`
  (`findAttachmentByObjectId`, `limit(1)` sem ordem, ~24-36) — o caminho da spec estava sem o prefixo
  do worker. Ele só varre objetos `trip_occurrence_attachment`/`trip_occurrence_thumbnail` com
  `retention_until` vencida, então o objeto do **lote** (`delivery_proof`, sem retenção) nunca é
  candidato. O mesmo upload do motorista **pode** servir duas ocorrências (`findConfirmedUpload` não o
  consome): vira duas linhas, o expurgo apaga os bytes, uma linha e marca o objeto `deleted`, e a outra
  linha fica apontando para objeto `deleted`, lida como `expired` — o mesmo que a coluna já mostrava;
  não é regressão, só uma linha morta. Documentado, não resolvido aqui.
- **Ordem de publicação obrigatória (deploy separado):** o migrador do drizzle aplica todas as
  pendentes numa transação só. A T1.2 (`20261006205139_…requirement_modes`) tem de estar aplicada em
  staging e produção (`drizzle.__drizzle_migrations`) **antes** de esta pasta entrar em qualquer push;
  senão as duas rodam juntas e o `ADD COLUMN signature_object_id` segura `ACCESS EXCLUSIVE` durante o
  `INSERT`. Nenhum gate verifica isso: é processo. Antes de produção, também a medição da T1d.0.
- **Janela entre o backfill e a escrita dupla:** ocorrência gravada por código anterior à T1d.5 depois
  do snapshot do backfill fica só com a coluna (a leitura antiga a cobre). Antes de **remover** a
  leitura da coluna, reaplicar o mesmo SQL numa migration nova — ele é idempotente.

### Resumo do que cada rollback preserva

`items_mode` do tipo e as CHECKs da 241 **permanecem** em todos os rollbacks: são da 241, e
derrubá-las desfaria o que está em produção.

## Dependência da spec 241

A 241 é pré-condição, não paralela, e **está satisfeita**: publicada em `origin/staging`
(`81cd849b6`, migration `20261006033752_occurrence_type_items_mode`).

- **Painel.** A 241 altera `company-settings/components/OccurrenceTypeCatalogPanel.component.tsx`
  (e o hook `useOccurrenceTypeCatalogPanel.hook.ts` + tipos) para o campo Produtos. A Fase 5 desta
  spec **move** esse conjunto para `modules/trip` e o estende; o que a 241 entregou (campo
  Produtos, `unset` ao desligar, testes) viaja junto. A T5.2 relê a árvore antes de mover.
- **API.** `save-occurrence-type.use-case.ts` e `occurrence.schema.ts` já aceitam `itemsMode` com
  `off|optional`; esta spec só alarga o enum de escrita e valida `items_minimum_count`.
- **Verificação da pré-condição** (T1c.0): **feita** — ver `evidence.md`.

## Segurança e tenant

`companyId` do contexto em toda leitura e escrita; as duas tabelas de exceção já são por empresa e
a de momentos nasce no mesmo padrão. A assinatura é objeto no bucket privado, servida por URL
assinada de vida curta, com o `retention_until` de cinco anos dos anexos de ocorrência (161),
guardado em `stored_objects`. O `contractorId` e o `recipientTaxId` do registro **saem da nota no
servidor**, nunca do payload. Nenhum CNPJ ou nome em log — a exceção se registra pelo id do tipo e
da linha.

## Idempotência e concorrência

A ocorrência do motorista já tem `Idempotency-Key` (179). O reenvio completa o anexo **uma vez** e
nunca sobrescreve (209); a assinatura entra na mesma regra. A substituição total do `PUT` de
exceções continua sendo a escrita, sem merge parcial.

## Observabilidade

Log estruturado na recusa por campo faltando, com o código do erro e o id do tipo — é o sinal de
que um cadastro endureceu com motoristas em rua com cache velho, ou de que uma exceção passou a
valer no servidor (RF6).

## Estratégia de testes

- **Contrato (API)**: projeção dos quatro modos; precedência destinatário > contratante > tipo,
  campo a campo, com nulo herdando; recusa por campo; `signatureObjectId` conferido contra
  empresa/viagem; o registro e o snapshot usam **o mesmo resolvedor**.
- **Migration**: a 246 assume a 241 aplicada — o `make migration-test` roda com a migration da 241 já
  no histórico e prova que o rollback da 246 deixa `items_mode` e as CHECKs da 241 intactas.
- **Integração, valor da coluna (T1.3)**, no padrão de `contractor-contact-channels.integration.ts`
  (semear antes, reexecutar o `UPDATE` lido do `migration.sql`): tipo `required` → `required`;
  `optional` e `off` → `optional`; exceção `required` → `required`; exceção `optional` sobre tipo
  `required` → `optional`; `signature_mode` `off`.
- **Integração, comportamento (T2.3b)**: tipo sem exceção com foto `required` → registro sem nota
  volta `TRIP_OCCURRENCE_NOTE_REQUIRED`.
- **Integração (momentos)**: CA00 com os códigos reais; CA00b verifica **as linhas** da tabela.
- **Integração (anexos)**: sementes (a) coluna sem linha, (b) coluna e uma linha só na posição 2,
  (c) galpão com duas linhas, (d) lote com um objeto em três ocorrências, (e) sem foto; verificar as
  linhas, `created_at`, que o leitor devolve exatamente uma foto em (a) e (b), e que reexecutar dá a
  mesma contagem.
- **Contrato (app do motorista)**: botão desabilitado por campo faltando, habilitando sem rede.
- **Contrato (painel)**: endereço único do painel; exceções visíveis sem interação; uma consulta
  por tela, não por linha.
- **Contrato do demonstrativo (CA09)**: foto de rua e resposta da correção aparecem; assinatura não.
- **Mutações** (cada uma só fecha com a execução vermelha registrada):
  - T1.4: tirar o `UPDATE` do tipo; default `'off'` em `note_mode`; trocar o `CASE` das exceções por
    `WHERE attachment_mode = 'required'` — todas deixam a T1.3 vermelha.
  - T2.3b: tirar o `UPDATE` do tipo deixa o comportamento vermelho.
  - T1b.5: `includes(ROUTE_MOMENT)` → `moments.length > 0`; e → "algum momento de rua".
  - T1d.4: arrancar o `INSERT`; tirar o `NOT EXISTS`; tirar `o.created_at`.
  - Lembrete: `toEqual` ignora `undefined` em array — usar sentinela e `toHaveLength`.

## Riscos

- **O maior é a CA04.** Tirar a regra do código e pô-la no dado é exatamente onde se perde
  comportamento sem ninguém ver. A integração sobre dado antigo é obrigatória, no valor **e** no
  comportamento.
- **A RF6 muda o que o servidor aceita.** Hoje ele exige pelo tipo e ignora exceções; uma exceção
  `optional` sobre tipo `required` passa a afrouxar de verdade. **A Fase 3 só ativa em produção
  depois da medição T3.0** (quantas exceções têm `attachment_mode <> 'required'` sobre tipo
  `required`), registrada em `evidence.md`.
- **Tipo `off` por default esconderia a observação** — por isso `note_mode` do tipo nasce `optional`.
- **O backfill de anexos segura `ACCESS EXCLUSIVE`** se vier junto da T1.2 — por isso é deploy
  separado.
- **Um objeto em N linhas de anexo** (lote do escritório) contradiz a suposição do expurgo da 161.
- **Mover o painel de módulo** toca quatro arquivos de contrato que afirmam o endereço atual.
  `format:check` é gate só na raiz: rodar prettier nos `.md` e nos arquivos movidos antes do push.
- **Duas sessões** mexendo em `specs/` e em migration ao mesmo tempo colidem em número. Conferir
  contra `origin/staging` e `db:generate` = `no_changes` antes do push.
