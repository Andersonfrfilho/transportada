# Plano técnico

## Contexto e premissas

Conferido no código (`origin/staging`, 2026-10-03):

- `company_occurrence_types` (`apps/api-transportada/src/database/trip.schema.ts:2511`):
  `allows_multiple_items boolean default true`, `attachment_mode varchar(16) default 'off'` com CHECK
  em `DELIVERY_PROOF_FIELD_MODES`, `leaves_document_behind`, `redelivery_policy default 'unset'`,
  `flow`, `stop_kind`. Nenhuma coluna diz "carrega itens". Unique `(company_id, id)`.
- Catálogo de bootstrap: `src/shared/occurrence-type-catalog.constant.ts`
  (`OccurrenceTypeCatalogEntry = { name, stage }`), gravado por `seedOccurrenceTypeCatalog`
  (`database/occurrence-type-catalog-seed.service.ts`), chamado no pre-deploy
  (`database/pre-deploy.service.ts:153`) **a cada deploy**, só para empresa sem nenhum tipo
  (`hasAnyOccurrenceType`). `insertOccurrenceTypes` grava `{ companyId, name, stage }`.
- WhatsApp: `main.ts` → `registerTripOccurrence` com `productCodes: []` ("sempre da nota inteira").
- App do motorista: manda `productCode: ''` (`DriverTripWorkspace.page.tsx:589`,
  `notDelivered.service.ts:156`); não tem seletor de item.
- Teto de um item: `OccurrenceTypeSingleItemError` (`trips/domain/trip.error.ts:615`, `422`), em
  `register-trip-occurrence.use-case.ts` e `correct-occurrence-items.use-case.ts`.
- Painel: `resolveOccurrenceCorrectionActions` (`trip/shared/tripOccurrenceDetail.service.ts:188`)
  decide `hasItems || wasCorrected` (240 T6.4); o registro lê `allowsMultipleItems` do tipo
  (`TripOccurrences.component.tsx:150`); o cadastro é
  `company-settings/components/OccurrenceTypeCatalogPanel.component.tsx`.
- `redelivery_policy = 'unset'` não abre tratativa (164 D1). Os tipos de boleto nascem `unset`.

## Decisões de modelo de dados 🧠

### D-A — `items_mode varchar(16)` com o vocabulário da 239, não boolean novo

**Escolhida:** `items_mode varchar(16) NOT NULL DEFAULT 'optional'`, CHECK em
`DELIVERY_PROOF_FIELD_MODES` (`off`/`optional`/`required`). É a coluna que a 239 RF1 já decidiu
(`itemsMode`), adiantada. A 241 escreve só `off`/`optional`; `required` é aceito pelo CHECK para a
239 não precisar de segunda migration, e recusado pelo Zod da 241.

**Descartadas:**

- `carries_items boolean default true` — resolve a 241 sozinho, mas cria um segundo eixo para a mesma
  pergunta que a 239 responde com `itemsMode`. Quando a 239 entrar, haveria duas colunas
  ("carrega?" e "exige?") que podem se contradizer (`false` + `required`). É a duplicação de decisão
  que a 179 produziu contra a 164 e a 161 (`specs/179-a-recusa-sai-com-foto/duplicacao.md`).
- Tri-estado próprio `items | whole_document | none` — distingue "nota inteira" de "sem itens", mas
  "nota inteira" já é **lista vazia por registro** (161, 166, 172, 240 decisão a), não propriedade do
  tipo, e inventa vocabulário fora de `DELIVERY_PROOF_FIELD_MODES`.
- Derivar do nome/etapa do tipo — nome é texto livre renomeável (208).

### D-B — Default `optional`, não `off` como no plano da 239

