# 032 — Evidência

## T001 — spec e plano

`specs/032-nota-de-servico-municipal/{spec.md,plan.md,tasks.md}` escritos antes de qualquer código.
Sem comando: são documentos.

## T002 — ADR 0029 e mapa fiscal

`docs/adr/0029-nfse-municipal-via-nota-rp-v2.md` registra a escolha da API v2 da Nota RP em vez da
v3, o cliente HTTP atrás da porta `NfseFiscalGateway`, e a autorização confirmada por consulta em vez
de postback. As duas alternativas rejeitadas ficaram escritas com o motivo: o `NotaRpNfseProvider` do
pacote é v3-only e a v3 não atende Ribeirão Preto; o webhook como fonte de verdade aceitaria transição
de estado fiscal a partir de POST não autenticado, num serviço sem rate limit nem HMAC validado.

`docs/spec/fiscal-integration.md` deixou de terminar em "NFS-e permanece fora do MVP fiscal": ganhou a
seção do trilho NFS-e, com a porta e a regra de que o adaptador lê o corpo da resposta, não o status
HTTP.

Sem comando: são documentos.

## T003 — confirmação contra a conta real

_Parcial._ Uma NFS-e real já emitida (Ribeirão Preto, via Nota RP, 11/08/2026) respondeu boa parte do
que a chamada à API responderia. O que ela fixou:

| Campo                                  | Valor                           | Onde vive                          |
| -------------------------------------- | ------------------------------- | ---------------------------------- |
| CNAE                                   | `4930202`                       | `nfse_emission_profiles.cnae_code` |
| Item da LC 116                         | `16.02`                         | `service_list_item`                |
| Atividade do município                 | `160107`                        | `municipal_taxation_code`          |
| Código NBS                             | `1.0501.19.00`                  | `nbs_code`                         |
| Alíquota de ISS                        | `2,00%` — Simples Nacional      | `iss_rate`                         |
| Natureza da operação                   | Exigível                        | `iss_exigibility` `'1'`            |
| ISS retido                             | Não                             | `iss_withheld` `false`             |
| Município de incidência e de prestação | Ribeirão Preto — IBGE `3543402` | `municipality_ibge_code`           |

A conta do imposto fecha com esses valores: `672,22 × 2% = 13,44`, que é o ISSQN impresso. A alíquota
de 2% vem do Simples Nacional — se a empresa sair do regime ela muda, e é por isso que ela é campo de
perfil e não constante.

**Tomador é o remetente (`taker = '0'`).** Confirmado pelo usuário: o cliente contrata a
transportadora, despacha a mercadoria e a transportadora entrega nos clientes dele. Ele é o remetente
da NF-e e é quem paga o frete. A nota real corrobora — o tomador fica em outro município e as
entregas são em Ribeirão Preto; se o agrupamento fosse por destinatário, aquela emissão teria virado
dezenas de NFS-e em vez de uma.

**A descrição é por período, não por lista de notas.** O texto da nota real cobre uma semana de
entregas num único documento. Foi o que originou a T010a — o motor de descrição não sabia escrever
isso.

**Numeração — respondida pela metade.** A nota traz os dois contadores lado a lado, e eles divergem:

|                 | Valor | Quem atribui               |
| --------------- | ----- | -------------------------- |
| Número da NFS-e | `63`  | prefeitura, na autorização |
| RPS             | `78`  | lado do emitente           |

São sequências independentes — o RPS anda mesmo quando a NFS-e não sai. Último RPS conhecido: **78**,
de 11/08/2026. Se o contador for nosso, a primeira emissão do produto começa em **79**.

_Continua pendente:_ **quem incrementa o RPS** — a Nota RP sozinha ou o payload da v2 exige o número.
Responde-se sem token, olhando o painel da Nota RP: se o número do RPS aparece preenchido na emissão,
o contador é do provedor e não entra nada no banco; se for digitado, entra sequência fiscal com escopo
`nfse`. Falta também `GET /api/v3/empresa/listar`, para saber se Ribeirão Preto já migrou para a v3.
Ao colar qualquer saída da API aqui: **sem token, sem CNPJ de terceiro, sem inscrição municipal**.

## T004 — contrato de schema, vermelho pelo motivo certo

`test/nfse-schema/{tables.ts,tenant-safety.contract.ts,aggregator.contract.ts,nfse.contract.ts}` e o
entrypoint `test/nfse-schema.contract.test.ts`, com a entrada nova na lista literal do
`apps/api-transportada/package.json` — teste fora da lista não roda.

```
$ bun test apps/api-transportada/test/nfse-schema.contract.test.ts
error: T005 schema implementation is missing database export: nfseEmissionProfiles
 0 pass
 19 fail
Ran 19 tests across 1 file. [53.00ms]
```

As 19 falhas são as três que o contrato exige antes da implementação: a tabela que não existe, a
agregação ausente no `databaseSchema`, e o `stored_objects_purpose_check` sem `nfse_document`.

`bun run --cwd apps/api-transportada typecheck` e `bun run format:check` verdes — o contrato lê
`STORAGE_OBJECT_PURPOSES` como `readonly string[]` para a asserção falhar em runtime, e não no
compilador.

## T005 — as onze tabelas, verde

`src/database/nfse.schema.ts` com `nfse_emission_profiles`, `nfse_provider_credentials`,
`nfse_service_invoices`, `nfse_service_invoice_documents`, `nfse_service_invoice_charges`,
`nfse_issuance_attempts`, `nfse_issuance_events`, `nfse_issuance_payloads`, `nfse_fiscal_documents`,
`nfse_processed_messages` e `nfse_issuance_outbox`; as onze registradas nos três pontos de
`database.schema.ts` (import, `export *` e o objeto `databaseSchema`). `'nfse_document'` entrou em
`STORAGE_OBJECT_PURPOSES` e no `check` literal de `storage.schema.ts` — e, por consequência, na
asserção de `test/nfe-schema/storage.contract.ts`, que fixa a lista inteira.

```
$ bun run --cwd apps/api-transportada test
 2058 pass
 3 skip
 0 fail
 8667 expect() calls
Ran 2061 tests across 83 files. [1.75s]

$ bun run --cwd apps/api-transportada typecheck   # sem saída
$ bun run format:check                            # All matched files use Prettier code style!
$ bun run lint                                    # sem achado nas quatro apps
```

Três decisões que o molde do MDF-e não respondia:

- **`pending_authorization`** é status próprio da NFS-e: a prefeitura aceita o RPS na hora e autoriza
  depois, então a aceitação não é liquidação. `nfse_service_invoices_next_check_state_check` amarra
  `next_status_check_at` a esse status — fora dele a coluna é nula, e a varredura de reconciliação
  não tem como pegar nota já liquidada.
- **`callback_token_sha256` é único global**, não por empresa: a rota de callback é anônima e resolve
  a empresa _pelo_ token, então não há contexto de tenant para restringir a busca.
- **`nfse_processed_messages` não tem FK para o outbox.** É o mesmo motivo do CT-e: a linha do outbox
  já foi apagada quando o consumidor grava a marca de processamento, e a FK impediria a gravação.

O PDF é par nulável (`nfse_fiscal_documents_pdf_check`): ou objeto e digest juntos, ou nenhum dos
dois — a prefeitura pode autorizar antes de o PDF existir.

## T006 — migration versionada, com rollback guardado

`drizzle/20260811194822_nfse_service_invoices/{migration.sql,rollback.sql,snapshot.json}`. O bloco
novo em `test/database-migration/static-migration.contract.ts` nasceu vermelho — `expect(directory)
.toBeString()` recebeu `undefined`, porque o diretório ainda não existia — e só depois a migration
foi gerada.

```
$ bun run --cwd apps/api-transportada db:check
Everything's fine 🐶🔥

$ make migration-test
 37 pass
 0 fail
 495 expect() calls

$ bun run --cwd apps/api-transportada test
 2059 pass
 3 skip
 0 fail
```

O `migration-test` aplica tudo num Postgres descartável, roda os rollbacks em ordem inversa até
sobrar só a identidade, e reaplica — as onze tabelas entraram em `NFSE_TABLES` (`support.ts`) e nas
duas listas esperadas de `database-migration.integration.ts`, então a ida e a volta são conferidas
tabela a tabela.

O único trecho não-aditivo da migration é a troca do check de propósito de `stored_objects`, num
único `ALTER TABLE ... DROP CONSTRAINT ..., ADD CONSTRAINT ...` — não há janela sem check, e nenhuma
linha existente é apagada ou invalidada. O contrato fixa essa forma por regex.

O `rollback.sql` derruba as onze tabelas em ordem inversa de dependência e **só então** devolve o
check antigo. A ordem importa: com `'nfse_document'` já fora da lista, um `stored_objects` que ainda
apontasse para documento de NFS-e faria o `ADD CONSTRAINT` falhar — que é o comportamento desejado,
e está dito no cabeçalho do arquivo. O `DELETE` do journal exige exatamente uma linha removida.

A migration também foi aplicada no banco local (`set -a; . ./.env; set +a; bun run --cwd
apps/api-transportada db:migrate`), para o ambiente de desenvolvimento não ficar com código à frente
do schema.

## T007 — cópias por valor no worker

`apps/worker-transportada/src/database/nfse-issuance-execution.schema.ts` (invoices, attempts,
events, payloads, fiscal documents e credenciais) e as duas tabelas do relay em
`src/database/processing.schema.ts` (`nfse_processed_messages`, `nfse_issuance_outbox`).

```
$ bun run --cwd apps/worker-transportada typecheck   # sem saída
$ bun run --cwd apps/worker-transportada lint        # sem achado
$ bun run --cwd apps/worker-transportada test
 317 pass
 0 fail
 726 expect() calls
```

A cópia carrega **só as colunas que o trilho lê ou escreve**, como manda o cabeçalho do arquivo do
MDF-e: nada de perfil de emissão (o payload já vai congelado pela API) e nada de vínculos ou
encargos (quem os cria e libera é a API, na transação dela). De `nfse_provider_credentials` vem o
`secret_envelope` — o token é aberto no gateway e zerado depois do uso — e não vem o
`callback_token_sha256`, que só a rota anônima da API consulta.

⚠️ Não existe teste de drift entre o schema da API e esta cópia; divergência só apareceria em
runtime. Mudança em qualquer uma das onze tabelas tem de mexer nos dois lados na mesma task.

## T008 — contrato da descrição (vermelho antes da implementação)

`test/nfse-domain/description.contract.ts`, servido pelo entrypoint novo
`test/nfse-domain.contract.test.ts` (acrescentado à lista literal do `package.json`, senão não roda).

```
$ bun run --cwd apps/api-transportada test ./test/nfse-domain.contract.test.ts
error: Cannot find module '../../src/nfse-invoices/domain/nfse-description.service.js'
 0 pass
 1 fail
```

O vocabulário de variáveis é `{{notas}}`, `{{quantidadeNotas}}` e `{{observacoes}}`, na mesma
sintaxe de interpolação que os `*.locale.json` do frontend já usam. Três decisões que o plano não
fechava:

- **Sem variável de valor.** O total já é campo próprio da nota (`service_amount`) e do payload do
  provedor; repetido como texto livre viraria uma segunda fonte de verdade para o valor, sem ninguém
  para conferir se as duas batem.
- **A contagem nunca mente.** `{{quantidadeNotas}}` reporta a seleção inteira mesmo quando a lista é
  truncada — quem lê a nota vê "10 notas" e a lista resumida, não "3 notas".
- **Corte entre notas, nunca dentro de uma.** A truncagem remove notas inteiras do fim e fecha com
  `… e mais N notas`; o contrato prova que a lista servida é exatamente o prefixo da seleção. Meia
  chave de acesso num documento fiscal não identifica nada.

Também fixados: espaço em branco (inclusive quebra de linha e caractere de controle) colapsa em
espaço simples, para o teto de caracteres ser contado sobre o texto que o provedor realmente recebe;
variável desconhecida é 422 `NFSE_DESCRIPTION_TEMPLATE_INVALID` nomeando a variável; template que
não deixa espaço para uma nota sequer é 422 `NFSE_DESCRIPTION_TOO_LONG`.

## T009 — contrato da seleção e da paridade de valor (vermelho antes da implementação)

`test/nfse-domain/selection.contract.ts`, no mesmo entrypoint do T008.

```
$ bun run --cwd apps/api-transportada test ./test/nfse-domain.contract.test.ts
error: Cannot find module '../../src/nfse-invoices/domain/nfse-description.service.js'
 0 pass
 1 fail
```

**A paridade é medida, não afirmada.** O contrato roda a mesma seleção pelas duas projeções — a de
CT-e (`projectCteBatchCharges`, agrupamento `sender_recipient`) e a de NFS-e — e exige
`serviceAmount === fiscalAmount`, `fiscalComponents` idênticos e `baseAmount` idêntico. Trocar o
documento fiscal não pode mudar o preço do serviço, e a única forma de garantir isso é somar pelos
mesmos `composeCharge`/`roundChargeToFiscalScale`.

Decisões que o plano deixava em aberto:

- **A alíquota de ISS é fração, não percentual.** `nfse_emission_profiles.iss_rate` é
  `numeric(9,6)` com check `>= 0 and <= 1`, igual a toda taxa do repositório (`applyRate` divide por
  `PERCENTAGE_FACTOR = 1e6`). 2% é `0.020000`. O ISS incide sobre o serviço já arredondado à escala
  fiscal, não sobre o valor da carga.
- **A seleção resolve o tomador; a projeção só agrupa.** `selectNfseCandidates` traduz
  `profile.taker` (`'0'` remetente, `'3'` destinatário) em `takerTaxId`/`takerLegalName` no
  candidato, e `projectNfseInvoices` agrupa por `takerTaxId` sem saber o que é remetente. Um papel a
  menos para a projeção errar.
- **Elegibilidade é a do CT-e, importada.** `checkDocumentEligibility` de
  `cte-batches/domain/cte-batch-eligibility.policy.ts` é reusada inteira, com o vocabulário de razões
  dela (`CTE_BATCH_DOCUMENT_NOT_AUTHORIZED` e companhia) — duas cópias da mesma regra divergiriam.
  Só as razões de vínculo são próprias: `NFSE_DOCUMENT_ALREADY_LINKED`,
  `NFSE_DOCUMENT_LINKED_TO_CTE_BATCH`, `NFSE_DOCUMENT_DUPLICATED`, `NFSE_DOCUMENT_NOT_FOUND`.
- **Razão nova que o CT-e não tem:** `NFSE_DOCUMENT_MISSING_TAKER_NAME`. `nfe_participants.legal_name`
  é anulável e `nfse_service_invoices.taker_legal_name` é `NOT NULL` — sem o nome não há nota de
  serviço, e descobrir isso na prefeitura é tarde.
- **A projeção do valor mora em `nfse-projection.service.ts`,** não dentro da policy de seleção: uma
  decide quem entra, a outra quanto custa, e nenhuma passa de 200 linhas.

## T010 — domínio implementado

Cinco arquivos em `apps/api-transportada/src/nfse-invoices/domain/`:
`nfse-description.service.ts`, `nfse-selection.policy.ts`, `nfse-projection.service.ts`,
`nfse-invoice-state.policy.ts` e `nfse-issuance.error.ts`.

Contrato novo desta task: `test/nfse-domain/state.contract.ts` (a máquina de estados não tinha
contrato — o plano só a listava), somado ao entrypoint `test/nfse-domain.contract.test.ts` já
declarado no `package.json`.

```
$ bun test apps/api-transportada/test/nfse-domain.contract.test.ts
 24 pass
 0 fail
 62 expect() calls

$ bun run --cwd apps/api-transportada test
 2083 pass
 3 skip
 0 fail
 8766 expect() calls
Ran 2086 tests across 84 files. [2.13s]

$ bun run --cwd apps/api-transportada typecheck
$ bun run lint
$ bun run format:check
All matched files use Prettier code style!
```

Decisões tomadas na implementação:

- **`nextStatus: null` é o cancelamento.** Não existe status `cancelling` na tabela: o pedido de
  cancelamento sai para a prefeitura com a nota ainda `authorized`, e só o write-back a leva para
  `cancelled`. A transição devolve `null` para dizer "aceito, não mexa no status" — o que está em voo
  aparece pela tentativa, não pelo status da nota.
- **`pending_authorization` bloqueia os dois lados.** Reemitir duplicaria a nota e cancelar não tem o
  que cancelar (ainda não há número). É o único estado que responde a mesma razão para `issue` e para
  `cancel`.
- **A truncagem da descrição é busca binária, não varredura.** Cada nota a mais só faz o texto
  crescer — inclusive quando o resumo cai de `notas` para `nota` —, então a monotonicidade vale e uma
  seleção de centenas de notas não renderiza o texto inteiro uma vez por nota.
- **A ordem dos bloqueios segue a do CT-e:** elegibilidade responde antes do vínculo
  (`resolveDocumentBlock` já fazia assim), para um documento inelegível **e** vinculado dizer por que
  é inelegível.
- **Sem faixa de caractere de controle no regex.** A primeira versão colapsava a faixa `\u0000-\u001F`, o que o `no-control-regex` do eslint reprova; `\s` já cobre quebra de linha, tabulação e retorno de
  carro, que é o que o contrato exige. Byte de controle solto é assunto da validação Zod da fronteira
  (Fase D), não da montagem do texto.

## T011 — bloqueio recíproco no CT-e

Contratos estendidos **antes** da implementação, e o vermelho veio pelo motivo certo:

```
$ bun run --cwd apps/api-transportada test
error: Export named 'buildDocumentNfseLinkFilters' not found in module
  '.../src/nfe-documents/infrastructure/drizzle-nfe-document.repository.ts'
# e, no contrato de domínio:
expect(received).toBeUndefined()  // resolveDocumentBlock ainda não conhecia o vínculo de NFS-e
```

Testes tocados: `test/cte-batch-domain/document-block.contract.ts` (documento seguro por NFS-e viva;
lote responde primeiro quando os dois vínculos existem), `test/nfe-schema/document-block-tenant-safety.contract.ts`
(recorte da consulta de vínculo ativo), `test/cte-batch-application/{preview,document-blocking}.contract.ts`

