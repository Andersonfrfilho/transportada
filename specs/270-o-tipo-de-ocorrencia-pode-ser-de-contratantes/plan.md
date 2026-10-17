# Plano — 270 O tipo de ocorrência pode ser de contratantes

## Contexto e premissas

O levantamento contra `origin/staging` (e79e26171, 2026-10-16) está em [`evidence.md`](evidence.md) § Levantamento. Os
fatos que moldam o plano:

- **Já existe o molde.** O conjunto de momentos da 246 mora numa tabela de ligação sob o tipo
  (`company_occurrence_type_moments`, FK composta com `CASCADE`), e a exceção por contratante aponta para
  `contractors (company_id, id)` com `RESTRICT`. A tabela nova segue os dois.
- **A nota tem no máximo uma contratante**: o casamento é pelo CNPJ do emitente e `contractors (company_id, tax_id)` é
  único. Sem casamento, `contractorId` é nulo.
- **Contratante não se apaga**: `contractor.routes.ts` só tem GET, POST e PATCH (status `active`/`inactive`).
- **Tipo não se apaga**: sai com `active: false`; as ocorrências apontam para ele com `RESTRICT`.
- **O `PUT` grava um tipo por vez** (`occurrenceTypeId: null` cria), schema `.strict()`, campo ausente não altera
  (242 RF2).
- **As listas confiam no `contractorId` da query** (`me-trip.routes.ts:860`, `trip-field-office-occurrence.routes.ts:86`)
  e o lote do escritório não resolve contratante. O app do motorista, quando o retrato não traz os tipos da nota, cai na
  lista geral (`find-current-driver-trip.use-case.ts:57-64`; `occurrenceRegistration.service.ts:45-54`).
- **O painel escolhe os tipos do galpão no cliente**: a separação usa `GET /company-settings/occurrence-types` e filtra
  `active`/etapa no navegador (`TripOccurrences.component.tsx:136-138`, `separationOccurrenceButton.service.ts:28`). O
  painel não conhece a contratante da nota (`TripDocument` não tem `contractorId`). Essa tela muda para uma lista do
  servidor por nota.
- **Guarda estrito no painel:** `isOccurrenceType` (`tripResponse.validation.ts:1947-1990`) reprova chave fora da lista e
  `occurrenceTypesFromApi` (:1132-1138) derruba a lista inteira. Chave nova no tipo antes do painel tolerante derruba a
  aba Tipos e o detalhe da viagem. **Por isso a Fase 1 vai a produção antes da API.** O guarda da exceção
  (`occurrenceAttachmentOverrides.validation.ts:50-80`) e o do app do motorista (`driverTrip.types.ts:515-585`) toleram
  chave nova.
- **Recusa no app:** todo 4xx que não é 408/429 vira recusa permanente com `rejectionCause = "<status> <code>"`; código
  sem rótulo aparece cru (`rejectionCauseLabel.service.ts:14-24`, `DriverOccurrenceDetail.page.tsx:118`). O código
  novo precisa de rótulo.

### Ordem com a 269

A 269 (`work/spec-269`, ainda fora de `staging`) acrescenta `contractor_mail_template_id`/`contractor_mail_template_selected_at` ao tipo e à exceção por contratante e
mexe nos mesmos arquivos: `occurrence.schema.ts` (schema `.strict()` do `PUT`), `save-occurrence-type-values.mapper.ts`,
`delivery-proof-read.support.ts` (leitura/escrita do tipo), a lista `allowed` de `isOccurrenceType`, o
`OccurrenceTypeRow.component.tsx` (blocos do editor) e o `OccurrenceExceptionForm.component.tsx`. **A 270 é implementada
depois da 269 e rebaseada sobre ela**: a T0.3 confere se a 269 já entrou em `staging`; se não, a Fase 1 começa por
`git rebase work/spec-269` (ou espera o merge). A migration da 270 nasce com carimbo **posterior** ao da migration da
269, e a publicação da 270 vai depois da 269 em cada etapa. Conflitos esperados: a lista `allowed` do guarda, o schema
do `PUT` e a ordem dos blocos do editor (o "Vale para" entra logo depois de Identidade e Momentos; o modelo de e-mail da
269 fica onde a 269 o pôs).

