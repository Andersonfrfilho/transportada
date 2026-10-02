# Evidência

Saída de comando, não impressão. Cada seção fecha com o SHA do commit da task.

## Fase 1 — A viagem entrega seus comprovantes de uma vez

### T1.1 — Como a URL assinada é produzida

**Resposta: HMAC local (SigV4), sem chamada de rede.** A rota em lote assina **original e
miniatura**, como a rota de uma nota já faz.

Caminho lido, de cima para baixo:

1. `apps/api-transportada/src/trips/application/read-delivery-proof.use-case.ts` — `readDeliveryProofs`
   chama `downloads.createDownloadUrl` duas vezes por comprovante (original + miniatura, em
   `Promise.all`).
2. `src/trips/infrastructure/delivery-proof-download.gateway.ts` — `createDeliveryProofDownloadGateway`
   delega a `storage.createSignedDownload({ bucket, key, expiresInSeconds: 300, disposition:
'inline', filename })` e só soma `expiresAt` com o relógio local.
3. `src/storage/infrastructure/nfe-storage-gateway.ts:175` — repassa a `provider.createSignedDownload`.
4. `@adatechnology/object-storage-provider@0.3.0`, `dist/index.js:274-295` — `new URL(await
getSignedUrl(client, new GetObjectCommand({...}), { expiresIn }))`, com `@aws-sdk/s3-request-presigner`.
   O `S3Client` (`dist/index.js:173`) é criado com `credentials: { accessKeyId, secretAccessKey }`
   **estáticas** — não há cadeia de provedores de credencial nem chamada de metadados. Presign SigV4
   é cálculo de HMAC sobre a requisição canônica; não toca o endpoint.

Medição (a prova de que não há rede): `createObjectStorageProvider` apontado para
`http://127.0.0.1:1` (porta fechada — qualquer round-trip falharia), 80 assinaturas seguidas de
`createSignedDownload` com `disposition: 'inline'`:

```
$ bun run ./sign-probe.ts        # de apps/api-transportada, arquivo descartado depois
80 assinaturas ms 40.2
```

≈ 0,5 ms por URL, e nenhuma falhou contra um endpoint inalcançável. Uma viagem com 40 comprovantes
são 80 assinaturas (original + miniatura) ≈ 40 ms de CPU, sem I/O.

**Decisão para a T1.5:** assinar **os dois** (`downloadUrl` e `thumbnailUrl`) por comprovante, com a
mesma serialização da rota de uma nota. O plano B ("só a miniatura, original sob demanda") fica
descartado — o custo que o motivava não existe. O teto de `?documentIds=` continua valendo, mas por
causa do tamanho da resposta e do diálogo (RNF5), não da assinatura.

Commit: `a55febc1a`.

### T1.2 — Contrato da rota em lote, antes da implementação

Dois arquivos novos, ligados nos entrypoints que **já** estão na lista explícita do `package.json`
(`trip-http.contract.test.ts` e `trip-delivery-proof.contract.test.ts` — por isso nenhuma linha nova
no `package.json` nesta task):

- `test/trip-http/delivery-proofs-batch.contract.ts` — 200 com `{ data }` e `documentId` por item;
  `companyId` do contexto e `tripId` do caminho; `companyId` na query é 400; `fleet.read` basta
  (`trip.manage` não é exigido), `trip.report-on-behalf` também lê, e `NO_PERMISSIONS` e
  `trip.manage` sozinho dão 403; `?documentIds=` filtra, deduplica e respeita o teto; 400 para vazio,
  não-uuid, chave repetida e chave desconhecida.
- `test/trip-delivery-proof/read-by-trip.contract.ts` — consulta escopada por empresa e viagem,
  `documentId` por item, serialização idêntica à da leitura de uma nota, original e miniatura
  assinados, sem `bucket`/`objectKey` no corpo, lista vazia.
- A fixture `test/fixtures/trip-http.fixture.ts` ganhou `readTripDeliveryProofs` (calls + result).

Vermelho visto antes de implementar:

