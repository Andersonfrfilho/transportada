# Plano técnico — Feature 019

## Contexto e premissas

- `POST /cte-batches/preview` já roda toda vez que o modal abre e sempre que o operador troca perfil
  ou agrupamento (`useCteEmissionDialog.hook.ts`, `queryKey` com `documentIds`, `profileId` e
  `groupingMode`). É o lugar natural da sugestão: sem rota nova, sem chamada extra, já escopado por
  tenant pelo `context.companyId`.
- O envelope do preview hoje é `{ blocked, projections, summary }` (`cte-batch-preview.port.ts`), e o
  guard do frontend (`cteBatchPreview.validation.ts:130`) chama `rejectExtraKeys` na raiz. **Chave
  nova na API sem o frontend preparado derruba a tela inteira** — é exatamente o modo de falha já
  registrado em outra rota. Por isso o frontend aceita `suggestedName` (opcional) numa task
  **anterior** à que faz a API emitir o campo.
- Injeção de relógio já é padrão no repo: `billing.use-case.ts:13`, `operations.use-case.ts:16` e
  `nfe-import.types.ts:113` declaram um port mínimo `{ now(): Date }`, ligado em `main.ts:201` como
  `{ now: () => new Date() }`. A data da sugestão entra por aí — nada de `new Date()` dentro da regra.
- Fuso: o worker já resolve data fiscal com `FISCAL_TIME_ZONE = 'America/Sao_Paulo'`
  (`mdfe-closure-input-resolver.service.ts:14`) via `Intl.DateTimeFormat`. As apps não compartilham
  código, então a constante é redeclarada no domínio de `cte-batches` — mesmo valor, mesma técnica.
- `name` é `min(2).max(100)` no `createBatchSchema`. `CT-e 2026-07-30 #12` tem 20 caracteres.
- A constraint `cte_batches_company_id_name_unique` continua sendo a autoridade sobre unicidade. A
  sugestão é palpite; o `409` da 018 permanece na frente e já está testado.

## Onde cada parte é implementada

### 1. Regra pura da sugestão (api · domain)

`src/cte-batches/domain/cte-batch-name.service.ts` (novo), sem I/O:

- `buildBatchNamePrefix({ now }): string` — formata a data em `America/Sao_Paulo` com
  `Intl.DateTimeFormat('en-CA', { timeZone })` (que já devolve `YYYY-MM-DD`) e devolve
  `` `CT-e ${date} #` ``.
- `suggestBatchName({ names, prefix }): string` — extrai o sufixo dos nomes que começam com o prefixo,
  aceita **só** dígitos (`#7` sim, `#7 revisado` não), e devolve `` `${prefix}${maior + 1}` ``, ou
  `` `${prefix}1` `` quando não há nenhum.

Duas funções puras porque o prefixo depende do relógio e a sequência depende do banco: separadas, o
caso de fuso e o caso de sequência são testáveis sem se contaminarem.

### 2. Consulta dos nomes do dia (api · application + infrastructure)

- `cte-batch-preview.port.ts` — `CteBatchPreviewReaderPort` ganha
  `findBatchNamesStartingWith(query: { companyId, prefix }): Promise<readonly string[]>`, e
  `CteBatchPreviewResult` ganha `readonly suggestedName: string`. Entra também
  `CteBatchClockPort = { now(): Date }` nas dependências do use-case.
- `preview-cte-batch.use-case.ts` — monta o prefixo pelo relógio, soma a consulta dos nomes ao
  `Promise.all` que já existe (documentos, links e catálogo de perfis rodam juntos — a quarta consulta
  não acrescenta viagem em série) e devolve `suggestedName`.
