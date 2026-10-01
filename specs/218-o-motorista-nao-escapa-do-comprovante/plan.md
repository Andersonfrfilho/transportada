# Plano técnico

## Contexto e premissas

- `contractors` (embarcador/contratante) e `deliveryClients` (destinatário) já existem, maduros,
  nascidos da nota (ADR-0048). Ambos têm `unique(companyId, taxId)` e `unique(companyId, id)` — as
  duas dão suporte a FK composta `(companyId, X)`.
- **Fase 0 já rodou** (`evidence.md`) e confirmou os pontos abaixo — o resto deste plano já reflete
  os achados, não mais suposições:
  - `contractors.taxId` já **é** o CNPJ do emitente por construção (`ensureDeliveryRegistry`,
    `apps/worker-transportada/src/nfe-imports/infrastructure/delivery-registry.writer.ts`, chamado
    de `drizzle-nfe-import-consumer.repository.ts:450-459`) — não existe join a recriar, só falta o
    _read_ do lado da API. Primitivo reaproveitável: `findContractorByTaxId`/`findByTaxId`
    (`apps/api-transportada/src/delivery-clients/infrastructure/drizzle-contractor.repository.ts:50-59`,
    já usado por `address-correction`).
  - `emitterTaxId` sai hoje em `GET /nfe-documents` mas **não** é selecionado na query do snapshot
    do motorista — falta um select a mais, não uma junção nova (ver "Backend — comprovante").
  - `resolveProofSettingsForRecipient` é chamado em
    `apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts:835-844`
    (`toDriverDocument`, o snapshot principal) e de novo na linha 328 (fotos pendentes) — os dois
    precisam da terceira camada.
  - `attachmentMode` chega ao motorista por
    `apps/api-transportada/src/trips/application/list-field-occurrence-types.use-case.ts:35-47`,
    servido por `GET /me/trips/current/occurrence-types`
    (`apps/api-transportada/src/trips/presentation/me-trip.routes.ts:99,721-734`) — reaproveitado
    também pelo escritório (`trip-field-office-occurrence.routes.ts:68`).
  - Rotas de `company_occurrence_types` (CRUD do catálogo): `apps/api-transportada/src/trips/presentation/trip.routes.ts:174`
    (`OCCURRENCE_TYPES_PATH = '/company-settings/occurrence-types'`) — a rota de
    `attachment-overrides` entra ali, sem arquivo próprio.
  - **Achado que mudou o desenho de D1:** os dois caminhos de ocorrência do motorista usam modelos
    de dado incompatíveis — ver "Frontend (app do motorista) — RF-A5" e RF-B5 no `spec.md`.
- `resolveDeliveryProofSettings`/`resolveProofSettingsForRecipient`
  (`apps/api-transportada/src/trips/domain/delivery-proof-settings.policy.ts`) já resolvem
  geral→destinatário. A T-série estende para três camadas, sem quebrar a assinatura de quem já
  chama a função de duas camadas — ver "Contratos/API/eventos".
- `DeliveryProofSection` (`apps/frontend-driver/src/modules/driver-trip/components/DriverStopCard.component.tsx:997`)
  já concentra toda a lógica de captura/validação — é o ponto de extração para RF-A2, não um
  componente novo do zero.

## Arquitetura e arquivos afetados

### Backend — comprovante (RF-C)

- `apps/api-transportada/src/database/company-delivery-proof-settings.schema.ts`
  - Nova tabela `deliveryProofSettingContractorOverrides` (mesma forma de
    `deliveryProofSettingOverrides`, troca `taxId` por `contractorId uuid`).
  - `deliveryProofSettingOverrides`: adicionar `foreignKey({ columns: [companyId, taxId],
foreignColumns: [deliveryClients.companyId, deliveryClients.taxId] })`.
- `apps/api-transportada/src/trips/domain/delivery-proof-settings.policy.ts`
  - `ResolveDeliveryProofSettingsParams` ganha `contractorOverride: DeliveryProofFieldSettings | null`.
  - `resolveDeliveryProofSettings`: `recipientOverride ?? contractorOverride ?? general ?? default`
    (renomear o `override` atual para `recipientOverride` — é um rename mecânico, contrato
    (`test/trip-schema` ou equivalente) confere o nome novo).
  - `ProofSettingsLookup` ganha `overridesByContractorId: ReadonlyMap<string, DeliveryProofFieldSettings>`.
