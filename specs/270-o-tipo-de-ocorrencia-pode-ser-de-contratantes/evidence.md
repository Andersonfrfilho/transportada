# Evidência — 270 O tipo de ocorrência pode ser de contratantes

## Pedido do dono (chat, 2026-10-16)

1. Cada tipo de ocorrência pode ser **Geral** (todas as contratantes — o comportamento de hoje, padrão) ou **Só destas
   contratantes** (uma lista escolhida). O app do motorista e o painel oferecem o tipo só nas notas cuja contratante está
   na lista.
2. A **exceção por contratante** (`company_occurrence_type_contractor_overrides`; com a 269, também o modelo de e-mail)
   continua como está. É outro conceito: a exceção ajusta, o escopo restringe.
3. Escopo **só por contratante** — o dono já tinha recusado exceção por destinatário.
4. "Contratantes deve ser um select": no editor, a escolha é um **seletor múltiplo** das contratantes cadastradas, com
   busca por nome e CNPJ — nada de texto livre nem chip digitado. Reusar o seletor que o painel já tem.
5. "Altera para os tipos hoje serem todos da contratante Spani": depois da feature em produção, um **passo de dados**
   põe todo tipo existente em `listed` com só a contratante Spani (`contractors.display_name ILIKE '%spani%'`, exatamente
   uma por ambiente, senão para). Task final à parte, por ambiente (staging, depois produção), idempotente, por script
   revisado via `railway ssh` no container da API, sem imprimir segredo, com antes/depois aqui, e **parada para o dono
   confirmar** ambiente e contratante. Staging hoje só tem "RIBER PET…" e "COMERCIAL ZARAGOZA…": o passo deve avisar
   que a Spani falta, nunca criá-la.

**Emenda registrada:** a 269 (`work/spec-269`, `evidence.md` Q2 e ADR-0106 §2) anotou que o dono recusou restringir
tipo a contratante ("se na ocorrência vamos definir já se é de uma contratante X o modelo vai acompanhar isso"). O
pedido de 2026-10-16 muda isso; a ADR-0107 emenda a ADR-0106 §2 só nesse ponto.

## Decisões tomadas nesta spec (padrões; a T0.2 valida)

- **Escopo explícito** (`contractor_scope` `all`/`listed`), não derivado da lista: uma lista vazia nunca abre o tipo em
  silêncio. `listed` com lista vazia é 400.
- **Contratante na lista com FK `RESTRICT`**: contratante não se apaga (só fica inativa); inativa continua na lista.
- **A parada ignora o escopo** e tipo só de parada não pode ser `listed`. Tipo com parada **e** nota: o escopo vale nos
  registros com nota.
- **Nota sem contratante e lista sem nota → só `all`.** Fecha o fallback do app (que caía na lista geral).
- **O servidor decide e recobra**: listas filtram pela contratante que o servidor lê da nota; o `contractorId` da query
  fica só para a exceção; registro fora do escopo → 422 `OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR`.
- **Lote do escritório** com notas de várias contratantes oferece a interseção; uma nota fora recusa o lote inteiro.
- **Recebimento de carga fora do escopo** (revisão T0.2): tipos seed-only, momentos `[]`, sempre `all`.
- **Ficha da contratante sem seção "Tipos exclusivos"**: fora do escopo; o chip do catálogo mostra a informação.
- **Passo da Spani por script com `--confirm`**, sem migration de dados (uma migration valeria para todo deploy novo de
  outra transportadora — a distribuição é um deploy por transportadora, ADR-0021).

## Perguntas abertas (com padrão adotado — não bloqueiam a execução)

- **Q1 — Tipo `listed` na parada.** Padrão: a parada ignora o escopo (a parada mistura contratantes). Alternativa: na
  parada, oferecer o tipo `listed` só se a parada tiver ao menos uma nota de contratante listada. Mudar depois é aditivo.
- **Q2 — Consequência do passo da Spani.** Depois dele, notas de qualquer outra contratante e notas sem contratante
  identificada ficam **sem tipo de nota** para registrar (só os de parada seguem). O dry-run conta essas notas; o dono
  confirma na T6.2/T6.3. Se alguma transportadora/ambiente tiver tipo que deva continuar geral, o dono marca antes.