- `cte-batch-selection.query.ts` — `findBatchNamesByPrefix(database, { companyId, prefix })`:
  `select name from cte_batches where company_id = $1 and name like $2`, com o prefixo escapado para
  `LIKE` (`\`, `%` e `_`). O filtro por `companyId` é obrigatório e é o que o teste de isolamento
  prova.
- `drizzle-cte-batch-preview.repository.ts` — delega, no formato dos dois métodos que já tem.
- `main.ts` — passa `clock: { now: () => new Date() }` na construção do use-case de preview.
- A rota não muda: `handle` já serializa o resultado inteiro do use-case.

### 3. Sugestão no modal (frontend)

- `cteBatchPreview.types.ts` — `CteBatchPreview` ganha `suggestedName: string`.
- `cteBatchPreview.validation.ts` — `suggestedName` entra na allowlist da raiz e é lido de forma
  **tolerante**: string vira string, ausente vira `''`. Ausência não pode derrubar a tela, e o `''`
  é o sinal de "não há sugestão" que o frontend já sabe tratar.
- `cteEmission.service.ts` — `resolveBatchName({ customName, fallbackName, suggestedName }): string`,
  função pura: nome digitado vence; senão a sugestão; senão o nome local de hoje.
- `useCteEmissionDialog.hook.ts` — o estado deixa de ser `name` e passa a ser
  `customName: string | null` (`null` = intocado) mais `fallbackName`, fixado no `open()`. O `name`
  exposto é **derivado** em render por `resolveBatchName`, sem `useEffect`: é transformação de dado,
  não sincronização com sistema externo. `setName` grava `customName`; `open()` volta os dois ao
  estado inicial.
- `CteEmissionDialog.component.tsx` não muda.

## Testes

| Arquivo                                                                                                                                      | Prova                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api-transportada/test/cte-batch-domain/batch-name.contract.ts` (novo, `import` em `cte-batch-domain.contract.test.ts`)                 | prefixo com a data de `America/Sao_Paulo` (inclusive o instante UTC que já é o dia seguinte); sequência `max + 1`, `#1` na lista vazia, sufixo malformado e outro dia ignorados |
| `apps/api-transportada/test/cte-batch-application/preview.contract.ts` (existente)                                                           | o preview devolve `suggestedName` a partir dos nomes que o reader falso entrega e do relógio injetado, sem tocar em `blocked`, `projections` ou `summary`                       |
| `apps/api-transportada/test/integration/cte-batch-suggested-name.integration.ts` (novo, registrado na lista explícita de `test:integration`) | em Postgres real: a sequência sobe a cada lote criado, ignora nome fora do padrão, e **duas empresas com lotes no mesmo dia recebem sequências independentes** (isolamento)     |
| `apps/frontend-transportada/test/cte-batch/client-and-queries.contract.ts` (existente)                                                       | o guard do preview aceita `suggestedName`, tolera a ausência (vira `''`) e continua rejeitando chave desconhecida                                                               |
| `apps/frontend-transportada/test/nfe-workspace/cte-emission-dialog.contract.ts` (existente)                                                  | `resolveBatchName`: digitado vence sugestão, sugestão vence fallback, fallback quando não há nada; e o hook não usa `useEffect` para o nome                                     |

Só o teste de integração precisa de registro novo no `package.json`; os demais entram por `import` em
entrypoints já listados.

## Ordem obrigatória

Fase A entrega só a regra pura, que não muda contrato nenhum. A task que faz a API **emitir**
`suggestedName` (T006) vem depois de T004, que ensina o guard do frontend a aceitar o campo — em
qualquer outra ordem existe uma janela em que a resposta legítima da API derruba o modal. A
numeração do `tasks.md` já reflete isso.

## Riscos e mitigação

| Risco                                                                | Mitigação                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Chave nova no envelope derrubando o modal por causa do guard estrito | O guard aceita o campo numa task anterior à que faz a API emitir; contrato cobre presente, ausente e chave desconhecida        |
| Sugestão sobrescrevendo o nome digitado quando o preview recalcula   | `customName` é `null` só enquanto intocado; contrato de `resolveBatchName` cobre a precedência                                 |
| Data errada perto da meia-noite                                      | Prefixo formatado em `America/Sao_Paulo`, com caso de teste no instante UTC que já virou o dia seguinte                        |
| Prefixo com metacaractere de `LIKE` casando nome demais              | O prefixo é escapado antes do `LIKE`; o formato é gerado pelo próprio código, mas o escape evita depender disso                |
| Consulta nova vazando entre tenants                                  | `companyId` é obrigatório na query e o teste de integração cria duas empresas com lotes do mesmo dia                           |
| Sugestão colidindo por concorrência entre dois operadores            | Fora do escopo por decisão: a constraint e o `409` da 018 seguem sendo a garantia; o teste de conflito da 018 continua no gate |

## Gate de saída

`bun run --cwd apps/api-transportada test` · `bun run --cwd apps/frontend-transportada test` ·
`bun run --cwd apps/api-transportada test:integration` · `make check` · verificação ao vivo na stack
local com duas emissões seguidas no mesmo dia, com evidência em `evidence.md` sem dado fiscal real.
Sem migration, então `make migration-test` não faz parte do gate desta feature.
