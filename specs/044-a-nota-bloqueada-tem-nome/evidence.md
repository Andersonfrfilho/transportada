# Evidência — 044 A nota bloqueada tem nome

## T001 — Contrato do rótulo no bloqueio

`test/nfse-domain/selection.contract.ts`: bloqueio de documento existente (`already-linked`,
`duplicated`, `linked-to-cte-batch`, `missing-taker-address`, `missing-taker-name`) passa a exigir
`number`/`series` preenchidos a partir do documento; bloqueio `notFound` exige os dois como `null`,
porque não há documento para nomear; `duplicated` (segunda ocorrência do mesmo id na seleção) exige
o rótulo também, porque o documento existe e já foi resolvido na primeira ocorrência.

Vermelho, `bun test test/nfse-domain.contract.test.ts`: `NfseSelectionBlock` ainda não tinha
`number`/`series` — os `toEqual` novos falhavam por chave ausente no objeto devolvido.

## T002 — `NfseSelectionBlock` ganha `number` e `series`

`selectNfseCandidates` (`nfse-selection.policy.ts`) resolve o rótulo de `documentsById` quando o
documento existe, `null` quando não (`notFound`). Nenhum I/O novo — `number`/`series` já vinham em
`findSelectionDocuments`, só não atravessavam para o bloqueio.

```
bun test test/nfse-domain.contract.test.ts

 46 pass
 0 fail
```

Verde — T001 fechado sem alterar nenhuma asserção.

## T003 — O rótulo atravessa o fio

`nfse-invoices.routes.ts`: o `map` de `preview.blocked` passa a serializar `number` e `series` junto
de `documentId`/`reason`. Contrato em `test/nfse-invoices-http/invoices.contract.ts`
(`'a prévia devolve as notas projetadas e os bloqueios como dado'`) afirma os quatro campos no corpo
da prévia — `body.data.blocked` igual a
`[{documentId, number: '000000456', reason: 'NFSE_DOCUMENT_ALREADY_LINKED', series: '001'}]`.

```
bun test test/nfse-invoices-http.contract.test.ts

 79 pass
 0 fail
```

## T004 — Tipo e agrupamento com rótulo

`NfsePreviewBlock` (frontend) ganha `number: null | string` e `series: null | string`.
`groupNfseBlocksByReason` (`nfseEmission.service.ts`) passa a devolver, por razão, `labels` (até
`NFSE_BLOCK_LABEL_LIMIT = 10`) e `remainingCount`. Rótulo construído como `${series}-${number}`
quando ambos existem; documento sem número (bloqueio `notFound`) cai no `documentId` — o bloqueio
precisa aparecer mesmo sem nome, nunca desaparecer por falta de rótulo.

Suíte `nfseEmission.service` verde, parte da suíte `nfse-invoice` completa (abaixo).

## T005 — Contrato do vocabulário de bloqueio

Suíte nova em `test/nfse-invoice/navigation-and-locales.contract.ts`
(`'covers every block reason the emission preview can return'`), varrendo
`emission.blockReason.*` nos dois `*.locale.json` contra os seis códigos `NFSE_DOCUMENT_*` que a
prévia de NFS-e devolve (reaproveita a constante `API_ERROR_CODES` já existente no arquivo, filtrada
por prefixo, em vez de declarar uma lista duplicada):
`NFSE_DOCUMENT_ALREADY_LINKED`, `NFSE_DOCUMENT_DUPLICATED`, `NFSE_DOCUMENT_LINKED_TO_CTE_BATCH`,
`NFSE_DOCUMENT_MISSING_TAKER_ADDRESS`, `NFSE_DOCUMENT_MISSING_TAKER_NAME`, `NFSE_DOCUMENT_NOT_FOUND`.

Nasceu verde: os seis verbetes já existiam nos dois idiomas, produzidos junto do T006. A suíte fica
como trava — razão nova sem tradução vira vermelho aqui, não `defaultValue` mudo na tela.

## T006 — A seção nomeia, e o botão espera

`NfseEmissionDialog.component.tsx`: cada linha da seção de bloqueios passa a exibir a razão
traduzida (`t('emission.blockReason.\${group.reason}', { defaultValue: group.reason })`) seguida dos
rótulos (`group.labels.join(', ')`) e, acima do teto de 10, `` `${t('emission.blockedMore', {
count: group.remainingCount })}` ``. `canConfirmNfseEmission`/`isEmissionEnabled`
(`nfseEmission.service.ts`) passam a devolver `false` sempre que `summary.blockedCount > 0` — o
botão de confirmar deixa de habilitar com bloqueio na mesa, em vez de deixar o operador descobrir o
422 no clique. Verbete `emission.blockedMore` acrescentado acentuado nos dois `*.locale.json`.

```
bun test test/nfse-invoice.contract.test.ts

 270 pass
 0 fail
```

```
bun test test/locale-accents.contract.test.ts

 (suíte de acentuação) — sem falha
```

## T007 — Gates e evidência

### Suítes das quatro apps

```
bun run test

api-transportada       2610 pass, 0 fail
worker-transportada      480 pass, 0 fail
cron-transportada        189 pass, 0 fail
frontend-transportada   1359 pass, 0 fail
```

Todas via `bun run --cwd apps/<app> test` — a lista explícita de arquivos de cada `package.json`,
não a varredura recursiva do repositório (que pega Playwright `.spec.ts` e testes de integração que
exigem Postgres vivo, fora do escopo desta feature).

### `typecheck`

```
bun run typecheck
```

Limpo nas quatro apps, sem erro.

### `lint`

```
bun run lint
```

Limpo nas quatro apps, sem erro.

### `format:check`

Primeira rodada apontou 3 arquivos fora do padrão do Prettier (reformatação anterior, sem mudança de
lógica): `nfse-invoices/domain/nfse-selection.policy.ts`,
`test/nfse-domain/selection.contract.ts`, `test/nfse-invoice/emission-dialog.contract.ts`.
`bunx prettier --write` aplicado só nesses três. Segunda rodada:

```
bun run format:check

All matched files use Prettier code style!
```

Reverificação pós-formatação (só reformatação de espaço em branco, sem mudança de asserção):

```
bun test test/nfse-domain.contract.test.ts    → 46 pass, 0 fail
bun test test/nfse-invoice.contract.test.ts   → 270 pass, 0 fail
```

### O 422 de `assertNoNfseBlocks` segue coberto

`apps/api-transportada/test/nfse-invoices-application/invoice-creation.contract.ts:310`,
`'documento bloqueado interrompe a criação inteira'`: seleciona um documento com bloqueio
(`status: 'cancelled'`) e afirma que `useCase.create(CREATE_INPUT)` rejeita, com
`recording.invoices` permanecendo vazio. Exercita `assertNoNfseBlocks` →
`NfseSelectionBlockedError` (`UNPROCESSABLE_STATUS` = 422, `code: reason`) em
`nfse-invoice-candidates.service.ts`/`nfse-issuance.error.ts`, ambos intocados por esta feature.

Antes da 044, esse era o caminho comum — o operador só descobria o bloqueio ao tentar criar. Depois
da 044 (T006 desabilita o botão de confirmar com qualquer bloqueio na prévia), este teste passa a
provar a guarda de corrida: só é alcançado se a seleção mudar de estado entre a prévia e o clique
(outra sessão vinculou o documento nesse intervalo). O teste, o erro e o código 422 não saíram do
lugar — só o papel deles mudou, de caminho normal para rede de segurança.

**Aceite cumprido:** tudo verde, evidência escrita.