- `apps/api-transportada/src/trips/infrastructure/drizzle-delivery-proof-settings.repository.ts`
  - `listOverrides`/`replaceOverrides` ganham o par para contratante (mesmas operações, tabela nova).
- `apps/api-transportada/src/trips/presentation/delivery-proof-settings.routes.ts` +
  `delivery-proof-settings.schema.ts`
  - Novo par `GET`/`PUT /company-settings/delivery-proof-contractor-overrides`
    (`API_COMPANY_SETTINGS_DELIVERY_PROOF_CONTRACTOR_OVERRIDES_PATH` em `shared/api.constant.ts`).
- `drizzle-current-driver-trip.repository.ts` (linhas 395-415, `selectDistinctOn`): adicionar select
  de `emitterTaxId` (papel `emitter` em `nfeParticipants`, hoje só `recipientTaxId` é selecionado),
  nos dois pontos (`toDriverDocument:835-844` e `listPendingProofs:328`). Com o `emitterTaxId` em
  mãos, resolver `contractors.taxId` via `findContractorByTaxId`/`findByTaxId` já existente — nenhum
  join novo, só reaproveitar o que a Fase 0 achou.

### Backend — ocorrência (RF-B)

- `apps/api-transportada/src/database/trip.schema.ts`
  - Duas tabelas novas: `companyOccurrenceTypeContractorOverrides`,
    `companyOccurrenceTypeRecipientOverrides` — cada uma com FK para `companyOccurrenceTypes.id`
    (`on delete cascade`, a exceção não sobrevive ao tipo) e para `contractors`/`deliveryClients`
    (`on delete restrict`, mesma regra do resto do produto).
- `apps/api-transportada/src/trips/domain/` — novo `occurrence-attachment-overrides.policy.ts`,
  reaproveitando a função de precedência de RF-D1.
- `apps/api-transportada/src/trips/application/save-occurrence-type.use-case.ts` — não muda a
  gravação do tipo em si; ganha um use case irmão (`replace-occurrence-type-attachment-overrides.use-case.ts`)
  para RF-B3.
- Rotas: `apps/api-transportada/src/trips/presentation/trip.routes.ts:174`
  (`OCCURRENCE_TYPES_PATH`) ganha `GET`/`PUT
/company-settings/occurrence-types/:occurrenceTypeId/attachment-overrides`, ao lado do CRUD já
  existente ali.
- `apps/api-transportada/src/trips/application/list-field-occurrence-types.use-case.ts:35-47`
  (linha 43: `attachmentMode: type.attachmentMode ?? 'off'`) passa a aplicar a resolução de três
  camadas — é o único ponto de leitura, reaproveitado pelo motorista e pelo escritório (T0.2), então
  as duas rotas ganham a exceção de uma vez só.

### Compartilhado (RF-D1)

- `apps/api-transportada/src/shared/resolve-with-overrides.policy.ts` (nome sugerido — a T-série
  pode achar lugar melhor dentro de `trips/domain` se as duas políticas não fizerem sentido fora de
  `trips`): função genérica
  `resolveWithOverrides<T>({ general: T | null, contractorOverride: T | null, recipientOverride: T | null, fallback: T }): T`.
  RF-C3 e RF-B2 chamam a mesma função — nenhuma reescreve `a ?? b ?? c ?? d` com as próprias
  palavras (evita a mesma divergência que a 209 documentou entre painel/app/legado).

### Frontend (painel) — telas de configuração

- `apps/frontend-transportada/src/modules/trip/components/TripDeliveryProofSettingsPanel.component.tsx`
  - Seção existente de exceção ganha rótulo "Por destinatário" explícito.
  - Nova seção "Por contratante", mesmo padrão de linha (campo de busca por CNPJ/nome do
    `contractors`, os 5 selects de modo).
  - `apps/frontend-transportada/src/modules/trip/shared/deliveryProofSettings.service.ts` e
    `apps/frontend-transportada/src/modules/trip/queries/useDeliveryProofSettings.query.ts` ganham
    o par de funções/query para o endpoint novo.
- `apps/frontend-transportada/src/modules/company-settings/components/OccurrenceTypeCatalogPanel.component.tsx`
  - Por tipo: seção colapsável "Exceções", duas listas (contratante/destinatário), mesmo componente
    de busca reaproveitado do painel de comprovante (extrair se ainda não for compartilhado).
  - `apps/frontend-transportada/src/modules/company-settings/hooks/useOccurrenceTypeCatalogPanel.hook.ts`
    ganha o estado e as chamadas do novo endpoint.

