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
