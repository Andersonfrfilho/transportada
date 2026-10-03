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
  decide `hasItems || wasCorrected` (235 T6.4); o registro lê `allowsMultipleItems` do tipo
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
  "nota inteira" já é **lista vazia por registro** (161, 166, 172, 235 decisão a), não propriedade do
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
- `src/trips/application/save-occurrence-type.use-case.ts` — persiste, ausente não mexe.
- `src/trips/domain/trip.error.ts` — `OccurrenceTypeItemsNotAllowedError` (`422`, código em
  `shared/errors/codes.ts` se o domínio já registrar lá).
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
- `company-settings/components/OccurrenceTypeCatalogPanel.component.tsx` (+ hook e tipos) — RF10.
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
-- migration.sql
ALTER TABLE company_occurrence_types
  ADD COLUMN items_mode varchar(16) NOT NULL DEFAULT 'optional';
ALTER TABLE company_occurrence_types
  ADD CONSTRAINT company_occurrence_types_items_mode_check
  CHECK (items_mode IN ('off', 'optional', 'required'));
UPDATE company_occurrence_types
   SET items_mode = 'off'
 WHERE name = 'Cliente pediu segunda via do boleto'
   AND stage = 'delivery'
   AND flow = 'document';

-- rollback.sql
ALTER TABLE company_occurrence_types DROP CONSTRAINT IF EXISTS company_occurrence_types_items_mode_check;
ALTER TABLE company_occurrence_types DROP COLUMN IF EXISTS items_mode;
```

Aditiva: `ADD COLUMN … DEFAULT` constante não reescreve a tabela no Postgres moderno. O rollback
perde a escolha `off` feita no cadastro — preço aceito, registrado aqui. Se a D2 da spec for
respondida com (b), o `INSERT` da prorrogação entra nesta mesma migration, e o rollback **não** o
apaga (ocorrência pode já apontar para o tipo; FK `restrict`).

Gates: `make migration-test`; depois do rebase em `origin/staging`, `db:generate` = `no_changes` e
conferir que o timestamp não colide com migration de outra sessão.

## Ordem de publicação (ADR-0081 §9, 235 T6.1)

1. **Etapa 1 — painel tolerante:** aceita as chaves novas ausentes ou presentes (ausência =
   `optional`/`true`), RF7–RF10. Contra a API atual, nada some: Corrigir passa a aparecer para
   ocorrência sem itens (lê `optional`) e a API atual aceita a correção como hoje. Publicar e esperar
   o deploy e o `autoUpdate` do PWA.
2. **Etapa 2 — banco e API:** migration, leituras, cadastro e o `422` do RF6. Só depois da etapa 1:
   o painel antigo não conhece `OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` e não esconde o seletor.

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
- **Mutação (prova de que o teste prende comportamento):**
  - arrancar o `UPDATE` da migration → CA01 vermelho;
  - arrancar a guarda do RF6 em `correct-occurrence-items.use-case.ts` → CA03 vermelho;
  - trocar o RF7 de volta para `hasItems || wasCorrected` → CA05 vermelho;
  - arrancar o filtro por `company_id` da junção → CA04 vermelho.
    Usar asserção de valor exato e `toHaveLength`, não `toEqual` sobre array com `undefined`.
- Todo arquivo de teste novo entra na lista do `package.json` da app.

## Riscos

- **Colisão com a 239.** Se a 239 for executada antes, ela cria `items_mode` com default `off` e
  quebra o comportamento de hoje; se depois, precisa saber que a coluna existe. T0.2 registra a nota
  na 239 assim que ela estiver em `staging`.
- **Nome da segunda via divergente em produção** (renomeado) — a migration não pega; o operador
  desliga no cadastro. Medir antes do deploy de produção com uma consulta só de leitura.
- **Painel antigo em aba aberta** mandando produto para tipo `off` — mitigado pela ordem de
  publicação; o `422` vira mensagem por `getApiErrorCode()`.
