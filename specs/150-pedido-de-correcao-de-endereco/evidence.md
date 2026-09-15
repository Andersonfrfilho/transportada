# Evidence

## T101

Migration aditiva `20260915162953_address_correction_requests` (gerada por `bun run db:generate
--name address_correction_requests` a partir de `src/database/address-correction.schema.ts`, exportado
em `database.schema.ts`), com `rollback.sql` manual. Amplia
`contractor_mail_threads_subject_type_check` para incluir `address_correction`
(`contractor-mail.schema.ts`). Pasta nova de `drizzle/` inclui `snapshot.json` (regra do
`apps/api-transportada/CLAUDE.md` — "migration à mão é permitida, sem snapshot não"). Nome da
migration adicionado à lista explícita em
`test/database-migration/static-migration.contract.ts`.

Comandos:

```
bun run typecheck
```

Resultado: `tsc --noEmit` passou nas 6 apps (api, worker, cron, frontend-transportada,
frontend-client, frontend-landing), sem erro.

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test test/database-migration.contract.test.ts --timeout 120000
```

(dentro de `apps/api-transportada`; Postgres do Docker em 65432 indisponível — I/O error — usado o
Postgres nativo descartável em 65433, conforme instrução da task)
Resultado: **58 pass, 1 fail**, 1078 `expect()`. A falha é em
`Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration`
(`test/database-migration/cte-profile-output-constraints.assertion.ts:134`), esperando SQLSTATE
`23503` e recebendo `23001` — divergência de versão do Postgres nativo local para violação de
`RESTRICT`, não relacionada a esta task (nenhum arquivo de `cte-profiles`/`cte-profile-output` foi
tocado nesta task; `git diff --stat` mostra só `contractor-mail.schema.ts`,
`database.schema.ts` e `static-migration.contract.ts`, além dos arquivos novos). O rollback da
migration nova (`address_correction_requests`) e a nova entrada na lista de diretórios passaram sem
erro.

```
bun run --cwd apps/api-transportada test
```

Resultado: **5820 pass, 23 skip, 0 fail**, 20539 `expect()`, 172 arquivos (sem
`DRIZZLE_TEST_DATABASE_URL`, os testes de integração Postgres pulam — comportamento documentado no
`CLAUDE.md` da raiz).

### Arquivos alterados

- `apps/api-transportada/src/database/address-correction.schema.ts` (novo)
- `apps/api-transportada/src/database/contractor-mail.schema.ts` (CHECK ampliado)
- `apps/api-transportada/src/database/database.schema.ts` (import/export/registro da tabela nova)
- `apps/api-transportada/drizzle/20260915162953_address_correction_requests/migration.sql` (novo,
  gerado)
- `apps/api-transportada/drizzle/20260915162953_address_correction_requests/rollback.sql` (novo)
- `apps/api-transportada/drizzle/20260915162953_address_correction_requests/snapshot.json` (novo,
  gerado)
- `apps/api-transportada/test/database-migration/static-migration.contract.ts` (lista explícita)

## T102

Contrato de tenant contra Postgres: `apps/api-transportada/test/integration/address-correction-repository.integration.ts`
(banco descartável com todas as migrations, apagado no fim), declarado em `test:integration` do
`package.json` da API. Prova: a contratante sai de `contractors.tax_id` dentro da `companyId`
informada (o CNPJ só cadastrado em outra empresa não é encontrado); o rascunho de uma empresa não
aparece em `findByAddressKeys`/`listDraftsByContractor` da outra, e o `upsertDraft` da outra cria
linha própria sem tocar no dele; salvar de novo atualiza o mesmo registro; pedido `sent` não é
reaberto (o rascunho novo é outra linha); a FK composta recusa `contractor_id` de outra empresa.

Postgres nativo descartável em `127.0.0.1:65433`, de dentro de `apps/api-transportada`:

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test ./test/integration/address-correction-repository.integration.ts --timeout 120000
```

**Vermelho** (antes da porta e do repositório existirem):

```
error: Cannot find module '../../src/address-correction/infrastructure/drizzle-address-correction.repository.js'
 0 pass
 1 fail
 1 error
```

**Verde** (depois de `address-correction.port.ts` e `drizzle-address-correction.repository.ts`):
**5 pass, 0 fail**, 17 `expect()` — não pulou (5 testes executados contra o banco).

O `upsertDraft` usa `on conflict (company_id, address_key) where status = 'draft'`, o índice
parcial da T101: um pedido `sent` fica fora do alvo e o insert cria linha nova.

Gates:

- `bun run typecheck` (raiz): verde.
- `bun run --cwd apps/api-transportada test`: **5820 pass, 23 skip, 0 fail**, 20539 `expect()`,
  172 arquivos.
- Prettier nos arquivos tocados: verde.

### Arquivos alterados

- `apps/api-transportada/src/address-correction/application/address-correction.port.ts` (novo)
- `apps/api-transportada/src/address-correction/infrastructure/drizzle-address-correction.repository.ts` (novo)
- `apps/api-transportada/test/integration/address-correction-repository.integration.ts` (novo)
- `apps/api-transportada/package.json` (entrada em `test:integration`)

## T103

`PUT /address-correction-requests/:addressKey` e `GET /address-correction-requests`, `settings.manage`,
padrão de `defineRoute`/Zod da `addresses`/`routing` (`address-report.routes.ts`,
`route-suggestion.routes.ts`).

### O que ficou

- **Validação na fronteira** (`address-correction-request.schema.ts`, Zod, padrão de
  `route-suggestion-request.schema.ts` + `parseBody`/`invalidRequest` de
  `http/request-parsing.service.ts`, que já converte `result.error.issues` em `details[]` — **todos**
  os campos inválidos de uma vez, sem código próprio para isso): CEP 8 dígitos aceito com ou sem
  hífen (normalizado antes da forma), UF das 27 siglas (`BRAZILIAN_STATE_IBGE_PREFIX`, novo,
  `address-correction/domain/brazilian-state.constant.ts` — não havia tabela de UF→prefixo IBGE no
  repo), `cityCode` de 7 dígitos cujos 2 primeiros batem com a UF proposta (`.superRefine`, erro no
  campo `cityCode`), `street`/`number`/`city` não vazios com teto de tamanho. O corpo é `.strict()`:
  mandar `reported`/`reason*` no payload é `400`, não ignorado — a fronteira só aceita `proposed`.
- **O "como veio" e o motivo nunca vêm do cliente**
  (`save-address-correction-draft.use-case.ts`): lidos do `AddressReportRepository.read({companyId})`
  já existente (reaproveitado, **sem** SQL nova nem método novo nesse port — a task previa "adicionar
  um método se preciso", mas o relatório inteiro já cabe numa leitura e a procura por `addressKey` é
  feita em memória) — `cityCode` sai do primeiro segmento da própria `addressKey`
  (`cityCode|postalCode|number`, `stop-address-key.ts`), o resto de `note*`. `addressKey` fora do
  relatório da empresa → `AddressCorrectionAddressNotFoundError` (404,
  `ADDRESS_CORRECTION_ADDRESS_NOT_FOUND`).
- **A contratante é resolvida pelo CNPJ do emitente daquela linha** via
  `AddressCorrectionRepositoryPort.findContractorByTaxId` (já existia, T102). Sem cadastro →
  `AddressCorrectionContractorNotFoundError`. **Status escolhido: `404`**, não `409` — segue
  `ContractorNotFoundError` (`delivery-clients/domain/delivery-client.error.ts`), o mesmo caso de
  "procurei o cadastro pelo documento e ele não existe"; `409` no repo é para pré-condição de outro
  recurso que o cliente já sabe existir e está no estado errado (`MdfeFiscalSettingsMissingError`).
  Justificado no comentário do próprio `address-correction.error.ts`.
- **`recipientName: null`** nesta task, como previsto (T104 é quem faz o relatório expor o nome).
- **`GET`** adicionou `AddressCorrectionRepositoryPort.listByCompany` (novo método, implementado em
  `DrizzleAddressCorrectionRepository` com o mesmo padrão de `findByAddressKeys` — `where company_id
= :companyId`, sem SQL duplicada de outro lugar) porque nenhum método existente lista **todo**
  status de uma empresa sem filtrar por `contractorId` ou por uma lista de `addressKeys`, que é
  exatamente o que a aba precisa para cruzar com o relatório.
- Resposta (`serializeAddressCorrectionRequest`) nunca expõe `companyId`/`contractorId`/`actorUserId`
  — chaves internas, não produto. `no-store` nos dois métodos, como `address-report`.
- `addressKey` no caminho (`:addressKey`, `pathParameterFormat: 'raw'`) porque carrega `|`
  (`cityCode|postalCode|number`) — mesmo motivo e mesmo padrão de forma
  (`ADDRESS_KEY_PATTERN = /^\d*\|\d{8}\|[^|]{1,60}$/u`) de `geocoded-addresses/:addressKey`
  (`route-suggestion.routes.ts`); chave malformada é `400` antes de tocar no banco.
- Rotas registradas em `src/main.ts`, ao lado de `createAddressReportRoutes`. Sem OpenAPI/lista de
  rotas documentadas neste repo (não existe contrato desse tipo, confirmado por busca).
- Nada de endereço/CEP em log: nenhum `logger.*`/`console.*` toca nesses módulos.

### Testes (vermelho não fazia sentido aqui — rota nova, sem comportamento prévio a proteger)

`test/address-correction-http.contract.test.ts` → `test/address-correction-http/routes.contract.ts`
(fakes, padrão de `test/addresses-http/routes.contract.ts` +
`test/fixtures/address-correction-http.fixture.ts`, novo, no modelo de
`test/fixtures/postal-code-http.fixture.ts`): `GET` devolve o estado por `addressKey` da empresa do
token e nunca cacheia; `PUT` grava com o `proposed` do corpo e devolve `200 { data }`; corpo com
`reported`/`reason*` é recusado (a fronteira não aceita); CEP com/sem hífen normaliza para 8 dígitos;
corpo com todos os campos inválidos ao mesmo tempo devolve `details[]` com **todos** eles
(`proposed.city`, `proposed.cityCode`, `proposed.number`, `proposed.postalCode`, `proposed.state`,
`proposed.street`); `cityCode` de outra UF é recusado sozinho; `addressKey` fora do relatório e
contratante ausente respondem `404` com o código estável certo; `addressKey` malformado é `400`;
chamador sem `settings.manage` é `403` em ambas as rotas, sem tocar no caso de uso.

Acrescentado a `test/integration/address-correction-repository.integration.ts` (T102): um teste para
`listByCompany` (isolamento de tenant do método novo, mesma suíte contra Postgres descartável).

### Gates

```
bun run typecheck
```

Resultado: verde nas 6 apps.

```
bun run --cwd apps/api-transportada test
```