- os dois `support.ts` de fixture.

Verde depois de implementar:

```
$ bun run --cwd apps/api-transportada test
 2088 pass
 3 skip
 0 fail
 8786 expect() calls
Ran 2091 tests across 84 files. [1.90s]

$ bun run --cwd apps/api-transportada typecheck
$ bun run lint
$ bun run --cwd apps/frontend-transportada test
 848 pass
 0 fail
Ran 848 tests across 16 files. [507.00ms]
$ bun run format:check
All matched files use Prettier code style!
```

Decisões tomadas na implementação:

- **`DocumentBlock` não foi alargado.** O bloqueio de NFS-e viaja com `batchId: null` em vez de ganhar
  um campo `invoiceId`: o schema HTTP do CT-e e todos os contratos que já o exercitam ficam intactos, e
  o operador lê a razão, que é o que ele precisa para agir.
- **O recorte de vínculo ativo é `cancelled_at is null`, sem junção com o status da nota.** Cancelar a
  NFS-e carimba `cancelled_at` nas linhas na mesma transação, e o índice parcial único guarda
  exatamente esse recorte — mesmo padrão que o `billing` já usa. Nota rejeitada continua segurando as
  NF-e dela, porque ela ainda pode ser reemitida.
- **Criação ganhou código 409 próprio.** `createBlockError` responde
  `CTE_BATCH_DOCUMENT_LINKED_TO_NFSE` em vez de cair no genérico `..._NOT_ELIGIBLE`: criação é tudo ou
  nada, e "não elegível" não diz ao operador que a nota está presa a uma nota de serviço.
- **Rótulo no frontend entrou junto.** Sem entrada em `nfeWorkspace.locale.json` a tabela Notas
  mostraria o código cru. A task é de backend, mas o código cru vazando para a tela é regressão da
  tela, não escopo novo.
- **Fixture sem tipo deixou o typecheck passar com 14 testes quebrados.** `CteBatchUnitOfWorkFixture`
  é duck-typed sobre `Record<string, unknown>`, então `tsc` não viu o método faltando —
  `transaction.findActiveNfseLinks is not a function` só apareceu em runtime. Porta nova exige
  atualizar a fixture na mesma passada.

## T012 — permissões nfse.\*

Quatro permissões novas em `identity/domain/authorization.policy.ts`: `nfse.manage`, `nfse.issue`,
`nfse.cancel`, `nfse.read`, distribuídas espelhando o CT-e — `fiscal` recebe as quatro,
`company-admin`/`operator` recebem `manage`+`read`, `finance`/`viewer` só `read`, `driver` nenhuma.

Contrato de RBAC (`test/authorization.contract.test.ts`) e o guarda de sincronismo do frontend
(`test/frontend-contract.test.ts::'keeps the allowlist in sync with the API authorization policy'`,
que lê os dois arquivos-fonte por regex e falha se divergirem) atualizados na mesma task, junto com
os testes que fixam a lista completa de permissões (`test/auth-me.contract.test.ts`,
`test/integration/auth-me.integration.ts`, `test/tenant-context.contract.test.ts`) e a lista literal
usada pelo type guard do frontend (`src/modules/identity/queries/useAuthMe.query.ts`).

```
$ bun run --cwd apps/api-transportada test
 2088 pass
 3 skip
 0 fail
 8786 expect() calls
Ran 2091 tests across 84 files. [2.15s]

$ bun run --cwd apps/api-transportada typecheck
$ bun run --cwd apps/frontend-transportada test
 848 pass
 0 fail
Ran 848 tests across 16 files. [287.00ms]

$ bun run lint
# api, worker, cron, frontend — sem erros

$ bun run format:check
All matched files use Prettier code style!
```

Decisão: a ordem de inserção na matriz (`TRANSPORTADA_PERMISSIONS`) segue logo depois de `mdfe.cancel`
e antes de `trip.read` — mantém os quatro trilhos de documento fiscal (`cte.*`, `mdfe.*`, `nfse.*`)
agrupados, com `trip.*` (escopo motorista) por último, como já estava.

## T013 — nfse-profiles: perfil de emissão e credencial do provedor

Módulo `src/nfse-profiles/` nas quatro camadas:

- `presentation/` — `nfse-profile-request.schema.ts` (corpos Zod `.strict()`), `nfse-profiles.schema.ts`
  (parse de corpo, query e caminho), `nfse-emission-profiles.routes.ts`, `nfse-provider-credentials.routes.ts`
- `application/` — `nfse-profile.port.ts`, `nfse-emission-profiles.use-case.ts`,
  `nfse-provider-credentials.use-case.ts`, `nfse-credential-secret.service.ts`
- `domain/` — `nfse-profile.error.ts`
- `infrastructure/` — `drizzle-nfse-profile.repository.ts`, `nfse-emission-profile.mapper.ts`,
  `nfse-profile.support.ts`

O token do provedor entra pelo `PUT`, é selado em `secret_envelope` (`A256GCM`, AAD
`transportada:nfse-credential:v1:${companyId}:${credentialId}`, `plaintext.fill(0)` no `finally`) e
**nunca volta**: `mapCredentialSummary` converte os dois segredos em booleanos
(`apiTokenConfigured`, `callbackTokenConfigured`) ainda na infraestrutura, de modo que nem o envelope
nem o hash do callback atravessam a fronteira da aplicação. O contrato usa um token sintético
(`notarp-synthetic-token-do-not-leak`) e falha se ele aparecer no corpo de qualquer resposta.

```
$ bun test ./apps/api-transportada/test/nfse-profiles.contract.test.ts
 18 pass
 0 fail
 82 expect() calls
Ran 18 tests across 1 file. [87.00ms]

$ bun run --cwd apps/api-transportada test
 2106 pass
 3 skip
 0 fail
 8868 expect() calls
Ran 2109 tests across 85 files. [2.23s]

$ bun run typecheck
# api, worker, cron, frontend — sem erros

$ bun run lint
# api, worker, cron, frontend — sem erros

$ bun run format:check
All matched files use Prettier code style!
```

### Duas divergências do plano, deliberadas

1. **Perfil de emissão ganhou CRUD completo** (`GET` lista, `POST`, `PATCH /:id`, `PATCH /:id/status`)
   no lugar do `GET|PUT` que o plano escreveu. `nfse_emission_profiles` tem unicidade
   `(company_id, name)`, ciclo de vida `draft`/`active`/`inactive` e coluna `version`: um `PUT`
   singleton nunca criaria o segundo perfil nomeado que o próprio schema permite. A credencial
   continua `GET` + `PUT` porque `(company_id, provider, fiscal_environment)` é único — ali o
   singleton por ambiente é real, e o `PUT` rotaciona o segredo no lugar
   (`onConflictDoUpdate` com `version + 1`).
2. **Sem máscara do token no `GET` da credencial.** O plano pedia "só máscara + `status`". Com no
   máximo uma credencial por ambiente fiscal a máscara não desambigua nada e ainda coloca um pedaço
   do segredo em backup, dump e log de resposta. O `GET` devolve
   `apiTokenConfigured`/`callbackTokenConfigured` (booleanos), `status`, `taxId`,
   `municipalRegistration`, `provider`, `id`, timestamps e `version` — e não toca no envelope.

Nota: `MIN_DESCRIPTION_MAX_LENGTH`/`MAX_DESCRIPTION_MAX_LENGTH` passaram a ser exportados de
`database/nfse.schema.ts` para o schema de request reusar os limites que o `check` do SQL já impõe,
em vez de redeclarar os números e deixá-los divergir.

## T014 — `nfse-invoices/`: prévia e criação

### O que entrou

| Camada         | Arquivo                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| presentation   | `nfse-invoices.routes.ts` (`POST /nfse-service-invoices/preview`, `POST /nfse-service-invoices`), `nfse-invoices.schema.ts`                                     |
| application    | `nfse-invoice.use-case.ts`, `nfse-invoice-candidates.service.ts`, `nfse-invoice-preview.service.ts`, `nfse-issuance-attempt.service.ts`, `nfse-invoice.port.ts` |
| domain         | `nfse-selection.policy.ts`, `nfse-projection.service.ts`, `nfse-description.service.ts`, `nfse-invoice-state.policy.ts`, `nfse-issuance.error.ts`               |
| infrastructure | `drizzle-nfse-invoice.repository.ts`, `nfse-invoice-selection.query.ts`, `nfse-invoice-issuance.query.ts`                                                       |

### Decisões que o contrato guarda

- **A prefeitura não é chamada no request.** A criação devolve **202** com o resumo do pedido
  aceito (`invoiceId`, `attemptId`, `status: requested`, `replayed`) e `cache-control: no-store`;
  a transmissão fica para o worker, pelo outbox.
- **Tudo numa transação só, nesta ordem:** `createInvoice` → `linkDocuments` → `createCharges` →
  `createAttempt` → `savePayload` → `appendEvent` → `pushOutbox`. Publicar antes de gravar o
  payload deixaria o worker ler uma nota pela metade.
- **`idempotency-key` é obrigatória.** Sem o header a rota responde 400 sem chegar ao caso de uso.
  Mesma chave + mesmo pedido devolve a tentativa original (`replayed: true`, zero gravação nova);
  mesma chave + outro pedido levanta `NfseIdempotencyKeyReusedError`. A digital é sha256 sobre o
  JSON canônico ordenado, então a ordem dos documentos na tela não muda o pedido.
- **`companyId` vem do contexto autenticado.** Os schemas são `.strict()`: `companyId` no corpo é
  400, não um tenant escolhido pelo cliente.
- **Payload congelado sem segredo.** `providerConfig` guarda `credentialId`, `fiscalEnvironment`,
  `municipalRegistration`, `provider` e `taxId` — o token continua selado na credencial. Contrato
  serializa payload + config e falha se `secret`, `token` ou `password` aparecer.
- **A nota congela a versão publicada da regra de frete** (`ruleSnapshot`), nunca a regra viva.
- **Prévia é leitura pura:** não abre transação (contrato assevera `transactionScopes` vazio) e
  devolve bloqueio como dado; na criação o mesmo bloqueio é erro, porque emitir metade da seleção
  seria surpresa.
- **Predicados extraídos para `nfse-invoice-issuance.query.ts`** para o contrato tenant-safe poder
  compilá-los com `new PgDialect().sqlToQuery(...)` no molde de
  `test/billing-schema/eligible-query-tenant-safety.contract.ts`. Comportamento idêntico ao que já
  estava embutido no repositório — só deixou de ser invisível ao teste.

### Contratos escritos antes da implementação

| Arquivo                                                             | O que prova                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/nfse-schema/invoice-issuance-query-tenant-safety.contract.ts` | os 8 predicados carregam `company_id` e o próprio recorte (lote cancelado, `cancelled_at is null`, versão `active` da regra, ambiente fiscal na credencial, chave de idempotência escopada) |
| `test/nfse-invoices-http/invoices.contract.ts`                      | 202 na criação, 200 na prévia, `idempotency-key` obrigatória, `nfse.read` não emite, `.strict()` recusa `companyId`, replay                                                                 |
| `test/nfse-invoices-application/invoice-creation.contract.ts`       | transação única, ordem da persistência, encargo com base e alíquota congeladas, ISS sobre o serviço, payload sem segredo, outbox com ator e correlation-id                                  |
| `test/nfse-invoices-application/invoice-idempotency.contract.ts`    | replay, chave reusada, digital independente de ordem, prévia sem transação                                                                                                                  |

Entrypoints `test/nfse-invoices-http.contract.test.ts` e
`test/nfse-invoices-application.contract.test.ts` registrados na lista literal do
`package.json` da API — teste não registrado não roda.

### Execução

```
$ bun test apps/api-transportada/test/nfse-invoices-http.contract.test.ts
 11 pass
 0 fail
 28 expect() calls

$ bun test apps/api-transportada/test/nfse-invoices-application.contract.test.ts
 22 pass
 0 fail
 59 expect() calls

$ bun test apps/api-transportada/test/nfse-schema.contract.test.ts
 33 pass
 0 fail
 308 expect() calls

$ bun run --cwd apps/api-transportada test
 2153 pass
 3 skip
 0 fail
 8998 expect() calls
Ran 2156 tests across 87 files.

$ bun run --cwd apps/api-transportada typecheck
# sem erros

$ bun run lint
# api, worker, cron, frontend — sem erros

$ bunx prettier --check apps/api-transportada
All matched files use Prettier code style!
```

Fora do escopo desta task: `apps/frontend-transportada/src/modules/nfe-workspace/styles/nfeWorkspace.module.css`
está modificado na árvore por outra task e reprova o `format:check` da raiz. Não foi tocado aqui
para não misturar mudança de outra task no diff do T014.

## T015 — `nfse-invoices/`: listagem, detalhe, cancelamento e downloads

### O que entrou

| Camada         | Arquivo                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| presentation   | `nfse-invoices.routes.ts` (+5 rotas), `nfse-invoices.schema.ts` (`parseNfseInvoiceList`, `nfseInvoiceCancellationSchema`, cursor)                                                                                 |
| application    | `nfse-invoice-cancellation.use-case.ts` (novo), `nfse-invoice-query.use-case.ts` (novo), `nfse-issuance-attempt.service.ts` (`scheduleNfseCancellation`, `createCancellationFingerprint`), `nfse-invoice.port.ts` |
| infrastructure | `nfse-invoice-query.query.ts` (novo), `nfse-fiscal-document-archive.gateway.ts` (novo), `drizzle-nfse-invoice.repository.ts`                                                                                      |
| fora do módulo | `cte-batches/infrastructure/cte-batch-selection.query.ts` — extração de `buildActiveNfseLinkFilters`                                                                                                              |

Rotas: `GET /nfse-service-invoices`, `GET /nfse-service-invoices/:id`,
`GET /nfse-service-invoices/:id/documents`, `POST /nfse-service-invoices/:id/cancel`,
`GET /nfse-service-invoices/:id/xml`, `GET /nfse-service-invoices/:id/pdf`.
Leitura sob `nfse.read`; cancelar sob `nfse.cancel` — quem emite não necessariamente derruba nota
já autorizada.

### Como a NFS-e cancelada devolve as notas

O vínculo **não é apagado**: `releaseDocumentLinks` carimba `cancelled_at` nas linhas de
`nfse_service_invoice_documents` **na mesma transação** que grava o motivo, cria a tentativa
`cancel` e empurra o outbox. Quem devolve a NF-e à elegibilidade é o índice parcial único
`nfse_service_invoice_documents_active_nfe_unique … WHERE cancelled_at is null`: com a linha
carimbada, o documento volta a caber em outra NFS-e e em lote de CT-e, e o histórico de que ele
esteve naquela nota continua legível.

A garantia só vale enquanto **todo** caminho de elegibilidade ler pelo mesmo recorte. Os quatro:

| Caminho                              | Predicado                                                             |
| ------------------------------------ | --------------------------------------------------------------------- |
| liberar no cancelamento              | `buildInvoiceLinkReleaseFilters` (`nfse-invoice-query.query.ts`)      |
| seleção de nova NFS-e                | `buildActiveInvoiceLinkFilters` (`nfse-invoice-selection.query.ts`)   |
| seleção de lote de CT-e              | `buildActiveNfseLinkFilters` (`cte-batch-selection.query.ts`)         |
| bloqueio em massa e listagem de NF-e | `buildDocumentNfseLinkFilters` (`drizzle-nfe-document.repository.ts`) |

Os quatro já carregavam `isNull(cancelledAt)`; o do lote de CT-e estava **inline** no `where` e
portanto invisível ao teste. Foi extraído para função exportada — comportamento idêntico — só para
o contrato poder compilar os quatro e falhar se algum dia um deles perder o recorte.

### Decisões que o contrato guarda

- **Cancelar responde 202, e o status continua `authorized`.** Quem cancela documento fiscal é a
  prefeitura, e ela é chamada pelo worker. O request aceita, libera os vínculos e enfileira
  `transportada.nfse.invoice.cancel.requested`; o status muda no write-back.
- **`idempotency-key` obrigatória no cancelamento.** Mesma chave + mesmo motivo devolve a tentativa
  original; mesma chave + outro motivo é 409 — o motivo entra na digital sha256.
- **XML fiscal nunca passa pelo corpo.** O download devolve `{ expiresAt, url }` assinado (300 s),
  com nome de arquivo derivado do número da prefeitura (`nfse-2026000123.xml`). Documento ainda não
  arquivado é 409 `NFSE_FISCAL_DOCUMENT_UNAVAILABLE`, não 404 — o objeto chega com a autorização.
- **Nota de outra empresa é 404, nunca 403** — 403 já entregaria que ela existe, e o número da nota
  é sequencial. Os vínculos passam pelo detalhe antes de consultar: sem isso, nota fora do recorte
  devolveria lista vazia em vez de 404.
- **Id malformado também é 404**, porque o roteador só casa segmento em UUID canônico e nem chega à
  rota. Distinguir "id errado" de "não é sua" viraria oráculo de existência.
- **Listagem não abre transação** e é paginada por cursor keyset `<iso>::<uuid>` decodificado na
  fronteira; `.strict()` e allowlist de query param recusam `companyId=` na URL.

### Contratos escritos antes da implementação

| Arquivo                                                           | O que prova                                                                                                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/nfse-schema/invoice-release-eligibility.contract.ts`        | os quatro caminhos de elegibilidade compilam o mesmo `cancelled_at is null` e todos carregam `company_id`                                                                                 |
| `test/nfse-invoices-application/invoice-cancellation.contract.ts` | liberação e outbox na mesma transação e nessa ordem, status intocado, motivo gravado, replay, chave reusada, bloqueio de transição, 404, credencial ausente antes de liberar              |
| `test/nfse-invoices-application/invoice-queries.contract.ts`      | listagem sem transação, `companyId` do contexto em toda leitura, vínculo de nota alheia é 404 e não lista vazia, download devolve URL e não conteúdo, 404 curto-circuita antes de assinar |
| `test/nfse-invoices-http/invoice-queries.contract.ts`             | cursor decodificado, filtro de status/tomador, teto de `limit`, param desconhecido 400, detalhe/vínculos/downloads                                                                        |
| `test/nfse-invoices-http/invoice-cancellation.contract.ts`        | 202 com `releasedDocumentIds`, propagação de motivo/chave/correlation-id, 403 só com leitura, 400 sem chave e sem motivo, 409 tipados                                                     |