```
$ bun --env-file=../../.env.test test ./test/trip-http.contract.test.ts ./test/trip-delivery-proof.contract.test.ts
error: Cannot find module '../../src/trips/domain/delivery-proof-batch.constant.js' ...
SyntaxError: Export named 'readDeliveryProofsByTrip' not found in module '.../read-delivery-proof.use-case.ts'
 0 pass
 2 fail
 2 errors
```

Commit: `7c4604234` (nasce vermelho, de propósito — a T1.3 a T1.5 o fecham).

### T1.3 — Porta + consulta por viagem

`ReadTripDeliveryProofsPort` (`findByTrip`) e `TripDeliveryProofRecord` em
`read-delivery-proof.use-case.ts`; `findDeliveryProofsByTrip` em `delivery-proof-read.support.ts`.
`listDeliveryProofs` virou casca fina sobre a mesma consulta privada (`selectDeliveryProofs`), de modo
que as junções escopadas por `company_id` e o `where` com `tripDocuments.tripId` são **um** só texto
de fonte. `companyId` e `tripId` são argumentos da consulta, nunca lidos de payload.

As suítes que leem esse arquivo como texto de fonte seguem verdes depois do refactor (tenant-safety,
`canhoto-review-read`, `received-by-read`, `no-gate`, `transaction-serial-queries`):

```
$ bun --env-file=../../.env.test test ./test/zz-tmp-probe.test.ts ./test/transaction-serial-queries.contract.test.ts
 84 pass
 0 fail
```

(`zz-tmp-probe.test.ts` era um entrypoint descartável que importava as seis suítes; apagado.)

Commit: `4e9538e33`.

### T1.4 — `readDeliveryProofsByTrip`

Ao lado de `readDeliveryProofs`. A montagem do item (URL assinada de original e miniatura, veredito do
canhoto, máscara do documento) saiu do corpo de `readDeliveryProofs` para `buildDeliveryProofView`,
chamada pelos dois — mesmo corpo, só movido.

```
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts ./test/canhoto-review.contract.test.ts ./test/trip-schema.contract.test.ts ./test/transaction-serial-queries.contract.test.ts
 502 pass
 0 fail
 1241 expect() calls
```

Commit: `19637643a`.

### T1.5 — Rota

`GET /trips/:id/delivery-proofs`, `TRIP_FIELD_READ_POLICY`, em `trip.routes.ts` ao lado da rota de uma
nota (que não foi tocada). Fronteira em `trip-delivery-proofs.schema.ts`; teto em
`delivery-proof-batch.constant.ts` (`DELIVERY_PROOF_BATCH_MAX_DOCUMENT_IDS = 100`); ligação em
`main.ts`. Decisão da T1.1 executada: assina original **e** miniatura.

```
$ bun --env-file=../../.env.test test ./test/trip-http.contract.test.ts ./test/trip-delivery-proof.contract.test.ts
 462 pass
 0 fail
$ bun --env-file=../../.env.test test --timeout 120000          # suíte de contrato inteira
 8498 pass
 23 skip
 0 fail
Ran 8521 tests across 192 files.
$ bun run typecheck     -> sem erro
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0   -> exit 0
```

A primeira rodada da suíte inteira deu **2 fail** esperados e instrutivos: `separator-role` e
`finance-read` listam **por extenso** as rotas que cada papel alcança, e a rota nova entrou nas duas
(`fleet.read` para o separador, `TRIP_FIELD_READ_POLICY` para o finance). As duas listas foram
atualizadas por escrito, com comentário — decisão: ambos já leem o comprovante de uma nota com a mesma
política, então ler o da viagem não amplia a superfície.

Commit: `eb4eca414`.

### T1.6 — Integração sobre viagem semeada

`test/integration/delivery-proofs-by-trip.integration.ts`, na lista explícita de `test:integration`
do `package.json`. Viagem com três notas no mesmo ponto, as três entregues e cada uma com a foto do
canhoto + miniatura; leitura por `readDeliveryProofsByTrip` sobre `findDeliveryProofsByTrip` real.