- **Q3 — Tipo já `listed` com outra contratante na hora do passo.** Padrão: relatado e não tocado (só existe se alguém
  usar a feature antes do passo). Sem `--replace`.

## Levantamento contra `origin/staging` (e79e26171, 2026-10-16)

Feito por duas buscas paralelas, só de leitura, e leitura direta. A T0.1 confere as linhas antes de qualquer código.
Caminhos relativos a `apps/api-transportada/` salvo indicação.

### API

- `company_occurrence_types`: `src/database/trip.schema.ts:2921-3282`; `active` :2929, `stage` :2927, `flow` :2985;
  unique `(company_id, id)` `company_occurrence_types_company_id_id_unique` :3280 (já usado por FKs compostas). CHECK no
  padrão `company_occurrence_types_<coluna>_check`, gerada de constante (ex. :3131-3134).
- Exceção por contratante `company_occurrence_type_contractor_overrides`: `trip.schema.ts:3289-~3400`; FK do tipo
  `CASCADE` (:3337-3343), FK `contractors (company_id, id)` `RESTRICT` (:3344-3350), unique tripla :3351.
- `contractors`: `src/database/delivery-client.schema.ts:109-150`; `tax_id` :114, `display_name` :115, `status`
  `active|inactive` :123; unique `(company_id, tax_id)` :135 e `(company_id, id)` :136. **Sem exclusão física**:
  `contractor.routes.ts` só GET/POST/PATCH (status, :162).
- Momentos: `src/shared/trip-occurrence.constant.ts:40` (`OCCURRENCE_TYPE_FLOWS`), :54-66 (`OCCURRENCE_MOMENT(S)`),
  :75 (`acceptsOccurrenceMoment`); tabela `company_occurrence_type_moments` em
  `src/database/occurrence-type-moment.schema.ts:20-54` (o molde da tabela nova). `stage`/`flow` derivados ao salvar
  (`delivery-proof-read.support.ts:1137`). `DRIVER_FIELD_MOMENTS = [document, stop]`
  (`list-field-occurrence-types.use-case.ts:131`).
- Onde o `active` barra o registro hoje (a guarda nova vai junto):

  | Caminho             | Onde                                                                                                    | Erro                              |
  | ------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------- |
  | Motorista, nota     | `driver-occurrence-assessment.service.ts:76-82`                                                         | 409 `TRIP_DOCUMENT_NOT_REACHABLE` |
  | Lote do escritório  | `office-occurrence-batch.service.ts:37-43`                                                              | 422 `OCCURRENCE_TYPE_NOT_FIELD`   |
  | Galpão (separação)  | `register-trip-occurrence.use-case.ts:383`                                                              | 404 `TRIP_DOCUMENT_NOT_FOUND`     |
  | Parada              | `drizzle-driver-field-report.repository.ts:1070`, `report-stop-occurrence.use-case.ts:150`              | 422 `OCCURRENCE_TYPE_NOT_STOP`    |
  | Recebimento (lista) | `src/cargo-receiving/infrastructure/cargo-arrival-occurrence-read.query.ts:125-145` (etapa `receiving`) | —                                 |
  | Lista de rua        | `list-field-occurrence-types.use-case.ts:293`                                                           | —                                 |

  `findOccurrenceType` não filtra `active` de propósito (`delivery-proof-read.support.ts:851-855`). Erros em
  `src/trips/domain/trip.error.ts` (`ApiError` com `{ code, message, status }`; **não há `codes.ts` central**).
  Nenhum código `OCCURRENCE_TYPE_NOT_AVAILABLE*` existe.

- Contratante da nota: `findDocumentOccurrenceSubject` (`src/trips/infrastructure/document-occurrence-subject.query.ts:28-66`)
  junta `contractors` por `company_id` + CNPJ do emitente, `.limit(1)`; o mesmo em `driver-reachable-document.query.ts:57`
  e `drizzle-current-driver-trip.repository.ts:507, :973`. **No máximo uma** contratante por nota; sem casamento →
  nulo. O lote do escritório não resolve contratante. O recebimento de carga já carrega `contractorId`
  (`cargo-arrival-occurrence.port.ts:35,89`).
