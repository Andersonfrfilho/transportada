# Plano técnico

## Contexto e premissas

A peça central já existe e está correta: `listFieldOccurrenceTypes` resolve o `attachmentMode` em
três camadas e a rota `GET /me/trips/current/occurrence-types` aceita `contractorId` e
`recipientTaxId` (`me-trip.routes.ts:760`). O que falta é **alimentá-la** — o app do motorista não
tem os dois valores — e **ampliá-la** de um campo para três.

Premissas conferidas no código antes de escrever:

- `company_occurrence_types.attachment_mode` é `varchar(16) not null default 'off'`, sobre
  `DELIVERY_PROOF_FIELD_MODES` (`trip.schema.ts:2416`).
- As duas tabelas de exceção existem e guardam só `attachment_mode`
  (`trip.schema.ts:2532` e `:2584`).
- A regra "foto `required` exige também a observação" está **no caso de uso**, não no dado
  (`register-driver-occurrence.use-case.ts:137`).
- O snapshot do motorista tem `recipientName` e `recipientDisplayName`, mas **não** o CNPJ do
  destinatário nem o id do contratante (`find-current-driver-trip.use-case.ts:57`).
- O app do motorista já tem captura de assinatura: `SignaturePad.component.tsx` e
  `signatureCapture.service.ts`. É reaproveitável porque é apresentacional — o que **não** se
  reaproveita é `ProofCaptureFields`, que enfileira para `/documents/:id/proof` e recriaria o
  defeito da 209.

## Arquitetura e arquivos afetados

**API** (`apps/api-transportada`)

- `src/database/trip.schema.ts` — três colunas de modo em `companyOccurrenceTypes` e nas duas
  tabelas de exceção; `signature_object_id` na ocorrência.
- `src/trips/application/list-field-occurrence-types.use-case.ts` — a projeção passa de um modo
  para três, resolvidos campo a campo por `resolveWithOverrides`.
- `src/trips/application/register-driver-occurrence.use-case.ts` — a exigência vira dado: lê os
  três modos efetivos em vez do `if (attachmentMode === 'required')` com a nota embutida.
- `src/trips/application/read-settings-resolution.use-case.ts` — devolve os três campos.
- `src/trips/domain/trip.error.ts` — erro da assinatura ausente.
- `src/trips/application/find-current-driver-trip.use-case.ts` — `contractorId` e `recipientTaxId`
  por nota no snapshot.
- `src/trips/presentation/occurrence.schema.ts`, `me-trip.routes.ts`,
  `company-settings` do catálogo — `PUT` dos três modos, no tipo e nas duas exceções.

**App do motorista** (`apps/frontend-driver`)

- `src/modules/driver-trip/shared/driverTripClient.service.ts` — envia `contractorId` e
  `recipientTaxId` na consulta de tipos.
- `src/modules/driver-trip/shared/driverTrip.types.ts`, `occurrenceTypesCache.service.ts` — o cache
  passa a guardar três modos e a chavear por nota, não só por viagem.
- `src/modules/driver-trip/components/DriverOccurrenceRegistrationForm.component.tsx` — habilita o
  botão só com o exigido capturado; monta `SignaturePad` quando a assinatura é pedida.
- `occurrenceRegistration.service.ts` — o item de fila carrega a assinatura junto da foto.

**Painel** (`apps/frontend-transportada`)

- `src/modules/trip/pages/TripOccurrencesWorkspace.page.tsx` — ganha `<Tabs>` no molde de
  `TripWorkspace.page.tsx:139`.
- O painel do catálogo e a seção de exceções mudam de módulo: de
  `modules/company-settings/components/` para `modules/trip/components/`, como o
  `TripDeliveryProofSettingsPanel` já faz. Hook, consultas e chaves de tradução vão junto.