Todas as suítes entraram sob entrypoints já registrados na lista literal do `package.json` da API
(`nfse-invoices-http`, `nfse-invoices-application`, `nfse-schema`) — nenhum arquivo novo ficou fora.

### Execução

```
$ bun test apps/api-transportada/test/nfse-invoices-http.contract.test.ts
 36 pass
 0 fail
 97 expect() calls

$ bun test apps/api-transportada/test/nfse-invoices-application.contract.test.ts
 44 pass
 0 fail
 108 expect() calls

$ bun test apps/api-transportada/test/nfse-schema.contract.test.ts
 48 pass
 0 fail
 350 expect() calls

$ bun test apps/api-transportada/test/cte-batch-application.contract.test.ts apps/api-transportada/test/nfe-http.contract.test.ts
 80 pass
 0 fail
 404 expect() calls

$ bun run --cwd apps/api-transportada test
 2215 pass
 3 skip
 0 fail
 9158 expect() calls
Ran 2218 tests across 87 files.

$ bun run --cwd apps/api-transportada typecheck
# sem erros

$ bun run lint
# api, worker, cron, frontend — sem erros

$ bunx prettier --check apps/api-transportada
All matched files use Prettier code style!
```

Segue fora do escopo, como no T014, o `nfeWorkspace.module.css` modificado por outra task, que
ainda reprova o `format:check` da raiz. A fiação em `src/main.ts` é o T016 — as rotas existem e
estão cobertas, mas ainda não estão montadas no servidor.

## T016 — fiação em `src/main.ts`

### O que entrou

Só o composition root. Nenhum arquivo de módulo foi tocado: T013–T015 já tinham entregue
use-cases, repositórios e rotas, e o que faltava era montá-los no servidor.

| Bloco de `createApplicationRoutes` | Linha nova                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| repositórios                       | `nfseProfileRepository = new DrizzleNfseProfileRepository(database)` · `nfseInvoiceRepository = new DrizzleNfseInvoiceRepository(database)` |
| use-cases                          | `nfseEmissionProfiles`, `nfseProviderCredentials`, `nfseInvoices`, `nfseInvoiceQuery`, `cancelNfseInvoice`                                  |
| rotas                              | `createNfseEmissionProfileRoutes`, `createNfseProviderCredentialRoutes`, `createNfseInvoiceRoutes`                                          |

Treze rotas passam a existir no servidor: cinco de perfil de emissão, duas de credencial e as seis
de nota (`preview`, criação, listagem, detalhe, vínculos, cancelamento, XML e PDF).

### Decisões da fiação

- **O segredo do provedor usa o mesmo cofre do certificado digital.** `createSecretEnvelopeProvider`
  passou a ser instanciado uma vez (`envelopeProvider`) e é compartilhado entre
  `createDigitalCertificateSecretService` e `createNfseCredentialSecretService`. Mesma `envelopeKeyRing`
  vinda de `config.cryptography`, mesma derivação, mesmo AAD — nenhuma chave nova foi inventada, e o
  token da Nota RP fica selado pelo mesmo mecanismo já auditado do certificado.
- **O storage é o mesmo objeto que o faturamento usa.** `createNfseFiscalDocumentArchiveGateway`
  recebe o `storageGateway` já construído para NF-e, DACTE e PDF de fatura — nenhuma segunda conexão
  com o bucket, nenhum segundo par de credenciais.
- **A digital de idempotência é o `fingerprintService` compartilhado**, com a mesma chave HMAC de
  `config.cryptography.idempotencyHmacKey` que lote de CT-e e faturamento já usam.
- **Nenhuma rota NFS-e é anônima.** `createAnonymousRoutes` não mudou: a rota pública de callback é
  o T025, e até lá o trilho inteiro exige Bearer + membership. As permissões vêm do T012:
  `settings.manage` para perfil e credencial, `nfse.read` para leitura, `nfse.issue` para emitir,
  `nfse.cancel` para cancelar.

### Execução

```
$ bun run --cwd apps/api-transportada typecheck
# sem erros

$ bun run --cwd apps/api-transportada test
 2215 pass
 3 skip
 0 fail
 9158 expect() calls
Ran 2218 tests across 87 files.

$ bun run lint
# api, worker, cron, frontend — sem erros

$ bunx prettier --check apps/api-transportada
All matched files use Prettier code style!
```

### Prova de que o servidor sobe com a fiação nova

Compilar não é subir. O composition root foi executado de verdade, contra o Postgres local, pela
mesma fixture que o teste de integração usa (`test/fixtures/signal-server.fixture.ts`, que chama
`bootstrap()`), numa porta livre para não brigar com a API de desenvolvimento:

```
$ APP_PORT=53099 bun --env-file=../../.env ./test/fixtures/signal-server.fixture.ts
[2026-08-12T14:24:50.452Z] [INFO] api_started
API_TEST_READY:53099
```

`api_started` só é impresso depois de `createApplicationRoutes` construir todos os repositórios e
use-cases e de `createRouter` aceitar o array inteiro de rotas — é a prova de que a fiação nova não
quebra o arranque.

O que essa prova **não** cobre: o roteador autentica antes de casar rota, então `curl` sem token
devolve 401 tanto para `/nfse-service-invoices` quanto para um caminho inexistente. O probe HTTP
anônimo não distingue rota registrada de rota ausente; quem prova o casamento de cada rota são os
contratos HTTP de T013–T015, que montam as mesmas funções `create*Routes` num router de teste.

## T016a — `cancellation_requested` no vocabulário de status

### Por que o estado existe

O schema já documentava por que `pending_authorization` existe: a prefeitura aceita o RPS na hora e
autoriza depois, então há um estado em que a nota tem protocolo do provedor e ainda não é documento
fiscal. O cancelamento tem exatamente a mesma assincronia — a prefeitura aceita o pedido agora e
confirma depois — e não tinha estado nenhum. Era assimetria: o T015 deixava a nota em `authorized`
até o write-back, então quem cancelava via a tela seguir dizendo "autorizada", sem sinal de que o
pedido saiu.

A cadeia passa a ser:

```
requested → issuing → pending_authorization → authorized → cancellation_requested → cancelled
```

### Decisão da migration: dobrar na existente, não empilhar

A migration `20260811194822_nfse_service_invoices` estava **não rastreada no git** (`??` em
`git status`), como toda a feature 032 — nada dela foi commitado, publicado ou aplicado fora do
Postgres local descartável. Empilhar uma segunda migration para corrigir uma primeira que nunca
existiu para ninguém deixaria no histórico um `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT` que
só faz sentido para quem leu as duas.

O diretório foi então **regerado** por `db:generate` (não editado à mão): saiu
`20260812143848_nfse_service_invoices`, com `migration.sql` e `snapshot.json` consistentes entre si.
O `rollback.sql` foi reescrito com o nome e o hash novos — o contrato estático recalcula o sha256 do
`migration.sql` e exige que o `rollback.sql` contenha exatamente aquele hash, então uma cópia
desatualizada reprovaria. O literal do diretório em `test/database-migration/static-migration.contract.ts`
acompanhou.

Se a feature já tivesse sido aplicada em qualquer ambiente real, a decisão seria a oposta: migration
aditiva separada, com rollback próprio.

### Os dois checks

| Check                                                       | Decisão                                                              | Por quê                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nfse_service_invoices_next_check_state_check`              | `status in ('pending_authorization', 'cancellation_requested')`      | A reconciliação precisa varrer quem espera confirmação de cancelamento, não só quem espera autorização. Deixar o estado novo de fora significaria `next_status_check_at` sempre nulo nele — a nota sairia da varredura e o cancelamento nunca seria confirmado.                                                                                    |
| `nfse_service_invoices_cancellation_requested_check` (novo) | exige `cancellation_reason is not null` **e** `cancelled_at is null` | O motivo já nasce com o pedido: é entrada obrigatória de quem cancela. A data não: `cancelled_at` é o instante em que o documento deixou de valer, e quem decide isso é a prefeitura — exigi-la aqui seria carimbar uma data que ainda não aconteceu. O `is null` é a outra metade: assere que a nota em voo ainda não está fiscalmente cancelada. |

O `nfse_service_invoices_cancelled_check` ficou intacto — `cancelled` continua exigindo data e
motivo, e agora só se chega nele pelo write-back.

### A liberação dos vínculos não mudou

Quem cancela espera as notas de volta na hora, não depois que a prefeitura responder. A
`releaseDocumentLinks` continua carimbando `cancelled_at` no vínculo na mesma transação do pedido, e
o índice parcial único continua sendo o mecanismo de liberação. O contrato
`test/nfse-schema/invoice-release-eligibility.contract.ts` segue verde com os mesmos cinco testes,
compilando os quatro caminhos de leitura e provando que nenhum perdeu o recorte `cancelled_at is null`
nem o `company_id`.

### A tabela de transições continua sendo a autoridade

`nfse-invoice-state.policy.ts` ganhou a ação `confirmCancellation` e uma terceira tabela,
`CONFIRM_CANCELLATION_TRANSITIONS` — o write-back da Fase E já nasce guardado: só
`cancellation_requested` vira `cancelled`, e `cancelled` chegando sobre qualquer outro estado é
resposta fora de ordem, recusada. O tipo `NfseInvoiceTransition` perdeu o `nextStatus: null`, que
existia só para representar "cancelamento não mexe no status"; agora toda transição permitida tem
destino.

O use-case não inlinou status nenhum: `loadCancellableInvoice` devolve o `nextStatus` que veio da
tabela, e ele é o que vai para `markCancellationRequested` e para a resposta.

### O typecheck achou o que o teste não achava

Com a suíte já verde, `tsc` reprovou:

```
src/nfse-invoices/domain/nfse-issuance.error.ts(8,7): error TS2741: Property
'NFSE_INVOICE_CANCELLATION_IN_FLIGHT' is missing in type '{ … }' but required in type
'Readonly<Record<NfseTransitionBlock, string>>'
```

O `Record` completo sobre a união de razões é o que transformou "esqueci a mensagem" em erro de
compilação. A mensagem entrou e um contrato HTTP novo passou a exercer o caminho: cancelar o que já
tem cancelamento em voo devolve 409 com código próprio.

### Arquivos

| Arquivo                                                                   | Mudança                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/database/nfse.schema.ts`                                             | status novo, check novo, `next_check_state_check` ampliado                |
| `src/nfse-invoices/domain/nfse-invoice-state.policy.ts`                   | ação `confirmCancellation`, razão `cancellationInFlight`, terceira tabela |
| `src/nfse-invoices/domain/nfse-issuance.error.ts`                         | mensagem da razão nova                                                    |
| `src/nfse-invoices/application/nfse-invoice.port.ts`                      | `status` em `MarkNfseInvoiceCancellationInput`                            |
| `src/nfse-invoices/application/nfse-invoice-cancellation.use-case.ts`     | carrega o `nextStatus` da tabela                                          |
| `src/nfse-invoices/infrastructure/drizzle-nfse-invoice.repository.ts`     | grava `status` no update                                                  |
| `drizzle/20260812143848_nfse_service_invoices/`                           | regerado (substitui `20260811194822_…`)                                   |
| `apps/worker-transportada/src/database/nfse-issuance-execution.schema.ts` | cópia por valor sincronizada                                              |
| `test/nfse-domain/state.contract.ts`                                      | 3 testes novos de transição                                               |
| `test/nfse-schema/nfse.contract.ts`                                       | 2 testes novos de check                                                   |
| `test/nfse-invoices-application/invoice-cancellation.contract.ts`         | status esperado                                                           |
| `test/nfse-invoices-http/invoice-cancellation.contract.ts`                | status esperado + 409 da razão nova                                       |
| `test/database-migration/static-migration.contract.ts`                    | diretório novo + asserts dos dois checks                                  |
| `test/fixtures/nfse-invoices-http.fixture.ts`                             | `CANCELLATION.status`                                                     |

O frontend não entrou: `apps/frontend-transportada` ainda não tem vocabulário de status de NFS-e
(a Fase G não começou), confirmado por varredura — só as permissões `nfse.*` do T012 aparecem lá.
`CLAUDE.md` também não: ele ainda não descreve o módulo NFS-e, e escrevê-lo é o T031.

### Execução

```
$ bun run --cwd apps/api-transportada test
 2220 pass
 3 skip
 0 fail
 9172 expect() calls
Ran 2223 tests across 87 files.

$ bun run --cwd apps/api-transportada typecheck
# sem erros

$ bun run --cwd apps/worker-transportada typecheck
# sem erros

$ bun run --cwd apps/worker-transportada test
 317 pass
 0 fail
Ran 317 tests across 46 files.

$ bun run lint
# api, worker, cron, frontend — sem erros

$ bunx prettier --check apps/api-transportada
All matched files use Prettier code style!

$ bun run --cwd apps/api-transportada db:check
Everything's fine 🐶🔥

$ make migration-test
 37 pass
 0 fail
 497 expect() calls
Ran 37 tests across 2 files.
```

O `migration-test` roda migration e rollback num Postgres descartável: é a prova de que o
`CREATE TABLE` com os checks novos aplica de verdade e de que o rollback regerado casa nome e hash.

Segue fora do escopo, como em T014–T016, o `nfeWorkspace.module.css` modificado por outra task, que
ainda reprova o `format:check` da raiz.

## T017 — contratos de topologia e de envelope do trilho `nfse-issuance.v1`

Task de **contrato antes da implementação**: só testes entraram. Os dois arquivos importam módulos
de produção que ainda não existem — quem os escreve é o T018.

### Arquivos

| Arquivo                                          | Papel                                           |
| ------------------------------------------------ | ----------------------------------------------- |
| `test/nfse-issuance-topology.contract.test.ts`   | novo — nomes de rota e isolamento entre trilhos |
| `test/nfse-processing-envelope.contract.test.ts` | novo — vocabulário e fronteira do envelope v1   |
| `package.json`                                   | as duas entradas na lista literal de testes     |

### O que o contrato de topologia prova

- `buildNfseIssuanceRabbitMqTopology({ queuePrefix })` devolve main/retry/dead com
  `routePrefix = ${queuePrefix}.nfse-issuance.v1` e o mesmo rigor do MDF-e: `delayMs: 5000` e
  `maxRetries: 3` no retry, dead-letter com exchange, fila e routing key próprios.
- **Nenhum nome escapa do prefixo versionado** — todo exchange e toda fila começam em
  `${prefix}.nfse-issuance.v1.`. É o que impede o trilho de invadir o espaço de nome de outro.
- **Interseção vazia com todos os outros trilhos.** O contrato constrói, com o _mesmo_
  `queuePrefix`, as topologias de `synthetic`, `nfe-import.v1`, `nfe-distribution.v1`,
  `cte-issuance.v1` e `mdfe-issuance.v1`, e exige que nenhum exchange e nenhuma fila apareça nos
  dois conjuntos. O assert compara os nomes compartilhados com `[]`, então a falha diz _qual_ nome
  colidiu, não só que colidiu.
- Prefixos diferentes geram trilhos disjuntos — é o que separa `local` de `staging` no mesmo broker.

### O que o contrato de envelope prova

Aceita: o envelope canônico de emissão, o de cancelamento, e o vocabulário exato de
`NFSE_PROCESSING_EVENT_TYPE` — as duas strings que a API já grava em
`nfse_issuance_outbox.event_type` (`nfse-issuance-attempt.service.ts`).

Recusa (15 casos): tipo de evento de outro trilho, tipo NFS-e fora do vocabulário, `version: 2`,
`companyId` ausente ou não-UUID, `actorId` não-UUID, `occurredAt` fora de ISO-8601,
`correlationId` em branco, campo desconhecido no envelope, `invoiceId`/`attemptId` ausentes ou
não-UUID, `attemptKind` fora de `issue`/`cancel`, `attemptFingerprint` em branco, e campo
desconhecido no payload.

### Decisão que o T018 tem de honrar: o motivo do cancelamento não viaja na fila

O `payload` do envelope carrega **só referência** — `invoiceId`, `attemptId`, `attemptKind`,
`attemptFingerprint`, `status`. Dois contratos guardam essa fronteira explicitamente: um prova que
`cancellationReason` no payload é **recusado**, outro que não há campo nenhum para credencial do
provedor.

O motivo é regra, não estilo. `security.md` §6: _"Payload de job carrega referência, não dado
pessoal"_. O motivo do cancelamento é texto livre digitado pelo operador — pode conter nome de
cliente, telefone, qualquer coisa — e o RabbitMQ não é lugar para isso. Ele já está durável em
`nfse_service_invoices.cancellation_reason`, com o check que o T016a criou garantindo que existe
sempre que o status é `cancellation_requested`. O worker lê da linha da nota na hora de transmitir.

Consequência direta para a Fase E: **o relay do T021 monta o envelope a partir das colunas tipadas
do outbox, nunca da coluna `payload` jsonb** — mesmo formato do `MdfeOutboxRelayService`. A coluna
jsonb continua existindo e continua guardando o motivo, mas como registro, não como transporte.

### Execução — vermelho pelo motivo certo

```
$ bun run --cwd apps/worker-transportada test

test/nfse-issuance-topology.contract.test.ts:
# Unhandled error between tests
error: Cannot find module '../src/messaging/nfse-rabbitmq-topology.js' from
'/…/apps/worker-transportada/test/nfse-issuance-topology.contract.test.ts'

test/nfse-processing-envelope.contract.test.ts:
# Unhandled error between tests
error: Cannot find module '../src/messaging/nfse-processing-envelope.schema.js' from
'/…/apps/worker-transportada/test/nfse-processing-envelope.contract.test.ts'

 317 pass
 2 fail
 2 errors
 726 expect() calls
Ran 319 tests across 48 files.
```