- Motorista: tipos por nota em `drizzle-current-driver-trip.repository.ts:800-812` (`readFieldOccurrenceTypes`) e
  :1120-1135 (`resolveFieldOccurrenceTypes`, momento `document`). `GET /me/trips/current/occurrence-types`
  (`me-trip.routes.ts:114`, :832-860; `main.ts:4137`) aceita `contractorId`, `moment`, `recipientTaxId`; sem `moment`
  traz nota e parada; os tipos de parada do app vêm daqui. Quando a leitura por nota falha, o retrato cai na lista geral
  sem contratante (`find-current-driver-trip.use-case.ts:57-64`).
- Escritório: `GET /trips/occurrence-types/field` (`trip-field-office-occurrence.routes.ts:27, :71-90`, `contractorId`
  da query em :86); lote `POST /trips/:id/documents/field-occurrences` (:28, :149); parada do escritório
  `trip-field-office-trip.routes.ts:41`; separação `TRIP_DOCUMENT_OCCURRENCES_PATH` (`trip.routes.ts:213, :1899`); feed
  `/trip-occurrences` (`trip.routes.ts:1830`); configuração `GET /company-settings/occurrence-types`
  (`trip.routes.ts:1984`, inclui inativos).
- Gravação: `PUT /company-settings/occurrence-types` (`trip.routes.ts:1988-2000`) grava **um tipo por chamada**;
  schema `src/trips/presentation/occurrence.schema.ts:443-605`, `.strict()` :598; ausente não altera;
  `save-occurrence-type.use-case.ts`, `save-occurrence-type-values.mapper.ts:10`; persistência `saveOccurrenceType`/
  `writeOccurrenceTypeRow` (`delivery-proof-read.support.ts:1127-1400`; violação de constraint → 422/409 em
  :1093-1125). **Tipo não se apaga** (`active: false`); ocorrências apontam com `RESTRICT`.
- Fila offline: a API devolve `ApiError.status` como está (`src/shared/api.error.ts:14`).
- Migrations: `drizzle/<carimbo>_<nome>/` com `migration.sql`, `rollback.sql`, `snapshot.json`; última em `staging`:
  `drizzle/20261015151849_trip_occurrence_resolution_events`. `make migration-test` (`Makefile:206`).
- Seeds de tipos: `src/database/occurrence-type-catalog-seed.repository.ts:43`, `occurrence-type-catalog-seed.service.ts`,
  `src/database/pre-deploy.service.ts:10-13`, `src/shared/occurrence-type-catalog.constant.ts`,
  `src/database/local-occurrence-type-seed.service.ts`. Nascem `all` pelo `DEFAULT`; nada a mudar.
- Leitores que **não** filtram tipo (o escopo não os atinge): feed, detalhe, relatórios. Só filtram `active` a busca de
  tipo de parada e a lista do recebimento. A correção de itens (`correct-occurrence-items.use-case.ts:78`) não troca o
  tipo.
- Script de dados com `--confirm`: molde em `scripts/whatsapp-location-redact.ts` (spec 245). Consulta em produção por
  `railway ssh -e production -s api -- bun ...` já usada na 147 (`specs/147-*/evidence.md:28-32`).

### Painel (`apps/frontend-transportada/src/modules/trip/`)

- Aba Tipos: `TripOccurrenceTypesTab` → `OccurrenceTypeCatalogPanel` → `OccurrenceTypeList` → `OccurrenceTypeItem`
  (`OccurrenceTypeSummary` fechado, `OccurrenceTypeRow` aberto com blocos Identity, Moments, RequirementFields,
  ContractorMail, ContractorReply, Notification, Exceptions em :72-120); criação em `OccurrenceTypeCreateForm`.
- Exceção: `OccurrenceExceptionForm.component.tsx:97-108` usa `SearchableSelect` de **um** valor; opções
  "Nome · CNPJ" em `shared/occurrenceExceptionPeople.service.ts:62-75`; busca sem acento sobre o rótulo
  (`components/ui/searchableSelect.service.ts:23-36`); contratantes por `useContractorsQuery`
  (`queries/useContractors.query.ts:14`), paginadas até um teto, com `contractorsTruncated`.