## Decisões de desenho (a T0.2 valida com `architect`)

| #   | Escolha                                                                                                                                                                                                                                                                                                                                                                            | Alternativa rejeitada                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| D1  | Coluna explícita `contractor_scope varchar(16) NOT NULL DEFAULT 'all'` com CHECK gerada de `OCCURRENCE_TYPE_CONTRACTOR_SCOPES`.                                                                                                                                                                                                                                                    | "Restrito" = lista não vazia (lista esvaziada por engano abriria o tipo para todos).                                  |
| D2  | Tabela `company_occurrence_type_contractors`; FK do tipo `CASCADE`, FK da contratante `RESTRICT`. Invariante `listed` ⇔ ≥1 linha, `all` ⇔ 0 linha, no caso de uso, com o tipo `FOR UPDATE`; o leitor ignora as linhas quando `all` (defesa).                                                                                                                                       | `uuid[]` no tipo; escopo na exceção por contratante.                                                                  |
| D3  | O escopo vale em registro **com nota** (motorista, escritório, lote, galpão, WhatsApp). Parada ignora. Tipo só de parada = conjunto de momentos ⊆ {`stop`}. `stop` combina com `office`/`separation`, nunca com `document` (246); num tipo `stop`+`office` o escopo vale no lote do escritório e não na parada. Tipo só de `stop` não pode ser `listed` (400 `OCCURRENCE_TYPE_CONTRACTOR_SCOPE_NEEDS_DOCUMENT`).                                                                                                                                                         | Na parada, oferecer o tipo se ao menos uma nota da parada for de contratante listada (ver `evidence.md` Q1).          |
| D4  | Nota sem contratante e lista sem nota → só `all`.                                                                                                                                                                                                                                                                                                                                  | Mostrar tudo quando não se sabe a contratante (abriria o tipo restrito no fallback do app).                           |
| D5  | As listas recebem `documentId` (o servidor lê a contratante) e passam a filtrar o escopo por ele; `contractorId` da query continua só para a exceção. O lote do escritório com notas de várias contratantes oferece a **interseção** (tipos válidos para todas as notas escolhidas).                                                                                               | Confiar no `contractorId` da query; oferecer a união e recusar parte do lote.                                         |
| D6  | Guarda única `assertOccurrenceTypeAvailableForContractor` chamada em todo caso de uso que registra com nota, logo depois da guarda de momento da 246, antes de qualquer escrita; 422 `OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR`. O lote é validado inteiro antes de gravar: uma nota fora do escopo recusa o lote (`details.documentIds`, só ids).                             | Só esconder na tela; gravar o lote parcial.                                                                           |
| D7  | Resposta do tipo: `contractorScope: 'all' \| 'listed'` e `contractors: [{ id, displayName, taxId, status }]` (ordenadas por nome). Entrada do `PUT`: `contractorScope` e `contractorIds` opcionais e **juntos** (um sem o outro → 400); ausentes não alteram; `all` com `contractorIds` não vazio → 400. Contratante de outra empresa ou inexistente → 404 `CONTRACTOR_NOT_FOUND`. | Mandar só ids na resposta (o chip precisaria de outra consulta).                                                      |
| D8  | Passo de dados Spani por script versionado com `--confirm` (molde do `scripts/whatsapp-location-redact.ts`, spec 245), que chama o **mesmo** serviço de gravação do escopo (regra de seed por caso de uso). Sem migration de dados.                                                                                                                                                | SQL solto no `railway ssh`; migration de dados (ficaria valendo para todo deploy novo, inclusive o de outro cliente). |

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