```
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/delivery-proofs-by-trip.integration.ts
 5 pass
 0 fail
 19 expect() calls
Ran 5 tests across 1 file. [13.19s]
```

Os cinco casos: três comprovantes de três notas numa chamada (cada `documentId` certo, três `id`
distintos, `downloadUrl` e `thumbnailUrl` presentes); `documentIds` recorta; a **viagem entra no
where** (nota de outra viagem da mesma empresa não vaza, nem pedida por `documentIds`); tenant (outra
empresa lê `[]` mesmo com o id certo); viagem sem comprovante é `[]`.

**Mutação:** removida a linha `eq(tripDocuments.tripId, input.tripId)` do `where` →
`4 pass / 1 fail` (reprova justamente o caso do vazamento entre viagens). Restaurada por
`git checkout`.

Rodado contra o Postgres de teste (`127.0.0.1:65432`), nenhum caso pulado. O script `test:integration`
inteiro (142 arquivos) passou de 10 min por rodada, então foi executado **em quatro fatias em primeiro
plano**, com a lista exata do script (arquivos 1–47, 48–71, 72–95, 96–142; `bun --env-file=../../.env.test
test --timeout 120000 <arquivos>`):

| Fatia  | Arquivos | Resultado                    |
| ------ | -------- | ---------------------------- |
| 1–47   | 47       | 288 pass, 0 fail             |
| 48–71  | 24       | 99 pass, 0 fail              |
| 72–95  | 24       | 87 pass, **3 skip**, 0 fail  |
| 96–142 | 47       | 231 pass, 0 fail (778 s)     |
| total  | 142      | **705 pass, 3 skip, 0 fail** |

Os 3 `skip` estão na fatia 72–95, em arquivos que não toquei (o `testWithPostgres`/gates de
infraestrutura deles); o arquivo novo da T1.6 rodou sozinho acima, com os 5 casos executados. Não
investiguei quais três são — se alguém quiser a lista, é um `bun test` dessa fatia com `--reporter`.

Commit: `bbf2c13c0`.

## Fase 1 — fechamento

- `bun run typecheck` → sem erro.
- `bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0` → exit 0.
- Contrato (`bun --env-file=../../.env.test test --timeout 120000`): 8498 pass, 23 skip, 0 fail, 192
  arquivos.
- Integração: 705 pass, 3 skip, 0 fail, 142 arquivos (em fatias).

## Fase 2 — T2.1 a T2.3

As três fecharam no executor da Fase 2, que foi interrompido antes de registrar evidência; as
medições abaixo são de execução própria depois disso, não relatório dele.

### T2.1 / T2.2 — a seleção sabe o que é elegível

`bun test ./test/trip/canhoto-batch-selection.contract.ts` → **10 pass, 0 fail, 27 asserções**.

Commit: `7ead3c6ec`.

### T2.3 — o lote no cliente

`bun test ./test/trip/canhoto-batch-approval.contract.ts` → **7 pass, 0 fail, 20 asserções**.

O 409 sendo conflito e não falha foi provado **por mutação**: trocando o `return OUTCOME.CONFLICTED`
por `throw error` em `canhotoBatchApproval.service.ts`, o contrato cai para **5 pass / 2 fail** (o
caso do CA07 e o caso de conflito-e-falha no mesmo maço). Restaurado, volta a 7 pass.

Reaproveitamento conferido por leitura, sem nada reinventado: `runFieldActionQueue` entrega
`{errorCode, item, value}` por item, e o código do 409 é o `CANHOTO_REVIEW_ALREADY_RESOLVED_CODE`
que já existia. O serviço compara `error.message` com essa constante porque é **ali** que esta base
carrega o código de erro — `readErrorCode` do próprio arnês documenta que ler `.code` nunca bate e
jogaria toda falha em `UNKNOWN`.

⚠️ Registro de um erro meu de método, não de código: ao conferir `canhotoBatch.constant.ts` com `cat`,
o hook do rtk devolveu o arquivo **sem** a linha de copyright que já estava lá, e eu quase a
dupliquei. Conferência de conteúdo de arquivo nesta base é por `rtk proxy cat`.