- **Seletor múltiplo que já existe:** `src/components/ui/multi-select.tsx` + `multiSelect.service.ts` (busca, caixas,
  pílulas, segunda linha, "órfãos" visíveis em :29-37), já usado para contratantes em
  `src/modules/delivery-clients/components/ContractorFilterBar.component.tsx:7,48`. Não há `command.tsx`/combobox.
- Guardas: `isOccurrenceType` estrito (`shared/tripResponse.validation.ts:1947-1990`, `hasKeys` em
  `shared/tripGuards.validation.ts:36-38, 64-69`), e `occurrenceTypesFromApi` (:1132-1138) derruba a lista inteira.
  `isFieldOccurrenceType` também estrito (:1563-1573; chaves em `shared/trip.constant.ts:550-568`). A exceção é
  tolerante (`shared/occurrenceAttachmentOverrides.validation.ts:50-80`).
- Registro: a separação usa `GET /company-settings/occurrence-types` e filtra no cliente
  (`TripOccurrences.component.tsx:136-138`, `shared/separationOccurrenceButton.service.ts:28`); o lote
  (`FieldOccurrenceDialog.component.tsx`) usa `GET /trips/occurrence-types/field` sem filtro no cliente (:115). O painel
  não tem `contractorId` da nota (`shared/trip.types.ts:165-181`; só `contact.contractorName`, :571-576).
- Chips do catálogo: `OccurrenceTypeSummary.component.tsx:82-104` com `styles.tag` (`styles/occurrenceTypeItem.module.css`).
- Ficha da contratante: `delivery-clients/components/ContractorFicha.component.tsx:53-72` (não muda nesta spec).

### App do motorista (`apps/frontend-driver/src/modules/driver-trip/`)

- `occurrenceTypes` por nota: `shared/driverTrip.types.ts:82`, lido em `driverTripResponse.validation.ts:84-87,165`;
  guarda tolerante `isDriverOccurrenceType` (`driverTrip.types.ts:515-585`).
- Junção nota + parada: `shared/occurrenceRegistration.service.ts:45-54`; lista da nota nula → cai na lista geral.
- Recusa: `shared/driverTripClient.service.ts:167-192` (repete só 408, 429, 502, 503, 504); `rejectionCause` em
  `shared/offlineQueue.service.ts:53`; rótulos em `shared/rejectionCauseLabel.service.ts:14-24` (código desconhecido
  aparece cru, `pages/DriverEventQueue.page.tsx:105-110`; `pages/DriverOccurrenceDetail.page.tsx:118` sempre cru);
  4xx pode ser descartado (`eventQueueView.service.ts:216-222`).
- Cache: catálogo em `localStorage` `transportada.driver.occurrence-types.v1:<subHash>`
  (`shared/occurrenceTypesCache.service.ts:14`); retrato no IndexedDB `transportada.driver-trip`, `DATABASE_VERSION = 6`
  (`shared/indexedDbQueue.service.ts:40-57`).

### Numeração

- Spec 270: livre (`origin/staging` vai até 268; 267 e 269 em branches próprias).
- ADR: `origin/staging` vai até 0105; a 269 usa 0106; **0107** para esta spec. A T5.4 confere de novo antes de publicar.

## T0.1 / T0.2 — Revisão de arquitetura (2026-10-16)

Base: `origin/staging` 6f9337f4a (269 já mergeada, PR #262); última migration `20261016165917`. Veredito do architect:
**aprovado com mudanças** (R1-R10), aplicadas em `plan.md` § Ajustes, `spec.md`, `tasks.md` e na ADR-0107 (agora aceita).
Divergências de linha: `company_occurrence_types_company_id_id_unique` em `trip.schema.ts:3294`; exceções começam em :3314;
`isOccurrenceType` :1950; `occurrenceTypesFromApi` :1132; filtro da separação em `TripOccurrences.component.tsx:134`.