| Camada    | Arquivo (novo ou alterado)                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constante | `src/shared/trip-occurrence.constant.ts`: `OCCURRENCE_TYPE_CONTRACTOR_SCOPE` / `OCCURRENCE_TYPE_CONTRACTOR_SCOPES`                                                                                                                                                                                                                                                                                                      |
| Schema    | `src/database/trip.schema.ts` (coluna + CHECK) e `src/database/occurrence-type-contractor.schema.ts` (tabela nova, no molde de `occurrence-type-moment.schema.ts`) + migration                                                                                                                                                                                                                                          |
| Domínio   | `src/trips/domain/occurrence-type-contractor-scope.policy.ts` (pura): `isOccurrenceTypeAvailableForContractor({ scope, contractorIds, contractorId })` e `validateOccurrenceTypeContractorScope({ scope, contractorIds, moments })` (todos os erros de uma vez)                                                                                                                                                         |
| Erros     | `src/trips/domain/trip.error.ts`: `OccurrenceTypeNotAvailableForContractorError` (422), `OccurrenceTypeContractorScopeEmptyError` (400), `OccurrenceTypeContractorScopeNeedsDocumentError` (400), `OccurrenceTypeContractorScopeInvalidError` (400, par incompleto ou `all` com lista); reusa `CONTRACTOR_NOT_FOUND` se existir (T0.1)                                                                                  |
| Gravação  | `occurrence.schema.ts` (chaves novas), `save-occurrence-type.use-case.ts`, `save-occurrence-type-values.mapper.ts`, `delivery-proof-read.support.ts` (`saveOccurrenceType`: trava o tipo, confere contratantes da empresa com `FOR KEY SHARE`, troca as linhas; `listOccurrenceTypes`: escopo + contratantes numa consulta)                                                                                             |
| Listas    | `drizzle-current-driver-trip.repository.ts` (`readFieldOccurrenceTypes`/`resolveFieldOccurrenceTypes`: filtra pelo `contractorId` já lido da nota), `list-field-occurrence-types.use-case.ts` (`selectFieldOccurrenceTypes` com `documentId`/`documentIds`), `me-trip.routes.ts:832-860`, `trip-field-office-occurrence.routes.ts:71-90`, (`cargo-arrival-occurrence-read.query.ts` fica **sem mudança**: recebimento é seed-only, não entra no escopo) |
| Registro  | guarda D6 em: `driver-occurrence-assessment.service.ts` (motorista, nota), `office-occurrence-batch.service.ts` (lote), `register-trip-occurrence.use-case.ts` (galpão e fluxo do operador pelo WhatsApp), os dois fluxos do WhatsApp (`register-driver-flow-actions.ts`, `register-operator-trip-flow-actions.ts`: lista filtrada pela contratante da nota do contexto; no 422 responde "Este tipo não vale para a contratante desta nota" e volta à lista). O recebimento de carga está **fora** (tipos seed-only, momentos `[]`, sempre `all`). A T0.1 lista **todo** chamador de registro com nota                                                                                           |
| Separação | lista por nota para o galpão: **rota nova** `GET /trips/:tripId/documents/:documentId/occurrence-types` (`trip.manage`, momento `separation`; nota da viagem e da empresa, senão 404). A visibilidade do botão continua lendo o catálogo; o formulário mostra estado vazio quando a nota não recebe tipos                                                                                                                                                                                                                                            |
| Script    | `scripts/occurrence-type-contractor-scope-assign.ts` + `src/trips/application/assign-occurrence-types-to-contractor.service.ts` (Fase 6)                                                                                                                                                                                                                                                                                |

### Painel (`apps/frontend-transportada`)

- **Fase 1 (tolerância):** `trip/shared/tripResponse.validation.ts` — `contractorScope` e `contractors` entram em
  `allowed` de `isOccurrenceType`, opcionais; valor de `contractorScope` desconhecido é aceito como texto (a tela trata
  como `all`). O guarda da exceção já tolera.
- **Fase 3 (telas):**
  - editor do tipo: `OccurrenceTypeContractorScope.component.tsx` (novo, bloco depois de Momentos em
    `OccurrenceTypeRow.component.tsx:72-120` e no `OccurrenceTypeCreateForm`), com rádio "Vale para" e o **`MultiSelect`
    que já existe** (`components/ui/multi-select.tsx`, já usado para contratantes em
    `delivery-clients/components/ContractorFilterBar.component.tsx:48`). Opções de `useContractorsQuery` com rótulo
    "Nome · CNPJ" (o mesmo `occurrenceExceptionPeople.service.ts:62-75`) — a busca acha nome e CNPJ. Contratante
    inativa ou fora da página carregada aparece como "órfã" marcada (`multiSelect.service.ts:29-37`), e o aviso
    `contractorsTruncated` aparece como na exceção. Tipo só de parada: bloco travado com a frase do RF5;
  - chip "Só: …" em `OccurrenceTypeSummary.component.tsx:82-104` (classe `styles.tag`), com título completo;
  - aviso na exceção (`OccurrenceExceptionForm`/`OccurrenceExceptionItem`) quando a contratante não está na lista;
  - separação: `TripOccurrences.component.tsx` e `separationOccurrenceButton.service.ts` deixam de filtrar tipos no
    cliente e usam a lista do servidor por nota;
  - lote do escritório: `FieldOccurrenceDialog.component.tsx` manda os `documentIds` escolhidos e trata o 422.