### Frontend (app do motorista) — o gate

- `apps/frontend-driver/src/modules/driver-trip/components/DriverStopCard.component.tsx`
  - Extrair de `DeliveryProofSection` (linhas ~997–1460) o miolo de captura (grade de botões,
    miniaturas, campos de nome/documento/quem recebeu) para um componente interno
    `ProofCaptureFields`, sem estado de "concluído" embutido — quem chama decide o que fazer quando
    os obrigatórios completam.
  - `DeliveryProofSection` (uso pós-entrega / Fotos pendentes) passa a montar `ProofCaptureFields` +
    o botão "Concluir" que já tem hoje (nunca bloqueia, spec 203/207 inalteradas ali).
  - Novo componente `PreDeliveryProofGate` (ou nome equivalente), usado dentro de `DocumentRow` no
    ramo "ainda não entregue": monta `ProofCaptureFields` + um botão "Confirmar entrega" desabilitado
    enquanto `listMissingProofFields` não é `[]`; ao habilitar e tocar, chama `onDeliver` (a mesma
    prop que já existe).
  - `DocumentRow`: onde hoje renderiza o botão "Entreguei" fixo (linha ~813), passa a decidir entre
    o botão de sempre (nada obrigatório) e `PreDeliveryProofGate` (algo obrigatório), calculando o
    plano com `resolveProofFormPlan(proofSettings)` — já importado no arquivo.
- `apps/frontend-driver/src/modules/driver-trip/shared/driverTrip.types.ts` — `deliveryProof` (e o
  tipo equivalente de `attachmentMode` do tipo de ocorrência, se ele já não carregar o valor
  resolvido) precisam já vir **resolvidos** (três camadas) no snapshot — nenhuma lógica de
  precedência entra no app do motorista, só leitura do valor pronto (mesma filosofia de
  "server-driven UI" do `web.md` §5).
- Legado `apps/frontend-transportada/src/modules/driver-trip/` (`/minha-viagem`) — mesma correção,
  por cópia de valor, enquanto `VITE_DRIVER_APP_URL` estiver desligada (mesmo padrão da spec 209
  RF7/D5). Se o interruptor já estiver ligado em produção no momento da execução, a T-série confirma
  com o usuário se ainda vale a pena replicar no legado.

### Backend — RF-B5, migração do vocabulário de ocorrência de parada

- **Achado da Fase 0** (`evidence.md`): os dois caminhos usam modelos de dado incompatíveis.
  Ocorrência de nota é `occurrenceTypeId` (FK para `company_occurrence_types`, com `attachmentMode`
  de verdade). Ocorrência de parada é `kind` — um enum FIXO em código,
  `TRIP_STOP_OCCURRENCE_KINDS` (`apps/api-transportada/src/database/trip.schema.ts:1265-1272`) e a
  cópia por valor `DRIVER_OCCURRENCE_KINDS`
  (`apps/frontend-driver/src/modules/driver-trip/shared/driverTrip.types.ts:169-176`) — nunca passou
  pelo catálogo, nunca teve `attachmentMode`.
- `apps/api-transportada/src/database/trip.schema.ts`:
  - `companyOccurrenceTypes` ganha a coluna `flow` (`text`, `document | stop`, `not null default
'document'`).
  - `tripStopOccurrences` ganha `occurrenceTypeId uuid` (FK para `companyOccurrenceTypes.id`,
    nullable) — `kind` **permanece** na tabela, sem uso novo além de leitura histórica.
- Migration (nova, sequência própria — depende de rodar depois que toda empresa já tem linha em
  `company_delivery_proof_settings`? Não: independente, só depende de `companies` existir):
  1. `ALTER TABLE company_occurrence_types ADD COLUMN flow ... DEFAULT 'document'` (aditiva, sem
     quebrar nenhuma leitura existente).
  2. Para cada `companies`, `INSERT INTO company_occurrence_types (..., flow) VALUES (..., 'stop')`
     — uma linha por valor de `TRIP_STOP_OCCURRENCE_KINDS`, `attachmentMode: 'optional'`, `name`
     traduzido a partir do texto que o app já usa hoje para rotular cada `kind` (a T-série confirma
     a string exata em `driverTrip.locale.json` ou onde o rótulo de `DRIVER_OCCURRENCE_KINDS` vive
     hoje, para não inventar um nome novo que o motorista não reconheça).
  3. `ALTER TABLE trip_stop_occurrences ADD COLUMN occurrence_type_id uuid REFERENCES
company_occurrence_types(id)`, seguido de `UPDATE` por `(company_id, kind)` → o `id` da linha
     inserida no passo 2 para aquela empresa e aquele `kind`.
  - **Rollback:** reverte o passo 3 (`DROP COLUMN occurrence_type_id`). Os 5 tipos inseridos no
    passo 2 **não são apagados** — mesmo raciocínio da RF-C2 (podem ter sido editados por um
    operador entre o deploy e um rollback tardio); ficam `active: false` em vez de removidos, se o
    rollback quiser desligá-los da tela.