Vermelho pelo motivo certo: a falha é a ausência do módulo de produção, não um assert quebrado. Os
317 testes que já passavam continuam passando — as entradas novas no `package.json` não
desalinharam a lista literal, e os dois arquivos novos rodam (319 = 317 + 2), o que prova que
foram de fato registrados. Teste fora da lista não roda e passaria despercebido.

`bunx tsc --noEmit` também falha nos dois arquivos, pelo mesmo motivo — é o esperado enquanto o
T018 não existe, e volta ao verde com ele.

```
$ bunx prettier --check apps/worker-transportada
All matched files use Prettier code style!
```

Segue fora do escopo, como em T014–T016a, o `nfeWorkspace.module.css` modificado por outra task.

## T018 — topologia e envelope do trilho `nfse-issuance.v1`

Implementação dos dois módulos de produção que o T017 especificou. **Nenhum contrato foi tocado** —
os asserts do T017 são a especificação e passaram sem edição.

### Arquivos

| Arquivo                                            | Papel                                                       |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `src/messaging/nfse-rabbitmq-topology.ts`          | novo — `buildNfseIssuanceRabbitMqTopology({ queuePrefix })` |
| `src/messaging/nfse-processing-envelope.schema.ts` | novo — `nfseProcessingEnvelopeV1Schema` e o vocabulário     |

### O que cada módulo expõe

`buildNfseIssuanceRabbitMqTopology({ queuePrefix })` devolve uma `RabbitMqTopology` com
`routePrefix = ${queuePrefix}.nfse-issuance.v1` e os três caminhos (main, retry com `delayMs: 5_000`
e `maxRetries: 3`, dead-letter). O molde é literalmente o `buildMdfeIssuanceRabbitMqTopology` — a
única diferença é o segmento de rota, que é justamente o que garante a interseção vazia com os
outros trilhos.

`nfse-processing-envelope.schema.ts` exporta:

- `NFSE_PROCESSING_EVENT_TYPE` — `INVOICE_ISSUE_REQUESTED` e `INVOICE_CANCEL_REQUESTED`, idênticas
  às constantes que a API já grava em `nfse_issuance_outbox.event_type`
  (`NFSE_ISSUE_OUTBOX_EVENT`/`NFSE_CANCEL_OUTBOX_EVENT` em `nfse-issuance-attempt.service.ts`).
- `NFSE_PROCESSING_ATTEMPT_KIND` — `['issue', 'cancel']`, o mesmo par de `NFSE_ATTEMPT_KINDS` do
  schema do banco (`nfse.schema.ts:74`), que é o que o check de `attempt_kind` já obriga nas duas
  tabelas de tentativa. Vocabulário divergente entre banco e fila seria mensagem aceita pelo broker
  e recusada pelo `INSERT`.
- `nfseProcessingEnvelopeV1Schema` — `z.strictObject` no envelope **e** no payload, `version` como
  `z.literal(1)`, `companyId`/`actorId`/`eventId`/`invoiceId`/`attemptId` como UUID.

### A fronteira do payload, honrada

O payload tem exatamente cinco campos — `invoiceId`, `attemptId`, `attemptKind`,
`attemptFingerprint`, `status`. O `z.strictObject` é o que faz `cancellationReason` e `apiToken`
serem recusados: não há campo, e campo desconhecido derruba o parse. O comentário no arquivo
registra o porquê, para quem for acrescentar um campo depois.

### Execução — verde

```
$ bun run --cwd apps/worker-transportada test

 341 pass
 0 fail
 756 expect() calls
Ran 341 tests across 48 files.
```

341, não 319. A conta fecha e vale explicar, porque o número **subiu** numa task que não escreveu
teste nenhum: enquanto o módulo faltava, cada arquivo de contrato falhava no `import` e contava
como **um** — os casos dentro dele nunca chegavam a rodar. Com os módulos no lugar, os 24 casos
finalmente executam: 317 + 4 (topologia) + 20 (envelope: 3 `it` + 15 `it.each` + os 2 guardas de
fronteira) = 341. Nenhum contrato foi removido.

```
$ bun run --cwd apps/worker-transportada typecheck
$ bunx tsc --noEmit
```

Limpo — os dois `Cannot find module` do T017 desapareceram, que era o critério de saída.

```
$ bunx prettier --check apps/worker-transportada
All matched files use Prettier code style!

$ bun run lint
api · worker · cron · frontend — sem erro e sem warning
```

### O que a Fase E ainda tem de honrar

- **T021 (relay):** monta o envelope a partir das colunas tipadas do outbox, nunca da coluna
  `payload` jsonb — decisão do T017, mesmo formato do `MdfeOutboxRelayService`. O schema aqui é a
  guarda: um envelope montado a partir do jsonb traria campo extra e seria recusado no parse.
- **T022 (consumidor):** o `status` do payload é `z.string()`, não enum — ele é diagnóstico, uma
  fotografia do estado no instante da publicação. A decisão de transição continua sendo do
  `nfse-invoice-state.policy.ts` sobre a linha lida do banco, nunca do que veio na mensagem.
- **T022 (transmissão do cancelamento):** o motivo é lido de `nfse_service_invoices.cancellation_reason`
  no momento de transmitir. O check que o T016a criou garante que ele existe sempre que o status é
  `cancellation_requested`.

Segue fora do escopo, como em T014–T017, o `nfeWorkspace.module.css` modificado por outra task.

## T019 — contrato do cliente Nota RP v2

Contrato do cliente HTTP do provedor, escrito antes do módulo de produção (T020). São 21 testes em
seis blocos: emissão, consulta, cancelamento, download, falhas de transporte e não-vazamento do
token.

### Arquivos

| Arquivo                                   | Papel                                               |
| ----------------------------------------- | --------------------------------------------------- |
| `test/nota-rp-v2-client.contract.test.ts` | novo — os 21 asserts                                |
| `test/nota-rp-v2/fixture.ts`              | novo — shapes, corpos sintéticos e `fetch` gravador |
| `package.json`                            | entrada literal do arquivo de teste                 |

### A documentação real da v2 **não está no repositório**

Varredura com `/usr/bin/grep -rli` por "nota rp", "notarp" e "dados-cadastrais": as únicas
ocorrências são nossas — `docs/adr/0029`, `specs/032/*` e o código desta feature. Não há coleção,
OpenAPI nem exemplo de resposta do provedor em lugar nenhum.

Consequência de projeto: **o vocabulário de fio é inferido** do ADR-0029 e da spec 032, que nomeiam
`id_nota`, `success`, `Discriminacao` e `CallbackUrl` — e mais nada. Todo corpo sintético
(`situacao: 'autorizada' | 'processando' | 'rejeitada' | 'cancelada'`, `numero_nota`,
`codigo_verificacao`, `codigo_erro`, `mensagem_erro`, o envelope `{ success, data, code, message }`)
sai de fábricas isoladas em `test/nota-rp-v2/fixture.ts`, com o porquê no cabeçalho do arquivo.
Quando a T030 medir a API real com a credencial de produção, o acerto de nome de campo é **num
arquivo só** e nenhum `test(...)` muda: o que eles provam é semântica, não vocabulário.

Onde está o risco, para a T020 e a T030 saberem: nome dos campos e valores de `situacao`. O que
**não** é risco: o formato do envelope de falha (o ADR já fixa que 200 com `success:false` é falha)
e o fato de a autorização vir por consulta.

### A interface que a T020 tem de implementar

`createNotaRpV2Client({ config: { baseUrl, timeoutMilliseconds, token }, fetch })` — `fetch`
injetado por dependência, na convenção do `http-vehicle-lookup.gateway.ts`
(`(input: string, init: RequestInit) => Promise<Response>`).

| Método                                        | Chamada esperada                          | Outcome                                                                                                                      |
| --------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `issue({ rps })`                              | `POST {baseUrl}/emitir`                   | `{ status: 'accepted' \| 'rejected' \| 'error', providerDocumentId?, rejection?, cause? }`                                   |
| `fetchStatus({ providerDocumentId })`         | `GET {baseUrl}/notas/?id_nota=`           | `{ status: 'authorized' \| 'pending' \| 'rejected' \| 'cancelled' \| 'error', document?, cancelledAt?, rejection?, cause? }` |
| `cancel({ providerDocumentId, reason })`      | `POST {baseUrl}/cancelar`                 | `{ status: 'accepted' \| 'rejected' \| 'error', rejection?, cause? }`                                                        |
| `fetchDocument({ providerDocumentId, kind })` | download binário (`kind: 'xml' \| 'pdf'`) | `{ status: 'ok' \| 'rejected' \| 'error', bytes?, contentType?, rejection?, cause? }`                                        |

`document` na autorização é `{ providerDocumentId, fiscalNumber, verificationCode, authorizedAt }`;
`rejection` é `{ code, message }` — o par que a tela mostra ao operador.

**`cause` é classificação, nunca mensagem.** O conjunto é fechado: `malformed_response`, `timeout`,
`transport_failure`, `unexpected_status`. A razão é concreta — mensagem de erro de rede carrega a
requisição inteira, cabeçalho `authorization` incluído. Constranger `cause` a esse conjunto torna o
vazamento estruturalmente impossível, e o teste
`não repassa a mensagem do erro de transporte para o outcome` prova isso com um `Error` cuja
mensagem contém o token sintético.

### O que os asserts fixam, e por quê

- **RPS transmitido verbatim.** Quem traduz o payload congelado para o vocabulário da v2 é o gateway
  (T020); o cliente é transporte e leitura de resposta. Reescrever o corpo aqui abriria uma segunda
  fonte da verdade fiscal entre o que a empresa aprovou e o que a prefeitura recebe.
- **HTTP 200 com `success:false` é falha** — nas quatro operações. Na consulta o assert é mais duro:
  `outcome.status` **não pode** ser `pending`. Ler a falha como "ainda processando" deixaria a nota
  em `pending_authorization` para sempre e o operador sem a rejeição que explica o que corrigir.
- **`situacao` fora do vocabulário conhecido não vira autorização** — vira `error` com
  `cause: 'malformed_response'`. O mesmo para autorização sem `numero_nota` ou sem
  `codigo_verificacao`: sem esse par a NFS-e não é verificável no portal, e gravar o documento
  assim seria dado fiscal quebrado no banco.
- **Documento de zero byte é erro, não documento.** É o caminho que colocaria um objeto vazio no
  storage e marcaria a nota como arquivada.
- **Nenhuma operação deixa exceção escapar** — o mesmo invariante do
  `mdfe-fiscal-gateway.contract.test.ts`. Exceção escapando do cliente derruba o consumidor antes do
  `markProcessed` e a mensagem volta para a fila em loop.
- **Token só em cabeçalho `Bearer`**, nunca na URL nem no corpo, e ausente de
  `JSON.stringify(outcome)` em toda operação — inclusive quando a mensagem de rejeição do provedor
  ecoa o token de volta.

### Execução — vermelho pelo motivo certo

```
$ bun run --cwd apps/worker-transportada test
error: Cannot find module '../../src/nfse-issuance/infrastructure/nota-rp-v2.client.js'
  from '.../apps/worker-transportada/test/nota-rp-v2/fixture.ts'
(fail) Nota RP v2 client — o token não vaza > rejeição do provedor não carrega o token no outcome

 341 pass
 21 fail
 756 expect() calls
Ran 362 tests across 49 files. [636.00ms]
```

Vermelho pelo módulo de produção ausente, não por assert quebrado — o `import` dinâmico do fixture
falha em cada um dos 21 casos, o que também prova que os 21 realmente rodam. E 49 arquivos (contra
48 no T018) prova que o teste entrou na lista literal do `package.json`; sem essa linha ele não
rodaria e o verde seria mentira.

```
$ bunx prettier --check apps/worker-transportada specs/032-nota-de-servico-municipal
All matched files use Prettier code style!

$ bun run --cwd apps/worker-transportada lint
sem erro e sem warning
```

Segue fora do escopo, como em T014–T018, o `nfeWorkspace.module.css` modificado por outra task.

## T020 — cliente Nota RP v2 e gateway fiscal

Os 21 contratos da T019 passaram a verde **sem uma linha de assert alterada**. A suíte do worker
saiu de `341 pass · 48 files` (T019, com o arquivo do cliente contando como uma falha de import)
para `362 pass · 0 fail · 49 files`.

### Arquivos

| Arquivo                                                           | Papel                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/nfse-issuance/infrastructure/nota-rp-v2.client.ts`           | novo — transporte HTTP e leitura de resposta                         |
| `src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts`         | novo — a porta que o consumidor vê: segredo, tradução e blindagem    |
| `src/nfse-issuance/application/nfse-credential-secret.service.ts` | novo — cópia por valor do serviço da API, só para abrir o `apiToken` |
| `test/nota-rp-v2/fixture.ts`                                      | correção de tipagem em `binaryResponse` — nenhum assert tocado       |

O terceiro arquivo não está na linha da task, que nomeia dois. Ele existe porque o gateway precisa
abrir o envelope selado e **as apps não importam código uma da outra**: o serviço da API
(`nfse-profiles/application/nfse-credential-secret.service.ts`) não é alcançável daqui. É a mesma
cópia por valor que o CT-e já faz em `cte-issuance/application/digital-certificate-secret.service.ts`.
O AAD é idêntico ao usado ao selar — `transportada:nfse-credential:v1:${companyId}:${credentialId}` —
e divergir dele quebraria a abertura em produção sem quebrar teste nenhum.

Só o `apiToken` sai do serviço. O `callbackToken` está no mesmo envelope e é exigido pelo schema
estrito, mas quem o compara é a rota pública da API (T025); trazê-lo para o worker seria segredo
circulando sem consumidor.

### O cliente: duas invariantes

**HTTP 200 com `success:false` é falha de negócio.** A leitura é sempre do corpo, nunca do status, e
nas quatro operações. No download isso é o que impede um envelope de erro em JSON de ser arquivado
em `stored_objects` como XML fiscal: se o `content-type` da resposta tem `json`, o corpo é lido como
envelope e o resultado é `rejected` ou `error` — nunca `bytes`.

**Nenhuma exceção escapa.** Todo caminho devolve outcome tipado. `send()` é o único ponto que toca o
`fetch` e já converte a exceção em `cause`; `JSON.parse` e `arrayBuffer()` têm `catch` próprio. Uma
exceção aqui derrubaria o consumidor antes do `markProcessed` e a mensagem voltaria para a fila em
laço.

### O token não vaza, por construção

| Defesa                                                                    | Onde                                    |
| ------------------------------------------------------------------------- | --------------------------------------- |
| `authorization: Bearer …` em cabeçalho, nunca em URL ou corpo             | `buildHeaders`                          |
| `cause` é conjunto fechado de quatro valores, nunca a mensagem do erro    | `classifyTransportError`                |
| mensagem do provedor passa por redação antes de virar `rejection.message` | `redact` (`split`/`join` sobre o token) |

A terceira defesa não é teórica: o contrato
`rejeição do provedor não carrega o token no outcome` devolve `message: "token <TOKEN> invalido"` —
o provedor ecoando a credencial de volta — e exige que `JSON.stringify(outcome)` não a contenha.

### Vocabulário fechado, e onde ele muda

`situacao` é lida contra quatro valores (`autorizada`, `processando`, `rejeitada`, `cancelada`).
Qualquer outro vira `error` com `cause: 'malformed_response'` — o contrário abriria a porta para uma
situação desconhecida ser tratada como autorização. Pela mesma razão, autorização sem `numero_nota`,
sem `codigo_verificacao` ou sem `data_emissao` é malformada, e documento de zero byte não é
documento.

O vocabulário de fio continua **inferido** (T019). Ele está em dois lugares só, ambos marcados no
cabeçalho do arquivo: a constante `SITUATION` e os nomes lidos de `data` no cliente, e o `buildRps`
do gateway. A T030 mede contra a API real e corrige aí.

### O gateway

Três responsabilidades, e o `cause` alargado para caber nelas:

| Responsabilidade                                  | Falha vira                       |
| ------------------------------------------------- | -------------------------------- |
| abrir o token do envelope, uma vez por operação   | `cause: 'credential_unreadable'` |
| validar e traduzir o payload congelado para o RPS | `cause: 'invalid_payload'`       |
| blindar o cliente (defesa em profundidade)        | `cause: 'transport_failure'`     |

`NfseGatewayCause = NotaRpCause | 'credential_unreadable' | 'invalid_payload'` — os outcomes do
cliente continuam atribuíveis aos do gateway, que só alarga o `cause`.

O cliente é criado **por operação**, com o token recém-aberto: a vida do segredo em memória fica
limitada a uma chamada, e o `plaintext.fill(0)` no `finally` do serviço de segredo fecha o resto.

Na tradução, as notas de origem não vão em lista separada: elas já estão dentro da `Discriminacao`
montada pelo `nfse-description.service.ts` e aprovada na prévia. Duas fontes do mesmo fato seriam a
primeira coisa a divergir. `IssRetido` sai como `'1'`/`'2'` (convenção ABRASF, que o resto do perfil
já segue); `CodigoTributacaoMunicipio` e `CodigoNbs` são omitidos quando vazios, porque string vazia
em campo fiscal opcional costuma ser recusada.

### Correção de tipagem herdada da T019

`bunx tsc --noEmit` no worker acusava, **antes desta task**, um erro em `test/nota-rp-v2/fixture.ts`:
`new Response(input.bytes, …)` com `Uint8Array<ArrayBufferLike>` não satisfaz `BodyInit` na tipagem
atual. O arquivo é da T019 e o typecheck não estava verde ao fim dela. Corrigido com
`new Uint8Array(input.bytes)`, que produz `Uint8Array<ArrayBuffer>` — cópia dos mesmos bytes, nenhum
assert tocado.

### Verificação

```
bun test apps/worker-transportada/test/nota-rp-v2-client.contract.test.ts
  21 pass · 0 fail · 84 expect()