`off` em `DELIVERY_PROOF_FIELD_MODES` é "o campo não aparece". O seletor aparece hoje para todo tipo
de nota; o default que não muda nada é `optional`. O plano da 239 ("`items_mode` nasce `off` …
nada muda") precisa ser corrigido quando ela for executada: a coluna já existirá, e a 239 só
acrescenta `items_minimum_count` e o estado `required`. Task T0.2 registra isso.

### D-C — Reconciliação na migration, não no seeder de boot

O seeder roda a cada deploy. Reconciliar flags ali reescreveria, deploy após deploy, a escolha que o
operador fez no cadastro — "já existe" não é "está certo", mas "está diferente do catálogo" também
não é "está errado" depois que o operador editou. A reconciliação dos tipos **já existentes** é feita
uma vez, pela migration (`UPDATE … WHERE name = '<nome da segunda via>' AND stage = 'delivery' AND
flow = 'document'`); o seeder passa a gravar `itemsMode` explícito só no insert de bootstrap.
Alternativa descartada: reconciliar no seeder por nome a cada deploy — sobrescreve edição do
operador.

### D-D — O detalhe lê o tipo atual por junção, não um snapshot na ocorrência

`occurrenceTypeId` já está gravado na ocorrência; `typeItemsMode` e `typeAllowsMultipleItems` saem da
junção com `company_occurrence_types` no momento da leitura. Alternativa descartada: copiar
`items_mode` para `trip_document_occurrences` no registro — coluna nova em tabela grande para um
dado que só decide a tela; a ocorrência antiga com itens num tipo que virou `off` é coberta pelo
`hasItems || wasCorrected` do RF7.

### D-E — Tipo `off` não abre tratativa: CHECK de coluna (D1, decidida por delegação)

**Decidida por delegação em 2026-10-03 — o usuário pode reverter antes da execução.**

**Escolhida:** `company_occurrence_types_items_off_shape_check`: `items_mode <> 'off' or
redelivery_policy = 'unset'`. Mesmo molde — CHECK de forma por tipo, nome `<tabela>_<assunto>_shape_check`
— do `company_occurrence_types_charge_shape_check` que a 204 planeja (`specs/204-…/plan.md:166`; ⚠️ a
204 **ainda não está no código**: `TRIP_OCCURRENCE_STAGE` tem dois valores e não há `charge` no
schema, então não há constraint pronta para copiar, só o padrão). As duas CHECKs são independentes e
coexistem. Conferido no código: o catálogo de bootstrap nunca escreve `redelivery_policy` (a coluna
nasce `unset`), e o seed local não inclui a segunda via — todo tipo semeado dela está `unset`, a menos
que o operador tenha mudado. Por isso o `UPDATE` normaliza `redelivery_policy` **na mesma instrução**
que põe `off`: a CHECK entra depois e nenhuma linha a viola. Linhas `optional` (todas as demais) passam
pela cláusula `items_mode <> 'off'`.

Servidor: `save-occurrence-type.use-case.ts` valida o estado resultante (campo ausente = valor gravado)
e lança `OccurrenceTypeItemsOffRedeliveryPolicyError` (`422`, código
`OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY`, declarado ao lado de `OccurrenceTypeSingleItemError` em
`trips/domain/trip.error.ts` — os códigos deste domínio moram ali, não em `shared/errors/codes.ts`).
Painel: esconde a política com Produtos = Desligado e envia `redeliveryPolicy: 'unset'` ao trocar.

**Descartadas:** (b) livre — tratativa que não fecha por `goods_paid`; (c) regra no domínio da 164 —
reabre 164, fora do escopo. **Custo de reverter:** `ALTER TABLE … DROP CONSTRAINT`, remover a guarda e
o `if` do painel; a normalização para `unset` não se desfaz (era `unset` em tipo de catálogo).
Tratativa **já aberta** em tipo que depois vira `off` não é tocada: a CHECK é do tipo, não do caso.

### D-F — A prorrogação só entra por cadastro na empresa existente (D2, decidida por delegação)

**Decidida por delegação em 2026-10-03 — o usuário pode reverter antes da execução.**

**Escolhida:** manter a regra da 208 (catálogo só no bootstrap, `hasAnyOccurrenceType`). O tipo "Cliente
pediu prorrogação do boleto" entra em `OCCURRENCE_TYPE_CATALOG` (empresa vazia, ambientes novos,
`make bootstrap`), com `itemsMode: 'off'`; a transportada de produção o **cadastra pela tela** (passo
operacional em `spec.md`). **A migration não insere esse tipo.** **Descartada:** (b) `INSERT … WHERE NOT
EXISTS` por empresa na migration — exceção à 208, e o rollback não pode apagar a linha (FK `restrict`
das ocorrências). **Custo de reverter:** acrescentar o `INSERT` e o teste de integração.