- `src/modules/company-settings/shared/companySettingsTabs.service.ts` — módulo novo em
  `SETTINGS_PANEL_MODULES` para a tela de ocorrências; `occurrenceTypeCatalog` muda de endereço;
  `occurrenceTypes` sai de `COMPANY_SETTINGS_TAB_IDS`.
- Modelo de e-mail, `redeliveryPolicy`, `SearchableSelect` de destinatário, busca e filtros-pílula entram na mesma aba (RF1e, RF1f, RF11b).
- As exceções deixam o acordeão: a lista por tipo vem numa consulta só (RF11), não uma por linha.

## Contratos/API/eventos

| Rota                                                                    | Mudança                                                                                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me/trips/current/occurrence-types`                                | devolve `photoMode`, `noteMode`, `signatureMode` resolvidos; `attachmentMode` permanece no corpo por um ciclo, igual a `photoMode`, para o app antigo |
| `GET /me/trips/current`                                                 | cada nota passa a trazer `contractorId` e `recipientTaxId`                                                                                            |
| `GET`/`PUT /company-settings/occurrence-types`                          | os três modos por tipo                                                                                                                                |
| `GET`/`PUT /company-settings/occurrence-types/:id/attachment-overrides` | os três modos por exceção; substituição total, como hoje                                                                                              |
| `GET /company-settings/settings-resolution`                             | os três campos por tipo                                                                                                                               |
| `POST .../occurrences` (nota e parada)                                  | aceita `signatureObjectId?`, conferido como o anexo (RF2b da 179)                                                                                     |

Nenhum evento novo. O item de fila do app ganha a assinatura dentro do item que já existe — item
novo multiplicaria aviso para um fato só (209 D1).

## Dados, migration e rollback

**O momento vira tabela filha**, não colunas booleanas: o conjunto é fechado hoje mas cresce, e
coluna por momento transforma cada momento novo em migration de schema.

```sql
CREATE TABLE company_occurrence_type_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  occurrence_type_id uuid NOT NULL REFERENCES company_occurrence_types(id) ON DELETE CASCADE,
  moment varchar(16) NOT NULL CHECK (moment IN ('separation','document','stop','office')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (occurrence_type_id, moment)
);
-- Backfill: um momento por tipo, derivado do par que ele já tinha.
INSERT INTO company_occurrence_type_moments (company_id, occurrence_type_id, moment)
SELECT company_id, id,
       CASE WHEN stage = 'separation' THEN 'separation'
            WHEN flow  = 'stop'       THEN 'stop'
            ELSE 'document' END
FROM company_occurrence_types;
```

`stage` e `flow` **permanecem** nesta spec, gravadas junto com o conjunto, como a 218 fez com
`trip_stop_occurrences.kind`: são a rede de segurança do rollback e o que todo leitor atual usa.
Removê-las é outra spec, depois que a leitura nova estiver em produção.

⚠️ **`stage` decide permissão** (`trip-occurrence.constant.ts`, ADR-0043): galpão é `trip.manage`,
rua é `trip.report`. Com o conjunto, a permissão passa a ser do **momento do registro**, não do
tipo. O erro a evitar é checar "o tipo tem algum momento que o papel cobre" — isso deixaria o
motorista registrar no momento do galpão. A checagem é sempre contra o momento daquela escrita.

E as demais colunas, aditivas:

```sql
ALTER TABLE company_occurrence_types
  ADD COLUMN note_mode varchar(16) NOT NULL DEFAULT 'off',
  ADD COLUMN signature_mode varchar(16) NOT NULL DEFAULT 'off';