bun run --cwd apps/worker-transportada test
  362 pass · 0 fail · 840 expect() · 49 files

bun run --cwd apps/worker-transportada typecheck   # limpo
bun run lint                                       # exit 0 (4 apps)
bunx prettier --check apps/worker-transportada specs/032-nota-de-servico-municipal
  All matched files use Prettier code style!
```

### O que fica para a T023

Nenhuma variável `NFSE_*` existe ainda no `environment.schema.ts` do worker. O gateway já declara o
que vai precisar — `baseUrls: { homologation, production }` e `timeoutMilliseconds` — e recebe
`fetch` e `createClient` por dependência, que é como o contrato do consumidor vai substituir o
provedor sem rede.

## T021 — Outbox NFS-e: repositório, relay e publisher

### Contrato antes da implementação

`test/nfse-outbox-relay.contract.test.ts` (8 casos), registrado na lista literal do
`package.json` do worker. Vermelho pelo motivo certo — o módulo de produção não existia:

```
bun run --cwd apps/worker-transportada test
  error: Cannot find module '../src/nfse-issuance/application/nfse-outbox-relay.service.js'
  362 pass · 1 fail · 1 error · 840 expect()
  Ran 363 tests across 50 files.
```

50 arquivos contra os 49 da T020 é a prova de que a entrada nova do `package.json` pegou. O arquivo
que falha no `import` conta como **um** teste; por isso 363 e não 370.

### O jsonb da linha não é transporte

Dois casos existem só para isso. O molde de repositório devolve a entrada com a coluna `payload`
preenchida (`cancellationReason: 'cliente pediu por telefone'`, `takerLegalName`) e o contrato exige
que a mensagem publicada tenha exatamente os cinco campos de referência —
`invoiceId`, `attemptId`, `attemptKind`, `attemptFingerprint`, `status` — e que
`JSON.stringify(envelope)` não contenha `cancellationReason`. O relay monta o envelope das colunas
tipadas; a coluna `payload` sequer aparece em `NfseOutboxClaimedEntry`. O motivo do cancelamento é
texto livre do operador e continua onde já está durável, em
`nfse_service_invoices.cancellation_reason`, lido na hora de transmitir (`security.md` §6).

### Arquivos criados

- `src/nfse-issuance/infrastructure/drizzle-nfse-outbox.repository.ts` — `claimDueEntries` com
  `FOR UPDATE SKIP LOCKED`, lease pareada (`claim_owner` + `claim_expires_at`) e recusa de linha
  fora do vocabulário (`nfse_service_invoice`/`invoice`, tipo de evento, `attemptKind`,
  `eventVersion > 0`); `markPublished` casando empresa + evento + dono da claim.
- `src/nfse-issuance/application/nfse-outbox-relay.service.ts` — publica em ordem, confere o dono
  da claim antes de publicar e só marca publicado depois da entrega confirmada.
- `src/nfse-issuance/application/nfse-outbox-publisher.service.ts` — `correlationId`, `messageId` e
  `type` no cabeçalho da mensagem.

`src/outbox/application/outbox-relay-loop.service.ts` **não foi alterado** — não aparece em
`git status`. O laço é reusado como está; a T023 apenas o instancia.

### Verificação

```
bun run --cwd apps/worker-transportada test
  370 pass · 0 fail · 866 expect() · 50 files

bun run --cwd apps/worker-transportada typecheck   # limpo
bun run lint                                       # exit 0 (4 apps)
bunx prettier --check apps/worker-transportada specs/032-nota-de-servico-municipal
  All matched files use Prettier code style!
```

### O que a T022 e a T023 recebem

O trilho já entrega no broker uma mensagem que satisfaz `nfseProcessingEnvelopeV1Schema`. A T022
consome dela só referência: o `status` do payload é diagnóstico, e a decisão de transição vem de
`nfse-invoice-state.policy.ts` sobre a linha do banco, nunca da mensagem. A T023 instancia
`OutboxRelayLoop` com `claimOwner: '${queuePrefix}.nfse.relay.${randomUUID()}'`,
`intervalMs: 1_000`, `leaseMs: 30_000`, `limit: 25`, no molde da fiação de MDF-e em `src/main.ts`.
Nada foi commitado.

## T022 — consumidor de emissão: idempotência, retry próprio e write-back guardado

### Contrato antes da implementação

`test/nfse-issuance-consumer.contract.test.ts`, `test/nfse-issuance-worker.contract.test.ts` e
`test/nfse-issuance-write-back.contract.test.ts` foram escritos antes do código de produção. O caso
novo desta task — `'the dead-letter only fails an invoice still mid-flight'` — ficou vermelho pelo
motivo certo: a política não conhecia o quinto tipo de escrita.

```
bun run --cwd apps/worker-transportada test
  TypeError: undefined is not an object (evaluating 'ALLOWED_FROM[input.kind].includes')
        at resolveNfseWriteBack (src/nfse-issuance/domain/nfse-write-back.policy.ts)
```

Verde depois de `failed` entrar em `NFSE_WRITE_BACK_KIND`, `NEXT_STATUS` e `ALLOWED_FROM`:
14 pass · 44 expect() no arquivo.

### O envelope não decide nada

O `status` que chega no payload é diagnóstico — descreve o que a nota era quando a mensagem foi
gravada, e mensagem chega repetida e fora de ordem. Quem decide a transição é a linha lida do banco:
`resolveNfseWriteBack({kind, storedStatus})` é a regra pura, e o repositório projeta **o mesmo**
recorte dentro do `UPDATE` (`inArray(status, listNfseWriteBackSourceStatuses(kind))` no `where`,
`resolveNfseWriteBackTargetStatus(kind)` no `set`). Não existe janela entre ler e escrever, e a regra
tem uma fonte só — testável sem banco.

`accepted` continua no recorte de tentativa não liquidada (`NFSE_NON_SETTLED_ATTEMPT_STATUSES`)
porque na NFS-e a autorização ainda vai ser confirmada por consulta; um `accepted` não fecha a
tentativa como fecha no trilho estadual.

`failed` (dead-letter) só derruba nota em `issuing`/`requested`. Dead-letter de **cancelamento** não
mexe na nota: lá na prefeitura ela continua autorizada.

### O motivo do cancelamento não atravessa o broker

`DrizzleNfseIssuanceExecutionRepository.load()` lê `nfse_service_invoices.cancellation_reason` na
hora de transmitir, junto da credencial ativa daquele ambiente fiscal. Texto livre do operador pode
carregar nome de cliente e não vira payload de fila (`security.md` §6). `undefined` no retorno
significa "nada a transmitir" — a linha saiu do recorte entre a publicação e o consumo.

### Retry próprio, em colunas próprias

A janela da prefeitura não é a da SEFAZ: a Nota RP responde de forma assíncrona e uma
indisponibilidade municipal dura minutos. A curva começa onde a estadual já desistiu —
`[30, 120, 600, 1800]` segundos contra `[5, 30, 300]`, e 5 tentativas contra 3.

Duas colunas novas em `company_fiscal_profiles`, com os mesmos dois `check` do par de CT-e:

```
nfse_retry_max_attempts     integer   not null default 5     between 1 and 10
nfse_retry_backoff_seconds  integer[] not null default
                            '{30,120,600,1800}'              1..10 passos, todos > 0
```

Migration **regenerada**, não empilhada (precedente da T016a): a migration da feature ainda não é
rastreada e nunca rodou fora de Postgres descartável.
`drizzle/20260812154051_nfse_service_invoices/` traz `migration.sql` + `snapshot.json` do
`db:generate`; o `rollback.sql` foi reescrito à mão com o `DROP` das duas colunas e dos dois
constraints, e a linha do journal apagada por nome **e** hash
(`b01ac2cc9936006399bf28500bd9c89e16c8bd7a8759acc7ec50d8c606fcc455`). O literal do diretório em
`test/database-migration/static-migration.contract.ts` acompanhou. A cópia por valor no worker
(`src/database/nfe.schema.ts`) recebeu as duas colunas — migration só roda na API.

O `Dockerfile` da API ganhou `COPY .../src/nfse-invoices/domain` porque
`company-fiscal-profile.schema.ts` passou a importar `nfse-retry.policy.ts`, e o runner de migration
do release precisa do fechamento transitivo. Foi o contrato `pre-deploy.contract.ts` que apontou.

### Arquivos criados

- `src/nfse-issuance/domain/nfse-attempt-status.policy.ts` — o recorte de tentativa não liquidada.
- `src/nfse-issuance/infrastructure/drizzle-nfse-issuance-worker.repository.ts` — `hasProcessed`,
  `markProcessed` (`onConflictDoNothing` em `(company_id, consumer_name, event_id)`), `scheduleRetry`
  e `markDeadLettered` (que recheca `hasProcessed` antes de falhar a nota).
- `src/nfse-issuance/infrastructure/drizzle-nfse-issuance-write-back.repository.ts` — as seis
  escritas, cada uma numa transação: tentativa, evento e, quando houver, nota.
- `src/nfse-issuance/infrastructure/drizzle-nfse-retry-policy.repository.ts` — resolve a política das
  colunas da empresa.
- `src/nfse-issuance/infrastructure/drizzle-nfse-issuance-execution.repository.ts` — a leitura única
  que junta tentativa, nota, payload e credencial ativa.
- `apps/api-transportada/src/nfse-invoices/domain/nfse-retry.policy.ts` — os defaults e limites que o
  schema da API usa; a cópia do worker declara no cabeçalho que é cópia por valor.

### Verificação

```
bun run --cwd apps/worker-transportada test
  401 pass · 0 fail · 949 expect() · Ran 401 tests across 53 files
bun run --cwd apps/worker-transportada typecheck   # limpo
bun run --cwd apps/api-transportada typecheck      # limpo
bun run --cwd apps/api-transportada db:check       # Everything's fine 🐶🔥
bun run --cwd apps/api-transportada test           # 2218 pass · 2 fail (alheias, ver abaixo)
make migration-test                                # 37 pass · 0 fail
bun run lint                                       # exit 0 (4 apps)
bunx prettier --check apps/api-transportada apps/worker-transportada specs/032-...
  All matched files use Prettier code style!
```

⚠️ `bun test` cru no worker glob-a arquivos fora da lista literal do `package.json` e reporta
"401 pass, 7 errors, 60 files". O portão é `bun run test`.

As duas falhas da API são alheias a esta feature: o contrato de deploy procura as seções
`## Domínios de production` / `## Domínios de staging` em `docs/spec/railway.md`, e o `git diff` do
arquivo mostra que alguém as renomeou para `## Domínios gerados de ...` em trabalho paralelo. Nenhum
arquivo de `docs/` foi tocado aqui.

Nada foi commitado.

## T023 — fiação do trilho NFS-e no worker e endereço da Nota RP por instalação

### Onde o arquivamento de XML e PDF ficou (e por que não é aqui)

A linha da task junta duas coisas — "storage do XML e do **PDF**" e "fiação em `worker/src/main.ts`".
Só a segunda cabe no worker hoje, e a razão é o ADR-0029: **a autorização chega por consulta, não por
webhook**. O que o worker faz é pedir a emissão; `NotaRpV2Client.issue` devolve
`{ providerDocumentId, status: 'accepted' }` e mais nada. Documento só sai de `fetchStatus` /
`fetchDocument`, e quem chama isso é o job `nfse.status.pull`, que o `plan.md` coloca no **cron**.

Confirmação, e não suposição:

- o efeito do T022 (`nfse-issuance-consumer.effect.ts`) não tem passo de arquivamento nem
  `recordAuthorized` — ele registra `in_flight`, `accepted`, rejeição ou retry;
- `nfseFiscalDocuments` (copiada no T007) não é referenciada por nenhum arquivo do worker;
- a seção **Worker** do `plan.md` lista `storage/infrastructure/nfe-storage-gateway.ts` como
  "reuso **sem alteração**" e não declara nenhum gateway de storage NFS-e; a seção **Cron** é que
  ganha `nfse-status-pull/`.

Escrever `nfse-fiscal-document-storage.gateway.ts` no worker agora seria código sem consumidor — e
consumidor nenhum apareceria, porque o worker nunca vê o XML. O gateway sobe no **T024**, junto com o
único chamador dele. Isso custa uma dependência nova ao cron: `apps/cron-transportada/package.json`
não tem `@adatechnology/object-storage-provider` hoje. A linha do T024 no `tasks.md` foi emendada
para dizer isso, para o escopo não se perder no caminho.

### O endereço da Nota RP não existe em lugar nenhum ainda

Nenhum ADR, spec, plan, evidência ou fixture desta feature traz uma base URL da Nota RP — ela é
medida contra a API real no **T030**. Inventar host foi descartado, e exigir a variável quebraria
todo ambiente existente (inclusive o `ENVIRONMENT` do contrato de runtime, que só declara oito
chaves). O desenho escolhido:

- `NFSE_PROVIDER_BASE_URL_HOMOLOGATION` e `NFSE_PROVIDER_BASE_URL_PRODUCTION` opcionais, validadas
  **as duas juntas ou nenhuma** — com uma só, a nota sairia no ambiente fiscal errado;
- `NFSE_PROVIDER_TIMEOUT_MS`, inteiro entre 1 s e 120 s, padrão 15 s;
- causa própria `provider_not_configured` no gateway, decidida **antes** de abrir o envelope: sem
  endereço não há a quem pedir, e o segredo continua selado. `transport_failure` mandaria o trilho
  tentar de novo para sempre contra uma URL vazia, e `credential_unreadable` acusaria o segredo de um
  defeito que é de configuração.

O trilho sobe e drena mesmo sem provedor contratado — a instalação que ainda não assinou a Nota RP
não perde o worker por causa disso.

### Vermelho

```
bun run --cwd apps/worker-transportada test
(fail) worker environment contract > parses the autonomous Bun worker configuration
(fail) worker environment contract > reads the Nota RP base URLs of both fiscal environments from the installation
(fail) worker environment contract > rejects a partially declared Nota RP base URL pair
(fail) worker environment contract > rejects a Nota RP base URL that is not a URL instead of emitting to nowhere
(fail) NF-e worker runtime contract > starts relay plus synthetic/import/distribution consumers independently and drains them before infrastructure shutdown
(fail) NFS-e fiscal gateway configuration contract > reports an unconfigured provider without opening the sealed token
 400 pass · 6 fail · Ran 406 tests across 54 files
```

Os diffs apontaram exatamente o que faltava: `'nfseIssuance.cancel'` e
`provider.close:…nfse-issuance.v1.main.queue` ausentes da ordem de desligamento, e
`cause: 'credential_unreadable'` onde o contrato espera `'provider_not_configured'`. A contagem
53 → 54 arquivos é o que prova que o teste novo entrou na lista literal do `package.json`.

### Arquivos criados

- `test/nfse-fiscal-gateway.contract.test.ts` — o NFS-e era o único trilho fiscal sem contrato de
  gateway (CT-e e MDF-e já tinham o seu). Dois casos: a base URL escolhida é a do ambiente fiscal
  declarado na credencial, e o provedor não configurado responde sem abrir o segredo (`decryptCalls`
  vazio nas quatro operações da porta).

### Arquivos alterados

- `src/shared/worker.types.ts` — `NfseProviderEnvironment` e o campo `nfseProvider`.
- `src/config/environment.schema.ts` — as três variáveis, o `superRefine` do par de URLs e o
  mapeamento em `parseWorkerEnvironment`.
- `src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts` — `provider_not_configured`, `baseUrls`
  por ambiente e a guarda antes de abrir o envelope. `invalid_payload` continua ganhando de
  `provider_not_configured` em `issue`: payload torto é erro de quem chamou, não da instalação.
- `src/main.ts` — topologia, publisher, starter injetável (`startNfseIssuanceConsumer` em
  `WorkerRuntimeDependencies`), consumidor, `OutboxRelayLoop` com `claimOwner`
  `${queuePrefix}.nfse.relay.<uuid>` e `failureMessage: 'nfse_outbox_relay_failed'`, e as entradas em
  `closeables`, `consumers`, no grupo de publishers e nas três linhas do `catch` de boot.
- `test/environment.contract.test.ts`, `test/nfe-runtime.contract.test.ts`,
  `test/shutdown-signals.contract.test.ts` (este último injeta os consumidores direto e falhava no
  `consume` real assim que o trilho novo passou a subir), `package.json`, `.env.example`.

### Verde

```
bun run --cwd apps/worker-transportada test
  406 pass · 0 fail · 958 expect() · Ran 406 tests across 54 files
bun run --cwd apps/worker-transportada typecheck   # limpo
make worker-integration                            # 37 pass · 0 fail · Ran 37 tests across 9 files
make config                                        # exit 0
bun run lint                                       # exit 0 (4 apps)
bunx prettier --check <arquivos tocados>           # All matched files use Prettier code style!
```

O `.env` local não declara nenhuma `NFSE_*` e o `make config` passa — que é o ponto: a ausência é o
padrão válido.

Nada foi commitado.

## T024 — job `nfse.status.pull` no cron

A prefeitura não avisa: ela responde quando perguntam. O trilho de emissão deixa a nota em
`pending_authorization` com um `provider_document_id` e vai embora; quem fecha o ciclo é este job,
que pergunta a situação, arquiva o documento fiscal quando ela autoriza, grava a recusa com código e
mensagem quando ela rejeita, e devolve a nota para a fila quando ainda não há resposta.

Duas invariantes seguram a idempotência, e nenhuma delas depende de o job rodar uma vez só:

- **Quem decide a transição é o banco.** Todo `UPDATE` de liquidação projeta o status de origem
  permitido no próprio `WHERE` e devolve `RETURNING` — não devolveu linha, a escrita inteira é
  abandonada sem efeito. Não existe janela entre ler e escrever.
- **A chave do objeto é determinística** (`tenants/<companyId>/nfse-documents/<providerDocumentId>/…`)
  e a escrita no bucket é `create-only`; a linha de `stored_objects` fecha em
  `(companyId, provider, bucket, objectKey)` com `onConflictDoNothing`. Reprocessar a mesma nota
  regrava o mesmo byte no mesmo lugar, ou não regrava nada.