Campos que a 208 usa e que o cadastro precisa permitir sem itens: `name`, `stage = 'delivery'`,
`flow = 'document'`, `attachmentMode = 'off'`, `leavesDocumentBehind = false` (só `separation` pode
ligá-la, CHECK `leaves_document_behind_check`), `redeliveryPolicy = 'unset'`, `notifies = false`. A T2.4
prova isso pelo `PUT` e a T1.5 pelo painel.

## Arquitetura e arquivos afetados

API (`apps/api-transportada`):

- `src/database/trip.schema.ts` — `itemsMode` + CHECK.
- `drizzle/<timestamp>_occurrence_type_items_mode/{migration.sql,rollback.sql,snapshot.json}` —
  gerada por `db:generate`, com o `UPDATE` da D-C acrescentado à mão.
- `src/shared/occurrence-type-catalog.constant.ts` — `itemsMode` na entrada; o tipo da prorrogação;
  nome da segunda via vira constante (`SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME`), usada também pelo
  teste da migration.
- `src/database/occurrence-type-catalog-seed.repository.ts` e `local-occurrence-type-seed.service.ts`
  — gravam `itemsMode`.
- `src/trips/presentation/occurrence.schema.ts` — `itemsMode: z.enum(['off','optional']).optional()`
  no cadastro; campos novos nas respostas.
- `src/trips/application/save-occurrence-type.use-case.ts` — persiste, ausente não mexe; valida o
  estado resultante `off` ⇒ política `unset` (D1).
- `src/trips/domain/trip.error.ts` — `OccurrenceTypeItemsNotAllowedError` (`422`,
  `OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED`) e `OccurrenceTypeItemsOffRedeliveryPolicyError` (`422`,
  `OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY`, D1); códigos ao lado de
  `OccurrenceTypeSingleItemError`, onde este domínio os declara.
- `src/trips/application/register-trip-occurrence.use-case.ts`,
  `correct-occurrence-items.use-case.ts` e o registro do escritório em nome do motorista
  (`register-driver-occurrence.use-case.ts`/`office-occurrence-batch.service.ts`, se aceitarem
  produto) — guarda do RF6 logo depois de ler o tipo, antes de qualquer escrita.
- Leituras do detalhe, feed (`trip-occurrence-feed.use-case.ts`) e lista da nota — junção com o tipo.
- `list-field-occurrence-types.use-case.ts` — projeta `itemsMode`.
- OpenAPI gerado e `docs/ai-context/api-transportada.md`.

Painel (`apps/frontend-transportada`):

- `trip/shared/trip.types.ts`, `tripResponse.validation.ts`, `trip.constant.ts`
  (`TRIP_OCCURRENCE_OPTIONAL_KEYS`) — chaves novas opcionais, ausência lida como `optional`/`true`.
- `trip/shared/tripOccurrenceDetail.service.ts` — RF7.
- `trip/components/TripOccurrences.component.tsx`, `SeparationOccurrenceDialog.component.tsx` — RF8.
- `trip/components/TripOccurrenceCorrectionForm.component.tsx` — RF9.
- `company-settings/components/OccurrenceTypeCatalogPanel.component.tsx` (+ hook e tipos) — RF10 e
  RF12 (esconde a política de reentrega com Produtos = Desligado e envia `unset` ao trocar).
- Locales pt-BR e en. `docs/ai-context/frontend-transportada.md`.