- `apps/api-transportada/src/trips/application/save-occurrence-type.use-case.ts` e o schema Zod do
  `PUT` do tipo ganham o campo `flow` (opcional no `PUT`, obrigatório no `POST` de criação — a
  T-série confirma se criação de tipo novo é `POST` separado ou o mesmo `PUT` upsert).

### Frontend (painel) — RF-B5, campo `flow` no cadastro

- `OccurrenceTypeCatalogPanel.component.tsx` ganha o select `flow` (2 opções) no formulário de cada
  tipo, ao lado de `attachmentMode` — pedido explícito do usuário, mesma tela, nenhuma nova.

### Frontend (app do motorista) — RF-A5, botão único de ocorrência (D1)

- Novo componente `OccurrenceRegistrationPanel` (nome sugerido), substituindo os dois pontos de
  entrada atuais:
  - o painel inline de `onDocumentOccurrence` (`DriverStopCard.component.tsx:832-889`, hoje só uma
    lista de botões de tipo, sem foto);
  - `DriverStopOccurrenceForm.component.tsx` + `useStopOccurrenceForm.hook.ts` (hoje o único com
    foto, spec 209, escolhendo por `kind` fixo).
- Depois de RF-B5, os dois caminhos leem a **mesma** lista (`GET
/me/trips/current/occurrence-types`, já usada por `onDocumentOccurrence` e por
  `DriverNotDeliveredForm` — T0b confirmou isso). O componente novo escolhe o tipo dessa lista única
  e monta `ProofCaptureFields` (RF-A2) se `attachmentMode !== 'off'`, com o mesmo gate de
  habilitar/desabilitar do delivery.
- **Roteamento por trás, pelo campo `flow` do tipo escolhido** (não mais uma regra a descobrir): `flow:
document` → `handleDocumentOccurrence` (chamada direta, `trip_document_occurrences`); `flow: stop`
  → `reportStopOccurrence` (fila offline, dois itens, `trip_stop_occurrences` com
  `occurrence_type_id` no lugar de `kind`). O motorista nunca vê essa decisão.
- `handleDocumentOccurrence`/`reportStopOccurrence` (as duas funções que hoje já existem) continuam
  sendo os dois destinos possíveis — o componente novo só decide qual delas chamar a partir do
  `flow`, nenhuma delas muda de assinatura relevante (a segunda passa a mandar `occurrenceTypeId` em
  vez de `kind`).

### Backend + frontend (painel) — RF-E, verificação

- `apps/api-transportada/src/trips/presentation/` — nova rota `GET
/company-settings/settings-resolution` (nome do arquivo a decidir pela T-série; pode viver junto
  de `delivery-proof-settings.routes.ts` ou como arquivo próprio `settings-resolution.routes.ts`,
  dado que ela lê de dois domínios — comprovante e ocorrência). Implementação é composição pura: lê
  `general` + as duas listas de override de cada assunto (reaproveitando os repositórios já
  existentes de RF-C/RF-B) e aplica `resolveWithOverrides` (RF-D1) uma vez por campo/tipo — **sem
  escrita nenhuma**, é `GET` só.
- Frontend: tela nova ou aba dentro do módulo `company-settings` (a T-série decide o menor
  acréscimo, seguindo `web.md` §14) com dois campos de busca (`contractors`, `deliveryClients`, os
  mesmos componentes de busca das seções de exceção acima) e uma tabela de resultado, sem edição.

## Contratos/API/eventos