### App do motorista (`apps/frontend-driver`)

- Sem mudança de guarda (tolerante). `rejectionCauseLabel.service.ts`: rótulo para
  `OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR` e locales (`driverTrip.locale.json`, `driverTrip.en.locale.json`);
  `DriverOccurrenceDetail.page.tsx:118` passa a usar o rótulo.
- Teste de contrato: tipo restrito ausente do retrato numa nota de outra contratante não aparece no registro, e o
  fallback (`occurrenceRegistration.service.ts:45-54`) não o traz (a lista geral já vem só com `all`).
- O cache local do catálogo (`occurrenceTypesCache.service.ts`, `localStorage` `...occurrence-types.v1`) guarda a
  resposta do servidor, que agora vem filtrada; não precisa de versão nova.

## Dados

Migration aditiva `drizzle/<carimbo posterior ao da 269>_occurrence_type_contractor_scope/`:

```sql
ALTER TABLE company_occurrence_types
  ADD COLUMN contractor_scope varchar(16) NOT NULL DEFAULT 'all';
ALTER TABLE company_occurrence_types
  ADD CONSTRAINT company_occurrence_types_contractor_scope_check
  CHECK (contractor_scope IN ('all', 'listed'));

CREATE TABLE company_occurrence_type_contractors (
  company_id uuid NOT NULL,
  occurrence_type_id uuid NOT NULL,
  contractor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_occurrence_type_contractors_pk
    PRIMARY KEY (company_id, occurrence_type_id, contractor_id),
  CONSTRAINT company_occurrence_type_contractors_type_fk
    FOREIGN KEY (company_id, occurrence_type_id)
    REFERENCES company_occurrence_types (company_id, id) ON DELETE CASCADE,
  CONSTRAINT company_occurrence_type_contractors_contractor_fk
    FOREIGN KEY (company_id, contractor_id)
    REFERENCES contractors (company_id, id) ON DELETE RESTRICT
);
CREATE INDEX company_occurrence_type_contractors_contractor_idx
  ON company_occurrence_type_contractors (company_id, contractor_id);
```

Rollback: `DROP TABLE company_occurrence_type_contractors; ALTER TABLE company_occurrence_types DROP CONSTRAINT ...;
DROP COLUMN contractor_scope` — perde as listas de propósito (volta tudo a "geral"). A CHECK é gerada da constante no
schema Drizzle; `db:generate` depois da migration dá `no_changes`.

## Contratos

```ts
// GET /company-settings/occurrence-types — cada tipo ganha
{ contractorScope: 'all' | 'listed',
  contractors: { id: string; displayName: string; taxId: string; status: 'active' | 'inactive' }[] }

// PUT /company-settings/occurrence-types — chaves opcionais, juntas
{ contractorScope?: 'all' | 'listed', contractorIds?: string[] /* únicos, ≤ 200 */ }
// 400 OCCURRENCE_TYPE_CONTRACTOR_SCOPE_EMPTY · 400 OCCURRENCE_TYPE_CONTRACTOR_SCOPE_NEEDS_DOCUMENT
// 400 OCCURRENCE_TYPE_CONTRACTOR_SCOPE_INVALID · 404 CONTRACTOR_NOT_FOUND (outra empresa também)

// listas de tipos para registrar: parâmetro novo
GET /me/trips/current/occurrence-types?documentId=<uuid>
GET /trips/occurrence-types/field?documentIds=<uuid>,<uuid>
// sem documentId(s): só tipos 'all' (e os de parada, que ignoram escopo)

// registro com nota fora do escopo
422 { error: { code: 'OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR', message } }
// lote: details.documentIds (só ids)
```