App do motorista: nenhuma mudança de código. Confirmar que o guard de tipos tolera a chave nova.

## Contratos/API

- `PUT /company-settings/occurrence-types` — corpo aceita `itemsMode?: 'off' | 'optional'`.
- `GET /company-settings/occurrence-types` e `GET /me/trips/current/occurrence-types` — `itemsMode`.
- `GET /trip-occurrences/:id`, `GET /trip-occurrences`, `GET
/trips/:tripId/documents/:documentId/occurrences` — `occurrenceTypeId`, `typeItemsMode`,
  `typeAllowsMultipleItems`.
- Registro e `PATCH …/occurrences/:occurrenceId/items` — novo `422
OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED`.

## Migration e rollback

```sql
-- migration.sql — a ORDEM importa: coluna, backfill (+ política), e só então a CHECK
ALTER TABLE company_occurrence_types
  ADD COLUMN items_mode varchar(16) NOT NULL DEFAULT 'optional';
ALTER TABLE company_occurrence_types
  ADD CONSTRAINT company_occurrence_types_items_mode_check
  CHECK (items_mode IN ('off', 'optional', 'required'));
UPDATE company_occurrence_types
   SET items_mode = 'off',
       redelivery_policy = 'unset'
 WHERE name = 'Cliente pediu segunda via do boleto'
   AND stage = 'delivery'
   AND flow = 'document';
ALTER TABLE company_occurrence_types
  ADD CONSTRAINT company_occurrence_types_items_off_shape_check
  CHECK (items_mode <> 'off' OR redelivery_policy = 'unset');

-- rollback.sql — ordem inversa: a CHECK da forma cai antes da coluna que ela lê
ALTER TABLE company_occurrence_types DROP CONSTRAINT IF EXISTS company_occurrence_types_items_off_shape_check;
ALTER TABLE company_occurrence_types DROP CONSTRAINT IF EXISTS company_occurrence_types_items_mode_check;
ALTER TABLE company_occurrence_types DROP COLUMN IF EXISTS items_mode;
```

Aditiva: `ADD COLUMN … DEFAULT` constante não reescreve a tabela no Postgres moderno. O `UPDATE` do
backfill leva `redelivery_policy = 'unset'` **na mesma instrução** que `items_mode = 'off'`, antes de a
CHECK da forma existir — numa só instrução não há instante com `off` + política ≠ `unset`, e a CHECK
entra sobre dado já conforme (D-E). O rollback perde a escolha `off` feita no cadastro e **não** restaura
a política anterior da segunda via (era `unset` em tipo de catálogo) — preço aceito, registrado aqui. A
D2 foi decidida por (a): **nenhum `INSERT` do tipo da prorrogação entra nesta migration**.

Gates: `make migration-test`; depois do rebase em `origin/staging`, `db:generate` = `no_changes` e
conferir que o timestamp não colide com migration de outra sessão.

## Ordem de publicação (ADR-0081 §9, 240 T6.1)

1. **Etapa 1 — painel tolerante:** aceita as chaves novas ausentes ou presentes (ausência =
   `optional`/`true`), RF7–RF10. Contra a API atual, nada some: Corrigir passa a aparecer para
   ocorrência sem itens (lê `optional`) e a API atual aceita a correção como hoje. Publicar e esperar
   o deploy e o `autoUpdate` do PWA.
2. **Etapa 2 — banco e API:** migration, leituras, cadastro e o `422` do RF6. Só depois da etapa 1:
   o painel antigo não conhece `OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` e não esconde o seletor.

**Passo 3 — produção (humano, depois da etapa 2):** o operador cadastra a prorrogação pela tela
(`spec.md` § Passo operacional em produção). Não é deploy nem migration.

O cadastro com Produtos (RF10) vai na etapa 1, mas o controle só aparece quando a listagem trouxer
`itemsMode` — sem o campo, não oferece algo que a API antiga ignoraria. Uma branch por etapa a partir
de `origin/staging`, cada etapa com seu PR para `main`.