Gates: `bunx prettier --check` nos três arquivos → estilo em conformidade. `bun run typecheck` →
sem erro.

### T2.4 — a consulta do maço (cliente + `useTripDeliveryProofsQuery`)

Vermelho antes: `bun test ./test/trip/trip-delivery-proofs-client.contract.ts` → **1 pass / 2 fail**
(`readTripDeliveryProofs is not a function`; o que passou é o caso "corpo que não é lista", que
passa por acidente porque o método inexistente também lança — ele só vale depois do verde). Hook:
`test:hooks` no arquivo novo → **0 pass / 1 error** (`Cannot find module .../useTripDeliveryProofs.query`).

Verde depois: cliente **3 pass / 0 fail, 9 asserções**; hook **3 pass / 0 fail, 6 asserções**.
Suítes completas: `bun run test` → **6186 pass / 0 fail**; `bun run test:hooks` → **183 pass / 0 fail**.

Provado por mutação em `useTripDeliveryProofs.query.ts`: sem `hasSelection` no `enabled` → **2 pass /
1 fail**; sem `canManage` → **2 pass / 1 fail**. Restaurado, 3 pass.

Contrato: `GET /trips/:id/delivery-proofs` sem query (a viagem inteira); o item mantém `documentId`;
item sem `documentId` ou com chave desconhecida sai da lista em vez de derrubá-la (molde da spec 193
T3.1). A chave é `[trips, companyId, tripId, 'delivery-proofs-batch']`, sob a da viagem, então
`invalidateTrip` a derruba junto.

⚠️ Desvio do plano: o ceiling de 100 ids da rota (acima disso, 400) fez a consulta pedir a viagem
**toda**, sem `?documentIds=`; o recorte pela seleção é de `resolveCanhotoBatchSelection` no cliente.
Pedir só os marcados quebraria numa viagem com mais de 100 notas marcadas.

Gates: typecheck sem erro; `eslint src test --max-warnings=0` → **0 erros**, 16 avisos
`react-hooks/exhaustive-deps` **preexistentes** em arquivos que não toquei (o `--max-warnings=0` já
estava vermelho antes). Dois erros de lint saíram: um num teste meu da T2.3 (`prefer-promise-reject-errors`,
de propósito rejeita um não-Error) e um `_omitted` não usado na T2.4.

### T2.5 — `approveCanhotoBatchMutation` no workspace

Vermelho antes: `test:hooks` no arquivo novo → **0 pass / 3 fail**. Verde depois: **3 pass / 0 fail,
10 asserções**. Suítes completas: `bun run test` → **6186 pass / 0 fail**; `bun run test:hooks` →
**186 pass / 0 fail**.

Mutação: tirando o `onSuccess: invalidate` → **1 pass / 2 fail** (os dois casos que afirmam a
invalidação). Restaurado, 3 pass.

O que o contrato prova: cinco notas → cinco `approve`; `409` vai para `conflicted` e falha de rede
para `failed`, com as outras três aprovadas; sem `trip.manage` nenhuma chamada chega ao cliente (o
controlador recusa antes) e as cinco voltam como `failed`. A viagem é invalidada nos dois primeiros.

Forma: é uma `useMutation` (`approveCanhotoBatchMutation`), no molde de `batchFieldReturnMutation`;
`mutateAsync` devolve o `{ approved, conflicted, failed }` da T2.3. A consulta do maço
(`delivery-proofs-batch`) mora sob a chave da viagem, então a mesma invalidação a refaz.

Gates: typecheck sem erro; prettier conforme; `eslint --max-warnings=0` continua vermelho só pelos 16
avisos preexistentes (0 erros).

### T2.9 — textos do maço nos dois idiomas (feita antes da T2.6, que precisa deles)