O XML é o documento fiscal: sem ele a nota **não liquida** — falta de bytes vira adiamento, não
autorização sem arquivo. O PDF é conveniência: a falta dele é registrada e a autorização segue.
Por isso `pdf_object_id`/`pdf_sha256` são anuláveis **em par**, e o CHECK do banco cobra os dois
juntos.

O ciclo isola falha por nota: uma prefeitura fora do ar conta `failedCount` naquela nota e o ciclo
continua. O `main.ts` já sai com código 1 só quando alguma falhou.

### Higiene de log

Nenhuma linha carrega dado do tomador nem a mensagem da prefeitura. O use case emite tudo por um
único helper `log()`, que só sabe passar `{companyId, errorCode, invoiceId}` — não há call site capaz
de vazar. A mensagem da prefeitura **é persistida** (`rejection_message` e o payload do evento),
porque o operador precisa lê-la: isso é armazenamento, não log.

### Vermelho

```
bun run --cwd apps/cron-transportada test
error: Cannot find module '../../src/nfse-status-pull/infrastructure/nfse-fiscal-document-storage.gateway.js'
 62 pass  1 fail  1 error   Ran 63 tests across 5 files.
```

O contrato entrou primeiro e falhou pelo motivo certo: o módulo de produção não existia. A contagem
4 → 5 arquivos é o que prova que `./test/nfse-status-pull.contract.test.ts` entrou na lista literal
do `package.json` — teste fora dela não roda.

### Arquivos criados

- `src/nfse-status-pull/` — as quatro camadas: `domain/` (política de elegibilidade com vocabulário
  de razões, política de desfecho que traduz a resposta da prefeitura em decisão),
  `application/` (`select-due-invoices`, `reconcile-invoice`, `run-cycle`, portas e o serviço de
  abertura do envelope), `infrastructure/` (cliente Nota RP v2, gateway fiscal, gateway de storage do
  documento e o repositório Drizzle).
- `src/database/nfse-reconciliation.schema.ts` — cópia por valor das tabelas que a reconciliação lê e
  escreve; só as colunas usadas. As migrations continuam rodando só na API.
- `src/config/cryptographic-configuration.schema.ts` — cópia por valor do parser de chaveiro do
  worker, lançando `CronConfigurationError`. O erro não carrega nome nem valor de variável.
- `src/job-registry.ts` — o registro saiu de dentro de `nfe-distribution-pull/`: já não pertence a um
  trilho só. `CronJobRunner` passou a devolver o `CronCycleResult` compartilhado.
- `test/nfse-status-pull.contract.test.ts` + `test/nfse-status-pull/{fixture,eligibility,outcome,
reconciliation,idempotency,nota-rp-parity}.contract.ts`.

### Arquivos alterados

- `src/config/cron.constant.ts` — `CRON_JOBS` ganhou o job novo **importando** `NFSE_STATUS_PULL_JOB`
  do domínio em vez de repetir a string; teto de timeout e teto de tamanho do documento.
- `src/config/cron.types.ts` — `CronNfseStatusPullEnvironment`, `CronStorageEnvironment`,
  `CronJobDependencies` e o `CronCycleResult` compartilhado.
- `src/config/environment.schema.ts` — o bloco de NFS-e só é resolvido quando
  `CRON_JOB === 'nfse.status.pull'`: o deploy da busca de notas continua subindo sem chaveiro, sem
  bucket e sem prefeitura, e o de NFS-e **falha no boot** se faltar qualquer um deles. Meio ciclo
  autorizaria nota sem XML guardado.
- `src/nfe-distribution-pull/nfe-distribution-pull.job.ts`, `src/main.ts` — tipo e caminho do registro.
- `apps/cron-transportada/package.json` — `@adatechnology/object-storage-provider` e
  `@adatechnology/secret-envelope`.
- `test/environment.contract.test.ts` — passa a afirmar `nfseStatusPull: undefined` para o job de
  NF-e. A ausência é o padrão válido, e agora está escrito.

Nenhuma chave nova no `.env.example`: `ENCRYPTION_*`, `STORAGE_*` e `NFSE_PROVIDER_*` já estavam lá.

### Verde

```
bun run --cwd apps/cron-transportada test
  123 pass  0 fail  221 expect() calls  Ran 123 tests across 5 files.
bun run --cwd apps/cron-transportada lint        # exit 0
bun run --cwd apps/cron-transportada typecheck   # exit 0
bun run --cwd apps/cron-transportada build       # Bundled 39 modules
bunx prettier --check "apps/cron-transportada/**/*.{ts,json}"
  All matched files use Prettier code style!
```

Nada foi commitado.

## T025 — rota anônima de callback da prefeitura

`CallbackUrl` é campo obrigatório do payload v2, então a Nota RP vai chamar de volta. A rota que
atende essa chamada é **gatilho, não fonte de verdade**: o corpo do postback nunca é lido, nenhuma
situação fiscal muda por causa dele. O único efeito é adiantar `next_status_check_at` das notas
daquela empresa que ainda esperam resposta — quem lê a situação de verdade continua sendo o job
`nfse.status.pull` da T024, por consulta autenticada. Confirmar autorização pelo que um anônimo
escreveu no corpo seria deixar o desfecho fiscal na mão de quem descobrir a URL.

### Como o `timingSafeEqual` é aplicado, e sobre o quê

`WHERE callback_token_sha256 = $1` entregaria a comparação do segredo ao Postgres, que compara em
tempo variável e ainda deixa o rastro na query. Em vez disso o repositório devolve **todas** as
credenciais ativas — instalação dedicada (ADR-0021), são poucas linhas — e quem compara é
`matchCallbackCredential`, em `domain/nfse-callback-token.policy.ts`:

- o token recebido vira `sha256` hex, e cada digest (recebido e guardado) só passa se casar
  `/^[0-9a-f]{64}$/`; daí vira `Buffer` de **32 bytes fixos**, que é o que `timingSafeEqual` exige;
- o laço percorre **todas** as credenciais sempre, sem `return`/`break` no meio, acumulando o
  resultado em `matched` — sair no primeiro acerto contaria a posição da empresa na lista pelo tempo;
- nunca há comparação de string: nem `===`, nem `includes`, nem `find`. O contrato
  `token-match.contract.ts` lê o fonte e falha se qualquer uma dessas formas reaparecer.

### Como o 204 invariável é provado

`public-route.contract.ts` roda a rota pelo handler HTTP real (`createRequestHandler` +
`createRouter`) e cobre, cada um exigindo `204`, corpo vazio e `anticipateCalls === []`:

- token desconhecido, token que parece hash (64 `a`), token vazio (`%20`), barra codificada (`%2F`),
  percent-escape inválido (`%E0%A4%A`), token de 2 000 caracteres;
- corpo vazio, corpo malformado, corpo pedindo `situacao: AUTORIZADA`, corpo de 200 mil caracteres —
  e em todos `request.bodyUsed === false`, isto é, o corpo não foi sequer lido;
- repositório estourando na listagem e estourando na antecipação: 204 mesmo assim, com o erro só no
  log da instalação;
- lista de credenciais vazia: 204 e nenhum efeito.

Duas ressalvas honestas, e nenhuma das duas revela existência de empresa ou de token:

- **Caminho acima de 2 KiB devolve 400**, não 204. É a fronteira de transporte
  (`parseRequestMetadata`, `pathname.max(2_048)`), que roda antes de existir rota e recusa igual para
  qualquer caminho da API. Está escrito como teste próprio, não escondido.
- **204 invariável não é tempo uniforme.** O tempo constante está onde o ataque mora — a comparação
  do segredo. Um acerto ainda faz um `UPDATE` que o erro não faz. Igualar isso exigiria escrever
  sempre, e transformar rota pública sem limite de taxa em amplificador de escrita seria pior do que
  o resíduo que fecha.

### Como a rota descobre a empresa sem contexto autenticado, e o que a segura

Não há Bearer, não há `tenantContext`: **quem diz a empresa é o token**, e só o token. O `companyId`
sai de `matchCallbackCredential`, isto é, de uma linha de `nfse_provider_credentials` que já estava
no banco. O contrato prova que a rota nunca chega perto do caminho autenticado — o `tenantContext` da
fixture **lança** se for chamado, e os testes afirmam que `events` não contém `tenant`,
`authenticate` nem `authorize`.

Do lado da query, `query-tenant-safety.contract.ts` renderiza os filtros pelo `PgDialect` e afirma
que a antecipação carrega `"nfse_service_invoices"."company_id" = $n` com o `companyId` casado, só
os dois status assíncronos (`pending_authorization`, `cancellation_requested`), e só linhas com
`next_status_check_at` no futuro. Um token da empresa A não alcança nota da empresa B porque o
`companyId` do `WHERE` é o da linha que casou, não um valor vindo da requisição. O contrato também
afirma que nem a query nem o repositório delegam a comparação do digest ao SQL.

### Higiene de log

O token está no **caminho**, e é por isso que `API_PUBLIC_NFSE_CALLBACKS_PATH` fica **fora** da
allowlist de `resolveLogPathname`: qualquer requisição desta rota entra no log como `<unmatched>`.
O contrato fixa isso para o caminho concreto e para o template. O único log da rota é um `warn` com
`{correlationId, reason}` — `reason` é o _nome_ da classe do erro, nunca a mensagem. Corpo não é
lido, então não há como vazar. Os testes varrem todas as linhas de log atrás dos tokens sintéticos e
do conteúdo do corpo.

### Rate limit — relatado, não improvisado

O repositório **não tem** limitador de taxa de entrada, em nenhuma rota (o ADR-0029 já registra
isso; `consecutiveRateLimits` no banco é contador do lado da SEFAZ, outra coisa). A instrução era
seguir o mecanismo existente ou relatar a ausência: está relatada. O que existe hoje e limita o
estrago: o teto de 2 KiB no caminho, o teto de 1 MiB no corpo (`assertRequestSize`, antes do
roteador), o corpo nunca lido, e a rota nem registrada quando `NFSE_CALLBACK_BASE_URL` está vazia.
Um limitador por IP nesta rota é item de Fase G.

### Vermelho

```
bun run --cwd apps/api-transportada test
error: Cannot find module '../../src/nfse-callbacks/infrastructure/nfse-callback.query'
  from '.../test/nfse-callbacks/query-tenant-safety.contract.ts'
 2221 pass  3 skip  7 fail  1 error   Ran 2231 tests across 89 files.
```

O contrato entrou primeiro e falhou pelo motivo certo: o módulo de produção não existia. A contagem
88 → 89 arquivos prova que `./test/nfse-callbacks.contract.test.ts` entrou na lista literal do
`package.json` — teste fora dela não roda.

### Arquivos criados

- `src/nfse-callbacks/domain/nfse-callback-token.policy.ts` — `hashCallbackToken` e
  `matchCallbackCredential`, o laço de tempo constante descrito acima. Sem I/O.
- `src/nfse-callbacks/application/nfse-callback.port.ts`,
  `src/nfse-callbacks/application/notify-nfse-callback.use-case.ts` — lista credenciais ativas,
  casa o digest, e só então antecipa. Sem casamento, sai sem efeito e sem erro.
- `src/nfse-callbacks/infrastructure/nfse-callback.query.ts` — o seam dos filtros
  (`buildCallbackAnticipationFilters`, `buildActiveCallbackCredentialFilters`), que é o que o
  contrato de isolamento renderiza. `NFSE_ACTIVE_STATUS` é **importado** do módulo de emissão.
- `src/nfse-callbacks/infrastructure/drizzle-nfse-callback.repository.ts` — só duas operações:
  listar `(callbackTokenSha256, companyId)` das credenciais ativas e `set nextStatusCheckAt = now()`.
  Nenhuma transição de status, nenhum `updated_at`, nenhuma escrita fiscal.
- `src/nfse-callbacks/presentation/nfse-callbacks.routes.ts` — `defineAnonymousRoute`, 204 sempre,
  `try/catch` só para não deixar erro de infraestrutura virar 500 (é o caso de "fallback gracioso"
  do §7, e o erro é logado uma vez pelo `logger` da rota).
- `test/nfse-callbacks.contract.test.ts` + `test/nfse-callbacks/{public-route,token-match,
query-tenant-safety,environment}.contract.ts` + `test/fixtures/nfse-callbacks-http.fixture.ts`.

### Arquivos alterados

- `src/http/router.service.ts` — rota anônima passou a aceitar **parâmetro de caminho**, reusando o
  casamento dinâmico que já existia (agora genérico) em vez de duplicá-lo. `pathParameterFormat`
  ganhou um terceiro valor, `'opaque'`: o segmento **não é decodificado**. Decodificar um segredo
  criaria dois caminhos para o mesmo token e, pior, um 404 observável quando o percent-escape fosse
  inválido — que é exatamente a informação que o 204 invariável esconde. `'canonicalUuid'` e `'raw'`
  seguem intactos.
- `src/shared/api.constant.ts` — `API_PUBLIC_NFSE_CALLBACKS_PATH`, com o comentário dizendo por que
  ele fica fora da allowlist de log.
- `src/config/environment.schema.ts`, `src/shared/api.types.ts`, `.env.example` —
  `NFSE_CALLBACK_BASE_URL` opcional, `trim`, vazio vira ausência, e preenchido tem de passar por
  `isTrustedLookupUrl` (HTTPS, ou HTTP só em localhost). Não é segredo e não tem prefixo público: o
  segredo é o token opaco por empresa, que vive no banco. `environment.contract.ts` afirma também que
  o `.env.example` não ganhou `VITE_NFSE_CALLBACK` nem `NFSE_CALLBACK_TOKEN`.
- `src/main.ts` — as rotas de callback são montadas **antes** da guarda de `companyId` do ADR-0022:
  o callback não depende da empresa de ambiente, quem diz a empresa é o token. Sem
  `NFSE_CALLBACK_BASE_URL` a função devolve lista vazia — rota morta, nunca rota aberta, o mesmo
  padrão do arranque.
- `apps/api-transportada/package.json` — o teste novo na lista literal.
- `test/integration/{server,auth-me}.integration.ts` — `nfseCallbackBaseUrl: undefined` nos literais
  de `ApiEnvironment`. A ausência é o padrão válido, e agora está escrito.

### Verde

```
bun run --cwd apps/api-transportada test
 2264 pass  3 skip  4 fail   Ran 2271 tests across 89 files.
bun run --cwd apps/api-transportada typecheck   # exit 0
bun run lint                                    # exit 0 (api, worker, cron, frontend)
make config                                     # 10 pass  0 fail
bunx prettier --check <arquivos tocados> specs/032-nota-de-servico-municipal
  All matched files use Prettier code style!
```

As 4 falhas são **alheias a esta feature** e vêm de trabalho paralelo na mesma árvore:

- `contrato de nome de serviço e de domínio` (2) — `docs/spec/railway.md` teve seções renomeadas por
  um esforço de DNS; o contrato procura `## Domínios de production`.
- `user invitation schema` (2) — o esforço de convite de usuário mexeu em
  `src/database/user-invitation.schema.ts`.

Nenhum arquivo de 032 aparece nelas, e nenhuma delas foi tocada aqui.

### Fica aberto para a Fase G

- **Como o `CallbackUrl` chega ao provedor na emissão.** A rota existe e a base está configurável,
  mas o worker deliberadamente não abre o envelope selado do `callbackToken`; montar
  `${NFSE_CALLBACK_BASE_URL}/public/nfse-callbacks/<token>` no momento do envio ainda não tem dono.
- **Limitador de taxa por IP** na rota pública (ver acima).
- **Rotação do token de callback** — hoje há uma coluna de digest e nenhum caminho de troca.

Nada foi commitado.

## T010a — `{{periodo}}` e `{{municipio}}` na descrição

### Por que a task existe

A última NFS-e real emitida pela transportadora descreve o serviço assim:

> Entregas na cidade de Ribeirão Preto 27-07 a 31-07-2026.

Não é uma lista de notas fiscais — é **uma janela de datas e uma cidade**. O motor da descrição
entregue no T010 resolvia só `{{notas}}`, `{{quantidadeNotas}}` e `{{observacoes}}`: não havia como
escrever o texto que a empresa usa hoje. Duas consequências:

- O risco nº 1 do plano (estourar o teto da `Discriminacao` com uma lista longa) encolhe muito: o
  texto real não cresce com a seleção.
- A truncagem por busca binária continua valendo — o modelo de lista segue disponível para quem
  quiser enumerar —, mas deixa de ser o caminho principal.

### De qual data sai o período — e o que isso custa

`nfe_documents.issued_at` é a **única data de negócio** que a nota carrega no banco. Não existe data
de entrega nem data de saída (`dhSaiEnt` não é persistida). Então `{{periodo}}` é a janela de
**emissão das NF-e**, enquanto o texto que a empresa escreve à mão diz "Entregas".

Na prática as duas costumam coincidir dentro da mesma semana, e o campo é livre — quem edita a
descrição na hora da emissão pode corrigir. Mas **é uma diferença semântica real e ela fica
registrada aqui**: para o período casar com a entrega de fato seria preciso uma data de entrega, que
hoje não existe em lugar nenhum do domínio.

**Decisão do usuário (12/08/2026): fica a data de emissão.** As duas janelas caem na mesma semana no
uso real e a descrição é editável antes de emitir, então capturar data de entrega — coluna nova, tela
de preenchimento, regra para nota sem data — não se paga dentro da 032. Limitação conhecida e aceita;
nenhuma task nova. Se um dia a data de entrega existir por outro motivo, `{{periodo}}` passa a lê-la
sem mudar o template.

### Fuso

`issued_at` é `timestamptz`: o dia depende da zona em que se lê. A NFS-e é municipal e o dia que a
prefeitura enxerga é o dia local, então o serviço fixa `America/Sao_Paulo`. Uma nota emitida às 22h
em São Paulo já é o dia seguinte em UTC, e o período sairia cobrindo um dia que o serviço não cobre.

```
Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ... })
  .format(new Date('2026-08-01T01:00:00.000Z'))  →  '2026-07-31'
```