## Segurança e tenant

- `companyId` do contexto; a junção usa `(company_id, id)` — tipo de outra empresa nunca entra na
  leitura (CA04 prova com tipo alheio no banco).
- O cadastro segue em `settings.manage`; as leituras novas são projeções de rotas que já existem, sem
  ampliar permissão. `/me/.../occurrence-types` não expõe e-mail do tipo (157).
- O `422` roda antes de qualquer escrita, notificação ou fila.

## Idempotência e concorrência

Escritas existentes seguem com `Idempotency-Key`. Tipo alterado para `off` entre carregar a tela e
salvar: o servidor recusa com `422` e a tela recarrega o tipo.

## Observabilidade

Log `warn` estruturado na recusa do RF6 com `occurrenceTypeId` e a rota — sinal de painel antigo em
aba aberta. Sem nome de produto.

## Estratégia de testes

- **Contrato (API):** RF6 nos três casos de uso (com produto → 422 sem `saveOccurrence` nem
  notificador; vazio → grava); schema do cadastro (`required` → 400; ausente não mexe); catálogo com
  `itemsMode` por entrada.
- **Integração (API, `test:integration` com `--env-file=../../.env.test`):** CA01 semeando o tipo
  **antes** da coluna (rodar a migration anterior, inserir, aplicar a nova); CA02 seed; CA04 leituras
  com tipo de outra empresa; CA07 cadastro.
- **Contrato (painel):** RF7 tabela de casos; tolerância à API anterior; RF8; RF9; RF10.
- **D1:** integração da CHECK (inserir `off` + `blocked` → SQLSTATE 23514), da migration sobre a
  segunda via semeada com política `blocked` (CA09) e contrato do `422
OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY` no cadastro (estado resultante, campo ausente).
- **Mutação (prova de que o teste prende comportamento):**
  - arrancar o `UPDATE` da migration → CA01 vermelho;
  - arrancar a guarda do RF6 em `correct-occurrence-items.use-case.ts` → CA03 vermelho;
  - trocar o RF7 de volta para `hasItems || wasCorrected` → CA05 vermelho;
  - arrancar o filtro por `company_id` da junção → CA04 vermelho;
  - arrancar `redelivery_policy = 'unset'` do `UPDATE` da migration → CA09 vermelho (a CHECK recusa a
    linha `off` + `blocked`);
  - arrancar a validação `off` ⇒ `unset` do `save-occurrence-type.use-case.ts` → CA09 vermelho.
    Usar asserção de valor exato e `toHaveLength`, não `toEqual` sobre array com `undefined`.
- Todo arquivo de teste novo entra na lista do `package.json` da app.

## Riscos

- **Colisão com a 239.** Ordem decidida: **241 primeiro** (`spec.md` § Ordem de execução entre a 239
  e a 241). Se a 239 fosse primeiro, criaria `items_mode` com default `off` e quebraria o
  comportamento de hoje; a 241 então teria de reescrever o default e as linhas. A 239, quando for
  executada, remove o `ADD COLUMN items_mode` da migration dela. Há também colisão de **número**:
  `origin/staging` tem `239-o-expurgo-se-liga-na-tela` e a da exigência existe só em `work/spec-239`.
- **Tipo da prorrogação ausente na produção até alguém cadastrar** — não há migration; o passo
  operacional é humano e está na spec. Sem ele, o SAC não tem o tipo.
- **Política da segunda via normalizada sem aviso** — se o operador a tinha posto em `allowed`/`blocked`,
  a migration a zera. Medir antes (T0.3) e registrar em `evidence.md`.
- **Nome da segunda via divergente em produção** (renomeado) — a migration não pega; o operador
  desliga no cadastro. Medir antes do deploy de produção com uma consulta só de leitura.
- **Painel antigo em aba aberta** mandando produto para tipo `off` — mitigado pela ordem de
  publicação; o `422` vira mensagem por `getApiErrorCode()`.