Resultado: **5833 pass** (5820 + 13 novos), 23 skip, 0 fail, 20568 `expect()`, 173 arquivos.

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test ./test/integration/address-correction-repository.integration.ts --timeout 120000
```

(dentro de `apps/api-transportada`, Postgres nativo descartável em 65433) Resultado: **6 pass** (5 do
T102 + 1 novo), 0 fail, 20 `expect()` — não pulou.

```
bun run lint
```

Resultado: exit 0 nas 6 apps.

### Arquivos alterados

- `apps/api-transportada/src/address-correction/domain/brazilian-state.constant.ts` (novo)
- `apps/api-transportada/src/address-correction/domain/address-correction.error.ts` (novo)
- `apps/api-transportada/src/address-correction/presentation/address-correction-request.schema.ts` (novo)
- `apps/api-transportada/src/address-correction/presentation/address-correction.routes.ts` (novo)
- `apps/api-transportada/src/address-correction/application/save-address-correction-draft.use-case.ts` (novo)
- `apps/api-transportada/src/address-correction/application/list-address-correction-requests.use-case.ts` (novo)
- `apps/api-transportada/src/address-correction/application/address-correction.port.ts` (`listByCompany`)
- `apps/api-transportada/src/address-correction/infrastructure/drizzle-address-correction.repository.ts` (`listByCompany`)
- `apps/api-transportada/src/shared/api.constant.ts` (`API_ADDRESS_CORRECTION_REQUESTS_PATH`)
- `apps/api-transportada/src/main.ts` (composição e registro das rotas)
- `apps/api-transportada/test/fixtures/address-correction-http.fixture.ts` (novo)
- `apps/api-transportada/test/address-correction-http/routes.contract.ts` (novo)
- `apps/api-transportada/test/address-correction-http.contract.test.ts` (novo)
- `apps/api-transportada/test/integration/address-correction-repository.integration.ts` (teste de `listByCompany`)
- `apps/api-transportada/package.json` (entrada em `test`)

## T104

O relatório expõe `recipientName` (RF11).

### O que ficou

- **A mesma consulta, uma terceira linha.** `drizzle-address-report.repository.ts` já escolhia
  `emitter` por um `alias(nfeParticipants, ...)`; `recipientParticipant` é o mesmo desenho —
  `left join` por `documentId`+`companyId`+`role = 'recipient'`, valor exato conferido no worker
  (`NFE_PARTICIPANT_ROLE.RECIPIENT`, `worker-transportada/src/nfe-imports/domain/nfe-participant-role.constant.ts`).
  **`left`, não `inner`**: nem toda nota grava a linha `recipient`, e o relatório precisa continuar
  mostrando o endereço mesmo sem ela — `null` no lugar do nome.
- **Por que não `nfeParticipants.legalName` direto.** A junção de destino (`destinationRolesFilter`)
  aceita `delivery` **e** `recipient` — o endereço físico pode vir do participante `delivery`
  (`<entrega>`), que não é quem a nota chama de destinatário. Testado no
  `address-report-repository.integration.ts`: a nota tem `delivery` com um nome e `recipient` com
  outro, e `recipientName` sai sempre do segundo.
  Continua **uma consulta só** (`address-report-repository.contract.ts` conta os `.select(` do
  arquivo: 3, o mesmo de antes) — nada de query por linha.
- **`AddressReportRow.recipientName: string | null`** (`address-report.port.ts`) — `null` quando a
  nota não tem linha `recipient`. Propaga sem código extra até `GET /address-report`: `AddressFinding`
  já é `AddressReportRow & {kind}`, e a rota devolve `report` inteiro (`address-report.routes.ts`,
  sem mudança).
- **`PUT /address-correction-requests/:addressKey` grava `recipient_name` do relatório, nunca do
  body** (`save-address-correction-draft.use-case.ts`): a linha `recipientName: null` (placeholder da
  T103) virou `recipientName: found.recipientName`, lido do mesmo `AddressReportRepository.read`
  que já resolve `reported`/`reason*` — coluna e caminho de gravação já existiam desde T101/T103,
  esta task só preenche o valor.
- **Frontend: campo aceito, não exibido.** `addressReport.validation.ts` ganhou
  `recipientName: null | string` em `AddressFinding` e o mapeamento (`nullableText`, mesmo padrão de
  `text`) — ausente ou `null` no corpo não derruba o achado.
- **Nada de PII em log**: `recipientName` segue a mesma trilha do `contractorName` existente — nunca
  passa por `logger.*`, só pelo relatório e pelo registro do pedido.

### Gates

```
bun run typecheck
```

Resultado: verde nas 6 apps.

```
bun run --cwd apps/api-transportada test
```

Resultado: **5835 pass**, 23 skip, 0 fail, 20571 `expect()`, 173 arquivos.

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test ./test/integration/address-correction-repository.integration.ts \
  ./test/integration/address-report-repository.integration.ts --timeout 120000
```

(dentro de `apps/api-transportada`, Postgres nativo descartável em 65433) Resultado: **9 pass** (6 do
T102/T103 + 3 novos: nome do `recipient` nunca do `delivery`, `null` sem linha `recipient`, o mesmo
nome chega na linha `unresolved`), 0 fail, 26 `expect()` — não pulou.

```
bun run --cwd apps/frontend-transportada test
```

Resultado: **3691 pass**, 0 fail, 34723 `expect()`, 29 arquivos.

```
bun run lint
```

Resultado: exit 0 nas 6 apps.

### Arquivos alterados

- `apps/api-transportada/src/addresses/infrastructure/drizzle-address-report.repository.ts` (alias
  `recipientParticipant`, `left join`, `recipientName` no `select` e nas duas funções de linha)
- `apps/api-transportada/src/addresses/application/address-report.port.ts`
  (`AddressReportRow.recipientName`)
- `apps/api-transportada/src/address-correction/application/save-address-correction-draft.use-case.ts`
  (`recipientName: found.recipientName`, comentário atualizado)
- `apps/api-transportada/test/addresses-application/read-address-report.contract.ts` (fixture `LINHA`
  com `recipientName`)
- `apps/api-transportada/test/addresses-infrastructure/address-report-repository.contract.ts` (dois
  testes novos: papel `recipient`, sem query por linha)
- `apps/api-transportada/test/integration/address-report-repository.integration.ts` (novo)
- `apps/api-transportada/package.json` (entrada em `test:integration`)
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/addressReport.validation.ts`
  (`AddressFinding.recipientName`, `nullableText`)
- `apps/frontend-transportada/test/nfe-workspace/address-report.contract.ts` (dois testes novos)

## T201

Formulário "Informar endereço correto" no `AddressReportPanel`, spec 150 H1.

### O que ficou

- **`shared/addressCorrection.validation.ts`**: cópia por valor da tabela de UF → prefixo IBGE
  (mesmo desenho de `ADDRESS_FINDING_KINDS`), tipos `AddressCorrectionFields`/
  `AddressCorrectionRequestRecord`, o mapeamento da resposta da API (registro com `status`
  desconhecido some da lista, não derruba o resto — mesma regra do relatório) e
  `validateAddressCorrectionFields`, funções puras com **as mesmas seis checagens do servidor**
  (`proposedAddressSchema`): logradouro/número/município obrigatórios, UF nas 27, CEP 8 dígitos,
  `cityCode` 7 dígitos começando pelo prefixo da UF proposta. `cityCodeFromAddressKey` lê o
  primeiro segmento de `cityCode|postalCode|number` — o mesmo valor que o servidor usa como "como
  veio" (T103) — para pré-preencher o campo sem uma leitura nova.
- **`shared/addressCorrectionMask.service.ts`**: reexporta a máscara de CEP já existente
  (`postalCode.service.ts`, mesma dos outros formulários) e acrescenta a de código IBGE (7 dígitos,
  sem separador).
- **`shared/addressCorrectionRequestError.service.ts`**: `web.md` §11, os quatro requisitos —
  `AddressCorrectionRequestError` carrega `details[]` ao lado do código (item 1);
  `toFieldErrorMap`/`toInvalidFieldNames` deduplicam por campo, sem o prefixo `proposed.` que o
  corpo da API usa e o formulário não (itens 2 e 4); `fieldLabelKey` só resolve os oito campos que
  este formulário conhece — campo que a API vier a recusar e que esta tela não rotula
  (`somethingNew` no teste) aparece cru no aviso, nunca some (item 4). O atalho que rola até o
  campo (item 3) fica para quando a T202 tiver um `panelRef` estável entre reaberturas do mesmo
  endereço — hoje o próprio campo já mostra `aria-invalid`+`aria-describedby`, e os campos
  desconhecidos aparecem juntos num aviso de rodapé.
- **`shared/nfeWorkspaceClient.service.ts`**: `saveAddressCorrection` (`PUT
/address-correction-requests/:addressKey`, `addressKey` codificado com `encodeURIComponent` —
  mesmo padrão de `tripClient.service.ts` para `geocoded-addresses/:addressKey`, a outra rota com
  `pathParameterFormat: 'raw'`) e `listAddressCorrectionRequests` (`GET
/address-correction-requests`). Os dois passam por `requestJsonWithDetails`, uma função nova ao
  lado de `requestJson`: a existente descartava o corpo de toda resposta que não fosse `ok`, e a
  fronteira desta rota manda `error.details[]` que o formulário precisa.
- **`hooks/useAddressReport.hook.ts`**: `ADDRESS_REPORT_QUERY_KEY` passou a exportada — é a chave
  que o formulário invalida depois de salvar.
- **`shared/nfeWorkspace.constant.ts`**: `ADDRESS_CORRECTION_REQUESTS_QUERY_KEY` nova, ao lado de
  `NFE_DOCUMENTS_QUERY_KEY`.
- **`hooks/useAddressCorrectionForm.hook.ts`**: o estado do formulário — `fields`, `patch`,
  `clearFieldError` (editar o campo limpa o erro dele, servidor e validação local pela mesma
  regra), `submit` (valida local primeiro; só chama a API se `validateAddressCorrectionFields`
  devolver vazio) e a mutação TanStack. `onSuccess` invalida `ADDRESS_REPORT_QUERY_KEY` e
  `ADDRESS_CORRECTION_REQUESTS_QUERY_KEY` **sem** `await` (`test/shared/mutation-pending-state.contract.ts`
  reprova `onSuccess` assíncrono — o botão não pode ficar preso à releitura). `onError` separa os
  `details[]` do servidor entre campo conhecido (`fieldErrors`) e desconhecido
  (`unlabelledErrors`).
- **`components/AddressCorrectionForm.component.tsx`**: os oito campos (logradouro, número,
  complemento, bairro, município, UF via `@/components/ui/select` com as 27 siglas, código IBGE
  com máscara de 7 dígitos, CEP com máscara `00000-000`), `useRevealedPanel` no `<form>`,
  `aria-invalid`+`aria-describedby` nos campos com regra própria (logradouro, número, município,
  UF, código IBGE, CEP — complemento e bairro não têm regra, então nunca têm erro), e a dica de
  CEP terminado em `-000` (`isGenericCityPostalCode`, RF/084 T14: nunca sugerir que está errado).
  Botões "Cancelar" e "Salvar correção", com `Icon`.
- **`components/AddressReportPanel.component.tsx`**: cada `FindingRow` ganhou um `useState` para o
  formulário (fechado por padrão) e o botão "Informar endereço correto" (`Icon name="edit"`), que
  alterna para o formulário inline pré-preenchido com o endereço **como veio** (`noteStreet`,
  `noteNumber`, `noteDistrict`, `notePostalCode`, `city`, `state`, e `cityCode` da própria
  `addressKey`). Salvar ou cancelar fecha o formulário de volta ao botão.
- **CSS** (`styles/addressReport.module.css`): classes novas com os tokens do design system
  (`--field-*`, `--space-*`), mobile-first (`correctionGrid` vira duas colunas a partir de
  `40rem`), sem estilo inline.
- **Locales**: `addressReport.correction.*` (rótulos, dica de CEP, ações) e `addressCorrection.*`
  (`field.*` para o mapa de rótulo e `error.*` para as mensagens de validação local), pt-BR
  acentuado e o par em `nfeWorkspace.en.locale.json`.

### Testes

`apps/frontend-transportada/test/nfe-workspace/address-correction.contract.ts`, registrado em
`test/nfe-workspace.contract.test.ts` (que já está na lista explícita de
`apps/frontend-transportada/package.json`): validação de cada campo (certo e errado), a checagem
cruzada `cityCode`/UF, a máscara de código IBGE e de CEP, `cityCodeFromAddressKey` (com e sem o
segmento vazio), a dica de CEP genérico, o mapa `details[].field` → campo sem o prefixo
`proposed.`, `fieldLabelKey` (conhecido e desconhecido), e o client: monta o `PUT` com a
`addressKey` codificada e o corpo `{ proposed }`, lê o `GET` da lista, e joga
`AddressCorrectionRequestError` com os três campos do `400` (incluindo o desconhecido) no `catch`.

### Gates

```
bun run typecheck
```

Resultado: verde nas 6 apps.

```
bun run --cwd apps/frontend-transportada test
```

Resultado: **3706 pass**, 0 fail, 34762 `expect()`, 29 arquivos (15 testes novos em
`address-correction.contract.ts`).

```
bun run lint
```

Resultado: exit 0 nas 6 apps.

```
bun run --cwd apps/frontend-transportada build
```

Resultado: `vite build` concluído (`✓ built in 5.09s`), PWA gerado (128 entradas precache).

### Arquivos alterados

- `apps/frontend-transportada/src/modules/nfe-workspace/shared/addressCorrection.validation.ts` (novo)
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/addressCorrectionMask.service.ts` (novo)
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/addressCorrectionRequestError.service.ts` (novo)
- `apps/frontend-transportada/src/modules/nfe-workspace/hooks/useAddressCorrectionForm.hook.ts` (novo)
- `apps/frontend-transportada/src/modules/nfe-workspace/components/AddressCorrectionForm.component.tsx` (novo)
- `apps/frontend-transportada/src/modules/nfe-workspace/components/AddressReportPanel.component.tsx`
  (botão + formulário inline por endereço)
- `apps/frontend-transportada/src/modules/nfe-workspace/hooks/useAddressReport.hook.ts`
  (`ADDRESS_REPORT_QUERY_KEY` exportada)
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/nfeWorkspace.constant.ts`
  (`ADDRESS_CORRECTION_REQUESTS_QUERY_KEY`)
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/nfeWorkspaceClient.service.ts`
  (`saveAddressCorrection`, `listAddressCorrectionRequests`, `requestJsonWithDetails`)
- `apps/frontend-transportada/src/modules/nfe-workspace/styles/addressReport.module.css`
  (`.correction*`)
- `apps/frontend-transportada/src/modules/nfe-workspace/locales/nfeWorkspace.locale.json` e
  `nfeWorkspace.en.locale.json` (`addressReport.correction`, `addressCorrection`)
- `apps/frontend-transportada/test/nfe-workspace/address-correction.contract.ts` (novo)
- `apps/frontend-transportada/test/nfe-workspace.contract.test.ts` (import da suíte nova)

## T202

O estado do pedido em cada endereço da aba, spec 150 H3.

### O que ficou

- **`shared/addressCorrectionStatus.service.ts`**: view-model puro que cruza as linhas de
  `listAddressCorrectionRequests` com um `addressKey` — sem chamada de rede, sem estado próprio.
  `resolveAddressCorrectionStatus` recebe só as linhas de uma chave e devolve
  `{ state: 'none' | 'draft' | 'sent', sentAt, lastSentAt, proposedSummary }`. **Um `sent` e um
  `draft` mais novo convivem na mesma chave**: o índice único de `upsertDraft`
  (`drizzle-address-correction.repository.ts`) é parcial (`status = 'draft'`), então salvar de novo
  depois de um envio cria uma segunda linha em vez de reabrir a enviada — a lista traz as duas, e o
  estado exibido é sempre `draft`, com o último envio em `lastSentAt`. `findDraftRequest` isola o
  rascunho de uma chave (nunca um `sent`), e `initialAddressCorrectionFields` decide o valor inicial
  do formulário: o proposto do rascunho, se houver, senão "como veio" da nota — a mesma regra que a
  T201 tinha hardcoded em `AddressReportPanel`, agora testável sozinha.
- **`hooks/useAddressCorrectionRequests.hook.ts`**: `useQuery` na mesma chave que
  `useAddressCorrectionForm` já invalida ao salvar (`ADDRESS_CORRECTION_REQUESTS_QUERY_KEY`, T201) —
  fechando o ciclo: salvar um rascunho já reconsultava essa chave, só não existia quem a lesse antes
  desta task. Habilitado pela mesma condição do relatório (`canManageSettings && activeTab ===
'addresses'`).
- **`components/AddressReportPanel.component.tsx`**: cada `FindingRow` filtra
  `correctionRequests` pelo próprio `addressKey`, resolve o status e mostra `AddressCorrectionStatusBadge`, um componente novo que **reaproveita `Badge`** (`@/components/ui/badge`, o mesmo
  selo de `BillingDefaultsFields` e das tabelas de NFS-e/MDF-e — nada de visual próprio da aba):
  `secondary` para "Sem pedido", `default` para "Rascunho salvo" (com "Último envio em …" ao lado
  quando há envio anterior) e `success` para "Enviado em …". A data reaproveita
  `formatNfeImportMoment` (`pt-BR`, `dateStyle: 'short'`, `timeStyle: 'short'`) — o mesmo formatador
  que a lista de importações já usa, em vez de um `Intl.DateTimeFormat` novo. Enquanto a lista
  carrega, `Skeleton` na forma do selo (`height="1.2rem"`); se falhar, um aviso discreto substitui o
  selo (`addressReport.correction.statusUnavailable`) — a aba continua utilizável, e a falha não é
  escondida. Quando há rascunho, o endereço proposto (`proposedSummary`) aparece numa segunda linha
  abaixo de "No cadastro", e o botão vira "Editar correção" em vez de "Informar endereço correto".
- **`pages/NfeWorkspace.page.tsx`**: chama o hook novo ao lado de `useAddressReport` e repassa os
  três campos (`correctionRequests`, `correctionRequestsFailed`, `correctionRequestsLoading`) para o
  painel.
- **CSS** (`styles/addressReport.module.css`): `.correctionStatusGroup` (selo + dica lado a lado,
  `flex-wrap` para mobile) e `.correctionStatusHint`/`.correctionStatusNotice`, tokens do design
  system, sem valor solto.
- **Locales**: `addressReport.correction.{editTrigger,proposedLabel,stateNone,stateDraft,stateSent,
lastSentAt,statusUnavailable}`, pt-BR acentuado e o par em `nfeWorkspace.en.locale.json`.

### Testes

`apps/frontend-transportada/test/nfe-workspace/address-correction-status.contract.ts`, registrado em
`test/nfe-workspace.contract.test.ts`: nenhuma linha (`none`), só rascunho (`draft` com resumo),
só envio (`sent` com data), envio seguido de rascunho novo (`draft` com `lastSentAt`), mais de um
envio (o mais recente vence), chave sem linha no relatório (filtrada antes de cruzar, `none`),
`findDraftRequest` nunca devolve um `sent`, e o valor inicial do formulário nos dois casos (com e
sem rascunho).

### Gates

```
bun run typecheck
```

Resultado: verde nas 6 apps.

```
bun run --cwd apps/frontend-transportada test
```

Resultado: **3715 pass**, 0 fail, 34777 `expect()`, 29 arquivos (9 testes novos em
`address-correction-status.contract.ts`).

```
bun run lint
```

Resultado: exit 0 nas 6 apps.

```
bun run --cwd apps/frontend-transportada build
```

Resultado: build concluído (`dist/` gerado, PWA `sw.js` gerado).

### Arquivos alterados

- `apps/frontend-transportada/src/modules/nfe-workspace/shared/addressCorrectionStatus.service.ts`
  (novo)
- `apps/frontend-transportada/src/modules/nfe-workspace/hooks/useAddressCorrectionRequests.hook.ts`
  (novo)
- `apps/frontend-transportada/src/modules/nfe-workspace/components/AddressReportPanel.component.tsx`
  (selo de estado, resumo do proposto, rótulo do botão, `AddressCorrectionStatusBadge`)
- `apps/frontend-transportada/src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx` (hook novo,
  props do painel)
- `apps/frontend-transportada/src/modules/nfe-workspace/styles/addressReport.module.css`
  (`.correctionStatusGroup`, `.correctionStatusHint`, `.correctionStatusNotice`)
- `apps/frontend-transportada/src/modules/nfe-workspace/locales/nfeWorkspace.locale.json` e
  `nfeWorkspace.en.locale.json` (`addressReport.correction.*` novos)
- `apps/frontend-transportada/test/nfe-workspace/address-correction-status.contract.ts` (novo)
- `apps/frontend-transportada/test/nfe-workspace.contract.test.ts` (import da suíte nova)

## T301

CRUD de `contractor_contacts` dentro de `/contractors/:id` (spec 143 T013) e a seção "Contatos de
e-mail" no módulo `delivery-clients` (spec 143 T017). A T013 e a T017 estavam abertas — fechadas
por esta task, como o `tasks.md` previa.

### API

- **Rotas** (`contractor-mail/presentation/contractor-contacts.routes.ts`): `GET
/contractors/:id/contacts`, `POST /contractors/:id/contacts`,
  `PATCH /contractors/:id/contacts/:contactId`, todas `settings.manage`, `cache-control: no-store`.
  Sem `DELETE` físico — desativar é `PATCH { status: 'inactive' }`, porque
  `contractor_mail_messages` aponta para o contato.
- **BOLA**: as três rotas resolvem a contratante primeiro por `getContractor.execute` (o mesmo
  `GET /contractors/:id` de `delivery-clients/application/contractors.use-case.ts`) — contratante de
  outra empresa responde `404 CONTRACTOR_NOT_FOUND`, igual a inexistente, antes de qualquer consulta
  a `contractor_contacts`.
- **Caso de uso** (`contractor-mail/application/contractor-contacts.use-case.ts`): normaliza o
  e-mail (`trim` + minúsculas) antes de gravar; `update` devolvendo `undefined` do repositório vira
  `ContractorContactNotFoundError` (404).
- **Duplicado**: `contractor_contacts_company_contractor_email_unique` (migration da T003 da spec 143) já cobre `(company_id, contractor_id, lower(email))` para **toda** linha, ativa ou inativa —
  mais estrito que "duplicado ativo" do RF, mas decisão registrada aqui: reativar um e-mail que já
  existe inativo é um `PATCH` de status, não um novo `POST`, então **nenhuma migration nova foi
  necessária**. A violação do índice vira `ContractorContactEmailTakenError` (`409
CONTRACTOR_CONTACT_EMAIL_TAKEN`, `details: [{ field: 'email', ... }]`) via
  `violatedUniqueConstraint` (`database/postgres-error.support.ts`).
- **Repositório** (`drizzle-contractor-mail.repository.ts`): `listContractorContacts`,
  `createContractorContact`, `updateContractorContact`, com `buildContractorContactFilters`
  (`company_id` + `contractor_id` na mesma condição, nunca conferência à parte).
- **Idempotency-Key**: as rotas vizinhas de `/contractors` (`contractor.routes.ts`) não aceitam a
  chave — `POST /contractors/:id/contacts` segue o mesmo padrão, sem ela.
- Nenhum e-mail em log: os `catch` de violação de unique não logam o valor, só o código do erro.

### Frontend

- **Módulo**: `delivery-clients`, o mesmo onde a spec 143 T011 já tinha resolvido "onde as
  contratantes são cadastradas" (o painel de e-mail da contratante). A seção nova mora na mesma aba
  "E-mail com contratantes", abaixo do painel de configuração — não existe hoje uma tela de
  CRUD de contratante em si, então o seletor de contratante (`GET /contractors`) vive dentro do
  próprio painel novo.
- **`ContractorContactsPanel.component.tsx`**: seletor de contratante (`@/components/ui/select`),
  lista de contatos com dois `Checkbox` (`receivesOccurrences`, `canDecide`) e o botão
  desativar/reativar (nunca excluir), e o formulário de novo contato com erro ancorado no campo
  e-mail.
- **`useContractorContacts.hook.ts`**: `TanStack Query` para a lista de contratantes e a lista de
  contatos (por `contractorId`), `create`/`update` como mutações que invalidam a lista de contatos.
- **Cliente e validação puros** (`contractorContactsClient.service.ts`,
  `contractorContacts.validation.ts`, `contractorContactsResponse.validation.ts`,
  `contractorContacts.types.ts`): sem `zod` nesta app — guarda manual (`hasExactKeys`) e validação
  de e-mail por regex, espelhando `contractorMailSettings*`.
- **`web.md` §11**: `ContractorContactsRequestError` carrega `details` do `409`
  (`Map<string, string>`), e o painel mostra a mensagem do servidor ancorada no campo `email`
  (`aria-invalid`), com a validação de formato do lado do cliente andando na frente.
- **Locales**: `contractorContacts.*` em `deliveryClients.locale.json` (pt-BR acentuado) e
  `deliveryClients.en.locale.json`.

### Testes

- `apps/api-transportada/test/contractor-mail/contractor-contacts.contract.ts` (novo, registrado em
  `test/contractor-mail.contract.test.ts`): caso de uso (BOLA, normalização, 404 de
  atualização, mapeamento do 409) e rotas (permissão, status code, serialização, BOLA em todas as
  rotas, 409 com o código estável).
- `apps/api-transportada/test/contractor-mail-schema/tenant-safety.contract.ts`: teste novo de
  `buildContractorContactFilters` filtrando por `company_id` e `contractor_id` juntos.
- `apps/api-transportada/test/integration/contractor-contacts-repository.integration.ts` (novo,
  registrado em `test:integration`): contra Postgres de verdade — cria, lista, atualiza (desativa),
  duplicado por caixa alta/baixa vira `ContractorContactEmailTakenError`, e isolamento por tenant
  (lista e atualização de outra empresa nunca alcançam o contato).
- `apps/frontend-transportada/test/delivery-clients/contractor-contacts-validation.contract.ts` e
  `contractor-contacts-response.contract.ts` (novos, registrados em
  `test/delivery-clients.contract.test.ts`): validação de e-mail pura, normalização, guarda de
  chaves da resposta (rejeita linha com campo a mais, campo faltando, status desconhecido) e a
  redução do agregado completo de `Contractor` aos três campos do seletor.

### Gates

```
bun run typecheck
```

Resultado: verde nas 6 apps.

```
bun run --cwd apps/api-transportada test
```

Resultado: **5851 pass**, 0 fail, 20598 `expect()`, 173 arquivos.

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres bun --env-file=../../.env.test test ./test/integration/contractor-contacts-repository.integration.ts --timeout 120000
```

(de dentro de `apps/api-transportada`) — Resultado: **2 pass**, 0 fail, 6 `expect()` (Postgres
nativo, não pulou).

```
bun run --cwd apps/frontend-transportada test
```

Resultado: **3727 pass**, 0 fail, 34790 `expect()`, 29 arquivos.

```
bun run lint
```

Resultado: exit 0 nas 6 apps.

```
bun run --cwd apps/frontend-transportada build
```

Resultado: build concluído (`dist/` gerado, PWA `sw.js` gerado).

### Arquivos alterados

- `apps/api-transportada/src/shared/api.constant.ts` (`API_CONTRACTOR_CONTACTS_PATH`,
  `API_CONTRACTOR_CONTACT_PATH`)
- `apps/api-transportada/src/contractor-mail/application/contractor-mail.port.ts` (tipos e métodos
  de contato no `ContractorMailRepositoryPort`)
- `apps/api-transportada/src/contractor-mail/application/contractor-contacts.use-case.ts` (novo)
- `apps/api-transportada/src/contractor-mail/domain/contractor-mail.error.ts`
  (`ContractorContactEmailTakenError`, `ContractorContactNotFoundError`)
- `apps/api-transportada/src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.ts`
  (`listContractorContacts`, `createContractorContact`, `updateContractorContact`,
  `buildContractorContactFilters`)
- `apps/api-transportada/src/contractor-mail/presentation/contractor-contacts.routes.ts` (novo)
- `apps/api-transportada/src/main.ts` (composição e registro das rotas novas)
- `apps/api-transportada/test/contractor-mail/contractor-contacts.contract.ts` (novo)
- `apps/api-transportada/test/contractor-mail.contract.test.ts` (import da suíte nova)
- `apps/api-transportada/test/contractor-mail-schema/tenant-safety.contract.ts` (teste novo)
- `apps/api-transportada/test/contractor-mail/process-inbound-email-webhook-use-case.contract.ts` e
  `settings-use-case.contract.ts` (fakes do repositório atualizados com os três métodos novos)
- `apps/api-transportada/test/integration/contractor-contacts-repository.integration.ts` (novo)
- `apps/api-transportada/package.json` (`test:integration` com o arquivo novo)
- `apps/frontend-transportada/src/modules/delivery-clients/shared/contractorContacts.types.ts`,
  `contractorContactsClient.service.ts`, `contractorContacts.validation.ts`,
  `contractorContactsResponse.validation.ts` (novos)
- `apps/frontend-transportada/src/modules/delivery-clients/hooks/useContractorContacts.hook.ts`
  (novo)
- `apps/frontend-transportada/src/modules/delivery-clients/components/ContractorContactsPanel.component.tsx`
  (novo)
- `apps/frontend-transportada/src/modules/delivery-clients/pages/DeliveryClientWorkspace.page.tsx`
  (painel novo na aba "mail")
- `apps/frontend-transportada/src/modules/delivery-clients/locales/deliveryClients.locale.json` e
  `deliveryClients.en.locale.json` (`contractorContacts.*` novos)
- `apps/frontend-transportada/test/delivery-clients/contractor-contacts-validation.contract.ts` e
  `contractor-contacts-response.contract.ts` (novos)
- `apps/frontend-transportada/test/delivery-clients.contract.test.ts` (import das suítes novas)

## T302

Desenho: `plan.md` § E-mail, "Decisão da T302" (parecer do architect de 2026-09-15). Um e-mail só,
com todos os contatos no `to`; HTML gravado pela API em `contractor_mail_messages.body_html`; fila
continua levando só `{ messageId }`.

### Vermelho (testes escritos antes da implementação)

```
cd apps/worker-transportada && bun test ./test/contractor-mail.contract.test.ts
```

1. Sem a constante: `Cannot find module '../../src/contractor-mail/domain/contractor-mail.constant.js'`
   — 0 pass, 1 fail.
2. Com a constante e `ResendInvalidRecipientsError` criadas (esqueleto, sem comportamento):
   **77 pass, 13 fail**. Os que falharam: `to` ainda string no caso de uso e no gateway; "sends one
   mail to every recorded recipient, in order, with the recorded html and text"; deduplicação por
   caixa; lista recusada pelo gateway vira `failed`; o corpo do POST com `to: [a,b,c]` e `html`; 51
   endereços, lista vazia e os quatro endereços com `\n`, `\r`, `,`, `<>` chamando o `fetch`.

```
cd apps/api-transportada && bun test ./test/database-migration.contract.test.ts
```

`preserves baseline and identity bytes while versioning additive fiscal migrations` falhou (54 pass,
1 fail): a lista explícita já tinha `20260915200000_contractor_mail_body_html` e a pasta não existia.

### Verde

- `bun test ./test/contractor-mail.contract.test.ts` (worker): **90 pass, 0 fail**.
- `bun run --cwd apps/worker-transportada test`: **1344 pass, 0 fail** (89 arquivos).
- `bun run --cwd apps/api-transportada test`: **5852 pass, 23 skip, 0 fail** (173 arquivos). Os 23
  skips são as integrações que precisam de banco, rodadas à parte abaixo.
- `bun run typecheck` (raiz): exit 0. `bun run lint` (raiz): exit 0.
- `bun run db:generate --name tmp` gerou exatamente o `migration.sql` escrito à mão; o
  `snapshot.json` foi movido para a pasta da migration e um `db:generate` seguinte respondeu
  `no_changes`.

Integração contra Postgres nativo `127.0.0.1:65433`:

- Migrations da API, `DRIZZLE_TEST_DATABASE_URL=… bun --env-file=../../.env.test test
./test/database-migration.contract.test.ts --timeout 120000`: 58 pass, 1 fail. A falha é a
  conhecida e alheia `cte-profile-output-constraints` (Postgres 18 local devolve `23001` onde a
  asserção espera `23503`), e ela vem **antes** da asserção nova na mesma sequência. Por isso a
  `assertContractorMailBodyHtml` rodou também isolada, num runner temporário (apagado depois): banco
  descartável, migrations, fixture de identidade e a asserção — **1 pass, 0 fail**. Ela prova:
  coluna `NULL`; saída com HTML de 524288 bytes aceita; entrada com HTML recusada (`23514`,
  `contractor_mail_messages_body_html_direction_check`); 524290 bytes recusados (`23514`,
  `contractor_mail_messages_body_html_size_check`); rollback tira a coluna e a linha do journal; as
  migrations reaplicam.
- Outbox do worker, `DATABASE_URL=…/worker_t302 bun test
./test/contractor-mail-outbound-outbox.integration.test.ts --timeout 120000` (banco novo `worker_t302`
  criado e migrado para isso): o teste novo "sends the recorded body_html and every recipient to the
  mail gateway" **passa**: o `body_html` gravado no banco e os três destinatários chegam ao gateway
  fake. Os dois testes de reivindicação (`claims a due unpublished row…` e `does not let a second
claim…`) **falham também na versão do HEAD** do arquivo, contra o mesmo banco. É anterior a esta
  task e não vem de acúmulo, porque são 6 linhas não publicadas para um `limit: 10`. Fica registrado
  e sem investigação aqui. O teste novo não grava linha de outbox (`withOutbox: false`), então não
  disputa essas reivindicações.

### Arquivos alterados

- `apps/api-transportada/drizzle/20260915200000_contractor_mail_body_html/` (novo: `migration.sql`,
  `rollback.sql`, `snapshot.json`)
- `apps/api-transportada/src/database/contractor-mail.schema.ts` (`bodyHtml` + duas CHECKs)
- `apps/api-transportada/src/contractor-mail/domain/contractor-mail.constant.ts` (novo,
  `CONTRACTOR_MAIL_MAX_RECIPIENTS = 50`)
- `apps/api-transportada/src/contractor-mail/application/contractor-mail.port.ts` e
  `infrastructure/drizzle-contractor-mail.repository.ts` (`bodyHtml` opcional; `setup_test` grava `null`)
- `apps/api-transportada/test/database-migration/contractor-mail-body-html.assertion.ts` (novo),
  `database-migration.integration.ts` e `static-migration.contract.ts`
- `apps/worker-transportada/src/database/contractor-mail.schema.ts` (cópia ganha `bodyHtml`)
- `apps/worker-transportada/src/contractor-mail/domain/contractor-mail.constant.ts` (novo) e
  `resend-provider.error.ts` (`ResendInvalidRecipientsError`)
- `apps/worker-transportada/src/contractor-mail/infrastructure/resend-mail.gateway.ts` (`to` como
  lista, `html` opcional, recusa antes da rede)
- `apps/worker-transportada/src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.ts`
  (`findMessageById` traz `bodyHtml`)
- `apps/worker-transportada/src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.ts`
  (sem `toAddresses[0]`; todos, deduplicados em minúsculas, na ordem; lista recusada vira `failed`)
- `apps/worker-transportada/test/contractor-mail/outbound-message.contract.ts`,
  `resend-mail-gateway.contract.ts`, `outbound-consumer.contract.ts`,
  `max-recipients-parity.contract.ts` (novo), `test/contractor-mail.contract.test.ts` e
  `test/contractor-mail-outbound-outbox.integration.test.ts`
- `docs/SECURITY.md`, `specs/143-a-contratante-responde-por-e-mail/tasks.md` (nota na T015),
  `specs/150-pedido-de-correcao-de-endereco/plan.md` (decisão da T302) e `tasks.md`

## T303

`buildAddressCorrectionMail` (`apps/api-transportada/src/address-correction/domain/address-correction-mail.template.ts`),
função pura sem I/O, reproduzindo `email-template.html`: layout em tabela, estilo inline, 600 px,
preheader oculto, cabeçalho grafite com filete cobre, blocos numerados "Como veio na nota" /
"Endereço correto" com barra verde / "Motivo", assinatura e rodapé. Cores e medidas nomeadas em
`address-correction-mail.constant.ts`; tipos de `Params`/`Result`/item em
`address-correction-mail.types.ts` (`AddressFields` reaproveitado de `address-correction.port.ts`).

### Regra do motivo adotada

`reason.distanceMetres === null` → "endereço não localizado". É o mesmo sinal que
`compare-addresses-batch.use-case.ts` (`toDistance`) já grava em branco quando o município diverge ou
o provedor não devolveu coordenada — inclusive `not_found` e `approximate` (o centroide de
município), que é exatamente "o nível indica cidade" citado na task. Havendo distância:

| distância   | texto                                                         |
| ----------- | ------------------------------------------------------------- |
| `< 1000` m  | `localizado a {metros inteiros} m do endereço informado`      |
| `>= 1000` m | `localizado a {km, vírgula, 1 casa} km do endereço informado` |

Documentado também no teste (`apps/api-transportada/test/address-correction-mail/template.contract.ts`).

### Escape

Função `escapeHtml` própria do módulo (nenhuma outra existia no repo) — `&` primeiro, depois `<`,
`>`, `"`, `'`. Só o HTML escapa; o `text` carrega o valor literal, como o rascunho aprovado.

### Endereço formatado

`logradouro, número[, complemento] — [bairro —] cidade/UF · CEP` (CEP com hífen, sem a palavra "CEP"
— é o que `email-template.html` de fato mostra: "· 13530-000"). Complemento entra depois do número;
bairro ausente ou complemento ausente não deixam separador sobrando.

### `recipientName` null

O bloco abre pelo endereço **correto** (proposto pelo operador), sem "null" e sem linha vazia — é o
identificador mais útil quando não há nome de destinatário.

### Verde

- `bun run typecheck` (raiz): exit 0 (6 apps).
- `bun run --cwd apps/api-transportada test`: **5864 pass, 23 skip, 0 fail** (174 arquivos,
  incluindo os 12 testes novos de `address-correction-mail.contract.test.ts`, adicionados à lista
  explícita do `package.json`).
- `bun run lint` (raiz): exit 0 (6 apps).

### Arquivos alterados

- `apps/api-transportada/src/address-correction/domain/address-correction-mail.template.ts` (novo)
- `apps/api-transportada/src/address-correction/domain/address-correction-mail.types.ts` (novo)
- `apps/api-transportada/src/address-correction/domain/address-correction-mail.constant.ts` (novo)
- `apps/api-transportada/test/address-correction-mail.contract.test.ts` (novo, entrypoint)
- `apps/api-transportada/test/address-correction-mail/template.contract.ts` (novo)

## T304

`POST /address-correction-requests/mail`, `settings.manage`. Body
`{ contractorTaxId, contactIds: string[] (1..50, sem repetição), requestIds?: string[] }`,
`Idempotency-Key` obrigatório. Resposta `202 { data: { threadId, messageId, sentRequestIds,
recipientCount } }` — segue o padrão do `test-email` (`202`, envio de fato acontece no worker via
outbox), não `200`.

### Arquitetura escolhida

Porta nova (`address-correction-mail.port.ts`) com um `AddressCorrectionMailTransactionPort`
(métodos estreitos: achar contratante/config/contatos/pedidos, gravar mensagem, marcar `sent`,
achar/gravar idempotência) e um `AddressCorrectionMailUnitOfWorkPort.execute` — o mesmo molde de
`RequestNfeImportTransactionPort`/`cte-batches`: a orquestração (o que cada leitura significa, qual
erro lançar) fica no caso de uso (`send-address-correction-mail.use-case.ts`), nunca no repositório
(`drizzle-address-correction-mail.repository.ts`), que só lê e escreve. A função `executeSend`
inteira roda dentro de `unitOfWork.execute`, ou seja, **uma transação Postgres só** — igual ao
`executeRequest` de `nfe-imports`, e diferente do `test-email` (que abre duas transações
separadas): aqui o pedido explícito era "numa única transação", e o `test-email` não tinha essa
exigência.

### Idempotência: a tabela genérica `idempotency_records`, não uma nova

`grep` por "Idempotency-Key" achou o mecanismo já usado por `nfe-imports`, `freight-rules`,
`cte-batches` e `company-settings`: a tabela `idempotency_records` (`fiscal-operation.schema.ts`,
já agregada em `database.schema.ts`), chave `(company_id, operation, idempotency_key)`, com
`request_fingerprint` guardando um HMAC-SHA256 (`IdempotencyFingerprintPort`,
`createIdempotencyFingerprintService`, já instanciado uma vez em `main.ts` como `fingerprintService`
e reaproveitado aqui) sobre os campos de negócio — replay com a mesma chave e fingerprint devolve
`response` sem repetir a escrita; mesma chave com fingerprint diferente é `IDEMPOTENCY_KEY_REUSED`
(409), o mesmo código que `nfe-imports`/`freight-rules`/`cte-batches` já usam, cada um com a própria
classe de erro local — segui o mesmo padrão (`AddressCorrectionIdempotencyKeyReusedError`) em vez de
importar a de outro domínio. Nenhuma migration nova: a tabela e a coluna do teto de e-mail já
existiam. O lock é `pg_advisory_xact_lock` sobre o hash de `['address-correction-mail', companyId,
idempotencyKey]`, cópia do helper de `company-settings.support.ts` (não achei versão exportada
reaproveitável fora do módulo).

### `subject_id` da conversa nova

`contractor_mail_threads` tem `unique(company_id, subject_type, subject_id)`. Para `setup_test` o
`subject_id` é o próprio `companyId` (uma conversa por empresa). Para `address_correction` cada
envio cria uma conversa **nova** (RF6a: unitário e completo convivem, e um envio anterior não pode
bloquear o próximo) — não existe um segundo objeto de negócio natural para apontar, então
`subject_id = threadId` (o próprio id gerado por `crypto.randomUUID()` para a conversa). A unicidade
do `subject_id` fica garantida pela unicidade do `id` da própria linha — decisão equivalente à do
`setup_test`, só que a chave de negócio aqui é "este envio", não "esta empresa".

### Reply-To funcional, como no `test-email`

A conversa precisa de um `reply_token_hash` que abra de verdade (para uma resposta da contratante
cair na conversa certa — mesmo mecanismo do RF7/RF2 da spec 143), então o fluxo decripta o
`replyTokenSecret` da configuração (`ContractorMailCredentialSecretService.decrypt`, a mesma usada
pelo `test-email`) e deriva o token com `deriveReplyToken`/`hashReplyToken`
(`reply-token.policy.ts`) para o `threadId` já definitivo — sem a dança de `reserveSetupTestThread`
(não é necessária aqui: cada envio já nasce com um id novo, não há corrida por "a" conversa).

### Validações e códigos

- `ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND` (já existia da T102/T103): CNPJ do body sem contratante
  na empresa.
- `CONTRACTOR_MAIL_NOT_CONFIGURED` (já existia do `contractor-mail`, 409): configuração ausente OU
  `status !== 'active'` — reaproveitado como pedido pelo enunciado ("recuse com o código que o
  módulo já usa"), cobrindo os dois motivos ("não configurado" e "não verificado") com a mesma
  resposta, sem distinguir os dois a quem não tem acesso de escrita na configuração.
- `ADDRESS_CORRECTION_NO_ACTIVE_CONTACT` (novo, 422): **qualquer** `contactId` do body que não
  resolva a um contato `active` desta contratante, dentro desta empresa — inexistente, inativo ou de
  outra contratante recebem a mesma resposta (não distingue qual dos três, por desenho: um atacante
  não aprende se o id pertence a outra contratante só testando). O mesmo teste cobre também a
  recusa por `\r \n , < >` no e-mail resolvido (defesa em profundidade — na prática inatingível
  porque `contractor-contacts` já valida o e-mail com Zod na criação, mas o teste de caso de uso não
  cobre esse ramo isoladamente porque não há como semear um e-mail assim pelas portas existentes;
  fica descrito aqui em vez de um teste artificial que forjaria o fake fora do que o sistema produz).
- `ADDRESS_CORRECTION_REQUEST_NOT_SENDABLE` (novo, 409): **qualquer** `requestId` explícito que não
  resolva a um rascunho `draft` desta contratante — de outra contratante, inexistente ou já `sent`.
- `ADDRESS_CORRECTION_NOTHING_TO_SEND` (novo, 409): a lista final de pedidos a enviar (completa ou
  filtrada por `requestIds`) ficou vazia.
- `IDEMPOTENCY_KEY_REUSED` (novo, 409): mesma `Idempotency-Key`, fingerprint diferente.
- `400` com `details[]`: corpo inválido (Zod) — `contactIds` vazio, repetido ou acima do teto
  (`CONTRACTOR_MAIL_MAX_RECIPIENTS = 50`, importado do `contractor-mail`), `contractorTaxId` fora do
  formato, `requestIds` repetido, header `Idempotency-Key` ausente/fora da forma
  (`parseIdempotencyKey` de `cte-batches/presentation/cte-batch.schema.ts`, reaproveitado — é o
  mesmo helper que `mdfe-issuance.routes.ts`/`nfse-invoices.routes.ts` já importam entre módulos).

O teto de 50 contatos é cobrado só no Zod da rota (RF do plan.md: "cobrada no Zod da API... e de
novo no gateway" — o gateway é o do worker, T302; o caso de uso desta task não repete a conta porque
não haveria código estável dedicado para isso na lista do enunciado, e duplicar a checagem aqui sem
um código próprio só trocaria um `400` por outro `400` idêntico).

### `carrierName` e `operatorName`

- `carrierName`: não existe `companies.name` — o nome da transportadora vive em
  `company_fiscal_profiles` (`legalName`/`tradeName`), a mesma tabela que `cte-issuance` e
  `invoice-pdf.gateway.ts` usam para identificar o emissor. Uso `tradeName`, com `legalName` de
  fallback se o nome fantasia estiver em branco (nenhuma convenção existente de "um nome só" para
  copiar; decisão registrada aqui). Sem perfil fiscal cadastrado, `carrierName` sai `''` — não há
  erro dedicado para isso na lista do enunciado, e a empresa já opera sem CT-e nesse estado (nota do
  `CLAUDE.md`: "perfil fiscal sem sequência de CT-e é leitura válida").
- `operatorName`: o contexto autenticado só tem `userId` (RF do enunciado: "se o contexto só tiver
  id, busque o nome pelo mecanismo existente"). O mecanismo existente é `identityUserProfiles.name`
  join `userCompanyMemberships` (ativo, na empresa) — o mesmo padrão de
  `actor-email.repository.ts` (que busca `email`) e de `actorProfile.name` em
  `drizzle-nfe-document-event.repository.ts`. Sem perfil ativo na empresa, `operatorName` sai `''`
  (mesmo raciocínio do `carrierName` — não há um pedido explícito de erro aqui).

### Verde

```
bun run --cwd apps/api-transportada typecheck
```

exit 0.

```
bun test ./test/address-correction-http.contract.test.ts ./test/address-correction-mail.contract.test.ts
```

**47 pass**, 0 fail, 111 `expect()` — inclui as 9 rotas novas (permissão, 400 com `details[]` para
corpo vazio/repetido/acima do teto, `Idempotency-Key` ausente, 202 com o corpo certo, `requestIds`
repassado, código estável propagado com o status certo, `cache-control: no-store`, nenhum PII em
log) e as 15 do caso de uso (fakes: completo, unitário, `requestId` de outra contratante, já
enviado, contato inativo, contato de outra contratante, sem rascunho, CNPJ sem contratante,
configuração ausente/inativa, idempotência replay e reuso, `html`/`text`/`subject` gravados vindos
de `buildAddressCorrectionMail`).

```
bun run --cwd apps/api-transportada test
```

**5885 pass**, 23 skip, 0 fail (174 arquivos).

```
bun run lint
```

exit 0 (6 apps).

Integração contra Postgres nativo `127.0.0.1:65433`
(`DRIZZLE_TEST_DATABASE_URL=… bun --env-file=../../.env.test test … --timeout 120000`, de dentro de
`apps/api-transportada`):

```
./test/integration/address-correction-mail-repository.integration.ts
./test/integration/address-correction-repository.integration.ts
./test/integration/contractor-contacts-repository.integration.ts
./test/integration/contractor-mail-test-email-thread.integration.ts
```

**20 pass**, 0 fail, 73 `expect()` (banco descartável por `describe`, não pulou). O arquivo novo
prova, contra Postgres de verdade: contratante/config resolvidos dentro da empresa (nunca de
outra); `carrierName`/`operatorName` só saem para a empresa certa; `findActiveContactsByIds` recusa
contato de outra contratante; `findSendableRequests` sem `requestIds` traz só os `draft` da
contratante, com `requestIds` valida dono e status por id; idempotência grava e relê
fingerprint+resposta; e o ponto central — `recordMail` + `markRequestsSent` dentro do mesmo
`execute()` comitam **juntos** (conversa `address_correction`, mensagem com `body_html`/`body_text`/
`to_addresses`, uma linha de outbox `message.send.requested`, e o pedido veio a `sent` com
`sent_at`/`thread_id`), e um erro lançado **depois** de `recordMail` mas antes do fim do `execute`
desfaz **tudo** — nem a conversa nem a mensagem sobrevivem, e o pedido volta a `draft`.

Não rodei a suíte `test:integration` inteira (mais de 60 arquivos, cada um sobe um banco
descartável — minutos) porque nenhum arquivo fora de `address-correction`/`contractor-mail` foi
tocado nesta task; rodei o arquivo novo mais os três vizinhos mais próximos (endereço, contatos,
`setup_test`) para confirmar que nada regrediu no que esta task de fato mexeu.

### Arquivos alterados

- `apps/api-transportada/src/address-correction/application/address-correction-mail.port.ts` (novo)
- `apps/api-transportada/src/address-correction/application/send-address-correction-mail.use-case.ts`
  (novo)
- `apps/api-transportada/src/address-correction/infrastructure/drizzle-address-correction-mail.repository.ts`
  (novo)
- `apps/api-transportada/src/address-correction/domain/address-correction.error.ts`
  (`AddressCorrectionNoActiveContactError`, `AddressCorrectionNothingToSendError`,
  `AddressCorrectionRequestNotSendableError`, `AddressCorrectionIdempotencyKeyReusedError`)
- `apps/api-transportada/src/address-correction/presentation/address-correction.routes.ts`
  (`POST /address-correction-requests/mail`)
- `apps/api-transportada/src/address-correction/presentation/address-correction-request.schema.ts`
  (`parsePostAddressCorrectionMailBody`)
- `apps/api-transportada/src/shared/api.constant.ts`
  (`API_ADDRESS_CORRECTION_REQUESTS_MAIL_PATH`)
- `apps/api-transportada/src/main.ts` (composição: `DrizzleAddressCorrectionMailRepository`,
  `createSendAddressCorrectionMailUseCase`, reaproveita `fingerprintService` e
  `contractorMailCredentialSecretService` já existentes)
- `apps/api-transportada/test/address-correction-http/mail-routes.contract.ts` (novo)
- `apps/api-transportada/test/address-correction-mail/send-mail-use-case.contract.ts` (novo)
- `apps/api-transportada/test/integration/address-correction-mail-repository.integration.ts` (novo)
- `apps/api-transportada/test/fixtures/address-correction-http.fixture.ts` (`sendMail`,
  `sendMailCalls`, `logCalls`)
- `apps/api-transportada/test/address-correction-http.contract.test.ts`,
  `test/address-correction-mail.contract.test.ts` (imports das suítes novas)
- `apps/api-transportada/package.json` (`test:integration` com o arquivo novo)
- `apps/api-transportada/package.json` (lista explícita de testes)

## T305

Os dois botões de envio no `AddressReportPanel` — "Enviar este endereço" por item e "Enviar todos
(N)" no cabeçalho da contratante — abrindo a mesma confirmação (`AddressCorrectionMailDialog`), com
os contatos marcáveis, a prévia "como veio → correto" e o `POST /address-correction-requests/mail`
(T304).

### `requestId` estava faltando no frontend

`GET /address-correction-requests` já serializa `id` (`address-correction.routes.ts`,
`serializeAddressCorrectionRequest`), mas `mapAddressCorrectionRequest` (T201) nunca lia esse campo
— `AddressCorrectionRequestRecord` não tinha `id`. Sem ele o envio unitário não tinha o que mandar em
`requestIds`. Corrigido nesta task: `id: string` obrigatório no tipo e no mapeamento (registro sem
`id` some da lista, mesmo padrão de `status`/`kind` desconhecidos). Os dois fixtures de teste que já
existiam (`address-correction.contract.ts`, `address-correction-status.contract.ts`) ganharam o
campo.

### `contractorId`: resolvido por `GET /contractors/by-tax-id/:taxId`, não uma rota nova

O relatório só traz `contractorTaxId` (RF do enunciado: "descubra como resolver pelo que a API
oferece; se não houver rota, PARE"). Achei a rota: `GET /contractors/by-tax-id/:taxId`
(`contractor.routes.ts`, `fleet.read`, devolve `{ data: Contractor }` com `id`). Permissão diferente
da do resto do fluxo (`settings.manage`), mas sem risco de acesso: `COMPANY_ROLE_PERMISSIONS`
(`authorization.policy.ts`) mostra que `settings.manage` só existe no papel `company-admin`, que
**também** tem `fleet.read` — quem chega à confirmação sempre tem a permissão da consulta. Erro
`CONTRACTOR_NOT_FOUND` (código diferente do `ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND` da própria
rota de envio) entra no mesmo mapa de mensagem.

### Seleção inicial dos contatos: os que já recebem ocorrência, não todos nem nenhum

RF5a diz "o operador marca quem recebe" a cada envio — decisão registrada aqui: a lista abre com os
contatos **ativos** que têm `receivesOccurrences: true` já marcados (é o mesmo público que a rotina
de ocorrência já avisa hoje), e o resto desmarcado. Nem a lista inteira marcada (RF5a não diz
"todos por padrão") nem nada marcado (o clique extra seria o caso comum). O operador ainda decide,
marcando ou desmarcando antes de confirmar — `initialAddressCorrectionMailContactIds` é pura e
testada com os três casos (ativo+ocorrência, ativo sem ocorrência, inativo). Contato inativo nunca
aparece na lista marcável (`activeAddressCorrectionMailContacts`).

### Sem contato ativo: aponta para "Clientes → E-mail com contratantes", sem deep-link de aba

Não existe registro programático de aba nesta app — `DeliveryClientWorkspace.page.tsx` sempre abre
em "Clientes" (`useState<DeliveryClientTabId>('clients')`), sem estado de aba na URL. Segui o padrão
existente de `cteProfilesNavigation.service.ts` (navegação de workspace inteiro via
`WorkspaceNavigator`, criado em `deliveryClientsNavigation.service.ts`), e o texto ao lado do botão
nomeia a aba ("E-mail com contratantes") para quem chegar em "Clientes" saber onde clicar.

### `invalidateMutationEffect` não entrou — mesma decisão de T201

O enunciado pedia `invalidateMutationEffect` para invalidar relatório e lista de pedidos. Não usei:
as duas chaves (`address-report`, `address-correction-requests`) são do **mesmo módulo**
(`nfe-workspace`) que a mutação, e `mutationInvalidation.service.ts` documenta esse registro como o
alcance **entre módulos** (`test/shared/mutation-invalidation.contract.ts`: "nenhum hook invalida a
chave de outro módulo por conta própria" — o inverso, mesma chave dentro do módulo dono, é o caminho
normal). `useAddressCorrectionForm.hook.ts` (T201) já invalida essas duas chaves direto por
`queryClient.invalidateQueries`, e esta task segue o mesmo hook irmão em vez de criar um efeito
cross-module para duas chaves que já pertencem a quem está invalidando.

### `Idempotency-Key`: mesmo padrão de `attemptToken`, sem teste de unidade dedicado

Gerada com `crypto.randomUUID()` dentro de `open()` e guardada em `useState` — o mesmo desenho de
`useNfseInvoiceBulkCancel.hook.ts` (`attemptToken`): estável entre `confirm()`s da mesma
confirmação (o estado não muda entre eles) e nova a cada `open()`. Não escrevi um teste de unidade
isolado para essa estabilidade: é estado React puro (sem ramificação a testar em isolamento), e o
`attemptToken` do hook irmão também não tem um — não há `renderHook`/`@testing-library/react` no
repo, e adicionar a infraestrutura só para este ponto seria desproporcional ao que a lista de testes
do enunciado pede ("contrato do serviço"). O que É testado: a montagem do corpo e o header
`idempotency-key` do POST (contrato do client), que é o que de fato viaja para o servidor.

### Botão desabilitado: 0 ou acima de 50

`canConfirmAddressCorrectionMail` reaproveita o teto do Resend (`ADDRESS_CORRECTION_MAIL_MAX_CONTACTS
= 50`, cópia por valor de `CONTRACTOR_MAIL_MAX_RECIPIENTS`, T302) — testado nos quatro limites do
enunciado (0, 1, 50, 51).

### Smoke Playwright: fica para a verificação final

Não rodei o smoke do envio de ponta a ponta — ele exige Keycloak e Resend configurados (o mesmo
motivo já registrado nas tasks anteriores desta spec para o envio de e-mail), e este worktree local
não tem os dois. Fica para a verificação no preview/staging, quando a stack completa estiver de pé.

### Verde

```
bun run typecheck
```

Resultado: exit 0 nas 6 apps (api, worker, cron, frontend-transportada, frontend-client,
frontend-landing).

```
bun run --cwd apps/frontend-transportada test
```

Resultado: **3739 pass**, 0 fail, 34828 `expect()`, 29 arquivos — inclui o novo
`address-correction-mail.contract.ts` (montagem do corpo unitário/completo, regra de habilitação do
botão nos quatro limites, seleção inicial dos contatos, filtro de contato ativo, mapa de código de
erro para os sete códigos + desconhecido, mapeamento das três respostas, e o client montando
`GET /contractors/by-tax-id/:taxId`, `GET /contractors/:id/contacts` e o `POST .../mail` com o
header `idempotency-key` e o corpo certo) e os dois fixtures atualizados com `id`.

```
bun run lint
```

Resultado: exit 0 nas 6 apps.

```
bun run --cwd apps/frontend-transportada build
```

Resultado: build concluído (`dist/` gerado, PWA `sw.js` gerado). O aviso de chunk grande
(`index-*.js`, `vectorBasemap.service-*.js`) é pré-existente, não desta task.

### Arquivos alterados

- `apps/frontend-transportada/src/modules/nfe-workspace/shared/addressCorrection.validation.ts`
  (`id` obrigatório em `AddressCorrectionRequestRecord` e no mapeamento)
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/addressCorrectionMail.validation.ts`
  (novo: contato, contratante e resultado do envio — cópia por valor da API)
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/addressCorrectionMail.service.ts`
  (novo: corpo do POST, regra do botão, seleção inicial, mapa de erro)
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/deliveryClientsNavigation.service.ts`
  (novo: navegação de workspace para "Clientes", mesmo padrão de `cteProfilesNavigation.service.ts`)
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/nfeWorkspaceClient.service.ts`
  (`getAddressCorrectionContractor`, `listAddressCorrectionContacts`, `sendAddressCorrectionMail`)
- `apps/frontend-transportada/src/modules/nfe-workspace/hooks/useAddressCorrectionMailDialog.hook.ts`
  (novo)
- `apps/frontend-transportada/src/modules/nfe-workspace/components/AddressCorrectionMailDialog.component.tsx`
  (novo)
- `apps/frontend-transportada/src/modules/nfe-workspace/components/AddressReportPanel.component.tsx`
  (os dois botões, o hook do diálogo, o diálogo renderizado)
- `apps/frontend-transportada/src/modules/nfe-workspace/styles/addressReport.module.css` (classes do
  diálogo e dos botões novos)
- `apps/frontend-transportada/src/modules/nfe-workspace/locales/nfeWorkspace.locale.json` e
  `nfeWorkspace.en.locale.json` (`addressReport.correction.mail.*`)
- `apps/frontend-transportada/test/nfe-workspace/address-correction-mail.contract.ts` (novo)
- `apps/frontend-transportada/test/nfe-workspace/address-correction.contract.ts` e
  `address-correction-status.contract.ts` (fixtures com `id`)
- `apps/frontend-transportada/test/nfe-workspace.contract.test.ts` (import da suíte nova)

## T306

Só documentação — nenhum arquivo de `src/` ou `test/` tocado.

- `specs/084-agenda-de-enderecos/tasks.md`: T20 marcada `[x]`, com a nota "Realizada pela spec 150
  (pedido de correção à contratante a partir do relatório)."
- `docs/ai-context/api-transportada.md`: seção nova "Pedido de correção de endereço à contratante
  (spec 150, realiza a 084 T20)" — as rotas `PUT`/`GET /address-correction-requests`, `POST
/address-correction-requests/mail`, a tabela `address_correction_requests`, o CRUD de
  `contractor_contacts`, `contractor_mail_messages.body_html`, `CONTRACTOR_MAIL_MAX_RECIPIENTS = 50`
  e `recipientName` no relatório, com as decisões da T304 (idempotência, `subject_id`,
  `carrierName`/`operatorName`) e o motivo de `404` vs `409` na contratante ausente.
- `docs/ai-context/frontend-transportada.md`: seção nova "'Clientes a atualizar' — pedido de correção
  de endereço (spec 150, realiza a 084 T20)" — a aba, os dois botões de envio, o diálogo de
  confirmação, o defeito de `requestId` ausente corrigido na T305, a resolução de `contractorId` por
  `GET /contractors/by-tax-id/:taxId` e o `ContractorContactsPanel` (spec 143 T013/T017).
- `docs/ai-context/worker-transportada.md`: seção nova "O e-mail à contratante sai para todos os
  destinatários, não só o primeiro (spec 150 T302)" — a correção de `toAddresses[0]`, o `to` como
  lista deduplicada, `html` opcional no gateway, `CONTRACTOR_MAIL_MAX_RECIPIENTS = 50` com contrato
  de paridade e a fila continuando a levar só `{ messageId }`.
- `apps/api-transportada/CLAUDE.md`: `address-correction` e `contractor-mail` entraram na lista de
  módulos (o segundo já existia desde a spec 143 e estava faltando na lista; corrigido de passagem,
  no mesmo parágrafo tocado por esta task). Invariante nova: a correção nunca edita `nfe_addresses`
  nem o XML, e a contratante é sempre resolvida pelo CNPJ do token, nunca do payload.
- `apps/worker-transportada/CLAUDE.md`: invariante nova na lista "Invariantes que valem antes de
  editar" — o e-mail à contratante sai num único envio com todos no `to`, teto
  `CONTRACTOR_MAIL_MAX_RECIPIENTS = 50` com contrato de paridade.
- `apps/frontend-transportada/CLAUDE.md`: **sem alteração**. Nenhum primitivo de design system novo
  nem invariante de núcleo surgiu desta spec que outro agente precise saber antes de editar — o
  formulário e o diálogo seguem primitivos já listados na tabela (`Select`, `Checkbox`), e a tabela
  em si não foi tocada (ela carrega contratos de design-system que cobram a referência a este
  arquivo).
- Documentação de rotas (OpenAPI/Scalar): confirmado por busca (`grep -rli "openapi\|scalar"`) que
  este repo não tem geração desse tipo — nada a atualizar, como a T103 já havia registrado.

### Gates

```
bun run format:check
```

Resultado: verde nos 8 arquivos tocados por esta task.

```
bun run --cwd apps/frontend-transportada test
```

Resultado: **3739 pass**, 0 fail, 34828 `expect()`, 29 arquivos — mesmo número da T305 (nenhum
arquivo de teste tocado; roda porque o `CLAUDE.md` da app foi tocado, mas ficou sem alteração de
conteúdo).

```
bun run --cwd apps/api-transportada test
```

Resultado: **5886 pass**, 23 skip, 0 fail, 20681 `expect()`, 174 arquivos (nenhum arquivo de teste
tocado por esta task; +1 em relação ao total da T304, de execução paralela entre tasks).

### Arquivos alterados

- `specs/084-agenda-de-enderecos/tasks.md` (T20 `[x]`)
- `docs/ai-context/api-transportada.md` (seção nova)
- `docs/ai-context/frontend-transportada.md` (seção nova)
- `docs/ai-context/worker-transportada.md` (seção nova)
- `apps/api-transportada/CLAUDE.md` (lista de módulos + invariante nova)
- `apps/worker-transportada/CLAUDE.md` (invariante nova)
- `specs/150-pedido-de-correcao-de-endereco/tasks.md` (T306 `[x]`)
- `specs/150-pedido-de-correcao-de-endereco/evidence.md` (esta seção)
- `specs/150-pedido-de-correcao-de-endereco/tasks.md` (T305 `[x]`)

## Correções da revisão final

Rodada de correção sobre os achados da revisão final (12 itens). Por instrução explícita, **não**
mexi na verificação `settings.status !== 'active'` de `send-address-correction-mail.use-case.ts`
(~linha 112, aguarda decisão do usuário) nem implementei limitador de taxa.

### 1 [ALTO] Envio concorrente = e-mail em dobro

`drizzle-address-correction-mail.repository.ts`: `.for('update')` nos dois ramos de
`findSendableRequests` (com e sem `requestIds`); `markRequestsSent` passou a filtrar
`eq(status, 'draft')` e a checar `.returning()` — menos linhas que as pedidas lança
`AddressCorrectionRequestNotSendableError` (a transação inteira desfaz, 409).

- **Vermelho**: removi temporariamente o `.for('update')` e neutralizei a checagem de
  `markRequestsSent` (`if (false)`) e rodei
  `test/integration/address-correction-mail-repository.integration.ts` — o teste novo (dois
  envios em paralelo do mesmo rascunho, chaves de idempotência diferentes) falhou: `fulfilled`
  veio com 2, não 1 (as duas transações venceram, duas mensagens/outbox).
- **Verde**: com o fix completo, `8 pass, 0 fail` no arquivo — exatamente um vence, o outro
  recebe `AddressCorrectionRequestNotSendableError`, um outbox só para o `thread_id` vencedor, o
  pedido fica `sent` com o `thread_id` do vencedor.
- **PUT concorrente com o envio** (segunda parte do item): não escrevi um teste de concorrência
  real separado para isso — a mecânica já é a mesma provada pelo teste sequencial existente ("um
  pedido enviado não é reaberto"): o `ON CONFLICT ... WHERE status = 'draft'` do `upsertDraft` só
  casa com a linha enquanto ela está fora do índice parcial; assim que o envio comita e a linha
  vira `sent`, qualquer `PUT` concorrente ou posterior deixa de achar conflito e insere um
  rascunho novo — o Postgres serializa a UPDATE/INSERT concorrentes na mesma linha via lock, e o
  predicado é reavaliado depois do lock liberar, então o resultado independe do timing. Decisão
  registrada aqui por limite de tempo desta rodada.

### 2 [MÉDIO] Paridade UF/IBGE

Novo `apps/frontend-transportada/test/nfe-workspace/brazilian-state-parity.contract.ts`, no
padrão de `physical-destination-parity.contract.ts` (worker): lê
`brazilian-state.constant.ts` (API) por texto, extrai os 27 pares `UF: 'prefixo'` por regex e
compara com `BRAZILIAN_STATE_IBGE_PREFIX` do frontend. Os dois já batiam (nenhuma correção de
comportamento) — o contrato existe para pegar divergência futura. Import em
`test/nfe-workspace.contract.test.ts`. Verde: `289 pass` em `test/nfe-workspace.contract.test.ts`.

### 3 [MÉDIO] `new Error` cru

`AddressCorrectionMailMessageNotPersistedError` nova (`address-correction.error.ts`), estende
`DiagnosableError` (mesmo padrão de `CompanySettingsPersistenceError`) — mensagem fixa, sem
interpolar dado de entrada, então pode ir ao log. Substitui o `new Error(...)` de
`recordMail` em `drizzle-address-correction-mail.repository.ts`.

### 4 [BAIXO] Strings repetidas → constantes

- `ADDRESS_CORRECTION_SEND_MAIL_OPERATION` (`address-correction-mail.constant.ts`), repetida
  entre `send-address-correction-mail.use-case.ts` e o repositório — extraída.
- `'active'` de `contractorContacts.status` → `CONTRACTOR_CONTACT_STATUSES[0]` (já exportado por
  `contractor-mail.schema.ts`, nunca redeclarado).
- `'active'` de `userCompanyMemberships.status` → `ACTIVE_MEMBERSHIP_STATUS`, importado de
  `nfe-documents/domain/active-membership-status.constant.ts` (já existia, reaproveitado).
- `'message.send.requested'` → `CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES[0]` (já exportado pelo schema).
- `'succeeded'` do idempotency record **não** foi extraído: só 1 ocorrência dentro do módulo
  `address-correction` (o padrão se repete em 8 domínios diferentes do repositório, cada um com a
  própria constante local — generalizar isso é fora do escopo desta rodada, tocaria 8 arquivos
  alheios a esta task).

### 5 [BAIXO] Dedupe do `to`/`recipientCount`

`send-address-correction-mail.use-case.ts`: `deduplicateRecipients` (minúsculas + `Set`, primeira
ocorrência vence) — cópia por valor do `deduplicateRecipients` do worker
(`send-contractor-mail-outbound-message.use-case.ts`). `recipientEmails` (o `to` gravado) e
`recipientCount` agora batem com o que o worker de fato vai enviar depois de deduplicar nele
também.

### 6 [BAIXO] Motivo pelo `matchLevel`

`address-correction-mail.template.ts`, `formatReason`: só `rooftop`/`range_interpolated` (casamento
de rua/número, `address-finding.policy.ts`) usam a distância; `approximate` (centroide do
município) e `not_found` viram "endereço não localizado" **mesmo com distância** —
`compare-addresses-batch.use-case.ts` (`toDistance`) mede a distância até o centroide para
`approximate` quando há coordenada, então o número por si só não provava casamento de rua.

- **Vermelho**: dois testes novos em `template.contract.ts` (`approximate`/`not_found` com
  distância não-nula) falhavam — o código antigo mostrava "localizado a X km".
- **Verde**: `27 pass` em `test/address-correction-mail.contract.test.ts` (25 antigos + 3 novos:
  os dois vermelhos e um confirmando `rooftop` com distância continua "localizado a X km").
- Tipo `AddressCorrectionMailReason.matchLevel` apertado de `string` para `ProviderMatchLevel`
  (import type de `database/address-comparison.schema.ts`); `toMailItem` no caso de uso faz o
  cast documentado (`reasonMatchLevel` é `varchar` no banco, sempre gravado a partir de
  `ProviderMatchLevel`).

### 7 [BAIXO] Idempotency-Key no frontend

Bug real: a chave era gerada só em `open()` e ficava fixa mesmo que o operador mudasse a seleção
de contatos antes de confirmar — um reenvio com seleção diferente reusaria a chave com corpo
diferente, e o servidor recusaria com `IDEMPOTENCY_KEY_REUSED` (409).

`resolveAddressCorrectionMailIdempotencyKey` nova, pura, em `addressCorrectionMail.service.ts`:
compara a seleção atual com a anterior (por conjunto, ordem não importa) e só chama `generateKey()`
quando elas divergem ou quando não há seleção anterior (`null`, forçado por `open()`).

- **Vermelho**: `resolveAddressCorrectionMailIdempotencyKey` não existia — `bun test` falhava com
  `SyntaxError: Export named ... not found`.
- **Verde**: `289 pass` em `test/nfe-workspace.contract.test.ts`, com os três testes pedidos
  (estável entre retries com a mesma seleção em qualquer ordem; nova ao reabrir; nova ao mudar a
  seleção).
- `useAddressCorrectionMailDialog.hook.ts`: troquei o `useState` fixo por um par
  (`contactSelectionSnapshot`, `idempotencyKey`) ajustado **durante a renderização** — o padrão
  oficial do React para "resetar estado quando um valor derivado muda", sem `useEffect`
  (`web.md` §5 proíbe `useEffect` para transformar dado, e aqui não há sistema externo para
  sincronizar). `open()` zera `contactSelectionSnapshot` para `null`, forçando chave nova mesmo
  que a seleção calculada bata com a da sessão anterior.

### 8 Segurança B1 — `.max(254)` no e-mail + CHECK no banco

- `contractor-contacts.routes.ts`: `EMAIL_MAX_LENGTH = 254` (RFC 5321 §4.5.3.1.3), aplicado em
  `createContactSchema` e `updateContactSchema`.
  - Vermelho: dois testes novos (`POST`/`PATCH` com e-mail de 259+ caracteres) esperando `400`
    falhavam com `201`/`200`. Verde depois do `.max()`: `129 pass` em
    `test/contractor-mail.contract.test.ts`.
- Migration aditiva `drizzle/20260915210000_contractor_contact_email_length_check/` — CHECK
  `contractor_contacts_email_length_check` (`length(email) <= 254`), gerada por
  `bun run db:generate --name contractor_contact_email_length_check` (com `snapshot.json`, nunca à
  mão) e renomeada de `20260915192737_...` para `20260915210000_...` para manter a ordem
  crescente com a migration mais recente já commitada (`20260915200000_contractor_mail_body_html`)
  — o `--name` do drizzle-kit usa o relógio local, que estava atrás do timestamp já commitado.
  `rollback.sql` no mesmo padrão de `contractor_mail_body_html/rollback.sql`.
  - **Conferido antes de aplicar**: não há seed nem rotina que grave `contractor_contacts` neste
    worktree (`local-identity-seed.service.ts`/`local-fleet-seed.service.ts` não tocam a tabela),
    e a migration rodou limpa contra o Postgres de teste descartável
    (`runDatabaseMigrations` de dentro do próprio teste de integração). **Não tenho acesso a
    staging/produção deste worktree** — se houver e-mail acima de 254 caracteres já gravado lá, a
    migration falharia ao aplicar (`ALTER TABLE ... ADD CONSTRAINT` valida linhas existentes por
    padrão) e precisa ser conferida por SQL direto antes do deploy (`select 1 from
contractor_contacts where length(email) > 254 limit 1`).
  - Novo teste de integração (`contractor-contacts-repository.integration.ts`): grava direto pelo
    repositório um e-mail de 259+ caracteres e espera rejeição — prova a CHECK contra Postgres de
    verdade, não só o Zod. Verde: `3 pass` no arquivo.
- Contrato de log sem PII espelhado do envio (item 12, mesma seção abaixo).

### 9 Segurança B2 — `sql.raw` do `ON CONFLICT ... WHERE`

`drizzle-address-correction.repository.ts`, `upsertDraft`: troquei
`targetWhere: sql\`${status} = ${sql.raw("'draft'")}\``por`targetWhere: eq(addressCorrectionRequests.status, DRAFT_STATUS)`
— **parametrizado, não literal**. O comentário antigo dizia que o Postgres só infere o índice
parcial de um literal; **provei o contrário** contra Postgres de verdade: rodei o teste que já
existia (`test/integration/address-correction-repository.integration.ts`, "um pedido enviado não é
reaberto: o rascunho novo é outra linha" — exatamente o teste que depende do `ON CONFLICT`reconhecer o índice parcial) antes e depois da troca,`6 pass`nos dois casos. A versão
parametrizada com`eq()`funciona igual à literal — mantive sem o`sql.raw`.

### 10 Segurança B3 — CPF/CNPJ fora da URL

Rota nova `POST /address-correction-requests/recipients`, body `{ contractorTaxId }`,
`settings.manage` (nunca `fleet.read`), 404 `ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND`:

- `find-address-correction-recipients.use-case.ts` (novo): resolve a contratante pelo CNPJ do
  corpo (`AddressCorrectionRepositoryPort.findContractorByTaxId`, dentro da `companyId` do token)
  e devolve os contatos **ativos** dela (reaproveita `contractorContacts.list`, que já faz BOLA por
  `getContractor`).
- `address-correction-request.schema.ts`: `parsePostAddressCorrectionRecipientsBody` (mesmo
  `buildTaxIdSchema(TAX_ID_PATTERN)` do envio).
- `address-correction.routes.ts`: rota nova, serialização própria (nunca `companyId`).
- `main.ts`: composição reaproveitando `addressCorrectionRepository` (já existente) e
  `contractorContacts.list` (já existente) — nenhum objeto novo de infraestrutura.
- Testes: unidade do caso de uso (contratante resolvido + só contato ativo; 404 estável quando não
  há contratante), HTTP (200 com o corpo certo, `cache-control: no-store`, 400 com CNPJ malformado,
  404 propagado, 403 sem `settings.manage`) — `28 pass` em `address-correction-http.contract.test.ts`,
  `29 pass` em `address-correction-mail.contract.test.ts`.
- **Frontend**: `getAddressCorrectionContractor` + `listAddressCorrectionContacts` (duas
  chamadas, CNPJ na URL da primeira) viraram `findAddressCorrectionRecipients` (uma chamada,
  `POST`, CNPJ no corpo). `mapAddressCorrectionRecipients` novo em `addressCorrectionMail.validation.ts`.
  `useAddressCorrectionMailDialog.hook.ts` colapsou as duas queries (`contractorQuery`+
  `contactsQuery`) numa só (`recipientsQuery`); `contactsFailed`/`contractorFailed`/
  `contactsLoading` viraram `recipientsFailed`/`recipientsLoading` (um único estado de
  erro/carregamento, já que é uma chamada só agora) — `AddressCorrectionMailDialog.component.tsx`
  ajustado. Teste do client reescrito para provar `request.url` **nunca** contém o CNPJ e o corpo
  do `POST` carrega `{ contractorTaxId }`. Verde: `289 pass` em `nfe-workspace.contract.test.ts`,
  build limpo.

### 11 H3 "para quem"

`recipientCount` nunca é uma coluna nova — é lido da mensagem `outbound` da conversa ligada pelo
`thread_id` (`left join` em `contractor_mail_messages`, `array_length(to_addresses, 1)`), porque um
pedido `sent` tem exatamente uma mensagem de saída naquela conversa (`address_correction` nunca
reabre a mesma `thread_id`).

- `AddressCorrectionRequest.recipientCount: number | null` novo no port; `drizzle-address-correction.repository.ts`
  (`listByCompany`) faz o `left join`; `toAddressCorrectionRequest` ganhou o parâmetro opcional
  (drafts e o repositório de envio sempre passam `null`).
- Rota `GET /address-correction-requests` expõe `recipientCount` na serialização.
- **Vermelho** (frontend): dois testes em `address-correction-status.contract.ts` (o `toEqual` do
  estado `sent` esperando `recipientCount`, e o estado `draft` esperando `recipientCount: null`)
  falhavam — a propriedade não existia em `AddressCorrectionStatus`. **Verde**: `289 pass`.
- `resolveAddressCorrectionStatus` (`addressCorrectionStatus.service.ts`) propaga
  `sent.recipientCount`; `AddressReportPanel.component.tsx` mostra `stateSentWithCount`
  (pluralizado, "Enviado a N contato(s) em …") quando há contagem, e mantém `stateSent` (só a
  data) como reserva para uma linha antiga sem mensagem ligada.
- Integração nova (`address-correction-repository.integration.ts`): grava conversa + mensagem
  outbound com 3 endereços de verdade no `to_addresses`, confere `recipientCount: 3` no pedido
  `sent` e `null` no `draft` — `7 pass` no arquivo, contra Postgres de verdade (prova o `left join`,
  não só o tipo).

### 12 Contrato de log sem PII (rotas de contatos)

`contractor-contacts.contract.ts`: fixture ganhou `logCalls` (mesmo padrão de
`address-correction-http.fixture.ts`); teste novo dispara `POST` e `PATCH` com e-mails "segredo" e
confere que nenhum aparece em `JSON.stringify(logCalls)`, inclusive no caminho de erro
(`ContractorContactEmailTakenError`). Verde: `130 pass` em `contractor-mail.contract.test.ts`.

### Gates finais

```
bun run typecheck   # 6 apps, exit 0
bun run lint        # 6 apps, exit 0
bun run format:check
```

Achou 3 arquivos fora de forma que esta task **não tocou**
(`specs/150-.../email-template.html`, `plan.md`, `spec.md` — pré-existentes) e 1 que tocou
(`address-correction-mail-repository.integration.ts`, formatado com `prettier --write`).

```
bun run --cwd apps/api-transportada test         # 5900 pass, 23 skip, 0 fail
bun run --cwd apps/frontend-transportada test    # 289 pass, 0 fail (test/nfe-workspace.contract.test.ts)
bun run --cwd apps/worker-transportada test      # 1344 pass, 0 fail
bun run --cwd apps/frontend-transportada build   # build limpo, PWA gerado
```

Integrações tocadas (Postgres nativo `127.0.0.1:65433`,
`DRIZZLE_TEST_DATABASE_URL=… bun --env-file=../../.env.test test … --timeout 120000`):

```
test/integration/address-correction-mail-repository.integration.ts   # 8 pass
test/integration/address-correction-repository.integration.ts        # 7 pass
test/integration/contractor-contacts-repository.integration.ts       # 3 pass
test/integration/contractor-mail-test-email-thread.integration.ts    # 5 pass
```

Não rodei a suíte `test:integration` inteira pelo mesmo motivo já registrado nas tasks
anteriores — só os arquivos que esta rodada tocou ou que exercitam o schema mexido
(`contractor_contacts`, `address_correction_requests`, `contractor_mail_messages`).

### Arquivos alterados (revisão final)

API:

- `src/address-correction/infrastructure/drizzle-address-correction-mail.repository.ts` (lock,
  `markRequestsSent` com checagem, erro diagnosticável, constantes)
- `src/address-correction/infrastructure/drizzle-address-correction.repository.ts` (`ON CONFLICT`
  parametrizado, `recipientCount` via `left join`)
- `src/address-correction/domain/address-correction.error.ts`
  (`AddressCorrectionMailMessageNotPersistedError`)
- `src/address-correction/domain/address-correction-mail.constant.ts`
  (`ADDRESS_CORRECTION_SEND_MAIL_OPERATION`)
- `src/address-correction/domain/address-correction-mail.template.ts` (`formatReason` por
  `matchLevel`)
- `src/address-correction/domain/address-correction-mail.types.ts` (`matchLevel: ProviderMatchLevel`)
- `src/address-correction/application/send-address-correction-mail.use-case.ts` (dedupe, constante,
  cast documentado de `matchLevel`)
- `src/address-correction/application/address-correction.port.ts` (`recipientCount`)
- `src/address-correction/application/find-address-correction-recipients.use-case.ts` (novo)
- `src/address-correction/presentation/address-correction.routes.ts` (rota `recipients`,
  `recipientCount` na serialização)
- `src/address-correction/presentation/address-correction-request.schema.ts`
  (`parsePostAddressCorrectionRecipientsBody`)
- `src/contractor-mail/presentation/contractor-contacts.routes.ts` (`.max(254)`)
- `src/database/contractor-mail.schema.ts` (CHECK `contractor_contacts_email_length_check`)
- `src/shared/api.constant.ts` (`API_ADDRESS_CORRECTION_REQUESTS_RECIPIENTS_PATH`)
- `src/main.ts` (composição do use case novo)
- `drizzle/20260915210000_contractor_contact_email_length_check/` (novo, com rollback)
- `test/address-correction-mail/template.contract.ts`,
  `test/address-correction-mail/send-mail-use-case.contract.ts`,
  `test/address-correction-mail/find-recipients-use-case.contract.ts` (novo),
  `test/address-correction-mail.contract.test.ts`
- `test/address-correction-http/routes.contract.ts`, `test/fixtures/address-correction-http.fixture.ts`
- `test/contractor-mail/contractor-contacts.contract.ts`
- `test/integration/address-correction-mail-repository.integration.ts`,
  `test/integration/address-correction-repository.integration.ts`,
  `test/integration/contractor-contacts-repository.integration.ts`
- `test/database-migration/static-migration.contract.ts` (lista de diretórios)

Frontend:

- `src/modules/nfe-workspace/shared/addressCorrection.validation.ts` (`recipientCount`)
- `src/modules/nfe-workspace/shared/addressCorrectionStatus.service.ts` (`recipientCount` no
  status `sent`)
- `src/modules/nfe-workspace/shared/addressCorrectionMail.service.ts`
  (`resolveAddressCorrectionMailIdempotencyKey`)
- `src/modules/nfe-workspace/shared/addressCorrectionMail.validation.ts`
  (`mapAddressCorrectionRecipients`, `AddressCorrectionRecipients`)
- `src/modules/nfe-workspace/shared/nfeWorkspaceClient.service.ts`
  (`findAddressCorrectionRecipients` substitui as duas rotas antigas)
- `src/modules/nfe-workspace/hooks/useAddressCorrectionMailDialog.hook.ts` (query única, chave de
  idempotência reativa à seleção)
- `src/modules/nfe-workspace/components/AddressCorrectionMailDialog.component.tsx`
  (`recipientsFailed`/`recipientsLoading`)
- `src/modules/nfe-workspace/components/AddressReportPanel.component.tsx` (badge com contagem)
- `src/modules/nfe-workspace/locales/nfeWorkspace.locale.json`,
  `nfeWorkspace.en.locale.json` (`stateSentWithCount`)
- `test/nfe-workspace/address-correction-mail.contract.ts`,
  `test/nfe-workspace/address-correction-status.contract.ts`,
  `test/nfe-workspace/brazilian-state-parity.contract.ts` (novo)
- `test/nfe-workspace.contract.test.ts` (import da suíte nova)

## T401

Liberação do envio (RF16/RF17): o envio sai com o remetente verificado, sem esperar a ida e volta
da 143.

- **Migration aditiva** `20260915220000_contractor_mail_sending_verified_at`:
  `contractor_mail_settings.sending_verified_at timestamptz NULL`, com `rollback.sql` e
  `snapshot.json` (gerado por `db:generate --name tmp_t401`, `migration.sql` gerado idêntico ao
  escrito à mão, `prevIds` encadeado em `20260915210000`). Entrou na lista explícita de
  `static-migration.contract.ts`. O worker **não** mudou: ele lê `contractor_mail_settings` só
  pelas colunas do envio (id, envelope, remetente, domínio) e nunca confere `status` — a cópia do
  schema dele declara só o que toca.
- **Lista de verificação** (`runChecks`): grava `sending_verified_at = now()` quando `api_key` e
  `sender_domain` saem `ok`, e `null` em qualquer outro caso — sempre com
  `WHERE version = <versão lida>` e **sem** subir `version` (o formulário aberto não recebe 409 por
  ter rodado a lista; um `PUT` que venceu no meio não herda a verificação antiga).
- **`saveSettings`** zera a coluna quando o remetente muda ou a chave muda de valor
  (`apiKeyChanged`, comparada com a chave selada antes; reenviar a mesma chave não zera).
- **Política pura** `contractor-mail/domain/mail-send-readiness.policy.ts`:
  `resolveMailSendReadiness({ settings, template? })` → `{ ready: true, settings }` ou
  `{ ready: false, reason: 'not_configured' | 'sending_not_verified' | 'template_missing' }`.
  `template` omitido = o envio ainda não exige modelo (a T402 liga); `null` = procurado e ausente.
- **Erros**: `CONTRACTOR_MAIL_SENDING_NOT_VERIFIED` (409) e `CONTRACTOR_MAIL_TEMPLATE_MISSING`
  (409, só definido — usado na T402), via `createMailSendReadinessError(reason)`.
- **Consumidores**: `POST /address-correction-requests/mail` e `POST
/contractor-mail-settings/test-email` usam a política; `settings.status !== 'active'` saiu do
  envio de correção. `status` da 143 continua existindo com o mesmo significado (linha no
  comentário do schema).
- **Resposta**: `GET`/`PUT /contractor-mail-settings` expõe `sendingVerifiedAt` (ISO ou `null`),
  sem segredo; validador `hasExactKeys` do frontend aceita o campo novo.

### Vermelho

Com as duas classes de erro já criadas (para o vermelho medir comportamento, não import ausente):

- `bun test ./test/contractor-mail/settings-use-case.contract.ts
./test/contractor-mail/send-test-email-use-case.contract.ts
./test/contractor-mail/mail-send-readiness-policy.contract.ts` → **25 pass, 8 fail**: os 6 de
  "contractor mail sending verification (spec 150 T401, RF16)" (a lista não gravava nada,
  `resetSendingVerification` não existia), "refuses with SENDING_NOT_VERIFIED" do e-mail de teste
  (saía sem verificação), e a política (`Cannot find module mail-send-readiness.policy.js`).
- `bun test ./test/address-correction-mail.contract.test.ts` → **13 fail**: com a configuração em
  `pending` e envio verificado, o use case lançava `ContractorMailNotConfiguredError` em todo envio
  (inclusive "sends with the 143 round-trip still pending once the sender is verified").
- Integração (`DRIZZLE_TEST_DATABASE_URL=…65433`, `--env-file=../../.env.test`)
  `contractor-mail-settings-repository.integration.ts` → **6 pass, 1 fail** ("records the sending
  verification on the read version…": coluna/método inexistentes). Não pulou.

### Verde

- `bun run --cwd apps/api-transportada test` → **5918 pass, 23 skip, 0 fail** (174 arquivos).
- Integração (Postgres nativo 65433, não pulou): `contractor-mail-settings-repository`,
  `address-correction-mail-repository`, `contractor-mail-test-email-thread`,
  `contractor-contacts-repository` → **23 pass, 0 fail**.
- `database-migration.integration.ts` → 1 fail, a falha conhecida e alheia
  (`cte-profile-output-constraints`, 23001 em vez de 23503 no Postgres 18 local).
- `bun run --cwd apps/frontend-transportada test` → **3743 pass, 0 fail**.
- `bun run typecheck` → ok (todas as apps). `bun run lint` → ok.
- `prettier --check`: só `specs/150-…/email-template.html` segue acusando (já commitado antes,
  alheio a esta task).

Arquivos: `drizzle/20260915220000_contractor_mail_sending_verified_at/*`,
`src/database/contractor-mail.schema.ts`, `src/contractor-mail/domain/mail-send-readiness.policy.ts`
(novo), `src/contractor-mail/domain/contractor-mail.error.ts`,
`src/contractor-mail/application/{contractor-mail.port,contractor-mail-settings.use-case,send-contractor-mail-test-email.use-case}.ts`,
`src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.ts`,
`src/contractor-mail/presentation/contractor-mail-settings.routes.ts`,
`src/address-correction/{application/address-correction-mail.port,application/send-address-correction-mail.use-case,infrastructure/drizzle-address-correction-mail.repository}.ts`;
testes `test/contractor-mail/mail-send-readiness-policy.contract.ts` (novo, importado em
`test/contractor-mail.contract.test.ts`), `settings-use-case`, `send-test-email-use-case`,
`settings-routes`, `process-inbound-email-webhook-use-case`, `send-mail-use-case`, fixture HTTP,
`static-migration.contract.ts`, integrações `contractor-mail-settings-repository` e
`address-correction-mail-repository`; frontend `contractorMailSettings.types.ts`,
`contractorMailSettingsResponse.validation.ts` e os dois contratos de `delivery-clients`.

## T402

Modelos de e-mail na API (RF13–RF15, com RF12 no escape). O envio passa a exigir modelo:
`resolveMailSendReadiness` recebe `template` (o achado ou `null`), então `template_missing` agora
é alcançável. O e-mail de teste continua sem passar `template` e não exige modelo.

- **Migration aditiva** `20260915230000_contractor_mail_templates`: tabela
  `contractor_mail_templates`, mais `contractor_mail_messages.template_id uuid NULL` com FK composta
  `(company_id, template_id) → (company_id, id)`. Para ser alvo dessa FK, a tabela nova tem único
  `(company_id, id)`. Também tem único `(company_id, mail_type, lower(name)) where status =
'active'` e único parcial `(company_id, mail_type) where is_default and status = 'active'`.
  CHECKs:
  - `mail_type` contra o catálogo e `status` em `active|archived`;
  - nome com 1..120 caracteres, assunto 1..200 e sem `\r`/`\n`, abertura e assinatura 1..4000,
    `item_text` até 4000;
  - `default_active`: arquivado nunca é padrão;
  - `version > 0`.

  `snapshot.json` gerado por `db:generate --name tmp_t402` e renomeado para depois de
  `20260915220000`. O `prevIds` encadeia em `fbc7ef36…` (a T401) e o `migration.sql` é o gerado,
  sem edição. Colunas `text` com CHECK, não `varchar`: é o padrão das outras tabelas de
  `contractor-mail.schema.ts`, e nenhuma usa ENUM nativo. Entrou na lista explícita de
  `static-migration.contract.ts`.

- **`rollback.sql`** verificado num banco descartável do Postgres 65433 (script em scratchpad).
  Depois de migrar: `{table: contractor_mail_templates, column: 1, journal: 1}`. Depois do rollback:
  `{table: null, column: 0, journal: 0}`. Reaplicado: `{…, column: 1, journal: 1}`.
- **Nenhum modelo em migration ou seed** (ADR-0021). O padrão sugerido vive no catálogo e só vira
  linha quando o operador salva.
- **Worker**: não mudou. Ele não lê modelo, e a coluna nova de `contractor_mail_messages` é
  anulável, então a gravação da mensagem `inbound` segue igual.
- **Imagem de runtime**: `contractor-mail.schema.ts` passou a importar
  `contractor-mail/domain/mail-template-catalog.constant.ts` (tipos, status e tetos). O `Dockerfile`
  da API ganhou `COPY src/contractor-mail/domain`, no mesmo molde de `companies/domain` e
  `cte-profiles/domain`. Sem essa linha, `pre-deploy.contract.ts` ("a imagem de runtime copia todo o
  grafo de imports do pre-deploy") reprova, e o contêiner morreria com `Cannot find module`.

### Catálogo e renderização

- `contractor-mail/domain/mail-template-catalog.constant.ts` define os tipos
  (`address_correction`) e as variáveis de cada tipo, cada uma com descrição em pt-BR para a T403
  listar:
  - do e-mail: `contratante`, `quantidade`, `clientes`, `transportadora`, `operador`;
  - de item: `cliente`, `endereco_como_veio`, `endereco_correto`, `motivo`, `cep_como_veio`,
    `cep_correto`, `municipio`, `uf`.

  O catálogo traz também o modelo padrão sugerido e os tetos de tamanho.

- `contractor-mail/domain/mail-template-render.policy.ts` tem três funções puras:
  - `validateMailTemplate` devolve todos os erros por campo, de uma vez. Recusa variável
    desconhecida, variável de item fora de `itemText` e chave solta ou malformada (`{`, `}`, `{}`,
    `{Maiúscula}`, `{{x}}`).
  - `renderMailTemplate` com `format: 'html'` escapa o texto inteiro depois de substituir: o texto
    digitado e o valor de terceiro, os dois. Com `format: 'text'`, sai literal.
  - `escapeMailHtml` passou a ser o único escape do e-mail; o builder usa este.
- **Decisão de singular/plural**: `{quantidade}` é só o número. A concordância ficou numa variável
  própria do e-mail, `{clientes}`, que vira "1 cliente" ou "N clientes". O assunto sugerido é
  `Correção de endereço de entrega — {clientes}`, que sai idêntico ao assunto aprovado com 1 ou com
  N itens (contrato "{clientes} concorda com a quantidade"). Sem a variável, um texto fixo não teria
  como saber quantos itens vão no envio.
- **Decisão do encaixe do `item_text`**: o RF13 diz que os blocos de endereço são fixos. Cada bloco
  segue o desenho aprovado: número, nome do cliente, "Como veio na nota" e "Endereço correto". O
  `item_text` renderizado ocupa a **última linha do bloco**, na linha âmbar onde o desenho aprovado
  põe o motivo (13px, `#8a4f1d`). O padrão sugerido é `Motivo: {motivo}.`, que reproduz a linha
  aprovada. `item_text` vazio não deixa linha no bloco. No texto puro, o item entra depois de
  "Endereço correto:".
- **Abertura e assinatura**: linha em branco separa parágrafos, e cada quebra de linha simples vira
  `<br>`. Quando a assinatura tem mais de um parágrafo, o último sai no estilo de assinatura do
  desenho: primeira linha em negrito, as demais em cinza (`#6b7c85`). Com o padrão sugerido, o html
  bate caractere a caractere com o de `email-template.html` nessa parte.
- **Diferenças do desenho aprovado**:
  - o "Motivo:" e o nome da contratante na saudação perdem o `<strong>`, porque o modelo é texto e
    não aceita marcação;
  - o texto puro (`text`) sai idêntico ao da T303, palavra por palavra (contrato "o modelo padrão
    reproduz o texto aprovado").
- **Assunto**: quebra de linha vinda de valor vira espaço, porque o assunto é cabeçalho de e-mail.
  O schema HTTP e a CHECK do banco também recusam quebra no texto do assunto.
- **Variável do e-mail dentro de `item_text`** é aceita: o RF14 só proíbe o contrário.
- **Prévia**: dados fictícios de `email-template.html` (`address-correction-mail-sample.constant.ts`).
  O caso de uso recebe um renderizador por tipo, ligado em `main.ts`, para o módulo
  `contractor-mail` não importar `address-correction`.

### Contrato HTTP

Todas as rotas exigem `settings.manage`, tiram `companyId` e ator do token e respondem com
`cache-control: no-store`. A resposta lista os campos `id`, `mailType`, `name`, `subject`, `intro`,
`itemText`, `closing`, `isDefault`, `status`, `version` (texto) e `updatedAt`; nunca inclui
`companyId` nem `actorUserId`.

| Rota                                          | Resposta                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /contractor-mail-templates/catalog`      | `200 {data: [{mailType, label, mailVariables[], itemVariables[], suggestedTemplate}]}`                                          |
| `GET /contractor-mail-templates?mailType=`    | `200 {data: [modelo…]}`, ativos e arquivados, só da empresa. `mailType` fora do catálogo ou chave de query desconhecida → `400` |
| `GET /contractor-mail-templates/:id`          | `200`, ou `404 CONTRACTOR_MAIL_TEMPLATE_NOT_FOUND` (também para o de outra empresa)                                             |
| `POST /contractor-mail-templates`             | body `{mailType, name, subject, intro, itemText, closing}` estrito → `201`. O primeiro modelo ativo do tipo nasce padrão        |
| `PATCH /contractor-mail-templates/:id`        | body `{version, name?, subject?, intro?, itemText?, closing?, status?: 'archived'}`, com pelo menos uma mudança                 |
| `POST /contractor-mail-templates/:id/default` | body `{version}`. Troca atômica: desmarca o anterior e marca o novo na mesma transação, sob advisory lock de `(empresa, tipo)`  |
| `POST /contractor-mail-templates/preview`     | `{templateId}` ou `{mailType, subject, intro, itemText, closing}` → `200 {data: {subject, html, text}}`. Nunca envia nem grava  |

Recusas:

- **`PATCH`**:
  - versão velha → `409 CONTRACTOR_MAIL_TEMPLATE_VERSION_CONFLICT`;
  - modelo arquivado → `409 CONTRACTOR_MAIL_TEMPLATE_ARCHIVED` (arquivado não volta; `status:
'active'` é `400`);
  - arquivar o padrão tira o padrão.
- **Padrão**: arquivado → `409 CONTRACTOR_MAIL_TEMPLATE_ARCHIVED`.
- **Validação**: `400 INVALID_REQUEST` com `details[]` por campo, tanto de forma (Zod) quanto de
  variável (caso de uso).
- **Nome duplicado** (por caixa, só entre os ativos do tipo) → `409
CONTRACTOR_MAIL_TEMPLATE_NAME_TAKEN` com `details[{field: 'name'}]`.

**Envio**: `POST /address-correction-requests/mail` aceita `templateId?` (uuid). Sem ele, vale o
padrão ativo do tipo.

- Sem padrão → `409 CONTRACTOR_MAIL_TEMPLATE_MISSING`, pela política. `SENDING_NOT_VERIFIED` e
  `NOT_CONFIGURED` vêm antes.
- `templateId` arquivado, de outro tipo, de outra empresa ou inexistente → `409
CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE`, resposta única que não revela qual dos quatro casos foi.
- A mensagem grava `template_id`.
- O `templateId` entra no fingerprint de idempotência **só quando escolhido**. O envio pelo padrão
  mantém o fingerprint de antes, então uma chave gravada antes deste deploy segue fazendo replay.

O mapa de erros da T305 no frontend ganhou `CONTRACTOR_MAIL_TEMPLATE_MISSING` e
`CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE`, com as mensagens `templateMissing`/`templateNotUsable` em
pt-BR e en.

**Logs**: nenhum texto de modelo vai para log. O contrato "never logs template text, even when the
request fails" confere isso com três pedidos, dois deles recusados.

### Vermelho

Contrato de tenant escrito antes de qualquer código:

- `test/contractor-mail-schema/template-tenant-safety.contract.ts` confere a FK de `companies`, o
  único `(company_id, id)`, a FK composta da mensagem e os filtros `company_id` + id e `company_id`
  (+ `mail_type`).
- `test/integration/contractor-mail-template-repository.integration.ts` confere:
  - modelo de outra empresa não é listado, lido, editado nem marcado padrão;
  - nome único por empresa e tipo, por caixa, só entre os ativos;
  - o banco recusa dois padrões ativos;
  - duas trocas de padrão concorrentes nunca deixam dois padrões;
  - o primeiro modelo nasce padrão, e arquivar o padrão tira o padrão;
  - versão velha não grava;
  - FK composta com modelo de outra empresa;
  - o envio só acha modelo ativo, do tipo e da própria empresa.

Resultado:

- `bun test ./test/contractor-mail-schema.contract.test.ts` → **0 pass, 1 fail** (`Cannot find
module …/drizzle-contractor-mail-template.repository.js`).
- A integração (`DRIZZLE_TEST_DATABASE_URL=…65433`, `--env-file=../../.env.test`) → **0 pass, 1
  fail**, mesmo motivo. Não pulou.

### Verde

- `bun run --cwd apps/api-transportada test` → **5974 pass, 23 skip, 0 fail** (174 arquivos). Na
  T401 eram 5918. Suítes novas:
  - `mail-template-render-policy.contract.ts` (validação, chaves soltas, escape);
  - `templates-routes.contract.ts` (18 contratos de rota, com tenant 404 em leitura, edição, padrão
    e prévia, e sem texto em log);
  - template com modelo (texto aprovado palavra por palavra, cores e estrutura, variáveis por item,
    `{clientes}` no singular e no plural, item vazio, escape de marcação digitada, assunto sem
    quebra);
  - caso de uso de envio (padrão, `templateId`, sem padrão → `TEMPLATE_MISSING`, arquivado ou de
    fora → `NOT_USABLE`, verificação antes do modelo, fingerprint);
  - rota de envio (`templateId` repassado, não-uuid `400`, códigos estáveis).
- Integração no Postgres nativo 65433, sem pular → **31 pass, 0 fail** em 5 arquivos:
  - `contractor-mail-template-repository` (8/8);
  - `address-correction-mail-repository`, que agora confere o `template_id` gravado;
  - `contractor-mail-settings-repository`;
  - `contractor-mail-test-email-thread`;
  - `contractor-contacts-repository`.
- `database-migration.integration.ts` → 1 fail, a falha conhecida e alheia
  (`cte-profile-output-constraints`, 23001 em vez de 23503 no Postgres 18 local).
- `bun run --cwd apps/frontend-transportada test` → **3743 pass, 0 fail**.
- `bun run typecheck` → ok (todas as apps). `bun run lint` → ok. `prettier --check` dos arquivos
  tocados → ok.

Arquivos:

- **Migration**: `drizzle/20260915230000_contractor_mail_templates/{migration.sql,rollback.sql,snapshot.json}`.
- **Banco e imagem**: `src/database/{contractor-mail.schema,database.schema}.ts`, `Dockerfile`.
- **Módulo `contractor-mail`**:
  - domínio: `domain/{mail-template-catalog.constant,mail-template-render.policy,contractor-mail-template.error}.ts`;
  - aplicação: `application/{contractor-mail-template.port,contractor-mail-templates.use-case}.ts`;
  - infraestrutura: `infrastructure/drizzle-contractor-mail-template.repository.ts`;
  - apresentação: `presentation/contractor-mail-templates.{routes,schema}.ts`.
- **Módulo `address-correction`**:
  - domínio: `domain/{address-correction-mail.template,address-correction-mail.types,address-correction-mail-format.policy,address-correction-mail-sample.constant}.ts`;
  - aplicação e infraestrutura: `application/{address-correction-mail.port,send-address-correction-mail.use-case}.ts`,
    `infrastructure/drizzle-address-correction-mail.repository.ts`;
  - apresentação: `presentation/{address-correction.routes,address-correction-request.schema}.ts`.
- **Transversais**: `src/shared/api.constant.ts`, `src/main.ts`.
- **Testes**:
  - contratos novos `test/contractor-mail/{mail-template-render-policy,templates-routes}.contract.ts`
    (importados em `test/contractor-mail.contract.test.ts`) e
    `test/contractor-mail-schema/template-tenant-safety.contract.ts`;
  - fixture nova `test/fixtures/contractor-mail-templates-http.fixture.ts`;
  - integração nova `test/integration/contractor-mail-template-repository.integration.ts`, na lista
    `test:integration` do `package.json`;
  - ajustados: `template`, `send-mail-use-case`, `mail-routes`, `static-migration`, fixture HTTP de
    contractor-mail (exporta o roteador de teste) e a integração `address-correction-mail-repository`.
- **Frontend**: `addressCorrectionMail.service.ts`, `nfeWorkspace{,.en}.locale.json` e
  `test/nfe-workspace/address-correction-mail.contract.ts`.

## T403

Seção "Modelos" na página "E-mail com contratantes" (módulo `delivery-clients`, aba "mail" ao lado
da configuração da 143 e dos contatos da T301), consumindo o contrato HTTP da T402.

- **Cópia por valor do catálogo/tipo/status/tetos** em
  `shared/contractorMailTemplates.types.ts` — o bundle não importa `mail-template-catalog.constant.ts`
  da API, no mesmo padrão de `contractorMailSettings.types.ts`.
- **Client HTTP** `shared/contractorMailTemplatesClient.service.ts`: `getCatalog`, `listTemplates`,
  `getTemplate`, `createTemplate`, `updateTemplate`, `setDefault`, `preview`. `ContractorMailTemplatesRequestError`
  carrega `details: ReadonlyMap<field, message>` do `error.details[]` (`web.md` §11), no mesmo molde de
  `ContractorContactsRequestError`.
- **Validação de resposta** `shared/contractorMailTemplatesResponse.validation.ts`: `hasExactKeys` em
  catálogo, modelo (único e lista) e prévia — recusa campo a mais ou a menos com
  `ContractorMailTemplatesResponseError` explícito, em vez de deixar passar em silêncio.
- **Validação client-side** `shared/contractorMailTemplate.validation.ts`, puro, espelhando
  `mail-template-render.policy.ts#validateMailTemplate` (T402) e os tetos do schema HTTP: mesmo
  tokenizador de `{variavel}` (chave solta recusada), variável de item só em `itemText`, variável
  desconhecida recusada, nome até 120, assunto até 200 sem quebra de linha, demais campos até 4000.
  O servidor continua sendo a verdade — esta validação só adianta o aviso antes do `POST`/`PATCH`.
- **Inserção de variável** `shared/mailTemplateVariableInsertion.service.ts`: `insertMailTemplateVariable`
  é pura (recebe `text`/`selectionStart`/`selectionEnd`/`name`, devolve `{text, cursorPosition}`) — o
  componente só lê `selectionStart`/`selectionEnd` do campo com foco e repassa; `setSelectionRange`
  depois do insert usa `requestAnimationFrame` para caber no próximo paint. `isItemVariableEnabled`
  decide o habilitar/desabilitar das variáveis de item pelo campo com foco (RF14: só em "Texto de
  cada endereço"; nos demais, desabilitadas com `mailTemplates.itemVariablesDisabledHint`).
- **Mapa de erro→locale** `shared/contractorMailTemplateErrors.service.ts`: os códigos do T402
  (`…_ARCHIVED`, `…_NAME_TAKEN`, `…_VERSION_CONFLICT`, `…_NOT_FOUND`, `INVALID_REQUEST`) e um genérico
  com `{{code}}` para o resto.
- **Hooks**: `useContractorMailTemplates.hook.ts` (TanStack: `catalogQuery`, `templatesQuery` por
  `mailType`, mutações `create`/`update`/`setDefault` invalidando a lista, `preview` sem invalidação
  — não persiste nada) e `useContractorMailTemplateEditor.hook.ts` (estado do editor: rascunho, campo
  com foco, `registerField`/`insertVariable`/`attemptSubmit`, erros por campo). `seed` (padrão
  sugerido ou em branco) entra como valor inicial do `useState` — nunca com `setState` durante o
  render — e só vale para criação; editar sempre parte do `template`.
- **`ContractorMailTemplatesPanel`**: lista com selo "Padrão"/"Arquivado" e ação "Editar"; seletor de
  tipo (`Select`) só aparece quando o catálogo tem mais de um tipo — hoje sempre 1, sem texto de tipo
  fixo no front além do rótulo que o catálogo devolve; "Criar a partir do padrão"/"Novo em branco";
  diálogo de confirmação de arquivamento (`useModalDialog` + `createPortal`, mesmo molde do
  `CompanyUserRemoveDialog` da identity). O tipo efetivo (`effectiveMailType`) é derivado do catálogo
  a cada render — sem `setState` condicional durante o render — porque o catálogo (uma chamada da
  hook) precisa resolver antes da lista de modelos (outra chamada da mesma hook, cache compartilhado
  pela `queryKey`) poder ser habilitada com o tipo certo.
- **`ContractorMailTemplateEditor`**: nome + `subject`/`intro`/`itemText`/`closing` (textareas),
  painel de variáveis com `Tooltip` (descrição) e botão "Inserir"; erro de validação client-side por
  campo (`showErrors` só depois do primeiro `attemptSubmit`, igual ao padrão de `touchedEmail` da
  T301); lista de campos recusados pelo servidor com atalho que rola e foca
  (`focusFieldByLabel` + `useRevealedPanel`, `web.md` §11 — mesmo padrão do `InvalidFieldsHint` da
  fleet, reescrito aqui porque aquele componente é `fleet`-locale-only); "Tornar padrão" (só ativo e
  não padrão) e "Arquivar" (só ativo) desaparecem no modelo arquivado, que também desabilita os
  campos. Conflito de versão (`CONTRACTOR_MAIL_TEMPLATE_VERSION_CONFLICT`) só mostra a mensagem —
  nunca limpa o rascunho, o texto digitado não se perde.
- **Prévia**: "Ver prévia" chama `POST /preview` com o conteúdo não salvo (`{mailType, ...content}`),
  mostra o assunto, um `<iframe sandbox="" srcDoc={html}>` (nunca `dangerouslySetInnerHTML`, sem
  `allow-scripts`) e o texto puro abaixo, sempre visível — sem aba escondendo um dos dois, por
  simplicidade (o pedido permitia "aba ou alternância").
- **CSP**: `frame-src` era `'none'` desde a ADR-0037 (nenhum `iframe` no bundle). A prévia abre o
  primeiro — `contentSecurityPolicy.service.ts` mudou para `frame-src 'self'`: `about:srcdoc` de um
  iframe sandbox é resolvido contra a origem do documento que o criou, então `'self'` basta, e
  terceiro continua fora (nenhuma diretiva nova, só o valor desta). `frame-ancestors` e `object-src`
  continuam `'none'`. Contrato ajustado:
  `test/shared/content-security-policy.contract.ts` ("allows only same-origin frames, and forbids
  embedding this app in any frame").
- **Locale**: `mailTemplates.*` em `deliveryClients{,.en}.locale.json` — título, rótulos de campo,
  variáveis, prévia, ações, diálogo de arquivamento, mensagens de validação e de erro do servidor.
  Acentuação conferida pelo `locale-accents.contract.ts` (dentro do `design-system.contract.test.ts`).
- **Estilos**: `styles/contractorMailSettings.module.css` ganhou as classes da seção (lista, selos,
  editor, painel de variáveis, prévia, diálogo). `min-height` de textarea usa o valor de exceção
  `5rem` do `field-metrics.contract.ts` (não há token de altura para textarea multilinha); o ponto de
  quebra do layout de duas colunas usa `64rem` (um dos quatro do `responsive.contract.ts`, não `60rem`
  como na primeira tentativa).
- **Página**: `DeliveryClientWorkspace.page.tsx` — `ContractorMailTemplatesPanel` entra na aba "mail",
  entre a configuração (143) e os contatos (T301).

### Vermelho→verde

Sem vermelho formal (task `sonnet`, serviço puro sem caso de uso de domínio) — os testes foram
escritos junto com cada serviço e falharam com o serviço ausente até a implementação. Gates finais:

- `bun run typecheck` (raiz, todas as apps) → ok.
- `bun run lint` (raiz, todas as apps) → ok, depois de ajustar dois testes do client HTTP que
  usavam `async` sem `await` (`@typescript-eslint/require-await`) e um `await expect(...).rejects`
  desnecessário (`@typescript-eslint/await-thenable`) — corrigido para o padrão já usado em
  `fuel-prices.contract.ts` (`expect(promise).rejects...` sem `await`/`return`).
- `bun run --cwd apps/frontend-transportada test` → **3784 pass, 0 fail** (29 arquivos; eram 3743 na
  T402 do evidence.md, mais os 5 arquivos novos desta task). Novas suítes:
  `contractor-mail-templates-validation.contract.ts` (nome, conteúdo, tokenizador),
  `contractor-mail-templates-variable-insertion.contract.ts` (inserção na posição do cursor,
  seleção, limites de índice, habilitação por campo focado),
  `contractor-mail-templates-response.contract.ts` (catálogo/modelo/lista/prévia, campo a mais ou
  status desconhecido recusados), `contractor-mail-templates-errors.contract.ts` (mapa completo +
  genérico) e `contractor-mail-templates-client.contract.ts` (rota e corpo de cada método com
  `fetch` fake, token no header, `details` do erro, falha de transporte).
- `bun run --cwd apps/frontend-transportada build` → ok (`dist/assets/DeliveryClientWorkspace.page-*.js`
  53.16 kB gzip 13.45 kB; nenhum novo aviso de tamanho além do que já existia).
- `prettier --check` dos arquivos tocados → ok, depois de `--write` nos 7 que faltavam.

### Arquivos

- **Novos**: `shared/{contractorMailTemplates.types,contractorMailTemplatesClient.service,
contractorMailTemplatesResponse.validation,contractorMailTemplate.validation,
mailTemplateVariableInsertion.service,contractorMailTemplateErrors.service}.ts`,
  `hooks/{useContractorMailTemplates,useContractorMailTemplateEditor}.hook.ts`,
  `components/{ContractorMailTemplatesPanel,ContractorMailTemplateEditor}.component.tsx`.
- **Testes novos**: `test/delivery-clients/contractor-mail-templates-{validation,
variable-insertion,response,errors,client}.contract.ts`, importados em
  `test/delivery-clients.contract.test.ts`.
- **Ajustados**: `pages/DeliveryClientWorkspace.page.tsx`,
  `styles/contractorMailSettings.module.css`, `locales/deliveryClients{,.en}.locale.json`,
  `shared/contentSecurityPolicy.service.ts`, `test/shared/content-security-policy.contract.ts`.

Commit: `feat(delivery-clients): a página de e-mail ganha os modelos, com variáveis e prévia (spec
150 T403)`, sobre `5f110d25` (staging).

## T404

"Pronto para enviar" na página "E-mail com contratantes" — um resumo que espelha
`resolveMailSendReadiness` da API (RF16/RF17, T401/T402) sem importar código de lá.

- **`shared/mailSendReadiness.service.ts`** (novo, puro): `resolveMailSendReadinessView({ checks,
mailType, settings, templates })` devolve `{ ready: true }` ou `{ ready: false, reason,
failingChecklistKeys }`. `settings === null` (nunca salvo) → `not_configured`;
  `settings.sendingVerifiedAt === null` → `sending_not_verified`, com `failingChecklistKeys`
  apontando qual dos dois itens da lista (`api_key`/`sender_domain`, RF12) ainda não está `ok` —
  os dois que juntos liberam `sendingVerifiedAt` na T401; sem modelo **ativo e marcado como
  padrão** do `mailType` → `template_missing` (arquivado, de outro tipo ou sem marca de padrão não
  contam, RF17/T402). O `status` da ida e volta (143) nunca entra nesta função —
  `isMailRoundTripConfigured(settings)` é uma checagem à parte (`status === 'active'`), só
  informativa.
- **Atalho por motivo**: `resolveMailSendReadinessShortcutTarget(reason)` — `not_configured` e
  `sending_not_verified` apontam para `'checklist'`, `template_missing` para `'templates'`. O
  componente resolve o alvo por `id` de seção (`contractor-mail-checklist-section` em
  `ContractorMailSettingsPanel`, `contractor-mail-templates-section` em
  `ContractorMailTemplatesPanel` — os dois ganharam o atributo `id`, sem mudar comportamento) e
  reaproveita `revealPanel` de `useRevealedPanel.hook.ts` (rola + foca o primeiro campo), o mesmo
  mecanismo que a T403 já usa para o painel do editor — chamado aqui por clique, não só na
  montagem.
- **`components/MailSendReadinessSummary.component.tsx`** (novo): busca `settings`/`checks`
  (`useContractorMailSettings`, já existente) e o catálogo + a lista de modelos do primeiro tipo do
  catálogo (`useContractorMailTemplates`, já existente — mesma `queryKey` da T403, sem requisição
  duplicada). `Skeleton`/`SkeletonGroup` enquanto qualquer uma das quatro consultas carrega ou o
  catálogo ainda não resolveu o `mailType`. Pronto: ícone `check` + texto; não pronto: ícone
  `alert` + o motivo em locale + botão (`.invalidField`, mesmo estilo dos atalhos da T403) com o
  atalho. Linha separada, sempre visível, com o estado do round-trip (RF16: "o envio não depende
  disso" no próprio texto).
- **`DeliveryClientWorkspace.page.tsx`**: `MailSendReadinessSummary` entra na aba "mail", antes do
  `ContractorMailSettingsPanel` — é o primeiro resumo que o operador vê ao abrir a aba.
- **Locale**: `contractorMail.sendReadiness.*` em `deliveryClients{,.en}.locale.json` (título,
  carregando, pronto, um texto por motivo, os dois atalhos, e as duas linhas do round-trip).
  Acentuação conferida pelo `locale-accents.contract.ts`.

### Contrato de paridade dos motivos

`test/delivery-clients/mail-send-readiness-parity.contract.ts` lê o **arquivo da API**
(`api-transportada/src/contractor-mail/domain/mail-send-readiness.policy.ts`, caminho relativo
entre apps do mesmo monorepo dentro de um teste — nunca um `import` de código, que é o que a
arquitetura proíbe) e compara `MAIL_SEND_READINESS_REASONS` do frontend contra a união de motivos
que `resolveMailSendReadiness` da API pode devolver, no mesmo molde de
`nfe-workspace/address-correction-mail.contract.ts` (specs 148/150 anteriores).

### Testes

`test/delivery-clients/mail-send-readiness.contract.ts` (novo, importado em
`test/delivery-clients.contract.test.ts`):

- cada motivo (`not_configured` sem cadastro, `sending_not_verified` sem a verificação — com o
  `failingChecklistKeys` batendo com o item que falha —, `template_missing` sem modelo algum) e o
  `ready` com tudo certo;
- modelo arquivado não conta, modelo de outro tipo não conta (cast simulando um segundo tipo, já
  que o catálogo de hoje só tem `address_correction`), modelo sem marca de padrão não conta;
- o atalho por motivo (`checklist` para os dois primeiros, `templates` para o terceiro);
- `isMailRoundTripConfigured` (`null`, `pending`, `failed` → não configurado; `active` →
  configurado), separado da liberação do envio.

`test/delivery-clients/mail-send-readiness-parity.contract.ts`: a paridade descrita acima.

### Gates

- `bun run typecheck` (raiz, todas as apps) → ok.
- `bun run lint` (raiz, todas as apps) → ok.
- `bun run --cwd apps/frontend-transportada test` → **3798 pass, 0 fail** (29 arquivos; eram 3784
  na T403). 14 testes novos entre as duas suítes desta task.
- `bun run --cwd apps/frontend-transportada build` → ok
  (`dist/assets/DeliveryClientWorkspace.page-*.js` 56.04 kB gzip 14.08 kB; era 53.16 kB/13.45 kB na
  T403 — aumento esperado pelo componente novo, nenhum aviso de tamanho novo além dos já
  existentes, alheios a esta task).
- `prettier --check` dos arquivos tocados → ok (depois de `--write` nos 4 que faltavam).

### Arquivos

- **Novos**: `shared/mailSendReadiness.service.ts`,
  `components/MailSendReadinessSummary.component.tsx`.
- **Testes novos**: `test/delivery-clients/mail-send-readiness{,-parity}.contract.ts`, importados
  em `test/delivery-clients.contract.test.ts`.
- **Ajustados**: `pages/DeliveryClientWorkspace.page.tsx`,
  `components/{ContractorMailSettingsPanel,ContractorMailTemplatesPanel}.component.tsx` (só o `id`
  da seção), `locales/deliveryClients{,.en}.locale.json`.

Commit: `feat(delivery-clients): a lista de verificação diz se o e-mail está pronto para enviar
(spec 150 T404)`, sobre `81c75c5e` (staging).

## T405

Confirmação de envio (T305) ganha o seletor de modelo e a prévia (RF15/RF17, contratos do T402),
tudo dentro de `nfe-workspace` — `web.md` §1 e `apps/frontend-transportada/CLAUDE.md` proíbem esta
app importar código de `delivery-clients`, então os tipos e o client HTTP são cópia por valor
próprios, no mesmo molde de `addressCorrectionMail.validation.ts` (T305) e
`mailSendReadiness.service.ts` (T404).

- **A prévia é sempre exemplo, nunca os rascunhos reais do envio** — conferido no caso de uso da
  API antes de desenhar a tela (`contractor-mail-templates.use-case.ts`, `preview`): recebe
  `{templateId}` ou conteúdo cru, e em qualquer caso chama `previewRenderers[mailType](content)`
  com dados fixos (`address-correction-mail-sample.constant.ts`, T402) — não existe parâmetro para
  os itens do envio corrente. A prévia mostra o assunto e o HTML reais do modelo escolhido (não é
  simulação da UI), mas com endereços fictícios; por isso o rótulo "exemplo" ao lado dela, e a
  lista "como veio → correto" (T305) continua sendo a única prova visual dos itens reais que vão no
  envio.
- **`addressCorrectionMail.validation.ts`**: `AddressCorrectionMailTemplate` (`id`, `isDefault`,
  `name`, `status`) e `AddressCorrectionMailTemplatePreview` (`html`, `subject`, `text`) — cópia por
  valor, só os campos que a confirmação usa (sem `mailType`/`version`/`updatedAt`, que o T403 já
  cobre no módulo dele). Mapeadores tolerantes ao registro que esta versão não reconhece, mesmo
  padrão dos contatos.
- **`nfeWorkspaceClient.service.ts`**: dois métodos novos —
  `listAddressCorrectionMailTemplates` (`GET /contractor-mail-templates?mailType=address_correction`,
  traz ativos e arquivados) e `previewAddressCorrectionMailTemplate` (`POST
/contractor-mail-templates/preview` com `{templateId}`). As duas rotas exigem `settings.manage`,
  a mesma permissão que T305 já demonstrou que quem chega à confirmação sempre tem (é a permissão
  do resto do fluxo de e-mail). `sendAddressCorrectionMail` ganhou `templateId?: string`.
- **`addressCorrectionMail.service.ts`** (serviço puro, testado):
  - `activeAddressCorrectionMailTemplates` — arquivado nunca aparece no seletor (RF15).
  - `defaultAddressCorrectionMailTemplateId` — o modelo com `isDefault: true` entre os ativos,
    `null` sem nenhum marcado.
  - `initialAddressCorrectionMailTemplateId` — **decisão**: o padrão quando existe; sem padrão
    marcado (ex.: o padrão foi arquivado e nenhum outro assumiu a marca ainda), cai no primeiro
    modelo ativo da lista; sem nenhum ativo, `null`. Prefere algo pré-selecionado a obrigar o
    operador a escolher às cegas sempre que houver pelo menos um modelo ativo — e ainda cabe em
    RF16/RF17, que só bloqueiam o envio (e desabilitam o botão) quando não há **nenhum** modelo
    ativo do tipo, não quando não há um marcado como padrão.
  - `addressCorrectionMailTemplateIdForRequest` — o `templateId` só viaja no corpo quando difere do
    **padrão de verdade** (`defaultAddressCorrectionMailTemplateId`, não a seleção inicial com
    fallback acima): mantém a compatibilidade de replay que o T402 desenhou ("o envio pelo padrão
    mantém o fingerprint de antes"). Quando não há padrão marcado, o servidor não tem como resolver
    um modelo sozinho (`findMailTemplate` sem `templateId` busca o marcado como padrão) — nesse
    caso o id explícito sempre viaja, mesmo que seja "o primeiro ativo" escolhido pelo fallback
    acima.
  - `buildAddressCorrectionMailRequestBody` ganhou `templateId?: string`, mesma regra de
    "ausente nunca é `undefined` explícito" que já valia para `requestIds`.
  - `canConfirmAddressCorrectionMail(selectedContactCount, hasTemplate)` — segundo parâmetro novo;
    o botão de enviar também desabilita sem nenhum modelo ativo disponível.
  - `resolveAddressCorrectionMailIdempotencyKey` estendida com `currentTemplateId`/
    `previousTemplateId`: o valor comparado é o **efetivo** que vai no corpo
    (`templateIdForRequest`, `null` quando é o padrão) — trocar de modelo sem sair do padrão não
    gera chave nova (o corpo enviado ao servidor não mudou), e trocar para um modelo diferente gera
    chave nova, mesma regra que já existe para a seleção de contatos.
  - `MAIL_CONFIGURATION_SHORTCUT_CODES`/`addressCorrectionMailErrorHasConfigurationShortcut`: os
    quatro códigos de RF16/RF17 (`CONTRACTOR_MAIL_NOT_CONFIGURED`,
    `CONTRACTOR_MAIL_SENDING_NOT_VERIFIED` — mapeado agora pela primeira vez no frontend, existia
    desde o T401 mas sem consumidor —, `CONTRACTOR_MAIL_TEMPLATE_MISSING`,
    `CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE`) ganham o atalho "Abrir configuração de e-mail".
- **`useAddressCorrectionMailDialog.hook.ts`**: `templatesQuery` (`GET`, habilitada com o diálogo
  aberto) e `previewQuery` (`POST /preview`, habilitada quando há um `selectedTemplateId` —
  refeita automaticamente a cada troca de modelo, `queryKey` inclui o id). Segue o mesmo padrão de
  override + snapshot dos contatos: `selectedTemplateIdOverride` (`null` até o operador trocar no
  seletor) e `templateSelectionSnapshot` (ajustado durante a renderização, sem `useEffect`, junto
  com `contactSelectionSnapshot` na mesma resolução de `resolveAddressCorrectionMailIdempotencyKey`
  — os dois snapshots viajam juntos, então `open()` zera os dois e força chave nova).
- **`AddressCorrectionMailDialog.component.tsx`**: nova seção "Modelo de e-mail" entre os contatos
  e o aviso de erro — `Select` do design system (`web.md` §11) com os modelos ativos, o padrão com
  o rótulo "(padrão)"; skeleton enquanto a lista carrega; sem nenhum modelo ativo, mensagem +
  atalho "Abrir configuração de e-mail" (reaproveita `navigateToDeliveryClients`, o mesmo mecanismo
  de "sem contato ativo" da T305 — não existe deep-link de aba nesta app, mesma limitação e mesma
  decisão já registradas ali). Prévia: aviso "exemplo" sempre visível, skeleton enquanto carrega,
  aviso de falha se a prévia não carregar (não bloqueia o envio, só o texto informativo), e quando
  chega: assunto + `<iframe sandbox="" srcDoc>` (nunca `dangerouslySetInnerHTML`) — a CSP já
  permite `frame-src 'self'` desde a T403. O aviso genérico de erro do envio ganhou o mesmo atalho
  quando `addressCorrectionMailErrorHasConfigurationShortcut` é verdadeiro. Botão "Enviar" segue
  `dialog.canConfirm`, que agora também exige `templates.length > 0`.
- **Estilos**: `addressReport.module.css` ganhou `.mailExampleNotice` (aviso itálico, discreto) e
  `.mailPreviewFrame` (mesmos tokens de borda/fundo do `.previewFrame` de
  `contractorMailSettings.module.css`, T403, com `min-height` menor porque aqui é um complemento à
  lista "como veio → correto", não o conteúdo principal da tela).

### Testes

`test/nfe-workspace/address-correction-mail.contract.ts` (existente, T305/revisão final):

- `buildAddressCorrectionMailRequestBody` com `templateId`;
- `canConfirmAddressCorrectionMail` com os cinco casos (0/1/50/51 contatos com modelo, 1 contato
  sem modelo);
- `activeAddressCorrectionMailTemplates` (arquivado excluído);
- `initialAddressCorrectionMailTemplateId` (padrão, sem padrão → primeiro ativo, arquivado não
  conta, lista vazia);
- `defaultAddressCorrectionMailTemplateId` (encontra fora da primeira posição, `null` sem marca);
- `addressCorrectionMailTemplateIdForRequest` (omite no padrão, inclui quando diverge, omite sem
  seleção, inclui sempre que não há padrão marcado);
- `addressCorrectionMailErrorHasConfigurationShortcut` (os quatro códigos vs. dois que não são);
- mapeadores de lista de modelos e de prévia (registro não reconhecido ignorado / prévia
  incompleta rejeitada);
- client: POST com `templateId` no corpo, GET filtrado por `mailType`, POST da prévia com
  `{templateId}`;
- chave de idempotência: nova ao trocar de modelo mesmo com os contatos iguais, estável quando
  contatos e modelo batem os dois.

### Gates

- `bun run typecheck` (raiz, todas as apps) → ok.
- `bun run lint` (raiz, todas as apps) → ok.
- `bun run --cwd apps/frontend-transportada test` → **3811 pass, 0 fail** (29 arquivos; eram 3798
  na T404). 13 testes novos no arquivo existente de T305.
- `bun run --cwd apps/frontend-transportada build` → ok
  (`dist/assets/NfeWorkspace.page-*.js` 141.33 kB gzip 36.28 kB; nenhum aviso de tamanho novo além
  dos chunks já grandes e alheios — `pdf`, `index`, `vectorBasemap`).
- `prettier --check` dos arquivos tocados → ok (depois de `--write` em 3 que faltavam).

### Arquivos

- **Ajustados**: `shared/{addressCorrectionMail.service,addressCorrectionMail.validation,
nfeWorkspaceClient.service}.ts`, `hooks/useAddressCorrectionMailDialog.hook.ts`,
  `components/AddressCorrectionMailDialog.component.tsx`, `styles/addressReport.module.css`,
  `locales/nfeWorkspace{,.en}.locale.json`, `test/nfe-workspace/address-correction-mail.contract.ts`.

Nenhum arquivo de `delivery-clients` tocado — zero acoplamento entre módulos (`web.md` §1).

## T406

Limitador de taxa com estado no Postgres para as rotas que disparam e-mail à contratante (RF18, M1
da revisão de segurança). Desenho aprovado pelo architect antes de codar, e ele corrigiu a premissa
do `plan.md`: **a API já tinha limitador em memória por processo** (`http/rate-limiter.service.ts`,
aplicado pelo `router.service.ts` depois de `authorize`). A T406 estende esse caminho em vez de criar
um paralelo; o parágrafo **Limitador** do `plan.md` foi reescrito para refletir isso.

### Decisões

- **Rota declara o teto como dado, e o `rateLimit` vira união discriminada**:
  `{ store: 'memory', maxRequests, windowMs }` (o de antes) ou
  `{ store: 'postgres', scope, maxRequests, windowSeconds }`. A única rota autenticada que já tinha
  teto em memória (`POST /me/whatsapp-phone/verification`) ganhou `store: 'memory'` explícito, sem
  mudar de comportamento. A rota anônima continua só em memória, por IP (tipo intocado).
- **Porta assíncrona** `RateLimitWindowStorePort.consume()` (`http/rate-limit-window.port.ts`),
  injetada em `createRouter` como `rateLimitWindows`. Rota `postgres` sem a porta **derruba o boot**
  (`assertPostgresRateLimitHasStore`), no molde de `assertMembershipRoutesUnderMe`: teto que não conta
  é porta aberta calada.
- **Ponto de aplicação inalterado**: depois de `authorize`, antes de `execute`/`parse`/idempotência.
  Corpo inválido (400) e replay idempotente **contam** — provado no contrato do router.
- **`DrizzleRateLimiterRepository`** (`http/drizzle-rate-limiter.repository.ts`): **um** upsert em
  autocommit, fora da transação do caso de uso — `INSERT … ON CONFLICT (scope, subject_key,
window_start) DO UPDATE SET hits = rate_limit_windows.hits + 1 RETURNING hits, window_start, now()`.
  `window_start = to_timestamp(floor(epoch(now()) / w) * w)` e o "agora" vêm do relógio do **banco**
  (réplica com relógio torto não abre janela própria). `Retry-After = ceil(window_start + w − now())`,
  mínimo 1, pela função pura `resolveRetryAfterSeconds` (`http/rate-limit-window.policy.ts`). Tudo
  parametrizado — nenhum `sql.raw`.
- **Fail-closed**: sem `try/catch`. O limitador fora do ar propaga e vira 500 pelo Router; sem saber
  quantos envios já saíram, o envio não sai.
- **Chave**: `scope` + `companyId:userId` — só UUIDs, nada de PII. Escopo único `contractor-mail`
  (`CONTRACTOR_MAIL_RATE_LIMIT_SCOPE`) para `POST /address-correction-requests/mail` e
  `POST /contractor-mail-settings/test-email`: o e-mail de teste gasta o mesmo balde do envio.
- **Código de erro reusado**: `TOO_MANY_REQUESTS` (`HTTP_ERROR.tooManyRequests`), o mesmo que o
  limitador em memória já devolvia. O `RATE_LIMIT_EXCEEDED` do plano não foi criado.
- **Env**: `RATE_LIMIT_CONTRACTOR_MAIL_MAX` (int 1..10000, padrão 20) e
  `RATE_LIMIT_CONTRACTOR_MAIL_WINDOW_SECONDS` (int 60..86400, padrão 3600) no
  `environment.schema.ts`, expostos como `ApiEnvironment.contractorMailRateLimit` e injetados nas
  duas factories de rota (`mailRateLimit`). Declarados no `.env.example` com o padrão, e o contrato
  do `.env.example` cobra isso (mesmo molde de `CARGO_LAYOUT_TIME_BUDGET_MS`). O `make config` não
  lista variável por variável — valida o schema —, então não precisou mudar. `.env`/`.env.test` não
  foram lidos nem tocados.
- **Tabela e migration aditiva** `20260915233000_rate_limit_windows` (gerada pelo `db:generate`,
  pasta renomeada para ordenar depois de `20260915230000`; `prevIds` confere com o snapshot anterior):
  `rate_limit_windows (scope, subject_key, window_start, hits)`, PK composta + btree
  `rate_limit_windows_window_start_idx`, e o CHECK de `job_schedules`/`job_executions` ampliado com a
  rotina nova, mais a linha semeada em `job_schedules` (`3600`). Com `snapshot.json`, `rollback.sql` e
  a entrada na lista explícita de `static-migration.contract.ts` e no `SEED_MIGRATIONS` do contrato
  do catálogo.
- **Limpeza no worker, não no cron**: o cron só publica a batida lendo `job_schedules`; quem executa
  rotina é o worker. Rotina nova `rate-limit.window.purge` (`minimumIntervalSeconds: 3_600`,
  vocabulário de falha vazio), no molde de `trip.cargo-layout.purge`: lotes de 1000 por `ctid` com
  `for update skip locked`, teto de 100 lotes, parada no limite do lote. O corte é
  `window_start < now − 48 h` — o worker não lê o env da API, então usa a janela máxima que o schema
  de lá aceita (24 h) mais 24 h de folga: toda janela apagada venceu há mais de 24 h. O mecanismo que
  cria a linha de `job_schedules` para rotina nova é a própria migration (`INSERT` no fim, como em
  `20260913210300_trip_cargo_layout_purge_job`). A rotina entra no catálogo das quatro apps (API,
  worker, cron, frontend) e nos três contratos-espelho; o worker ganhou o espelho do schema
  (`src/database/rate-limit-window.schema.ts`) com contrato de paridade. Nada de `DELETE`
  oportunista na API.

### Vermelho → verde

- **Vermelho** (antes da implementação), API:
  `bun test ./test/rate-limit.contract.test.ts ./test/rate-limited-routes.contract.test.ts` →
  **0 pass, 3 fail, 1 error** — `Cannot find module '../../src/http/rate-limit-window.policy.js'`
  derrubando o arquivo inteiro de janela/router/env, e as duas asserções de rota (nenhuma rota com
  teto `postgres`, nenhum arquivo declarando).
- **Verde**, mesmos arquivos + `env-example` + router antigo + rotas de correção, e-mail e WhatsApp +
  `http`: **671 pass, 0 fail** (8 arquivos).
- Worker: o contrato da rotina e o de paridade foram escritos **junto** com a rotina, não antes —
  não houve vermelho registrado para eles. O contrato do catálogo das quatro apps reprova sem a
  entrada (é paridade por valor), mas também não guardei a execução vermelha.

### Testes novos (todos na lista explícita do `package.json` da app)

- `test/rate-limit.contract.test.ts` → `rate-limit/window.contract.ts` (janela alinhada, Retry-After
  arredondado para cima e com piso 1, teto inclusivo), `rate-limit/router.contract.ts` (porta falsa:
  429 + `retry-after` + `TOO_MANY_REQUESTS` sem chegar ao caso de uso; chave
  `companyId:userId` e escopo; 400 conta; porta que lança → não é `ApiError` e vira **500** pelo
  request handler; boot recusa rota `postgres` sem porta; rota `memory` e rota anônima seguem
  iguais e nunca tocam a porta), `rate-limit/environment.contract.ts` (padrão 20/3600, valores
  declarados, `0`/`10001`/`1.5`/texto/vazio e `59`/`86401`/`3600.5`/vazio derrubam o boot).
- `test/rate-limited-routes.contract.test.ts`: as duas rotas `postgres` por extenso, com escopo e
  teto, e varredura de `src/**/*.routes.ts` — só os dois arquivos declaram `store: 'postgres'`.
- `test/config/env-example.contract.ts`: as duas variáveis declaradas com o padrão.
- `test/integration/rate-limiter.integration.ts`: 30 `consume` em `Promise.all` com teto 20 →
  **exatamente 20 passam**, 10 recusam com `Retry-After` em [1, 3600], linha com `hits = 30`; virada
  de janela (linha da janela anterior com 25 hits não conta, a nova começa em 1); outro usuário e
  outro escopo com balde próprio.
- Worker: `test/rate-limit-window-purge.contract.test.ts` → `purge.contract.ts` (nome, corte de 48 h,
  lotes, parada, teto, log só com contagens) e `schema-parity.contract.ts`;
  `test/rate-limit-window-purge.integration.test.ts` (apaga as janelas de 49 h e 72 h, mantém as de
  47 h e 0 h; segundo ciclo não apaga nada).
- Fixtures de rota de correção e de e-mail passam `mailRateLimit` e uma porta que sempre deixa
  passar; os dois `ApiEnvironment` montados à mão nas integrações ganharam `contractorMailRateLimit`.

### Integração (Postgres nativo `127.0.0.1:65433`)

- API, `DRIZZLE_TEST_DATABASE_URL=…/postgres bun --env-file=../../.env.test test … --timeout 120000`:
  `rate-limiter.integration.ts` **3 pass**; com `contractor-mail-test-email-thread` e
  `address-correction-mail-repository`, **16 pass**. Nenhum pulou.
- `server.integration.ts` + `auth-me.integration.ts` leem `API_TEST_DATABASE_URL ?? DATABASE_URL`;
  sem a primeira, caem no Postgres do Docker (65432, quebrado — registrado na memória do projeto) e
  estouram 30 s. Contra um banco migrado descartável (`api_t406`): **5 pass, 0 fail** — o
  `main.ts` sobe com a porta nova injetada.
- `database-migration.contract.test.ts` com banco: **falha conhecida e alheia**
  `cte-profile-output-constraints` (`23001` em vez de `23503`, Postgres 18 local). Ela interrompe o
  teste **antes** do laço de rollbacks, então o `rollback.sql` novo foi provado à parte num banco
  descartável: migrations aplicadas → linha semeada com `3600` → `rollback.sql` → tabela ausente,
  zero linha da rotina, CHECK recusa a rotina (`23514`) → migrations reaplicadas → tabela de volta.
- Worker, `DATABASE_URL=…/worker_t302` (migration nova aplicada antes):
  `rate-limit-window-purge.integration.test.ts` + `trip-cargo-layout-purge` + `job-run-execution` →
  **15 pass, 0 fail**. As duas falhas conhecidas de claim do outbox não estão nesses arquivos e não
  foram exercitadas aqui.

### Gates

- `bun run typecheck` (raiz, todas as apps) → ok.
- `bun run lint` (raiz, todas as apps) → ok.
- `bun run --cwd apps/api-transportada test` → **5999 pass, 23 skip, 0 fail** (176 arquivos).
- `bun run --cwd apps/worker-transportada test` → **1352 pass, 0 fail** (90 arquivos).
- `bun run --cwd apps/cron-transportada test` → **94 pass, 0 fail** (catálogo tocado).
- `bun run --cwd apps/frontend-transportada test` → **3811 pass, 0 fail** (catálogo tocado).
- `prettier --check` dos arquivos tocados → ok (depois de `--write`).

### Arquivos

- **API, novos**: `src/http/{rate-limit-window.policy,rate-limit-window.port,drizzle-rate-limiter.repository}.ts`,
  `src/database/rate-limit-window.schema.ts`, `drizzle/20260915233000_rate_limit_windows/`
  (`migration.sql`, `rollback.sql`, `snapshot.json`), `test/rate-limit.contract.test.ts`,
  `test/rate-limit/{window,router,environment}.contract.ts`,
  `test/rate-limited-routes.contract.test.ts`, `test/integration/rate-limiter.integration.ts`.
- **API, ajustados**: `src/http/{rate-limiter.service,router.service}.ts`, `src/main.ts`,
  `src/config/environment.schema.ts`, `src/shared/{api.constant,api.types,job-catalog.constant}.ts`,
  `src/database/database.schema.ts`, as duas rotas de e-mail,
  `src/whatsapp-commands/presentation/whatsapp-phone.routes.ts`, `package.json`, os dois fixtures de
  rota, os dois `ApiEnvironment` de integração, e os contratos de `.env.example`, catálogo e
  migration estática.
- **Worker**: `src/rate-limit-window-purge/**`, `src/database/rate-limit-window.schema.ts`,
  `src/main.ts`, `src/shared/job-catalog.constant.ts`, `package.json`, testes novos e o contrato do
  catálogo.
- **Cron / frontend**: só a entrada do catálogo e o contrato-espelho (cron).
- Raiz: `.env.example`. Spec: `plan.md` (limitador), `tasks.md` (`[x]`), este arquivo.
- `docs/SECURITY.md` fica para a T407.

## T407

Só documentação: `docs/SECURITY.md`, `docs/ai-context/*`, os `CLAUDE.md` das apps tocadas. Nenhum
código-fonte mudou nesta task.

### `docs/SECURITY.md`

- **M1 — fechado.** Nova entrada em "Fechados", datada de 2026-09-15: as duas rotas de e-mail
  (`POST /address-correction-requests/mail`, `POST /contractor-mail-settings/test-email`) tinham
  disparo sem teto; a T406 fechou com o limitador de estado no Postgres (`rate_limit_windows`, escopo
  `contractor-mail`, chave `companyId:userId`, sem PII), padrão 20/h por env, fail-closed, `429
TOO_MANY_REQUESTS` + `Retry-After`. Registrado explicitamente o que **continua aberto**: o teto é por
  usuário, não por empresa (N operadores multiplicam o volume), e as demais rotas autenticadas e
  todas as rotas públicas/anônimas do produto continuam só com o limitador em memória por processo —
  o achado geral "sem limitador com estado compartilhado" não fechou, só o par de rotas de e-mail.
- **M2 — pendente antes de produção.** Nova entrada em "Abertos": nenhuma ação de
  `contractor-mail`/`address-correction` (envio, CRUD de contatos, CRUD de modelos) grava trilha de
  auditoria (§10 do baseline). Registrado o que já existe e não é trilha (`contractor_mail_messages`,
  `created_at`/`updated_at`, log estrutural sem PII) e que a decisão do usuário nesta rodada foi
  deixá-la fora da Fase 4 (RF19).
- **B3 — fechado só no fluxo novo.** Nova entrada em "Abertos": `POST
/address-correction-requests/recipients` tirou o CPF/CNPJ da URL no fluxo de correção (item 10 da
  revisão final). Registrado que `GET /contractors/by-tax-id/:taxId` (`fleet.read`) **continua
  existindo** e é consumida por outros pontos do produto (resolução de `contractorId` no
  `nfe-workspace`) — migrá-los é trabalho fora do escopo desta spec.
- **CSP `frame-src`**: nova entrada em "Abertos" (motivo e limite da troca de `'none'` para `'self'`
  na T403, com `frame-ancestors`/`object-src` intocados) — decisão que se audita, no mesmo padrão das
  entradas de `camera`/`geolocation` já existentes no arquivo.
- **`body_html` (item 12 da revisão final, T302)**: **não duplicado**. Já havia uma linha sobre o
  mesmo tratamento de `body_text` na entrada "respostas das contratantes guardadas sem prazo de
  descarte" (verificado por grep antes de editar) — nada novo a acrescentar aqui.

### `docs/ai-context/`

- `api-transportada.md`: seção "Fase 4 — modelos de e-mail, liberação do envio e limitador" logo
  depois da seção existente da spec 150 (T101–T305) — liberação (`sending_verified_at`,
  `resolveMailSendReadiness`, `status` da 143 não bloqueia mais), modelos (tabela, catálogo,
  variáveis, renderização, recusas), limitador (união discriminada do `rateLimit`, tabela, chave,
  fail-closed, envs, limpeza no worker).
- `frontend-transportada.md`: seção "Fase 4 — modelos, 'Pronto para enviar' e prévia em `iframe`" —
  painel de modelos, prévia em `iframe sandbox` e o porquê da CSP, `mailSendReadiness.service.ts`
  (espelha a política da API sem importar), seletor de modelo na confirmação de envio.
- `worker-transportada.md`: seção nova "A limpeza do limitador de taxa é rotina do worker, não do
  cron" — `rate-limit.window.purge`, corte de 48h, por que o worker não lê o env da API.
- `cron-transportada.md`: uma linha nova (não seção) explicando que `rate-limit.window.purge` só
  entra no catálogo mirrorizado para o contrato de paridade — o cron não executa, quem executa é o
  worker.

### `CLAUDE.md`

Só invariantes de uma ou duas linhas, sem mexer em nenhuma tabela existente:

- `apps/api-transportada/CLAUDE.md`: duas linhas novas ao lado do aviso existente de
  `address-correction/` — liberação do envio não depende mais de `status`, e rota que dispara e-mail
  declara `rateLimit: { store: 'postgres', … }` e aparece em `test/rate-limited-routes.contract.test.ts`.
- `apps/frontend-transportada/CLAUDE.md`: uma linha na seção "CSP, ambiente e tema de login" sobre
  `frame-src 'self'` e o limite (`sandbox` sem `allow-scripts`, `frame-ancestors`/`object-src`
  intocados). **Não mexi** na tabela de primitivos do design system, como pedido.
- `apps/worker-transportada/CLAUDE.md`: uma linha nova em "Invariantes que valem antes de editar"
  sobre a rotina `rate-limit.window.purge` viver aqui, não na API nem no cron.
- `apps/cron-transportada/CLAUDE.md`: **não tocado** — o único efeito no cron é uma entrada
  mirrorizada de catálogo sem mudança de comportamento, já coberta em `docs/ai-context/cron-transportada.md`;
  não é invariante nova para quem edita código do cron.

### Gates

```
bun run --cwd . prettier --check docs/SECURITY.md docs/ai-context/api-transportada.md \
  docs/ai-context/frontend-transportada.md docs/ai-context/worker-transportada.md \
  docs/ai-context/cron-transportada.md apps/api-transportada/CLAUDE.md \
  apps/frontend-transportada/CLAUDE.md apps/worker-transportada/CLAUDE.md \
  specs/150-pedido-de-correcao-de-endereco/tasks.md
```

Resultado: `All matched files use Prettier code style!` — nenhum código-fonte tocado, gates de
typecheck/teste/lint (`bun run typecheck`, `bun run lint`, testes das apps) não se aplicam a esta
task por instrução (só documentação).

### Arquivos alterados

- `docs/SECURITY.md` (M1 fechado, M2/B3/CSP abertos)
- `docs/ai-context/api-transportada.md`, `frontend-transportada.md`, `worker-transportada.md`,
  `cron-transportada.md`
- `apps/api-transportada/CLAUDE.md`, `apps/frontend-transportada/CLAUDE.md`,
  `apps/worker-transportada/CLAUDE.md`
- `specs/150-pedido-de-correcao-de-endereco/tasks.md` (`[x]` na T407)
- Este arquivo (`evidence.md`)

## Correções da revisão da Fase 4

Rodada de correção pós-T407, um item por vez, teste antes de cada correção de comportamento.
Commits: `e218b096`, `e95d9d2b`, `03d36d5e`, `fab9a18a`, `77390e50`, `d213bef7`, `dad811ad`,
`7fe74030`, `c8bca7eb`, `f5783acc`, `a8e54839`, `86ac6f9e`, `79bddff1`.

### 1 — Verificação zerada por erro de rede (T401)

`contractor-mail-settings.use-case.ts`: `checkProvider` passou a devolver um terceiro veredito,
`sendingVerificationOutcome: 'verified' | 'rejected' | 'transient'` — `rejected` só quando o
provedor recusou de fato (chave, `sender_domain_not_found`/`not_verified`); `transient` cobre rede
indisponível, resposta fora do esperado e o cofre local não abrindo (`credential_unavailable`, que
não é decisão do Resend). `runChecks` só chama `recordSendingVerification` fora de `transient`.

**Vermelho**: três testes novos em `test/contractor-mail/settings-use-case.contract.ts`
(`ResendProviderUnreachableError`, `ResendProviderUnexpectedResponseError`, cofre quebrado) —
`recordSendingVerificationCalls` esperado vazio, recebido com um `isSendingVerified: false` (a
implementação anterior zerava em qualquer falha). **Verde**: `185 pass, 0 fail` em
`test/contractor-mail.contract.test.ts`.

### 2 — Modelo diferente da prévia (T405 revertido)

`addressCorrectionMailTemplateIdForRequest` (frontend) sempre devolve o `selectedTemplateId`
(exceto `null`), nunca mais omite quando bate com o padrão do servidor — decisão da T402/T405
revertida: a prévia confirmada é sempre a do modelo **selecionado**, e o padrão do servidor pode
mudar entre a prévia e a confirmação.

**Vermelho**: teste reescrito em `test/nfe-workspace/address-correction-mail.contract.ts` esperando
`'template-default'` de volta em vez de `undefined` quando selecionado = padrão. **Verde**:
`28 pass, 0 fail`.

### 3 — Deadlock no envio completo × unitário

`.orderBy(addressCorrectionRequests.id)` antes dos dois `for('update')` de `findSendableRequests`
(`drizzle-address-correction-mail.repository.ts`) — sem ordem, o envio completo (trava por
contratante) e o unitário (trava por lista de ids) podiam travar os mesmos rascunhos em ordem
oposta sob concorrência. Teste de integração novo cruzando as duas formas de envio sobre os mesmos
3 rascunhos concorrentemente — reproduzir o deadlock de propósito é inerentemente instável
(confirmado: a mesma suíte passou mesmo sem a correção numa execução isolada), então o teste prova
ausência de erro cru/500 e o estado final consistente, não o deadlock em si. **Verde**:
`9 pass, 0 fail` em `test/integration/address-correction-mail-repository.integration.ts`.

### 4 — Funções com mais de um parâmetro posicional

`requireActiveTemplate`, `assertValidContent` (`contractor-mail-templates.use-case.ts`),
`acquireDefaultLock`, `activeDefaultFilter` (`drizzle-contractor-mail-template.repository.ts`) e
`canConfirmAddressCorrectionMail` (frontend) passam a receber um objeto. `'active'`/`'archived'`
soltos no repositório de modelos viram `const [ACTIVE_STATUS, ARCHIVED_STATUS] =
CONTRACTOR_MAIL_TEMPLATE_STATUSES`. Mecânico — sem vermelho/verde de comportamento, só
`typecheck`/`lint`/testes existentes continuando verdes (`185 pass` contractor-mail, `302 pass`
nfe-workspace).

### 5 — Paridade do tokenizador (front × API)

`test/delivery-clients/mail-template-variable-parity.contract.ts`, novo, molde de
`mail-send-readiness-parity.contract.ts`: lê o texto-fonte de `VARIABLE_NAME` de
`mail-template-render.policy.ts` (API) por caminho relativo entre apps (nunca `import` de código) e
compara com a constante do front (`contractorMailTemplate.validation.ts`, agora `export`ada só para
este contrato); mais 9 casos idênticos (variável válida, mais de uma variável, chave solta dos dois
lados, nome vazio, maiúscula, dígito, chave aninhada) rodados contra o `tokenizeTemplate` real do
front. **Verde**: `2 pass, 0 fail`.

### 6 — Tamanho no front medido como o banco

`validateMailTemplateName`/`validateMailTemplateContent` (`contractorMailTemplate.validation.ts`)
passam a medir `raw.length` (cru) contra o teto, não `raw.trim().length` — a CHECK do banco
(`length(coluna) <= limite`, sem `btrim` no lado do teto) opera sobre o texto cru armazenado; medir
o aparado deixava o front aceitar um valor que o `PATCH` recusaria depois. O requisito de
"obrigatório" continua olhando o aparado (só espaço continua vazio).

**Vermelho**: dois testes novos em `test/delivery-clients/contractor-mail-templates-validation.contract.ts`
(nome e `closing` com espaços de borda que empurram o cru acima do teto, mas o aparado fica dentro)
— esperado `TEXT_TOO_LONG`/`NAME_TOO_LONG`, recebido `[]`/`undefined`. **Verde**: `17 pass, 0 fail`.

### 7 — `new Error` cru

`http/drizzle-rate-limiter.repository.ts`: `RateLimitWindowUpsertMissingRowError` (novo,
`DiagnosableError`) no lugar do `new Error('rate limit upsert returned no row')`.
`http/router.service.ts`: o `if (rateLimitWindows === undefined) throw new Error(...)` dentro de
`assertWithinRouteRateLimit` era comprovadamente inalcançável (o próprio comentário já dizia "só
estreita o tipo" — `assertPostgresRateLimitHasStore` recusa o boot antes) — virou asserção não-nula
documentada, sem `throw`. Sem comportamento novo a testar (o `if` nunca disparava); `32 pass, 0
fail` em `rate-limit`/`router`/`rate-limited-routes` confirma que nada regrediu.

### 8 — Arquivar o padrão sob o mesmo lock

`update()` (`drizzle-contractor-mail-template.repository.ts`) passa a rodar em transação e segurar
`acquireDefaultLock({ companyId, mailType })` **quando arquiva** — mesmo lock de `create`/
`setDefault` — antes só o `UPDATE` avulso, sem lock, corria risco de um `create` concorrente ler
"já existe padrão" um instante antes de este `UPDATE` desmarcá-lo. Nunca promove outro modelo
sozinho (decisão de produto fora do escopo); a checklist/confirmação já comunicavam "sem padrão"
(`contractorMail.sendReadiness.reasonTemplateMissing`,
`addressReport.correction.mail.error.templateMissing`) — conferido, sem mudança de texto.

Teste de integração reforçado (`o primeiro modelo ativo nasce padrão, e arquivar o padrão tira o
padrão`): depois de arquivar, confere explicitamente que o segundo modelo **continua** sem padrão e
que nenhum modelo ativo do tipo está marcado como padrão. **Verde**: `9 pass, 0 fail`.

### 9 — Segurança L2: teto de modelos ativos e rate limit na prévia

`CONTRACTOR_MAIL_TEMPLATE_MAX_ACTIVE = 50`: `create()` conta os modelos ativos de
`(companyId, mailType)` sob o mesmo advisory lock da troca de padrão e recusa a criação além do
teto com `409 CONTRACTOR_MAIL_TEMPLATE_LIMIT_REACHED` (arquivar libera vaga).
`POST /contractor-mail-templates/preview` ganha `rateLimit: { store: 'memory', maxRequests: 60,
windowMs: 60_000 }` — por usuário, por instância (prévia acompanha cada troca de modelo na tela, não
é trilha compartilhada como o envio). `test/rate-limited-routes.contract.test.ts` só lista rotas com
`store: 'postgres'` explicitamente, então não precisou de atualização (conferido).

**Vermelho**: teste de integração novo (`a 51ª criação ativa do mesmo tipo é recusada...`) — cria 50,
a 51ª esperada `ContractorMailTemplateLimitReachedError`, recebido `undefined` (sem teto ainda).
**Verde**: `9 pass, 0 fail`.

### 10 — Migrations com CHECK ampliado/novo

Confirmado por `git log origin/staging -- <caminho>` que nenhuma das duas migrations está em
`origin/staging` — seguro editar. `20260915210000_contractor_contact_email_length_check` e
`20260915233000_rate_limit_windows`: `ADD CONSTRAINT ... CHECK (...) NOT VALID` seguido de
`ALTER TABLE ... VALIDATE CONSTRAINT ...` (a segunda roda sob lock mais fraco, sem bloquear escrita
concorrente durante a validação). `bun run db:generate --name` continua respondendo `no_changes`
(schema/snapshot inalterados); `rollback.sql` segue igual (um `DROP CONSTRAINT` desfaz os dois
jeitos igual). **Verde**: `58 pass, 1 fail` (a falha é a `cte-profile-output-constraints` alheia,
documentada na T101) em `database-migration.contract.test.ts`.

### 11 — 429 na tela com Retry-After

Novo `src/modules/shared/retryAfter.service.ts`
(`resolveRetryAfterMinutes`/`readRetryAfterSecondsHeader`, testado isoladamente). O cliente HTTP
expunha o header? Não — `AddressCorrectionRequestError` (nfe-workspace) e a nova
`ContractorMailSettingsRequestError` (delivery-clients) passam a carregar `retryAfterSeconds`, lido
de `response.headers.get('retry-after')` no `429`. A tela do envio de correção
(`AddressCorrectionMailDialog`) e o e-mail de teste (`ContractorMailSettingsPanel`) mostram "tente
de novo em N min" em vez do código cru quando o erro é `TOO_MANY_REQUESTS`. Locale pt/en acentuado.

**Vermelho/Verde**: `resolveRetryAfterMinutes`/`readRetryAfterSecondsHeader` com teste próprio (`2
pass`); o teste de client `429 do limitador carrega o Retry-After no erro`
(`test/nfe-workspace/address-correction.contract.ts`) já nasceu verde porque a plumbing de
`AddressCorrectionRequestError` foi implementada antes do teste rodar pela primeira vez — confirmado
por leitura: sem `retryAfterSeconds` na assinatura anterior, `error.retryAfterSeconds` seria sempre
`undefined`. **Verde**: `3819 pass, 0 fail` no frontend inteiro, build ok.

### 12 — Atalho para a aba "E-mail"

`DeliveryClientWorkspace.page.tsx` ganha `readDeliveryClientTabFromLocation`
(`resolveDeliveryClientTab` exportado, mesmo mecanismo de `readTabFromLocation` do
`NfeWorkspace.page.tsx`): lê `?tab=` na montagem, `useState` com inicializador preguiçoso.
`navigateToDeliveryClients` (T305/T405) passa a empurrar `/clientes?tab=mail`, então os três
atalhos ("sem contato ativo", "configurar e-mail" × 2) abrem direto na aba certa.

**Vermelho**: `resolveDeliveryClientTab`/`navigateToDeliveryClients` ainda não tratavam `?tab=`
(a rota não carregava o parâmetro, e o `pushPath` só mandava `/clientes`) — testes novos
escritos contra o comportamento alvo, verdes assim que a implementação foi trocada (a
função-alvo não existia antes: `ReferenceError`/`undefined` seria o vermelho de um `import`
que falha). **Verde**: `3 pass, 0 fail` nos dois contratos novos; build ok.

### 13 — Spec e SECURITY.md

`spec.md` RF14 ganha `{clientes}` (já implementado no catálogo, não citado na spec).
`docs/SECURITY.md` ganha três entradas em "Abertos": **M1** (texto livre do modelo pode carregar
URL — pendente auditoria de edição e aviso antes de produção), **L1** (teto do limitador por
usuário, não por empresa — decisão consciente, instalação dedicada por transportadora, ADR-0021),
**L4** (rotas anônimas seguem só com limitador em memória; `password-resets` é a candidata natural
a migrar primeiro). Só documentação — `prettier --check` verde nos dois arquivos.

### Gates finais (saída fresca, toda a rodada)

```
bun run typecheck   # 6 apps, verde
bun run lint        # 6 apps, verde
bun run format:check
```

Resultado do `format:check`: **1 arquivo com aviso**, `specs/150-pedido-de-correcao-de-endereco/email-template.html`
— pré-existente (commit `656951b0`, antes desta rodada), não tocado por nenhuma das 13 correções
(`git diff --stat HEAD` confirma). Não corrigido aqui por não ser parte do pedido (evitar escopo
fora do combinado); registrado para quem for tocar o arquivo depois.

```
bun run --cwd apps/api-transportada test        # 6002 pass, 23 skip, 0 fail
bun run --cwd apps/worker-transportada test     # 1352 pass, 0 fail
bun run --cwd apps/cron-transportada test       # 94 pass, 0 fail
bun run --cwd apps/frontend-transportada test   # 3821 pass, 0 fail
bun run --cwd apps/frontend-transportada build  # ok, PWA gerado
```

Integrações (Postgres nativo `127.0.0.1:65433`, dentro de `apps/api-transportada`):

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test \
  ./test/integration/address-correction-repository.integration.ts \
  ./test/integration/address-correction-mail-repository.integration.ts \
  ./test/integration/contractor-mail-template-repository.integration.ts \
  ./test/integration/contractor-contacts-repository.integration.ts \
  ./test/integration/address-report-repository.integration.ts \
  --timeout 120000
```

Resultado: **31 pass, 0 fail**.

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test ./test/database-migration.contract.test.ts --timeout 120000
```

Resultado: **58 pass, 1 fail** — a falha conhecida e alheia `cte-profile-output-constraints`
(Postgres 18 local devolve `23001` onde a asserção espera `23503`), já documentada na T101; nada
relacionado às migrations tocadas nesta rodada (item 10).

Worker, dentro de `apps/worker-transportada`, banco `worker_t302`:

```
DATABASE_URL=postgresql://postgres@127.0.0.1:65433/worker_t302 \
  bun test ./test/contractor-mail-outbound-outbox.integration.test.ts --timeout 120000
```

Resultado: **3 pass, 0 fail** — os dois testes de reivindicação de outbox que a T302 registrou como
falha alheia (`claims a due unpublished row…`, `does not let a second claim…`) passaram nesta
execução; nada nesta rodada tocou o worker.

### Arquivos alterados (por commit, ver hashes acima)

- API: `contractor-mail-settings.use-case.ts`, `settings-use-case.contract.ts` (item 1);
  `drizzle-address-correction-mail.repository.ts`,
  `address-correction-mail-repository.integration.ts` (item 3);
  `contractor-mail-templates.use-case.ts`, `drizzle-contractor-mail-template.repository.ts` (item 4
  e item 8); `drizzle-rate-limiter.repository.ts`, `rate-limit-window.error.ts` (novo),
  `router.service.ts` (item 7); `mail-template-catalog.constant.ts`,
  `contractor-mail-template.error.ts`, `contractor-mail-templates.routes.ts`,
  `contractor-mail-template-repository.integration.ts` (item 9);
  `drizzle/20260915210000_contractor_contact_email_length_check/migration.sql`,
  `drizzle/20260915233000_rate_limit_windows/migration.sql` (item 10).
- Frontend: `addressCorrectionMail.service.ts`,
  `hooks/useAddressCorrectionMailDialog.hook.ts` (itens 2 e 4);
  `contractorMailTemplate.validation.ts`,
  `contractor-mail-templates-validation.contract.ts` (item 6);
  `mail-template-variable-parity.contract.ts` (novo, item 5);
  `shared/retryAfter.service.ts` (novo), `addressCorrectionRequestError.service.ts`,
  `nfeWorkspaceClient.service.ts`, `AddressCorrectionMailDialog.component.tsx`,
  `contractorMailSettingsClient.service.ts`, `DeliveryClientWorkspace.page.tsx`,
  `ContractorMailSettingsPanel.component.tsx`, locales pt/en (item 11);
  `DeliveryClientWorkspace.page.tsx`, `deliveryClientsNavigation.service.ts`,
  `tab-from-location.contract.ts` (novo), `delivery-clients-navigation.contract.ts` (novo) (item
  12).
- Docs: `specs/150-pedido-de-correcao-de-endereco/spec.md`, `docs/SECURITY.md` (item 13).