`en-CA` devolve `YYYY-MM-DD`: largura fixa, e ordena por comparação de texto — os extremos do
período saem de um `reduce` sobre strings, sem aritmética de data.

⚠️ **Transportadora fora de UTC-3 precisará parametrizar isso.** A constante está isolada em
`nfse-period.service.ts` justamente para a troca ser de um lugar só.

### Como `{{municipio}}` foi resolvido

O perfil já guardava `municipality_ibge_code` (`3543402`), que é código, não nome. Traduzir código
para nome exigiria uma tabela do IBGE que o produto não tem. O nome virou **dado do perfil**, no
mesmo molde que o MDF-e já usa para cidade (`mdfe.schema.ts`, `CITY_NAME_MAX_LENGTH = 60`):

- coluna `municipality_name text not null`, com check `length > 0 and length <= 60` — nome em branco
  não descreve município nenhum;
- `municipalityName` em `NfseEmissionProfileSettings`, `NfseInvoiceProfile`, no schema Zod da rota,
  no mapper, nas duas consultas e nas fixtures.

### Migration empilhada, não regerada

O precedente do T006/T016a era **regerar** a migration da feature, porque ela é a ponta da fila e
nunca saiu de um Postgres descartável. Isso deixou de valer: `20260812154051_nfse_service_invoices`
já não é a última — dois esforços paralelos na mesma árvore (`20260812172200_invitation_delivery` e
`20260812180149_company_activation_channel`) empilharam depois dela, e **os snapshots deles já
contêm as tabelas de NFS-e**. Apagar a migration da feature para regerá-la faria o `db:generate`
diferenciar contra o snapshot mais novo, achar zero diferença e **as tabelas de NFS-e sumiriam da
cadeia inteira**.

Então a coluna entrou como migration própria, aditiva, na ponta:
`20260812180517_nfse_profile_municipality_name`, com `rollback.sql` guardado por nome e hash no
molde das demais, e bloco novo em `test/database-migration/static-migration.contract.ts`.

`ADD COLUMN ... NOT NULL` sem default só é seguro porque a tabela é da própria leva não rastreada e
não tem linha em ambiente nenhum.

### Vermelho antes da implementação

```
bun test ./test/nfse-domain.contract.test.ts
  ApiError: The description template uses an unknown variable: periodo.
  27 pass  9 fail   Ran 36 tests across 1 file.

bun test ./test/nfse-schema.contract.test.ts ./test/nfse-invoices-application.contract.test.ts
  RangeError: date value is not finite in DateTimeFormat format()   (issuedAt ausente na projeção)
  77 pass  18 fail   Ran 95 tests across 2 files.
```

O contrato da descrição ganhou 9 testes de período, entre eles: reproduzir o texto da nota real,
omitir o ano do dia inicial dentro do mesmo ano (`27-06 a 31-07-2026`), soletrar os dois anos na
virada (`27-12-2025 a 05-01-2026`), dia único dito uma vez só, leitura em São Paulo e não em UTC, e
**o período cobre a seleção inteira mesmo quando a lista de notas é truncada** — a janela é a do
serviço prestado, não a das notas que couberam no texto.

### Verde

```
bun run --cwd apps/api-transportada test
 2280 pass  3 skip  5 fail   Ran 2288 tests across 90 files.
bun run --cwd apps/api-transportada typecheck   # exit 0
bun run lint                                    # exit 0 (api, worker, cron, frontend)
bun run --cwd apps/api-transportada db:check    # Everything's fine
make migration-test                             # 38 pass  0 fail
bunx prettier --check <arquivos tocados> specs/032-nota-de-servico-municipal
  All matched files use Prettier code style!
```

As 5 falhas são **alheias a esta feature**, do mesmo trabalho paralelo já registrado no T025:

- `contrato de nome de serviço e de domínio` (2) — seções renomeadas em `docs/spec/railway.md`.
- `user invitation schema` (2) — `src/database/user-invitation.schema.ts`.
- `GET /company-settings HTTP contract` (1) — `activation_channel` em `company_fiscal_profiles`.

Nenhum arquivo de 032 aparece nelas. Worker e cron não têm cópia de `nfse_emission_profiles`, então
nada mudou do lado deles.

Nada foi commitado.

## T026 — fundação do módulo `nfse-invoice` no frontend

### O que entrou

`apps/frontend-transportada/src/modules/nfse-invoice/`, dez arquivos:

| Arquivo                                    | Papel                                                                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/nfseInvoice.constant.ts`           | rota da API e da tela, as quatro permissões, limites (página 25, seleção 500, motivo 5..255), chaves de query, listas de campos por DTO e o mapa código de erro → chave de feedback |
| `shared/nfseInvoice.types.ts`              | status, tipos de cálculo e de ajuste, e os DTOs de lista, detalhe, prévia, aceite e download                                                                                        |
| `shared/nfseInvoiceGuards.validation.ts`   | type guards primitivos, entre eles `isDecimalString` e `hasExactKeys`                                                                                                               |
| `shared/nfseInvoiceResponse.validation.ts` | os oito adaptadores de resposta                                                                                                                                                     |
| `shared/nfseInvoiceClient.service.ts`      | client HTTP do módulo, com `fetch` injetado                                                                                                                                         |
| `hooks/useNfseInvoices.hook.ts`            | controlador por permissão, query e mutations                                                                                                                                        |
| `pages/NfseInvoiceWorkspace.page.tsx`      | casca da tela — a listagem de verdade é a T028                                                                                                                                      |
| `styles/nfseInvoice.module.css`            | `.nfseInvoiceShell` com `width: var(--layout-width)`                                                                                                                                |
| `locales/nfseInvoice.locale.json` + `.en.` | 25 frases de feedback, os 8 status e o texto da casca                                                                                                                               |

Fiação: `i18n.service.ts` (namespace `nfseInvoice` nos dois idiomas), `icon.tsx`
(`workspace-nfse-invoice`, que a barra lateral monta como `workspace-${key}`) e `main.tsx`
(import, chave do workspace, item `{ href: '/nfse-invoices', … }`, as **duas** listas do grupo
fiscal, o `pathname` e o `storedWorkspace` em `resolveCurrentWorkspace`, e o `case` em `resolvePage`).

A T027 (ação em massa na tela Notas) e a T028 (listagem completa) **não** entraram — esta task é a
fundação que as duas vão consumir.

### Decisões que o contrato guarda

- **A chave de idempotência é cabeçalho, nunca corpo.** O schema da API é `.strict()`: um campo a
  mais no JSON derruba a requisição inteira. O contrato afirma o cabeçalho e afirma que a chave não
  aparece no corpo serializado.
- **`companyId` não viaja.** O teste manda `companyId: 'forbidden-company'` nas três rotas de
  escrita e exige que ele não apareça nem na URL nem no corpo — quem diz a empresa é o token.
- **Dinheiro e alíquota são string decimal.** `isDecimalString` recusa número: um `672.22` binário
  perde centavo antes de chegar na tela. O contrato manda `serviceAmount` numérico e espera
  `NFSE_INVOICE_RESPONSE_INVALID`.
- **O documento fiscal sai por link assinado.** `getInvoiceDocumentUrl` devolve `{ url, expiresAt }`,
  e o adaptador recusa uma resposta que traga `content` ou `xml` — bytes de XML não passam pelo
  navegador nem pelo cache do client.
- **`reason` de bloqueio da prévia é string aberta.** A elegibilidade do CT-e entra ali com o
  vocabulário dela; validar contra lista fechada recusaria resposta legítima da API.
- **Emitir e cancelar são permissões distintas.** O controlador rejeita com `NFSE_INVOICE_FORBIDDEN`
  antes de tocar no client, e o contrato exercita as três faixas: cada ação com só a sua permissão,
  o operador completo passando pelas sete rotas na ordem, e o operador sem nada sendo recusado em
  todas.
- **A espera é esqueleto.** O contrato lê o arquivo da página e falha se achar `Carregando`, `<svg`
  cru, `<select` ou `type="checkbox"` — as regras do design system valem desde a casca.

### Contratos escritos antes da implementação

`test/nfse-invoice/client-and-controller.contract.ts` e
`test/nfse-invoice/navigation-and-locales.contract.ts`, sobre a fixture sintética
`test/nfse-invoice/nfse-invoice.fixture.ts`, ligados pelo entrypoint
`test/nfse-invoice.contract.test.ts` e registrados no `package.json` da app.

```
bun test test/nfse-invoice.contract.test.ts
  Cannot find module '../../src/modules/nfse-invoice/shared/nfseInvoice.constant'
  ENOENT: nfseInvoice.locale.json
  0 pass  22 fail   Ran 22 tests across 1 file.
```

Vermelho pelo motivo certo: o módulo de produção não existia. Nenhuma falha era de asserção.

### Execução

```
bun test test/nfse-invoice.contract.test.ts
  22 pass  0 fail  182 expect() calls

bun run --cwd apps/frontend-transportada test
  888 pass  0 fail  4367 expect() calls   Ran 888 tests across 17 files.

bun run typecheck                                  # exit 0 (api, worker, cron, frontend)
bun run lint                                       # exit 0
bunx prettier --check apps/frontend-transportada   # All matched files use Prettier code style!
bun run --cwd apps/frontend-transportada build     # built in 1.16s + PWA (11 entries)
```

Duas correções durante a execução, ambas minhas: `ATTEMPT_ID` importado e não usado no contrato do
client (o lint pegou), e a expressão que conta as listas do grupo fiscal em `main.tsx` — com a
sétima chave o prettier quebrou as duas listas em várias linhas, então o padrão passou a tolerar
espaço em branco entre os itens.

A regra de largura (`test/design-system/layout-width.contract.ts`) ganhou a entrada
`.nfseInvoiceShell`: o `SHELL_RULES` é uma lista explícita, e módulo novo que não é acrescentado ali
sai da varredura sem ninguém notar.

O `format:check` da raiz continua acusando `specs/033-recuperacao-de-senha/spec.md`, de trabalho
paralelo — nenhum arquivo de 032 aparece.

Nada foi commitado.

## T027 — Ação em massa e diálogo na tela Notas

### Contrato antes da implementação

`test/nfse-invoice/emission-dialog.contract.ts`, ligado pelo entrypoint já registrado
`test/nfse-invoice.contract.test.ts`. Cobre, na ordem em que a task pediu: botão só com
`nfse.manage`; prévia agrupada por tomador; descrição editável chegando alterada na criação;
bloqueio exibido com a razão; `companyId` ausente do payload; idempotência no cabeçalho; valor como
string decimal.

```
bun run --cwd apps/frontend-transportada test
  Cannot find module '../../src/modules/nfse-invoice/shared/nfseEmission.service'
  ENOENT: NfseEmissionDialog.component.tsx
  889 pass  35 fail   Ran 924 tests across 17 files.
```

Vermelho pelo motivo certo: as 35 falhas eram módulo de produção inexistente, componente
inexistente e bloco `emission` ausente nos dois locales. Nenhuma era de asserção.

### Execução

```
bun run --cwd apps/frontend-transportada test
  924 pass  0 fail  4504 expect() calls   Ran 924 tests across 17 files.

bun run typecheck                                  # exit 0 (api, worker, cron, frontend)
bun run lint                                       # exit 0
bunx prettier --check <arquivos tocados> specs/032-nota-de-servico-municipal
                                                   # All matched files use Prettier code style!