O retrato `GET /me/trips/current` não muda de forma: `documents[].occurrenceTypes` só passa a vir filtrado.

## Passo de dados — todos os tipos para a Spani (Fase 6)

Pedido do dono (chat 2026-10-16): depois da feature em produção, todo tipo existente vira `listed` com só a contratante
"Spani".

- **Script:** `bun run scripts/occurrence-type-contractor-scope-assign.ts --company <uuid> --contractor-name spani`
  (só lista) e o mesmo com `--confirm` (grava). Roda no container da API por
  `railway ssh -e <ambiente> -s api -- bun run scripts/...`, sem imprimir segredo nem variável de ambiente.
- **Casamento:** `contractors.display_name ILIKE '%spani%'` na empresa. **Exatamente uma** contratante → segue. Zero ou
  mais de uma → para sem gravar e lista o que achou (id, nome, status — sem CNPJ completo). Staging hoje tem só "RIBER
  PET…" e "COMERCIAL ZARAGOZA…": o esperado lá é **parar e avisar** que a Spani não existe; o script **não a cria**.
- **O que grava:** todo tipo da empresa (ativo ou inativo) que tem algum momento de nota passa a `listed` = [Spani],
  pelo mesmo serviço do `PUT`. Tipo só de parada fica `all` e sai na listagem como "ignorado (parada)". Idempotente: tipo
  já `listed` = [Spani] não é tocado; tipo `listed` com outras contratantes é **relatado e não tocado** sem `--replace`
  (a T6.1 decide se `--replace` existe; padrão: não existe, e o caso para para o dono).
- **Saída (antes/depois):** por tipo: id, nome, momentos, ativo, escopo antes, escopo depois. Mais duas contagens para o
  dono decidir: notas em viagem aberta de **outras** contratantes e notas sem contratante identificada — depois do passo,
  essas notas ficam **sem nenhum tipo de nota** para registrar (só os tipos de parada continuam). Tudo vai ao
  `evidence.md`.
- **Parada obrigatória:** a T6.2 (staging) e a T6.3 (produção) só rodam o `--confirm` depois de o dono ver o dry-run e
  confirmar o ambiente e a contratante encontrada.

## Riscos

- **Notas sem tipo** depois do passo da Spani (ver acima) — medido no dry-run, decidido pelo dono.
- **Fila offline antiga:** registros enfileirados antes da troca de escopo voltam recusados — esperado (RF7); o motorista
  vê o motivo.
- **Painel antigo e API nova:** coberto pela Fase 1 em produção antes da Fase 2.
- **Conflito com a 269:** coberto pela ordem (T0.3).

## Ajustes da revisão de arquitetura (T0.2 — veredito: aprovado com mudanças)

- **Guardas, em ordem, em todo lugar:** tipo existe/ativo → momento → nota alcançável/da empresa (404 como hoje) →
  escopo (422) → exigência da 246 → qualquer escrita ou upload.
- **Listas:** `GET /me/trips/current/occurrence-types` não ganha parâmetro (momento `document` → só `all`; parada sem filtro).
  `listOccurrenceTypes` lê só os `contractorIds` por tipo numa consulta (`withOccurrenceTypeContractorIds`, como
  `withOccurrenceTypeMoments`); nome/CNPJ/status só em `GET /company-settings`. As listas de rua nunca carregam escopo nem
  contratantes (teste de contrato).
- **Fila offline:** 4xx não 408/429 já é recusa permanente; só o rótulo (T4.1). O painel mapeia `details.documentIds`
  para números de nota no cliente.
- **Migration:** timestamp posterior a `20261016165917`. Reusa `CONTRACTOR_NOT_FOUND`
  (`delivery-clients/domain/delivery-client.error.ts:33`).
- **Editor:** "Vale para" depois de `OccurrenceTypeMoments` e antes do bloco de e-mail da 269; escolha de contratantes em
  `components/ui/multi-select.tsx` (multi-seleção com busca, requisito do dono).