UPDATE company_occurrence_types SET note_mode = 'required' WHERE attachment_mode = 'required';
-- idem nas duas tabelas de exceção
ALTER TABLE trip_document_occurrences ADD COLUMN signature_object_id uuid;
ALTER TABLE trip_stop_occurrences    ADD COLUMN signature_object_id uuid;
```

O `UPDATE` é o que preserva o comportamento da 179 RF3 ao tirar a regra do código (CA04). Sem ele,
todo cadastro com foto obrigatória deixaria de exigir a observação — regressão silenciosa.

`attachment_mode` **não** é renomeada: o nome fica, o significado ("a foto") passa a estar
documentado. Renomear exigiria duas migrations e um ciclo de compatibilidade por nada.

`rollback.sql` derruba as colunas novas. Ocorrência gravada com assinatura perde a referência — é o
preço aceito de um rollback, registrado aqui de propósito.

### Produtos, quantidade mínima e anexos da rua

```sql
ALTER TABLE company_occurrence_types
  ADD COLUMN items_mode varchar(16) NOT NULL DEFAULT 'off',
  ADD COLUMN photo_minimum_count smallint NOT NULL DEFAULT 1 CHECK (photo_minimum_count BETWEEN 1 AND 5),
  ADD COLUMN items_minimum_count smallint CHECK (items_minimum_count >= 1); -- nulo = todos os itens
-- idem nas duas tabelas de exceção
-- Backfill RF1d: attachment_object_id da ocorrência de rua -> trip_document_occurrence_attachments
```

`items_mode` nasce `off` em todo cadastro: a 166 nunca exigiu produto, então nada muda. O backfill
da RF1d é o segundo ponto onde se perde dado calado — mesma disciplina da CA04 (semear antes, provar
depois, mutação vermelha). `attachment_object_id` permanece gravada até a leitura nova estar em
produção.

## Segurança e tenant

`companyId` do contexto em toda leitura e escrita; as duas tabelas de exceção já são por empresa.
A assinatura é objeto no bucket privado, servida por URL assinada de vida curta, com o mesmo
`retention_until` de cinco anos dos anexos de ocorrência (161). Nenhum CNPJ ou nome em log — a
exceção se registra pelo id do tipo e da linha.

## Idempotência e concorrência

A ocorrência do motorista já tem `Idempotency-Key` (179). O reenvio completa o anexo **uma vez** e
nunca sobrescreve (209); a assinatura entra na mesma regra. A substituição total do `PUT` de
exceções continua sendo a escrita, sem merge parcial.

## Observabilidade

Log estruturado na recusa por campo faltando, com o código do erro e o id do tipo — é o sinal de
que um cadastro endureceu com motoristas em rua com cache velho.

## Estratégia de testes

- **Contrato (API)**: projeção dos três modos; precedência destinatário > contratante > tipo;
  recusa por campo; `signatureObjectId` conferido contra empresa/viagem.
- **Integração**: CA02 e CA04 — este último semeando o dado **antes** da coluna nova, que é a única
  forma de provar que cadastro existente não mudou de comportamento.
- **Contrato (app do motorista)**: botão desabilitado por campo faltando, habilitando sem rede;
  a consulta de tipos leva os dois parâmetros.
- **Contrato (painel)**: endereço único do painel; exceções visíveis sem interação; uma consulta
  por tela, não por linha.
- **Mutação**: arrancar o `UPDATE` da migration tem de deixar a integração da CA04 vermelha. Um
  teste que passa sem a correção não prova nada (`toEqual` ignora `undefined` em array).

## Riscos

- **O maior é a CA04.** Tirar a regra do código e pô-la no dado é exatamente onde se perde
  comportamento sem ninguém ver. A integração sobre dado antigo é obrigatória, não opcional.
- **Cache de tipos no aparelho** passa a ter chave por nota. Chave errada serve exigência de outra
  nota — pior que não ter exceção nenhuma.
- **Mover o painel de módulo** toca quatro arquivos de contrato que afirmam o endereço atual.
  `format:check` é gate só na raiz: rodar prettier nos `.md` e nos arquivos movidos antes do push.
- **Duas sessões** mexendo em `specs/` e em migration ao mesmo tempo colidem em número. Conferir
  contra `origin/staging` e `db:generate` = `no_changes` antes do push.