| Rota                                                          | Método  | Novo/alterado                                                                                                                                                                  |
| ------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/company-settings/delivery-proof-contractor-overrides`       | GET/PUT | novo                                                                                                                                                                           |
| `/company-settings/delivery-proof-overrides`                  | GET/PUT | inalterado (continua por destinatário)                                                                                                                                         |
| `/company-settings/occurrence-types/:id/attachment-overrides` | GET/PUT | novo                                                                                                                                                                           |
| `/company-settings/settings-resolution`                       | GET     | novo (RF-E1, só leitura)                                                                                                                                                       |
| `GET /me/trips/current`                                       | GET     | forma não muda; `document.deliveryProof` e o `attachmentMode` de cada tipo de ocorrência passam a refletir a resolução de 3 camadas quando há exceção de contratante aplicável |

Todas as rotas novas: `{ permission: 'settings.manage', scope: 'company' }`, mesmo shape de
resposta (`{ data: {...} }`), substituição total no `PUT` (nunca PATCH incremental) — mesmo padrão
de `deliveryProofOverridesSchema`.

## Dados, migration e rollback

1. **Migration 1 (comprovante, RF-C1/C2):**
   - Cria `delivery_proof_setting_contractor_overrides`.
   - Backfill: `INSERT INTO delivery_clients (company_id, tax_id, display_name, status)` para todo
     `(company_id, tax_id)` de `delivery_proof_setting_overrides` sem correspondente em
     `delivery_clients` (`ON CONFLICT DO NOTHING`, chave é o `unique` que já existe).
   - `ALTER TABLE delivery_proof_setting_overrides ADD CONSTRAINT ... FOREIGN KEY (company_id,
tax_id) REFERENCES delivery_clients (company_id, tax_id) ON DELETE RESTRICT ON UPDATE
CASCADE`.
   - **Rollback:** `DROP CONSTRAINT` da FK nova + `DROP TABLE
delivery_proof_setting_contractor_overrides`. As linhas de `delivery_clients` criadas pelo
     backfill **não são desfeitas** — são registros legítimos (mesmo que "vazios"), e apagá-las no
     rollback arriscaria remover um cliente de entrega que passou a ter uso real entre o deploy e um
     rollback tardio. Documentar isso explicitamente no `evidence.md`.
2. **Migration 2 (ocorrência, RF-B1):** cria as duas tabelas de override. Sem backfill — não existe
   dado anterior equivalente (é granularidade nova).
   **Rollback:** `DROP TABLE` das duas, sem efeito colateral (nada mais referencia essas tabelas).
3. **Migration 3 (ocorrência, RF-B5 — vocabulário de parada):**
   - `ALTER TABLE company_occurrence_types ADD COLUMN flow ... DEFAULT 'document'` (aditiva).
   - `INSERT` de 5 linhas por empresa (`flow: 'stop'`) — um `INSERT ... SELECT` cruzando `companies`
     com os 5 valores fixos, não um laço de aplicação.
   - `ALTER TABLE trip_stop_occurrences ADD COLUMN occurrence_type_id uuid REFERENCES