Vermelho antes: `bun test ./test/trip/canhoto-batch-labels.contract.ts` → **3 pass / 2 fail**
(chaves ausentes; os 3 verdes são vácuos de chave ausente: `[] == []`). Verde depois: **5 pass / 0
fail, 537 asserções**. Suítes completas: `bun run test` → **6191 pass / 0 fail**; hooks → **186 pass /
0 fail**.

Mutação: tirando `{{label}}` da chave `selectItem` do en → **4 pass / 1 fail** (paridade de
placeholders). Restaurado, 5 pass.

O contrato prova: toda chave (`stateActions.batchCanhoto*` com `_other`, `deliveryProof.canhotoBatch.*`)
existe nos dois idiomas, mesmos placeholders, plural com `{{count}}`, falha parcial com
`{{failed}}`/`{{total}}`, nenhuma palavra de portão (bloque/trava/impede/invalid) e **nenhuma de
recusa** (recus/reject/rejeit) — a máquina não recusa —, e pt-BR sem palavra sem acento.

Gates: typecheck sem erro; prettier conforme.

### T2.6 — `TripCanhotoBatchDialog`

Vermelho antes: `test/trip-hooks/canhoto-batch-dialog.contract.ts` → **0 pass / 1 fail / 1 error**
(módulo inexistente). Verde depois: **16 pass / 0 fail, 36 asserções**. Suítes completas:
`bun run test` → **6191 pass / 0 fail**; hooks → **202 pass / 0 fail**.

Mutações: tirar `!isWaitingImages` do `canConfirm` → **15 pass / 1 fail**; `loadedIds` que nunca
registra a foto → **13 / 3**; `checkedItems = items` (ignora a desmarcação) → **13 / 3**; tirar
`isEager` do item → **15 / 1**. Todas restauradas, 16 pass. **Não provado por mutação:** que o
Escape da foto em tamanho real não fecha a conferência (a galeria é irmã do overlay, não filha; o
caso passa, mas não tentei a mutação que a põe dentro).

Forma: diálogo montado só enquanto aberto (`isOpen: true` fixo no `useModalDialog`), então cada
abertura nasce do zero. Props: `{items, onClose, onConfirm, overflowCount, status}`, com
`status: 'loading' | 'ready' | 'submitting' | 'failed'`. O cartão de cada nota é
`TripCanhotoBatchItem` (arquivo próprio). A leitura automática reaproveita `ProofReview`, que já
traduz o veredito do canhoto.

⚠️ Desvio, **mais estrito que a spec**: as fotos carregam `eager` (nova prop `isEager` no
`ProofImage`) e o botão só vale quando todas as **marcadas** chegaram. Com `lazy` a foto abaixo da
dobra nunca carregaria e a pessoa aprovaria o que não viu. Nota desmarcada não segura o botão.

O `action-icons.contract` (já existente) reprovou o "Cancelar" sem ícone — corrigido.

Gates: typecheck sem erro; prettier conforme; eslint 0 erros (os 16 avisos preexistentes).

### T2.7 — foto que não abriu nasce desmarcada, com aviso (RF-A8, CA09)

Vermelho antes: `canhoto-batch-dialog-image-failure.contract.ts` → **2 pass / 4 fail** (os 2 verdes
são vácuos: "a foto que carrega normal não ganha aviso" e "a nota que falhou não volta por clique",
que passa porque desmarcar já era possível). Verde depois: **6 pass / 0 fail**. Suítes completas:
`bun run test` → **6191 pass / 0 fail**; hooks → **208 pass / 0 fail**.

Mutações: `onError` que não registra a falha → **3 pass / 3 fail**; tirar o "sem fonte" (`downloadUrl`
e miniatura vazias) → **5 / 1**; deixar a nota falha marcada → **1 / 5**. Restauradas.

O gancho é o `onSettled('failed')` que a T2.6 já pôs no `ProofImage` (o `onError` dele). Foto que
falhou, ou canhoto sem imagem nenhuma (sem `onError` para esperar), fica desmarcado, com a caixa
travada (`disabled`) e o aviso `role="alert"`; não segura as outras notas.

Gates: typecheck sem erro; prettier conforme; eslint 0 erros (16 avisos preexistentes).