bun run --cwd apps/frontend-transportada build     # built in 1.42s + PWA (11 entries)
```

Duas correções durante a execução, ambas minhas: `.iconAction` do CSS novo sem `position: relative`
(o contrato do `count-badge` pegou — o badge fica no canto absoluto e precisa de âncora), e
`className?: string` na ação, que o `exactOptionalPropertyTypes` recusa porque o tipo gerado do CSS
Module devolve `string | undefined`.

### Desenho

A criação da API aceita **um tomador por requisição**
(`NFSE_INVOICE_CREATE_SPANS_MULTIPLE_TAKERS`). O diálogo então faz uma prévia da seleção inteira —
a API já devolve agrupada por tomador — e, ao confirmar, dispara **uma criação por grupo, em série**,
cada uma com a sua chave de idempotência `nfse-emission.<token>.<n>`. O token nasce uma vez por
abertura do diálogo: repetir o clique não emite a nota do mesmo tomador duas vezes, e tentar de novo
após falha parcial repõe só o que faltou. Em paralelo as criações disputariam a linha de cada nota.

A ação mora em `modules/nfse-invoice/components/NfseEmissionAction.component.tsx` e carrega o próprio
`useTranslation('nfseInvoice')`. A tabela de notas recebeu exatamente **um import e um elemento** —
nenhuma chave de locale de `nfeWorkspace` foi criada, e o contrato trava isso (`table` não pode
conter `emitNfse`). O arquivo está sob alteração paralela (extração do `count-badge`); a mudança foi
aditiva e não reorganizou nada.

A descrição editável é o **modelo** (com `{{variáveis}}`), semeado pelo `descriptionTemplate` do
perfil escolhido. Intocado, não vai no corpo — a API aplica o do perfil. Editado, vai na prévia e em
todas as criações. Campo apagado é escolha do operador: `''` é enviado, o modelo não volta por cima.

Soma em `sumScaledAmounts` (BigInt sobre string decimal); o serviço não contém `parseFloat` nem
`Number(`, e o diálogo formata por `formatAmount` do `decimalAmount.service`.

### Limitação conhecida — perfil fora do alcance de quem emite

`GET /nfse-emission-profiles` exige `settings.manage`, e `profileId` é **obrigatório** no schema da
prévia e da criação (T014). O papel `fiscal`, que é quem carrega `nfse.issue`, não tem
`settings.manage`: na prática ele abre o diálogo, não consegue listar perfil e não emite. O CT-e não
sofre disso porque casa o perfil no servidor (`AUTOMATIC_PROFILE_ID`); a NFS-e não tem equivalente.

O diálogo não esconde o problema: sem a permissão de listagem ele mostra `emission.profileUnavailable`
dizendo por que a emissão está bloqueada, em vez de uma prévia vazia sem explicação.

**Correção, para T028:** uma rota de opções somente-leitura dos perfis ativos, autorizada por
`nfse.issue` (ou `nfse.manage`), devolvendo apenas `id`, `name` e `descriptionTemplate` — não o
perfil inteiro, que é configuração. Alternativa equivalente: casar o perfil no servidor quando houver
um só ativo, como o CT-e faz. A escolha é de T028; T027 é frontend, e resolver isso aqui seria mexer
em contrato de API fora do escopo da task.

### Segurança

Nenhum dado de tomador real em código, teste, fixture, locale ou comentário — o segundo tomador do
contrato é sintético e existe só para provar o agrupamento. Os dois locales são varridos por
`/[0-9]{11,14}/` e por máscara de CNPJ, e passam. `companyId` não aparece em nenhum corpo enviado
(há teste para isso); a chave de idempotência vai no cabeçalho, nunca no corpo, porque o schema da
API é `.strict()`.

Nada foi commitado.

## T028a — rota de opções de perfil para quem emite

A limitação registrada em T027 virou task própria antes de T028: o diálogo de emissão pedia
`GET /nfse-emission-profiles`, que exige `settings.manage`. O papel `fiscal` — que é quem carrega
`nfse.issue` — não tem essa permissão, recebia 403 e ficava sem perfil para escolher, com `profileId`
obrigatório no schema da prévia e da criação.

Das três saídas desenhadas em T027, a escolhida foi a **rota de opções somente-leitura**. Casar o
perfil no servidor quando há um só ativo foi descartado: o comentário do schema já diz que escolher
em silêncio emitiria a nota pelo perfil errado. Dar `settings.manage` ao papel `fiscal` também —
abriria toda a configuração da empresa para quem só precisa emitir.

```
GET /nfse-emission-profiles/options   nfse.issue      [{ id, name, descriptionTemplate }], status='active'
GET /nfse-emission-profiles           settings.manage  inalterada
```

### A projeção é estreita nas quatro camadas

Não basta a rota devolver três campos hoje. Um parâmetro fiscal acrescentado ao perfil amanhã não
pode escorregar sozinho para quem emite, então cada camada estreita por conta própria:

- `infrastructure/nfse-emission-profile-options.query.ts` — seam de filtros próprio (`companyId` +
  `status = 'active'`), separado do da listagem;
- `application/nfse-profile.port.ts` — tipo `NfseEmissionProfileOption`, três campos, distinto do
  perfil;
- `drizzle-nfse-profile.repository.ts` — `select({ descriptionTemplate, id, name })`, não `select()`;
- `presentation/*.routes.ts` — `serializeProfileOption` escrito campo a campo, não derivado de
  `serializeProfile`.

Só perfil `active` entra: rascunho não tem parâmetro fiscal fechado e desativado foi tirado de
circulação de propósito — emitir por qualquer um dos dois é nota rejeitada pela prefeitura.

### O segmento `options` não é um identificador de perfil

Duas garantias independentes, ambas provadas por contrato: `matchRoute` tenta a rota estática exata
antes da dinâmica, e `:id` usa `pathParameterFormat: 'canonicalUuid'`, que recusa o literal
`"options"`. `GET /options` responde 200 pela rota de opções com `listCalls` vazio; `PATCH /options`
responde 404 com `updateCalls` vazio.

### Vermelho — API

Contrato antes da implementação, `test/nfse-profiles/emission-profile-options.contract.ts` e
`test/nfse-schema/emission-profile-options-query-tenant-safety.contract.ts` já na lista literal do
`package.json`:

```
$ bun test test/nfse-profiles.contract.test.ts test/nfse-schema.contract.test.ts
expect(received).toBe(expected)   // collection.status
Expected: 200
Received: 404
TypeError: undefined is not an object (evaluating 'payload.data[0]')
error: Cannot find module '../../src/nfse-profiles/infrastructure/nfse-emission-profile-options.query.js'

 18 pass
 5 fail
 1 error
```

404 porque a rota não existia, `payload.data[0]` indefinido pelo mesmo motivo, e o módulo ausente
porque o seam de query era o arquivo que o contrato tenant-safe importava. Os três motivos certos.

### Vermelho — frontend

```
$ bun test test/nfse-invoice.contract.test.ts
(fail) nfse emission profile options contract > reads the options route instead of the settings.manage listing
  error: NFSE_INVOICE_RESPONSE_INVALID  (nfseInvoiceResponse.validation.ts:251)
(fail) nfse emission profile options contract > rejects an option carrying a field beyond the three the dialog needs
  error: NFSE_INVOICE_RESPONSE_INVALID  (nfseInvoiceResponse.validation.ts:251)
(fail) nfse emission profile options contract > gates the profile query on nfse.issue
  expect(received).not.toContain("NFSE_SETTINGS_MANAGE_PERMISSION")

 83 pass
 3 fail
```

As duas primeiras porque o guarda ainda exigia as vinte e duas chaves do perfil inteiro e recusava a
opção de três campos; a terceira porque o gate do diálogo ainda era `settings.manage`.

### Verde

```
$ bun run --cwd apps/api-transportada test
 2291 pass
 3 skip
 0 fail
 9368 expect() calls
Ran 2294 tests across 90 files.

$ bun run --cwd apps/frontend-transportada test
 952 pass
 0 fail
 4563 expect() calls
Ran 952 tests across 17 files.

$ bun run typecheck   # api, worker, cron, frontend — sem saída
$ bun run lint        # sem saída
```

`bun test` sem argumento no frontend varre `test/responsive.smoke.spec.ts` e quebra com "Playwright
Test did not expect test() to be called here" — é o smoke do Playwright, que roda por `make smoke`.
A lista literal do `package.json` é a que vale, e é a que está acima.

### Frontend

O client passou a ler `NFSE_EMISSION_PROFILE_OPTIONS_PATH`; o guarda virou
`isEmissionProfileOption`, estrito nos dois sentidos — campo de menos é resposta quebrada, campo de
mais é a listagem de configurações chegando pela rota errada. `NfseEmissionProfileOption` perdeu
`status` (a rota só serve ativo) e a projeção manual sumiu junto: o guarda já garante a forma exata.
O gate do diálogo é `NFSE_ISSUE_PERMISSION`, e `emission.profileUnavailable` continua no lugar para
quem não pode emitir.

### Segurança

Nenhum dado de terceiro em código, teste ou fixture — a opção do contrato é sintética. A resposta não
carrega alíquota, CNAE, item da lista, tomador nem `companyId`, e há asserção sobre o conjunto exato
de chaves para que um campo novo falhe alto em vez de vazar calado. `companyId` continua vindo do
contexto autenticado: o contrato tenant-safe prova `company_id = $1` e `status = 'active'` nos
filtros da query.

Nada foi commitado.

## T028 — tela de listagem de NFS-e e painel de perfil/credencial

### Contrato antes da implementação (vermelho)

`test/nfse-invoice/invoice-table-state.contract.ts` foi escrito antes dos componentes e da folha de
estilo. Com o contrato registrado no entrypoint e a implementação ausente:

```
$ bun run --cwd apps/frontend-transportada test
 979 pass
 9 fail
```

Os 9 são todos do contrato novo, e falham pelo motivo certo — o arquivo que a asserção lê não
existia:

- presentation × 5 — `NfseInvoiceTable`, `NfseInvoiceFilters`, `NfseInvoiceColumnsMenu`,
  `NfseInvoicePagination`, `NfseInvoiceSelectionBar`/`NfseInvoiceAdvancedFilterBuilder`
- style × 2 — `nfseInvoice.module.css` sem `.tableScroll`, `.sortButton`, `.columnsPopover`,
  `.bulkBar`, `.pagination`, `.conditionGroup`, `.fieldGrid` e sem `@media (width >= 40rem)`
- locales × 2 — `columns.*`, `field.*`, `operator.*`, `connector.*` e o bloco `table.*` ausentes nos
  dois idiomas

As asserções de paginação por cursor e do hook já passavam nesse ponto: `cursorPagination.service.ts`
e `useNfseInvoiceTable.hook.ts` tinham sido escritos antes.

### Depois (verde)

```
$ bun run --cwd apps/frontend-transportada test
 988 pass
 0 fail
 4943 expect() calls
Ran 988 tests across 17 files.
```

API sem regressão:

```
$ bun run --cwd apps/api-transportada test
 2291 pass
 3 skip
 0 fail
 9368 expect() calls
```

Gates da raiz: `bun run typecheck` e `bun run lint` limpos nas quatro apps;
`bunx prettier --check` verde em tudo que foi tocado e em `specs/032-nota-de-servico-municipal`
(dois componentes precisaram de `--write` e a suíte foi reexecutada depois, ainda 988/0).

`bun test test/cte-batch.contract.test.ts` → **121 pass, 0 fail**.

### O que a tela ganhou

Tabela seguindo `docs/frontend/data-tables.md`: cabeçalho ordenável com `aria-sort` e rótulo textual
para leitor de tela, filtro simples e avançado (grupos E/OU aninhados) com troca por `Select`,
pílulas removíveis de `@/components/ui/filter-pills` com `countFilterPills`, badge de contagem no
botão de filtro, menu de colunas com visibilidade e reordenação persistidas em `localStorage`,
seleção em massa com soma decimal exata por `formatAmount` (nunca `Number`/`parseFloat`), e
paginação por cursor com pilha de cursores visitados para o "anterior".

Design system respeitado sem afrouxar contrato: ícone só de `@/components/ui/icon`, `Select` e
`Checkbox` só dos primitivos, esqueleto de `@/components/ui/skeleton` em **todo** carregamento — a
tabela em carregamento renderiza um esqueleto com a mesma forma das linhas reais, nunca texto nem
`null`. Nenhum hexadecimal, nenhuma medida mágica: cores por `color-mix` sobre token, espaçamento
por `--space-*`, campos por `--field-height`/`--field-padding`/`--field-font-size` (e as variantes
`*-compact` no construtor de condições).

O menu de colunas abre em **portal no `document.body`**, posicionado por `useFloatingLayer`: dentro
do painel rolável o `position: absolute` era recortado pelo `overflow` do ancestral.

### 375px, 768px e 1280px

Conferido pela folha de estilo, não em navegador — este ambiente não tem sessão de browser aberta
nesta frente. O que a regra garante em cada largura:

- **375px** — `.fieldGrid` e `.conditionRow` em uma coluna; `.tableScroll` com `overflow-x: auto` e
  `.dataTable { white-space: nowrap }`, então a tabela rola dentro do painel e a página não ganha
  scroll horizontal; `.intro` em `width: min(44rem, 100%)`.
- **768px** — `@media (width >= 40rem)` leva `.fieldGrid` a duas colunas e
  `@media (width >= 48rem)` leva `.conditionRow` a `repeat(3, minmax(0, 1fr)) auto`.
- **1280px** — `@media (width >= 64rem)` leva `.fieldGrid` a três colunas; o contêiner continua em
  `var(--layout-width)`, guardado por `test/design-system/layout-width.contract.ts`.

Nenhuma regra usa `max-width: <número>` — o contrato recusa, e a folha só adiciona com `min-width`.

### Refatoração fora da frente — `modules/shared/cursorPagination.service.ts`

**Precisa de decisão sua.** Extraí a paginação por cursor para
`modules/shared/cursorPagination.service.ts` e reescrevi
`cte-batch/shared/cteBatchItemSelection.service.ts` em cima dela. É arquivo de outra frente, e a
orientação era não tocar.

O que motivou: a tabela de NFS-e precisa da mesma pilha de cursores visitados que a de CT-es (avançar
empilha, voltar desempilha, qualquer troca de filtro/ordenação/tamanho volta à primeira página). A
alternativa era uma segunda cópia da mesma máquina de estado em `nfse-invoice`, com o risco clássico
de as duas divergirem na correção de borda.

Evidência para decidir: **`test/cte-batch.contract.test.ts` → 121 pass, 0 fail**, sem alterar nenhum
teste de `cte-batch`. `CTE_ITEM_FIRST_PAGE` continua exportado e o contrato novo prova que ele é o
mesmo valor de `FIRST_CURSOR_PAGE`; o serviço compartilhado não menciona `CteItem` nem `Nfse`. Se a
decisão for reverter, o caminho é restaurar `cteBatchItemSelection.service.ts` do HEAD e duplicar a
máquina de estado dentro de `nfse-invoice` — a tabela de NFS-e não depende de nada específico de
CT-e.

### Segurança

Token da credencial é somente-escrita: a resposta traz `apiTokenConfigured`/`callbackTokenConfigured`
como booleanos, sem máscara, e o painel diz em texto que campo em branco preserva o valor guardado.
Nenhum token em `localStorage`, log, query string ou estado global — o que persiste em `localStorage`
é só preferência de coluna. Nenhum CNPJ, razão social, inscrição municipal ou endereço real em
código, teste, fixture, locale ou nesta evidência; o contrato de locales recusa sequência de 11 a 14
dígitos e string em formato de CNPJ no arquivo pt-BR.

Nada foi commitado.

## T029 — ponta a ponta local: seleção → emissão → cancelamento → notas liberadas

Banco local recriado do zero antes da verificação (decisão registrada em conversa: apagar os dados de
desenvolvimento existentes). A conta usada é a do stub local da Nota RP, nunca a real.

### Três defeitos encontrados pela verificação

**1. Cancelamento silencioso (worker).** `POST /:id/cancel` respondia, a mensagem era consumida e
`nfse_processed_messages` gravava o `event_id` — e a prefeitura nunca era chamada. Nenhum erro, em
lugar nenhum.

A causa era o carregador da execução em
`nfse-issuance/infrastructure/drizzle-nfse-issuance-execution.repository.ts`: o vínculo com
`nfse_issuance_payloads` era `innerJoin`. Só a **emissão** congela payload; a tentativa de
cancelamento não tem linha nenhuma lá. Confirmado no banco: para a tentativa de cancelamento,
`payloads = 0`. Com o `innerJoin`, a consulta não devolvia linha, `load()` devolvia `undefined` e o
efeito caía no caminho `/** Tentativa já liquidada ou linha que sumiu: nada a transmitir */` —
confirmava a mensagem e marcava processado. Falha silenciosa por construção.

Correção: `leftJoin` no payload (`invoice` e `credential` continuam `inner` — sem eles não há o que
transmitir), payload omitido do retorno quando nulo, e **guarda fatal explícita** no caminho de
emissão: sem payload congelado a tentativa vai para dead-letter em vez de transmitir documento
remontado na hora. Remontar aqui mudaria a nota fiscal.

**2. Ordenação das notas devidas (cron).** `next_status_check_at` é nulo até a primeira consulta, e a
política trata nota sem agendamento como devida agora (contrato `eligibility`: _"accepts a pending
invoice with no scheduled check"_). O repositório ordenava por `asc(nextStatusCheckAt)` — e no
Postgres `asc` é `nulls last`. A nota recém-emitida, a mais devida de todas, ia para o fim da fila e
o `limit` do ciclo podia nunca alcançá-la. O comentário no código já prometia `nulls first`; o SQL
não entregava.

Correção: seam `nfse-status-pull/infrastructure/nfse-reconciliation.query.ts` com
`buildDueInvoiceOrdering()` emitindo `asc nulls first`, consumido pelo repositório.

**3. Registro fiscal preso em `authorized` (worker).** Depois do cancelamento confirmado, a consulta
ao banco mostrou a nota `cancelled` e a linha de `nfse_fiscal_documents` ainda `authorized`, com
`cancelled_at` nulo. O write-back síncrono do worker só mexia na nota; quem marcava o documento era o
job de reconciliação, e ele não passa por aqui — no fluxo normal quem confirma o cancelamento é o
worker. Duas rotas de escrita para a mesma tabela, comportamentos diferentes. O CT-e não tem esse
buraco: `recordCancelled` marca `cte_fiscal_documents` como `cancelled` na mesma transação.

Impacto hoje é de registro, não de comportamento: a API só lê `xml_object_id`/`pdf_object_id` dessa
tabela, para o download. Mas é a linha que a auditoria fiscal lê, e ela dizia o contrário do que
aconteceu.

Correção: `recordCancellationConfirmed` atualiza `nfse_fiscal_documents` (`status: 'cancelled'`,
`cancelled_at`) antes de fechar a nota, no mesmo recorte `(company_id, invoice_id)` que a
reconciliação usa.

### Contrato antes da correção (vermelho pelo motivo certo)

Worker — `test/nfse-issuance-execution-input.contract.test.ts` (novo, banco falso que registra o
tipo de cada join, molde `api-transportada/test/billing-infrastructure/support.ts`) mais duas
asserções em `test/nfse-issuance-write-back.contract.test.ts`. Com o `innerJoin` ainda no lugar,
**3 falhas**, todas pelo defeito:

- o join do payload vinha como `inner`, não `left`;
- linha com `payload: null` vazava a chave nula para dentro do objeto devolvido;
- emissão sem payload congelado **resolvia** em vez de rejeitar — nenhum `NfseIssuanceFatalError`.

Cron — `test/nfse-status-pull/due-ordering.contract.ts` (novo, compila o SQL com
`PgDialect().sqlToQuery()`, sem banco) falhou primeiro por
`Cannot find module '…/nfse-reconciliation.query.js'`: o seam ainda não existia.

Worker, defeito 3 — `test/nfse-write-back-statements.contract.test.ts` (novo, banco que grava cada
statement da transação e compila o `where` com `PgDialect`, molde
`mdfe-issuance-write-back.contract.test.ts`): **2 falhas** — nenhum statement em
`nfse_fiscal_documents`, e a ordem tentativa → documento → nota não existia:

```
 2 pass
 2 fail
error: NFSE_FISCAL_DOCUMENT_CANCELLATION_MISSING
```

Os três arquivos novos entraram na lista literal de testes do `package.json` de cada app — fora dela
o teste não roda.

### Depois (verde)

```
$ bun run --cwd apps/worker-transportada test
 423 pass
 0 fail
 1005 expect() calls
Ran 423 tests across 57 files.

$ bun run --cwd apps/cron-transportada test
 124 pass
 0 fail
 223 expect() calls
Ran 124 tests across 5 files.
```

`bun run typecheck` limpo nas duas apps e `bun run lint` limpo na raiz.

A correção do defeito 3 é provada por contrato (o SQL compilado, as colunas escritas e a ordem dentro
da transação), não por nova rodada no banco: a nota do ciclo já estava liquidada, e o guarda de
status impede reescrever tentativa fechada — que é exatamente o que ele deve fazer.

### A emissão, ao vivo

Antes do cancelamento, o ciclo completo ficou registrado no banco local:

| Evidência                                  | Valor                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `nfse_issuance_attempts`                   | `issue` nº 1 → `authorized`; `cancel` nº 2 → `cancelled`                                             |
| `nfse_service_invoices`                    | `authorized_at`, `provider_number` e `verification_code` populados                                   |
| `nfse_fiscal_documents`                    | `authorized`, `homologation`, XML e PDF com id e sha256                                              |
| `stored_objects` `purpose='nfse_document'` | `application/xml` (`…/authorized.xml`) e `application/pdf` (`…/nota.pdf`), ambos `final` e com bytes |

O PDF é caminho novo — nenhum outro trilho arquivava `application/pdf` — e chegou ao bucket pelo
mesmo gateway do XML.

### O cancelamento, ao vivo

A mensagem original já constava em `nfse_processed_messages`, então o replay foi feito inserindo uma
cópia da linha do outbox com `event_id` novo — a idempotência puliria a mesma chave, e é isso que ela
deve fazer.

| Evidência                                       | Valor                                      |
| ----------------------------------------------- | ------------------------------------------ |
| `nfse_issuance_outbox.published_at`             | `2026-08-13 02:20:51.185` (relay publicou) |
| `nfse_issuance_attempts.status`                 | `cancelled`                                |
| `nfse_service_invoices.status` / `cancelled_at` | `cancelled` / `2026-08-13 02:20:51.188`    |
| Última linha do log do stub                     | `[stub] POST /cancelar`                    |
| `nfse_service_invoice_documents`                | 0 ativos, 5 com `cancelled_at` preenchido  |

Antes da correção esse mesmo caminho terminava sem nenhuma linha no log do stub.

### As notas voltaram a ser elegíveis nos dois trilhos

Prévia de NFS-e sobre as cinco notas liberadas: **200**, `blocked: []`, `listedDocuments 5`,
`omittedDocuments 0`, `baseAmount 8016.2300`, `calculatedAmount 801.6230`, `issAmount 40.08` — o
índice parcial `nfse_invoice_documents_active_nfe_unique` de fato só vale para linha não cancelada.

Prévia de CT-e sobre as mesmas cinco: os cinco documentos aparecem bloqueados **apenas** por
`CTE_PROFILE_UNRESOLVED` — não existe perfil de emissão de CT-e no banco recriado.
`CTE_BATCH_DOCUMENT_LINKED_TO_NFSE` sumiu da lista, que é exatamente o que o bloqueio recíproco deve
fazer quando a NFS-e é cancelada.

### Fora desta frente, não corrigido

`cte-batches/infrastructure/drizzle-cte-batch.repository.ts:517-532` — os seis filtros de contagem de
itens usam subconsulta correlacionada com colunas interpoladas cruas dentro do template `sql`, que as
emite **sem qualificação de tabela**. É o mesmo defeito já corrigido nesta feature no seam de
elegibilidade. O idioma correto já existe no repositório
(`drizzle-cte-batch-item.repository.ts:393`, `trips/infrastructure/trip.query.ts:57,73`). Não foi
tocado: é anterior à feature 032 e precisa de contrato próprio.

### Segurança

Nenhum número, série ou chave de acesso de NF-e de terceiro nesta evidência — os identificadores
citados são de tabela interna. Nenhum CNPJ, razão social, inscrição municipal ou endereço real. O
token do stub vive só no `.env`, e o bloco NFS-e do `.env` local aponta para o stub em
`127.0.0.1:54999`, não para a conta real. Nada foi commitado.