company_occurrence_types(id)` + `UPDATE` por `(company_id, kind)`.
   - **Rollback:** `DROP COLUMN occurrence_type_id` de `trip_stop_occurrences`. As 5 linhas por
     empresa em `company_occurrence_types` **não são apagadas** (mesmo raciocínio da Migration 1) —
     o rollback pode marcá-las `active: false` se quiser tirá-las da tela, mas não faz `DELETE`.
   - Roda **antes** da Migration 2 (RF-B1 assume que `company_occurrence_types` já tem `flow` e os
     5 tipos de parada semeados, caso a exceção por contratante/destinatário precise valer para eles
     também — não há razão para excluí-los).

Ambas seguem `code-standart.md` §8 (VARCHAR em vez de ENUM nativo para `attachment_mode`, mesmo
`DELIVERY_PROOF_FIELD_MODES`/`AttachmentMode` já usado) e a regra local de migration aditiva por
padrão (`api-transportada/CLAUDE.md`: migration à mão precisa de `snapshot.json`, `db:generate`
confere contra o schema TS antes de qualquer commit).

## Segurança e tenant

- Toda tabela nova carrega `companyId` e todo índice único/FK inclui o tenant.
- `contractorId`/`taxId` nunca em log (`security.md` §1) — nenhuma rota nova loga o corpo da
  requisição inteiro (auditoria via `auditLogs`, como as rotas irmãs).
- Teste negativo de isolamento obrigatório para as 4 tabelas novas/alteradas
  (`test/*-schema/tenant-safety.contract.ts`).

## Idempotência e concorrência

- `PUT` das duas rotas novas é substituição total, idempotente por natureza (reenviar a mesma lista
  produz o mesmo estado).
- Sem concorrência nova a tratar: são tabelas de configuração, editadas por operador humano no
  painel, sem fila nem replay.

## Observabilidade

- Nenhum log novo estruturado necessário além do que `settings.manage` já audita.
- A resolução de 3 camadas no snapshot do motorista é função pura — sem I/O, sem log próprio.

## Estratégia de testes

- **Contrato (API), antes da implementação:**
  - `resolveDeliveryProofSettings`/`resolveWithOverrides` com as 4 combinações de presença
    (nenhum override, só contratante, só destinatário, os dois — confere que destinatário vence).
  - Rotas novas: CRUD feliz, 404 fora do tenant, `settings.manage` exigida.
  - Migration: teste de integração que roda a migration 1 contra um banco com override "órfão" e
    confere que `delivery_clients` ganha a linha e a FK não quebra (`make migration-test`).
- **Contrato (app do motorista):**
  - Caso "nada `required`": `DocumentRow` renderiza o botão de sempre, `onDeliver` dispara no
    primeiro toque (regressão zero).
  - Caso "`photo: required`": botão nasce desabilitado, habilita só depois de `attach('photo', ...)`,
    `onDeliver` não é chamado antes disso.
  - Caso lançamento tardio: o gate se aplica igual (RF-A4).
  - RF-A5: lista única mostra tipos `flow: document` e `flow: stop` juntos; "Registrar" desabilitado
    sem foto quando `required`, habilita ao capturar sem esperar upload; confirmar chama a função
    certa por `flow` (nunca as duas, nunca nenhuma).
  - RF-B5 no app: `reportStopOccurrence` passa a mandar `occurrenceTypeId`, não `kind`.
- **Contrato (painel):** as duas telas, incluindo o caso "duas exceções, uma para o mesmo
  contratante" sendo rejeitado pelo `unique`; a tela de verificação (RF-E) com as 4 combinações de
  P4/P6.
- **E2E/smoke:** não é obrigatório para esta spec (a tela de configuração já tem cobertura de
  Playwright equivalente para o painel de comprovante existente; replicar o padrão, não inventar um
  novo).

## Riscos

- ~~RF-C3 depende de um call site que a investigação não abriu por completo~~ — **resolvido pela
  Fase 0**: `drizzle-current-driver-trip.repository.ts:835-844` e `:328`. Ver "Contexto e premissas".
- **A migration 3 (RF-B5) precisa do rótulo exato de cada `kind` para nomear o tipo novo** — errar o
  texto faz o motorista ver um nome diferente do que já reconhece nos 5 botões de "Deu problema".
  Mitigação: a T-série lê o valor literal em `driverTrip.locale.json` (ou onde o rótulo de
  `DRIVER_OCCURRENCE_KINDS` estiver hoje) antes de escrever o `INSERT`, nunca traduz de cabeça.
- **Extrair `ProofCaptureFields` de `DeliveryProofSection` é a parte de maior risco de regressão**
  (30+ contratos hoje cobrem esse componente: `proof-capture`, `not-delivered`,
  `stop-occurrence-photo`, `location-sharing` compartilha arquivo). Mitigação: extração é a
  **primeira** tarefa da frente A, rodando o `check` da app antes de tocar em qualquer
  comportamento novo — se a extração sozinha não deixar os testes existentes verdes, para ali antes
  de somar o gate em cima.
- **Ambiguidade se o legado `/minha-viagem` ainda precisa da RF-A** — depende do estado de
  `VITE_DRIVER_APP_URL` em produção no momento da execução, que muda com o tempo. A T-série confirma
  com o usuário antes de tocar no legado.
- ~~RF-A5/D1 depende de uma pergunta técnica que a Fase 0 ainda não respondeu~~ — **resolvido**: a
  Fase 0 achou que os dois caminhos usam modelos de dado incompatíveis (não só "falta uma regra"), e
  o usuário decidiu migrar o enum fixo para o catálogo (RF-B5). O risco que sobra é de execução, não
  de decisão: a Migration 3 mexe em `trip_stop_occurrences` (dado gravado de viagens reais) — rodar
  primeiro em banco de teste com dados de exemplo (`make migration-test`) antes de cogitar staging.
