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

### T2.8 — o botão no maço, e o fluxo do maço no detalhe da viagem (RF-A2, RF-A3, RF-A9, CA02–CA04)

Vermelho antes:
`canhoto-batch-action.contract.ts` → **2 pass / 2 fail** (CA02 e o clique; CA03 e CA04 passam no
vazio, porque "nenhum botão" é verdade antes de o botão existir — o que as prende é a mutação
abaixo). `canhoto-batch-review-flow.contract.ts` → módulo `useCanhotoBatchReview.hook` inexistente,
a suíte nem carrega (vermelho de importação, sem número). Verde depois: **4 pass / 0 fail** e
**7 pass / 0 fail**. Suítes completas: `bun run test` → **6191 pass / 0 fail**; hooks → **219 pass
/ 0 fail** (eram 208; +11 desta task).

Mutações (restauradas): confirmar sem tirar o `conflicted` da seleção → **5 / 1**; sem o aviso de
exclusão do canhoto → **3 / 1**; sem `setIsRefreshing(true)` ao abrir → 6 / 0 (**sobrevivia**) e,
depois do teste "enquanto a releitura está pendente o diálogo não mostra foto", **6 / 1**.

Desenho: o botão e o aviso vivem em `TripStateActions` (props novas `canhotoBatch` e
`onOpenCanhotoBatch`), no molde do `batchFieldDelivery`; a contagem de excluídas é a `excludedCount`
da T2.2, que já devolve `0` quando nada é oferecido. O fluxo (consulta, abrir-relê, confirmar,
falha "N de M") mora no hook novo `useCanhotoBatchReview`, para não inchar o `TripDetail`. Sem
`trip.manage` o `TripStateActions` já devolve `null` e a consulta nem dispara (T2.4).

- RF-A9: abrir chama `refetch()` e o diálogo fica em `loading`, **sem itens**, até a releitura
  voltar — a tela não mostra (e portanto não aprova) o que a releitura pode ter tirado da fila.
  Releitura que falha → `failed`, também sem itens.
- Confirmar tira da seleção o aprovado **e** o conflito (409); o que falhou continua marcado e o
  aviso `batchCanhotoPartialFailure` ("1 de 5") aparece ao lado do de devolução em massa. Nota
  desmarcada no diálogo não é enviada e continua marcada.
- `CanhotoAutomaticReview` não foi tocado.

Gates: typecheck sem erro; prettier conforme; eslint 0 erros (16 avisos preexistentes).

### T2.10 — revisão de design e usabilidade do diálogo (`web.md` §15)

Sem teste novo: é revisão de tela. O diálogo foi renderizado no Vite **deste worktree** (porta 53222,
`cwd` conferido com `lsof`; a 53000 era de outra sessão — `reconcile-spec-145` — e a API/infra não
estavam de pé). Foi uma página descartável, fora do repositório, com 5 e com 43 itens, uma foto
quebrada de propósito; **a tela real do detalhe da viagem, com dados e login, não foi levantada**.

Medido por DOM e geometria (screenshot só no fim):

- **Teto**: 43 canhotos pendentes → 40 itens, aviso "3 canhotos ficaram para a próxima rodada.",
  rodapé "39 de 40 marcados" (1 com foto quebrada, desmarcada e travada), botão "Aprovar 39 canhotos".
- **Foco**: ao abrir, o foco está no diálogo (`aria-modal`, `aria-labelledby`); Shift+Tab a partir
  dele cai em "Aprovar N canhotos" (armadilha de Tab), então o botão não exige 80 Tabs.
- **Teclado**: 82 paradas de Tab com 40 itens (duas por item: abrir em tamanho real e a caixa). É o
  custo do teto de 40; com a seleção por teclado, quem quiser pode ir direto ao botão por Shift+Tab.
- **Rodapé**: `position: sticky`, fica visível com o diálogo rolado (4512 px de conteúdo em 736).
- **Desktop 1280**: diálogo de 64rem, três colunas de ~319 px; **celular 375**: uma coluna de 335 px,
  sem rolagem horizontal, botões de 44 px de altura, rodapé em 129 px.
- **Visual**: tema escuro, cobre, cantos retos (`border-radius: 0`), rótulos em mono — o idioma da app.

⚠️ Defeito achado e corrigido: na foto quebrada o texto alternativo do `<img>` se sobrepunha ao
rótulo da nota. Agora o item com foto que não abriu ganha `canhotoBatchItemFailed` (moldura
tracejada de 9 rem, imagem oculta), e o aviso abaixo diz o que houve. Conferido de novo no DOM
(`visibility: hidden`, moldura de 144 px) e no print.

Gates: typecheck sem erro; `bun run test` → 6191 pass / 0 fail e hooks 219 pass / 0 fail; eslint 0
erros (16 avisos preexistentes); prettier conforme.

#### O print que fecha a T2.10 — conferido e entregue fora do agente

Os screenshots citados acima foram tirados pelo executor e **não existiam em disco**: a T2.10 pede
print **ao usuário**, e relatório de agente não é print. Refeito aqui, em Vite isolado na 53011
montando o `TripCanhotoBatchDialog` real com o `index.css` e o i18n reais, 4 itens (um com foto que
não abre), em 1280 / 768 / 375 — os três tamanhos que o `web.md` §10 exige. Entregue ao usuário em
2026-10-01.

Duas coisas que só apareceram ao olhar:

- **A CSP da app é real em desenvolvimento.** `data:` em `<img>` é bloqueado por
  `img-src 'self' blob: http://127.0.0.1:53001`; as fotos sintéticas tiveram de ser servidas de
  `public/`. Não é defeito — é a diretiva funcionando.
- **A app tem tema claro.** `src/styles/index.css` declara `color-scheme: light` (:192) e
  `@media (prefers-color-scheme: light)` (:210), e o Playwright, que nasce em claro, renderizou a
  tela clara. A linha "tema escuro único" do `apps/frontend-transportada/CLAUDE.md` está errada. Os
  prints entregues são os de `colorScheme: 'dark'`.

Conferência independente do fechamento da Fase 2 (medida aqui, não lida do relatório): `bun run test`
→ **6191 pass / 0 fail**, 42926 `expect()`, 31 arquivos; `test:hooks` → **219 pass / 0 fail**;
`typecheck` limpo; `lint` com saída 0 e 16 avisos `exhaustive-deps` em 13 arquivos — a interseção
desses 13 com os arquivos tocados por esta branch (`git diff --name-only $(git merge-base
origin/staging HEAD)..HEAD`) é **vazia**, que é a prova de que os avisos são preexistentes.

Artefatos descartáveis do print (`print-canhoto.{html,tsx,mjs}`, `public/print-canhoto/`) removidos;
árvore limpa.

## Fase 3 — O robô tem porta própria

### T3.3 — o contrato da rota do robô e de `isGrantablePermission`, antes da implementação

Dois arquivos de contrato, ambos já na lista do `package.json` (`canhoto-review.contract.test.ts` e
`authorization.contract.test.ts`): três blocos novos em `test/canhoto-review/routes.contract.ts` e
um teste em `test/authorization.contract.test.ts`.

Vermelho de antes (de `apps/api-transportada`): `bun --env-file=../../.env.test test
./test/canhoto-review.contract.test.ts` → **80 pass / 16 fail** (78 preexistentes + 18 novos, dos
quais 16 vermelhos); `authorization.contract.test.ts` → **32 pass / 1 fail**. Os 16 falham com
`Received: 404` — a rota não existe. Os dois que passam já antes são por desenho, e não provam a
rota: "o token do robô não alcança a rota de gente" (403 porque o token não tem `trip.manage`) e
"a rota de gente continua aceitando `automatic`" (é o contrato de que o navegador não muda).

O que os testes prendem: o token com só `trip.canhoto-auto-review` → 200 com empresa e autor do
contexto; `trip.manage` sem a permissão do robô → 403 na rota do robô; o `.strict()` recusa
`action` (os três valores), veredito, origem, empresa, chave de acesso e número/série com 44
posições; **campo de leitura ausente é 400** (os quatro, um a um) e os quatro `null` são 200 —
é o que impede o `optional()` de entrar sem aviso; e `isGrantablePermission` recusa a permissão
depois de provar que ela **existe** (sem a primeira asserção, `false` seria vacuamente verdade).

⚠️ Este commit é **vermelho de propósito**: contrato antes da implementação. T3.4 e T3.5 o
fecham.

### T3.4 — a permissão `trip.canhoto-auto-review` existe em três lugares

Fonte (`authorization.policy.ts`): catálogo `TRANSPORTADA_PERMISSIONS`, papel `automation` e
`SERVICE_ONLY_PERMISSIONS`. Nenhum grupo a recebe (`permissionGroups.constant.ts` intocado) e o
realm do Keycloak não muda. Espelho do frontend em `useAuthMe.query.ts`.

Vermelho mecânico antes de acertar as igualdades exatas: com só a fonte editada, o contrato da API
fechou em **8494 pass / 30 fail** = 9 do toll booth (baseline sem Postgres) + 16 da rota do robô
(T3.5) + **5 de igualdade de catálogo** (matriz completa e seed local em `authorization`, T014b ×2,
conta de serviço em `tenant-context`). Acertadas as igualdades: `authorization` + `tenant-context`

- `user-administration-application` → **155 pass / 0 fail**.

Verde de depois: API **8499 pass / 25 fail** (os 9 do toll booth + os 16 da rota do robô, ambos
vermelhos conhecidos: o primeiro é Postgres fora do ar, o segundo é a T3.5). Frontend: **6202 pass
/ 0 fail** (31 arquivos) e 219 / 0 no segundo comando do `test`; `tsc` limpo; lint 0 erros.

Mutações (as três suítes direcionadas, 155 asserções):

- tirar a permissão de `SERVICE_ONLY_PERMISSIONS` → **4 fail** (declaradas como de serviço, `isGrantablePermission`, matriz "não oferece permissão de serviço", grupo recusa todas as de serviço);
- tirar do papel `automation` → **5 fail** (matriz completa, "automation recebe todas", `tenant-context`, matriz, `isGrantablePermission`);
- restaurado: 155 / 0.

Locales (medição): a divergência é que `identity.en.locale.json` carrega `mdfe.*` em português e
`whatsapp.settle` em inglês. **Sem entradas de locale para a permissão nova, o frontend segue em
6202 / 0**: o contrato só exige rótulo para `apiPermissions`, que exclui as de serviço. Entradas
adicionadas mesmo assim, por convenção das duas de máquina existentes (pt no pt, en no en);
continua 6202 / 0.

Lint: `routes.contract.ts` da T3.3 tinha um `_omitted` não usado (eslint); trocado por filtro de
`Object.entries`, comportamento igual.

### T3.5 — a rota `PATCH .../proof/review/automatic`

`canhoto-review.routes.ts`: segunda rota no mesmo arquivo e no mesmo caso de uso
(`canhotoReview.review`), com `policy` `trip.canhoto-auto-review` e schema próprio
(`AUTOMATIC_REVIEW_BODY_SCHEMA`: `.strict()`, sem `action`, quatro campos de leitura `nullable()`
e obrigatórios). O handler e o parse de caminho/IP são compartilhados com a rota de gente, que não
mudou. O comando que chega ao caso de uso é `{ action: 'automatic', ... }` montado no servidor.

Vermelho de antes: `canhoto-review.contract.test.ts` **80 pass / 16 fail** (os 16 com 404, da T3.3).
Verde de depois: **96 pass / 0 fail**; contrato inteiro da API **8515 pass / 9 fail** (só os 9 do
toll booth, Postgres fora do ar); `tsc` limpo, eslint e prettier limpos.

Mutações (suíte do canhoto):

- `readNumber` com `.optional()` → **1 fail** (o teste do campo ausente);
- sem `.strict()` no schema do robô → **7 fail** (`action`, veredito, origem, empresa, chave de acesso);
- policy da rota do robô trocada para `trip.manage` → **16 fail**;
- restaurado: 96 / 0.

### T3.6 — a trilha por comprovante só no canal do robô

Desenho: a **rota** escolhe o canal (`CanhotoReviewChannel`: `person` na rota de gente, `service` na
rota do robô) e o entrega ao caso de uso em `ReviewCanhotoProofInput.channel` — o corpo não tem
como mandá-lo (a rota de gente com `channel` no corpo é 400). `reviewCanhotoProof` monta a trilha
em `buildAuditEntry`: ramo automático só grava com `channel === 'service'` (ação
`trip.canhoto-review.automatic`, ator = usuário do serviço, `reason: null`, sem nota nem leitura);
approve/reject seguem como antes. `CanhotoReviewAuditEntry` ganhou `permission` (a trilha do robô
registra `trip.canhoto-auto-review`; a de gente segue `trip.manage`) e o repositório deixou de
fixar `trip.manage`. Só grava quando a decisão é `apply`: sobre veredito humano (`unchanged`) não
há escrita nem trilha.

Vermelho de antes (`canhoto-review.contract.test.ts`): **97 pass / 5 fail** — trilha do robô (2),
`permission` na trilha de gente (1), canal na rota do robô (1) e canal por rota (1).
Verde de depois: **102 pass / 0 fail**; contrato da API inteiro **8521 pass / 9 fail** (os 9 do toll
booth); `tsc` limpo (pegou `me-trip.integration.ts`, que chamava o caso de uso sem canal: ganhou
`channel: 'person'`), eslint e prettier limpos.

Mutações (suíte do canhoto, 102 asserções):

- tirar o filtro `channel !== 'service'` → **1 fail** (canal de pessoa passa a deixar trilha);
- permissão da trilha do robô trocada por `trip.manage` → **1 fail**;
- rota do robô com `channel: 'person'` → **2 fail**;
- trilha nunca gravada → **4 fail**;
- restaurado: 102 / 0.

### T3.7 — a integração do robô contra o Postgres

O Postgres do Docker (65432) estava fora do ar; a integração rodou contra um **Postgres 18.4
nativo descartável** (cluster `initdb` temporário, porta 55999, `DRIZZLE_TEST_DATABASE_URL`, que a
fixture lê antes de `DATABASE_URL`), derrubado depois. Não é o banco de CI, mas é a mesma versão
do Postgres local do projeto e roda as migrations de verdade.

Cinco testes novos em `test/integration/delivery-proof-canhoto-review.integration.ts` (já na lista
do `test:integration`), chamando `reviewCanhotoProof` com `DrizzleCanhotoReviewUnitOfWork`:

1. a leitura que casa aprova, grava `canhoto_read_*`, deixa `canhoto_review_by_user_id` nulo e grava
   **uma** linha em `audit_logs` (ação `trip.canhoto-review.automatic`, ator = usuário do serviço,
   permissão `trip.canhoto-auto-review`, alvo = viagem, `metadata` só com o IP, sem o número da
   nota) — CA19;
2. a leitura que não casa fica `pending` e ainda deixa a trilha;
3. sobre veredito humano o robô devolve `unchanged`: o comprovante inteiro fica idêntico e não há
   trilha — CA10, CA12;
4. pelo canal de pessoa o ramo automático segue sem trilha;
5. a empresa vem do contexto: com a `companyId` de outra empresa o resultado é
   `CanhotoReviewProofNotFoundError`, sem escrita nem trilha.

Vermelho de antes: com o caso de uso e o repositório do commit da T3.5 (T3.6 desfeita) →
**11 pass / 2 fail** (os testes 1 e 2, sem trilha); o contrato é anterior à implementação nos
testes de unidade (T3.6) e a integração fecha o que eles não enxergam — o INSERT real em
`audit_logs` com a FK composta de membership. Verde de depois: **13 pass / 0 fail** no arquivo.

Mutações (arquivo, 13 testes): sem o filtro `channel !== 'service'` → **1 fail** (o de pessoa);
permissão fixa `trip.manage` no repositório → **1 fail**; sem filtro de empresa na trava (nos dois
`SELECT`s) → **1 fail** (o da outra empresa; só um deles não basta, o segundo já cobre); restaurado
13 / 0. Os outros arquivos de integração que tocam canhoto/comprovante
(`me-trip`, `trip-delivery-proof-canhoto`, `canhoto-ocr-flag`, `delivery-proof-received-by`,
`delivery-proofs-by-trip`, `driver-delivery-proof-read`, `trip-field-office*`): **90 pass / 0
fail**. A suíte de integração inteira (~17 min) não foi rodada.

### T4.3 — as dependências do leitor entram no worker

Conferência independente da Fase 3 antes de abrir a Fase 4, por execução e não pelo relatório do
executor: contratos da API **8521 pass / 9 fail** e frontend **6202 pass / 0 fail** + **219 / 0** de
hooks — números do relatório confirmados. Os 9 vermelhos são todos
`toll booth catalog repository (spec 154, T201)`, em `ERR_POSTGRES_CONNECTION_CLOSED`, e **não são
desta branch**: sob `make check` o mesmo arquivo dá **8521 / 0**. O vermelho aparece só quando a
suíte recebe `--env-file=../../.env.test`, que entrega uma URL de Postgres que está fora do ar —
com a variável ausente esses testes pulam. É defeito de invocação, não de código.

`@jsquash` (T4.2) decodifica, mas não lê código de barras — o spike exercitou
`bytes → luminância → zxing Code128Reader → chave`. Então a T4.3 instalou as duas pontas:
`@jsquash/jpeg@1.6.0`, `@jsquash/png@3.1.1`, `@jsquash/webp@1.5.0` e `@zxing/library@0.23.0`, este
último **pinado na versão que o painel já usa** (`apps/frontend-transportada/package.json:37`) para
não abrir duas versões do mesmo leitor no monorepo. 6 pacotes instalados, 42 resolvidos.

- `bun install --frozen-lockfile` na raiz: `Checked 788 installs across 921 packages (no changes)`.
- `make check`: **EXIT=0** — `format:check`, lint (16 warnings pré-existentes, 0 errors), typecheck,
  testes de todas as apps e build.

**O `.wasm` resolve dentro deste repositório**, o que o spike não provou (ele rodou num diretório
descartável fora da árvore): um round-trip `encode`/`decode` de 64x64 com meia imagem escura, rodado
com `apps/worker-transportada` como cwd, devolveu `decodedWidth: 64`, `firstPixelDark: true`,
`lastPixelLight: true` — a barra sobreviveu ao JPEG e o módulo carregou sem passo de build.

## Fase 5 — A rotina entra no relógio

### T5.2 e T5.1 — `trip.canhoto.read` nas quatro cópias do catálogo

Contrato antes (`d83889a5e`): cron **2 fail**, worker **2 fail**, API **5 fail** — catálogo sem a
rotina e a migration ausente de `SEED_MIGRATIONS`. Depois da T5.1 (`b5e980d1f`): cron **6 / 0**,
worker **5 / 0**, frontend **394 / 0** (segue a API); a API ficou com 1 vermelho até a migration.
Com a T5.3: `bun test ./test/job-catalog.contract.test.ts` na API → **13 pass / 0 fail**.
Entrada igual nas quatro: `failureOutcomes: ['object_unavailable', 'unsupported_media',
'too_large', 'decode_timeout', 'api_unreachable']`, `minimumIntervalSeconds:
JOB_TICK_INTERVAL_SECONDS`.

### T5.3 e T5.3b — uma migration, cinco partes

`drizzle/20261002120000_trip_canhoto_read_job/` (posterior a `20261001123700_event_location_stamp`;
sem colisão local nem em `origin/staging`): recria `job_executions_job_check` e
`job_schedules_job_check` (DROP → ADD `NOT VALID` → VALIDATE) com 15 jobs; `INSERT` da linha de
`job_schedules` (300 s); coluna `canhoto_read_attempted_at timestamptz` anulável, sem backfill;
índice parcial `trip_delivery_proofs_canhoto_pending_idx ON (created_at) WHERE canhoto_review =
'pending' and canhoto_read_source is null and canhoto_read_attempted_at is null`. Coluna e índice
também em `trip.schema.ts`. As três decisões ficaram como mandado: `kind` fora do predicado, chave só
`(created_at)`, conjuntos como literais SQL.

Testes novos: um estático em `static-migration.contract.ts` (e a pasta na lista explícita) e a
asserção `canhoto-read-queue.assertion.ts`, ligada em `database-migration.integration.ts`, que no
Postgres confere coluna anulável `timestamp with time zone`, a definição exata do índice, a linha
de `job_schedules` (`[300]`), as duas CHECK aceitando o job, e um `EXPLAIN` com `enable_seqscan =
off` da consulta com os literais repetidos → `Index Scan using trip_delivery_proofs_canhoto_pending_idx`.

Vermelho antes: com a pasta fora da lista, `db:test` deu **88 pass / 25 skip / 1 fail**.

### T5.4 — `rollback.sql` e a migration aplicada de verdade

⚠️ **O Docker estava fora** (`Cannot connect to the Docker daemon`; `open -a Docker` não subiu em 90 s),
então `make migration-test` não pôde rodar como está. Foi rodado o **mesmo comando que ele executa**
(`bun run --cwd apps/api-transportada db:test` com `DRIZZLE_TEST_DATABASE_URL`) contra um Postgres 18.4
nativo descartável (Homebrew, porta 55999, banco temporário no scratchpad):

```text
$ DRIZZLE_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55999/postgres bun run db:test
 115 pass
 0 fail
 1712 expect() calls
Ran 115 tests across 8 files. [24.69s]
```

**0 skip** — o integration aplicou todas as migrations, rodou o `rollback.sql` da nova (índice,
coluna, linha do relógio e job nas CHECK somem; entrada do `__drizzle_migrations` some) e reaplicou.
Sem Postgres o mesmo comando dá 90 pass / **25 skip** — pular não é passar, e este número não vale.

⚠️ O Postgres nativo expôs um vermelho **pré-existente** e alheio: o `DELETE` barrado por
`ON DELETE RESTRICT` em `delivery-proof-contractor-overrides.assertion.ts` responde `23001` no 18.4 e
`23503` na CI (mesmo caso de `cte-profile-output-constraints`). Corrigido em commit à parte
(`1486f072c`) aceitando os dois códigos. A CI usa o Postgres do `compose.yaml`; **acompanhar o
`migration-test` dela no push** — passar no nativo não prova a imagem fixada por digest.

Mutações (cada uma com a migration/rollback restaurados depois; 113 pass / 2 fail cada):

- predicado do índice sem `canhoto_read_attempted_at is null` → estático **e** integration vermelhos;
- `rollback.sql` sem o `DROP COLUMN` → estático **e** integration vermelhos;
- `"kind" = 'canhoto'` no predicado do índice → estático **e** integration vermelhos.

Restaurado: **115 / 0**.

### T5.5 — `db:generate`

```text
$ bun run db:generate
$ drizzle-kit generate --output json --config drizzle.config.ts
{"status":"no_changes","dialect":"postgresql"}
```

Nenhuma pasta nova em `drizzle/`. O `snapshot.json` veio da receita do repositório (gerar tmp, mover o
snapshot, apagar o tmp); a linha do `CREATE INDEX` é idêntica, caractere a caractere, à que o Drizzle
gerou.

⚠️ **Para a Fase 6**: a consulta da rotina tem de repetir os literais (`canhoto_review = 'pending'`,
`canhoto_read_source is null`, `canhoto_read_attempted_at is null`), nunca `eq()` com valor JS — senão
o índice é ignorado em silêncio. O `EXPLAIN` acima é o modelo do CA20 / T6.3.

### T5.3b (complemento) — a recaptura zera o carimbo

O `make check` pegou um vermelho que o `db:test` não podia pegar: `nenhuma coluna da família canhoto
fica de fora do zeramento` (`trip-delivery-proof.contract.test.ts`) — **8522 pass / 1 fail**, a coluna
nova `canhotoReadAttemptedAt` faltando em `buildCanhotoReviewReset`. Não é formalidade: a recaptura cai
no `ON CONFLICT DO UPDATE` da **mesma linha** e o `SET` é denotativo, então sem o `null` ali o canhoto
refotografado herdaria o "a máquina já tentou" e **nunca** entraria de novo na fila. (A afirmação
anterior, de que recaptura cria comprovante novo e não é afetada, estava errada para esse caminho.)
`canhotoReadAttemptedAt: null` entrou no tipo e no objeto do zeramento, e na lista `RESET_TO_NULL` do
contrato: `trip-delivery-proof.contract.test.ts` → **273 pass / 0 fail**.

## Fase 6 — a rotina do worker

### T6.1 / T6.2 — a régua da chave de acesso no worker

Contrato **antes** da cópia: `bun test ./test/canhoto-read.contract.test.ts` →
`Cannot find module '../../src/canhoto-read/domain/canhoto-barcode.policy.js'` (0 pass / 1 fail / 1 error).

Depois de `domain/canhoto-barcode.policy.ts` (cópia por valor, motivo no cabeçalho) e
`domain/canhoto-read.constant.ts` (lote, teto do ciclo, teto de 8 MB, orçamento de ms, formatos e
resultados de falha): **15 pass / 0 fail**, 0 skip. O contrato usa as mesmas chaves do contrato do
frontend (`canhoto-identification.contract.ts`): a do pedido, a de outra nota, a fora da viagem, o
modelo 65, o dígito errado, o CNPJ alfanumérico e as duas chaves de ambiguidade.

A saída do worker é só o que ele viu (`readDocumentId`, `readNumber`, `readSeries`,
`readSource: 'barcode'`) ou `{ kind: 'unusable' }`; **nenhum veredito** existe no tipo (RF-B4).

Mutações (cada uma restaurada em seguida):

- sem a conferência do modelo 55 → **13 pass / 2 fail** (modelo 65; "sem código, DV errado, modelo 65 e lixo");
- nota liberada passando a contar na ambiguidade → **14 pass / 1 fail**;
- ambiguidade devolvendo a primeira candidata → **14 pass / 1 fail**.

Restaurado: **15 / 0**. `bunx tsc --noEmit` limpo; `eslint src/canhoto-read test/canhoto-read*` sem
avisos. `./test/canhoto-read.contract.test.ts` entrou na lista `test` do `package.json`.

### T6.3 — a consulta dos pendentes (CA20)

Postgres 18.4 nativo descartável (porta 55997), migrado com o `db:migrate` da API (264 migrations).
Teste **antes**: `test/integration/canhoto-read-queue.integration.ts` →
`Cannot find module '.../drizzle-canhoto-read-queue.repository.js'` (0 pass / 1 fail / 1 error).

Depois de `infrastructure/drizzle-canhoto-read-queue.repository.ts` (SQL cru, três predicados como
**literal**) e do fixture `test/fixtures/canhoto-graph.fixture.ts` (o grafo: empresa → viagem → nota
→ parada → evento → objeto → comprovante): **9 pass / 0 fail**, 0 skip (`DATABASE_URL` definida).
Cobre: ids dos joins (`tripId`, `documentId`) e tamanho gravado; `ORDER BY created_at` e teto;
`excludeProofIds`; fora da fila — lido, tentado, não-canhoto, `not_applicable`, empresa
`disabled`, viagem `cancelled`, nota liberada, objeto `deleted`; `listTripDocuments`;
`markAttempted` (só a coluna do carimbo, uma vez, só na fila, só na empresa certa).

EXPLAIN da consulta real (`enable_seqscan = off`, tabelas quase vazias — prova que o índice **serve**
o predicado, não que o planejador o escolha com volume):

```text
Limit  (cost=0.87..17.93 rows=1 width=176)
  ->  Nested Loop  (cost=0.87..17.93 rows=1 width=176)
        Join Filter: (o.id = p.object_id)
        ->  Nested Loop  (cost=0.73..17.54 rows=1 width=152)
              ...
              ->  Nested Loop  (cost=0.58..17.10 rows=1 width=136)
                    ->  Nested Loop  (cost=0.43..16.72 rows=1 width=120)
                          ->  Nested Loop  (cost=0.29..16.33 rows=1 width=88)
                                ->  Index Scan using trip_delivery_proofs_canhoto_pending_idx on trip_delivery_proofs p  (cost=0.14..8.16 rows=1 width=72)
                                      Filter: (kind = 'photo'::text)
                                ->  Index Scan using trip_stop_events_company_stop_created_at_idx on trip_stop_events e
                          ->  Index Scan using trip_documents_live_freight_calculation_unique on trip_documents d
                    ->  Index Scan using trips_company_fiscal_readiness_idx on trips t
              ->  Index Scan using companies_pkey on companies c
        ->  Index Scan using stored_objects_company_status_lease_expires_idx on stored_objects o
```

⚠️ **Decisão registrada**: `stored_objects.status = 'final'` entra no predicado. Falha de
infraestrutura (objeto ausente) **não** carimba a tentativa; sem esse filtro, objeto apagado ficaria
para sempre na cabeça da fila e, com `ORDER BY created_at LIMIT`, empurraria os demais.

⚠️ O EXPLAIN com parâmetro vinculado **não** detecta o defeito do `eq()` (plano personalizado das
primeiras execuções ainda usa o índice). Por isso há um teste à parte que prende o texto que sai do
construtor: os três literais presentes e `params` só com o `limit`.

Mutações (restaurada a cada uma):

- `canhoto_review = ${'pending'}` (parâmetro) → **8 pass / 1 fail** (o teste do texto; o EXPLAIN seguiu verde, como dito);
- sem `d.released_at is null` → 8 / 1; sem `t.status <> 'cancelled'` → 8 / 1;
- sem `canhoto_read_attempted_at is null` → **5 pass / 4 fail** (fila, `markAttempted`, plano e texto).

Restaurado: **9 / 0**. `tsc --noEmit`, `eslint` e `prettier --check` limpos nos arquivos novos.
`./test/integration/canhoto-read-queue.integration.ts` entrou na lista `test:integration`.

## Fase 6 — T6.4: o decodificador em `worker_thread` e o leitor de imagem

Teste antes da implementação: `canhoto-image-reader.contract.ts` nasceu vermelho (`Cannot find module
.../canhoto-image-reader.service.js`, 0 pass / 1 error). Depois: `canhoto-read.contract.test.ts`
**27 pass / 0 fail / 0 skip** (15 da régua + 5 do decodificador real em thread + 7 do leitor).

O que cada parte prova:

- **Foto realista**: JPEG 3024x4032 (12 MP), barra sólida, papel `228 + random*12`, q85, gerado no
  teste por `@jsquash/jpeg` com `encodeCode128C` copiado **por valor** (`test/fixtures/canhoto-photo.fixture.ts`).
  `decode()` devolve **exatamente** os 44 caracteres (`toBe`, não "achou algum código"). PNG e WebP
  (2400x1800) idem.
- **Sem código / bytes que não são imagem** → `null`, não exceção (a rotina grava a tentativa).
- **Prazo**: `budgetMilliseconds: 1` → rejeita `CanhotoDecodeTimeoutError` e a thread é encerrada.
- **Teto de 8 MB antes de baixar**: `sizeBytes = teto + 1` → `too_large` com **0 downloads e 0 decodes**;
  `sizeBytes = teto` passa (fronteira). `application/pdf` → `unsupported_media`, também sem download.
  Objeto ausente → `object_unavailable` (1 download, 0 decodes).
- Erro inesperado do decodificador **propaga** (a rotina conta a falha daquele comprovante, CA14).

Mutações (restaurada a cada uma; suíte inteira de 27):

| Mutação                                            | Resultado                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| teto conferido depois do download                  | 26 pass / **1 fail** (`refuses ... before downloading it`)                                                                         |
| `>` vira `>=` no teto                              | 26 / **1** (`accepts an object of exactly the cap`)                                                                                |
| timeout vira `read/null`                           | 26 / **1** (`reports decode_timeout`)                                                                                              |
| leitor engole erro inesperado                      | 26 / **1** (`lets an unexpected decoder error propagate`)                                                                          |
| estouro de prazo resolve `null` em vez de rejeitar | 26 / **1** (`terminates the thread and rejects ...`)                                                                               |
| WebP roteado ao decodificador de PNG               | 26 / **1** (`reads the same key from PNG and WebP`)                                                                                |
| worker devolve metade da chave                     | 25 / **2** (JPEG 12 MP e PNG/WebP)                                                                                                 |
| peso do verde zerado na luminância                 | **27 / 0 — sobreviveu**: a foto fabricada é cinza (R=G=B), logo o peso não é observável; a mutação não prova nada e não é contada. |

Restaurado: **27 / 0**.

Build: `canhoto-barcode.worker.ts` entrou no `build` do `package.json`;
`test/build-entrypoints.contract.test.ts` **2 pass / 0 fail**. `bun run build` gera
`dist/canhoto-read/infrastructure/canhoto-barcode.worker.js` (1,55 KB, `--packages=external`) e o
arquivo **empacotado**, executado como `Worker` com a foto de 12 MP, devolveu a chave de 44
caracteres em 170 ms.

⚠️ Os imports de `@zxing/library` são pelo nome na raiz do pacote. Os caminhos fundos
(`esm/core/...`) usados no spike não tipam sob `NodeNext` (o pacote não declara `type: module`, o
`.d.ts` é lido como CJS e o `default` vira o namespace): `TS2351` em quatro construtores. Pela raiz,
`tsc` limpo e a mesma chave lida.

`tsc --noEmit`, `eslint` (cwd da app) e `prettier` limpos. Não rodou: RabbitMQ, MinIO — nenhum
teste desta task os exige (o leitor recebe `AttachmentObjectReaderPort` por injeção).

## Fase 6 — T6.5: o gateway autenticado da API

Calco de `mdfe-auto-issue/infrastructure/automatic-manifest-api.gateway.ts`: mesmo crachá
(`config.mdfeAutoIssue`: `client_credentials`, `tokenUrl`, `apiBaseUrl`), token em cache com margem de
30 s, `fetch` e `now` injetáveis. O papel `automation` já carrega `trip.canhoto-auto-review`
(`authorization.policy.ts`); **`trip.manage` não foi tocado**.

Teste antes: `canhoto-review-api.gateway.contract.ts` vermelho (`Cannot find module`). Depois:
`canhoto-read.contract.test.ts` **35 pass / 0 fail / 0 skip** (27 + 8).

- `PATCH {base}/trips/:tripId/documents/:documentId/proof/review/automatic`; `:documentId` é o
  `trip_documents.id` do comprovante, não o `readDocumentId` lido. `authorization: Bearer`,
  `x-company-id`, `content-type: application/json`.
- Corpo **exatamente** `{readDocumentId, readNumber, readSeries, readSource}` — nem `action`, nem
  veredito. "Li e não achei" são quatro `null` explícitos, nunca campos ausentes.
- 400/404/409 → `report_rejected`; 401/403 → `api_unauthorized` (e o 401 descarta o token em cache);
  429/5xx/conexão recusada/token malformado → `api_unreachable`. Recusa do endpoint de token é
  classificada pelo mesmo status. O erro leva só resultado e status: corpo da resposta e segredo não.
- O gateway devolve `{ review }` (o `canhotoReview` que o servidor gravou), que a rotina usa para
  contar `approved` e `pending` sem recalcular o veredito.

Mutações (restaurada a cada uma; suíte de 35):

| Mutação                        | Resultado                                         |
| ------------------------------ | ------------------------------------------------- |
| `action: 'approve'` no corpo   | 33 pass / **2 fail** (corpo exato e quatro nulls) |
| margem de 30 s zerada          | 34 / **1** (`reuses the token until 30 seconds`)  |
| 409 sai de `report_rejected`   | 34 / **1**                                        |
| 403 sai de `api_unauthorized`  | 34 / **1**                                        |
| 401 não descarta o token       | 34 / **1**                                        |
| exceção de `fetch` escapa crua | 34 / **1** (`api_unreachable`)                    |
| `null` omitido do corpo        | 34 / **1** (`four explicit nulls`)                |

Restaurado: **35 / 0**.

Não rodou: chamada real à API ou ao Keycloak (o `fetch` é injetado nos testes; a ponta a ponta com a
rota real é da T6.9, que ainda fala com um gateway falso, não com o HTTP).

## T6.6 / T6.7 (rotina) — o laço: tetos, parada, falha contada, quando a tentativa é gravada

Teste antes: `canhoto-read-routine.contract.ts` vermelho (`Cannot find module .../canhoto-read.routine.js`,
0 pass / 1 fail / 1 error). Depois, com `application/canhoto-read.routine.ts`:
`canhoto-read.contract.test.ts` **59 pass / 0 fail / 0 skip** (35 + 24) e `build-entrypoints`
2 pass — os dois juntos, 61 / 0. `tsc --noEmit`, `eslint` (cwd da app) e `prettier` limpos.

O que o laço faz (e o contrato prende):

- Lotes de 10 (`CANHOTO_READ_BATCH_SIZE`), teto de 40 por ciclo; `excludeProofIds` cresce a cada lote,
  então a falha de infraestrutura — que continua na fila — não volta no mesmo ciclo. Lote curto
  encerra o laço (a fila secou).
- `isStopRequested()` é lido antes de cada lote **e** antes de cada comprovante.
- Um comprovante ruim não derruba os outros: o ciclo sempre fecha `succeeded` e a falha vira contador
  (`objectUnavailable`, `unsupportedMedia`, `tooLarge`, `decodeTimeout`, `apiUnreachable`,
  `reportRejected`, `apiUnauthorized`, `unexpectedErrors`). Todos os contadores saem sempre, com zero.
- Tentativa (`markAttempted`) só quando a leitura terminou **sem** código utilizável; nesse caso
  nenhuma chamada à API. Falha de infraestrutura, 4xx e 401/403 não gravam.
- Sentry: `report_rejected`, `api_unauthorized` e exceção inesperada. `api_unreachable` não é
  incidente nosso e não vai.
- O que sobe à API são exatamente os quatro campos de leitura; `approved`/`pending` são só contados a
  partir do `review` que o servidor devolveu.

Mutações (restaurada a cada uma; suíte de 59):

| Mutação                                             | Resultado                      |
| --------------------------------------------------- | ------------------------------ |
| teto de ciclo de 40 vira 1000                       | 57 pass / **2 fail**           |
| sem checagem de parada por comprovante              | 58 / **1**                     |
| grava a tentativa também na falha de infraestrutura | 55 / **4** (uma por resultado) |
| não grava a tentativa quando não há código          | 57 / **2**                     |
| `api_unreachable` passa a ir para o Sentry          | 58 / **1**                     |
| `CanhotoReviewApiError` tratado como inesperado     | 53 / **6**                     |
| sem `excludeProofIds` (a falha voltaria no ciclo)   | 58 / **1**                     |
| sem o encerramento por lote curto                   | 58 / **1**                     |
| exceção inesperada de um comprovante escapa         | 58 / **1**                     |
| um campo `review` extra no que se reporta           | 57 / **2**                     |
| contagem `approved` invertida                       | 58 / **1**                     |

Restaurado: **59 / 0**. A primeira tentativa da mutação do teto (remover a condição) entrou em laço
infinito — `limit` ficava negativo e o `slice` devolvia fila —; foi abortada, restaurada, e refeita
trocando 40 por 1000, que é a mutação que vale.

Não rodou: a ligação em `main.ts` (próximo commit), o contrato de log (T6.8) e as integrações
(T6.9/T6.10).

## T6.7 (ligação) — a rotina entra em `main.ts`

`main.ts` registra `trip.canhoto.read` em `routines:` com `createStorageAttachmentReaderGateway` (o
mesmo da extração de anexos, nenhum segundo gateway), `createThreadedCanhotoBarcodeDecoder`,
`createDrizzleCanhotoReadQueue`, o gateway da rota do robô e o `errorTracker`. Como
`whatsapp.command.settle`, só entra com `config.mdfeAutoIssue` declarado: sem o crachá do worker a
janela pousa em `job_run_routine_missing`, em vez de ler foto que ninguém poderia reportar.

`tsc --noEmit` e `eslint src/main.ts` limpos; `bun run test` do worker inteiro: **1519 pass / 0 fail**
em 95 arquivos (0 skip declarado pela saída). Não há teste que exercite o registro de rotinas de
`main.ts` (nenhuma rotina tem); a prova de que o registro existe é o tipo (`JobRoutineRegistry`) e a
integração T6.9/T6.10, que usam a rotina com o mesmo `createDrizzleCanhotoReadQueue`.

⚠️ O `createCanhotoReviewApiGateway` não tem timeout de `fetch` (igual ao do MDF-e): API pendurada
poderia segurar um ciclo. Fica registrado, não corrigido aqui.

## T6.8 — contrato de log (CA15)

`canhoto-read-log.contract.ts`: um ciclo de seis comprovantes com **todo** tipo de falha (objeto
ausente, exceção com nome, CPF, endereço e marcador de bytes na mensagem, leitura sem código, 400 da
API, API fora, leitura que casa) e o logger capturando as quatro linhas possíveis. Afirma: nenhuma
linha contém a chave de acesso, o número da nota, nome, CPF, endereço ou os bytes; toda chave de
metadata está numa lista de permissão (id opaco, código, booleano, contagem); o resumo do ciclo traz
as contagens e os ids de correlação/execução; a falha de um comprovante sai por `proofId` + resultado,
nunca pela mensagem do erro.

Nasceu verde (a rotina já loga assim desde a T6.7), então a prova é por mutação — suíte de 63:

| Mutação                                        | Resultado            |
| ---------------------------------------------- | -------------------- |
| texto do erro vira o "resultado" do log        | 61 pass / **2 fail** |
| número lido (`12345`) entra no resumo do ciclo | 61 / **2**           |
| `objectKey` entra no log de falha              | 61 / **2**           |
| `proofId` sai do log de falha                  | 62 / **1**           |

Restaurado: **63 / 0 / 0 skip**; `tsc`, `eslint` e `prettier` limpos.

⚠️ O que o log não cobre: a **exceção inesperada vai crua ao Sentry** (`captureException(error)`), com a
mensagem que a biblioteca de origem escreveu. A garantia ali é o `scrubSentryEvent` do
`observability/sentry.service.ts`, não esta rotina — não foi exercitada aqui.

## T6.9 — integração do ciclo (CA10, CA11)

`test/integration/canhoto-read-cycle.integration.ts` (+ `test/fixtures/canhoto-access-key.fixture.ts`,
que monta chave de NF-e com dígito do módulo 11 válido). Doze canhotos pendentes numa viagem, contra
Postgres de verdade (fila, casamento com as notas da viagem e carimbo são os adaptadores reais).
Fotos: 8 trazem a chave da própria nota, 2 a de **outra nota da mesma viagem**, 2 a de nota **fora**
da viagem. Afirma: 8 `approved` com origem `automatic`; 4 `pending` **com o número lido**, fonte
`barcode`, origem nula; nenhum `rejected`; contadores `approved 8 / pending 4 / reported 12`; o
worker reportou só os quatro campos, um relato por comprovante, cada um para o próprio documento; o
**segundo ciclo** não baixa, não reporta e deixa as doze linhas idênticas (`proofsSeen 0`).

⚠️ O veredito **não é real**: a regra `resolveAutomaticVerdict` mora na API e nenhuma app importa
código de outra. O `serverEmulator` do teste a reproduz em SQL (casou documento **e** número ⇒
`approved`/`automatic`). Não houve HTTP nem Keycloak. A regra em si só é provada nos testes da API.
O decodificador também é dublê (a "foto" é o texto da chave): o real é prova da T6.4 e da T6.10.

Não nasceu vermelho — a rotina e a fila já existiam. Prova por mutação (suíte de 3, Postgres
nativo 18 descartável, `DATABASE_URL` explícita):

| Mutação                                                  | Resultado                                     |
| -------------------------------------------------------- | --------------------------------------------- |
| rotina reporta `readDocumentId: null`                    | 2 pass / **1 fail**                           |
| fila sem o predicado `canhoto_read_source is null`       | 2 / **1**                                     |
| rotina reporta `readNumber: null`                        | 1 / **2**                                     |
| rotina reporta `readSource: 'manual'`                    | 1 / **2**                                     |
| rotina manda campo extra `verdict` no relato             | 2 / **1**                                     |
| fila sem o predicado `canhoto_read_attempted_at is null` | 3 / 0 (**sobrevive**; é da T6.10)             |
| fila sem o filtro `kind = 'photo'`                       | 3 / 0 (**sobrevive**; só há fotos no cenário) |

Restaurado: **3 pass / 0 fail**. `tsc`, `eslint`, `prettier` limpos.

## T6.10 — integração da convergência (CA17)

`test/integration/canhoto-read-convergence.integration.ts`. Aqui o decodificador
(`createThreadedCanhotoBarcodeDecoder`, worker_thread + zxing) e o leitor de imagem são os **reais**,
com JPEG de câmera de 12 MP (`REALISTIC_CAMERA_PHOTO`); só o armazenamento (contador de downloads) e a
API (grava a leitura) são dublês. Dois canhotos: um **sem** código de barras e um com a chave
`35240912345678000199550010000123451876543212`. Ciclo 1: o sem código é baixado **1 vez**,
`canhoto_read_attempted_at` fica gravado, a análise segue `pending`, sem fonte nem número, e não
há relato; o com código é decodificado de verdade e reportado com `readNumber 12345`, série `1`,
`barcode`, documento da própria viagem. Ciclo 2: `proofsSeen 0`, o sem código **continua com 1
download** (CA17), nenhum relato novo.

| Mutação                                               | Resultado           |
| ----------------------------------------------------- | ------------------- |
| fila sem `canhoto_read_attempted_at is null`          | 2 pass / **1 fail** |
| rotina não carimba a tentativa (`markAttempted` mudo) | 1 / **2**           |
| fila sem `canhoto_read_source is null`                | 2 / **1**           |

Restaurado: **3 pass / 0 fail**. Junto com `canhoto-read-queue.integration.ts` e a do ciclo:
**15 pass / 0 fail** com `DATABASE_URL`; **sem** `DATABASE_URL` os mesmos três arquivos reportam
**21 skip / 0 pass** (pular não é passar). `tsc`, `eslint`, `prettier` limpos.

Ambas registradas em `test:integration` do `package.json` do worker. Não rodou: RabbitMQ/MinIO
(nenhum teste novo precisa), `make check`, `make migration-test` (sem migration), deploy.

## Fase 7 — Documentação viva e fechamento

### T7.1 — documentação viva em três arquivos

`docs/ai-context/worker-transportada.md`: rotina `trip.canhoto.read`, o laço com tetos (lote 10, 40 por
ciclo, 8 MB), `worker_thread` de decodificação (ADR-0053), índice parcial da fila e **por que os três
predicados saem como literal SQL** (Postgres só prova implicação de predicado sobre `quals` em forma
literal; com `eq()` o índice é ignorado em silêncio), e a regra de parada (tentativa gravada só quando
leitura terminou sem código; falha de infraestrutura merece próximo ciclo; apenas `report_rejected` e
`api_unauthorized` vão ao Sentry).

`docs/ai-context/api-transportada.md`: rota do robô `PATCH /trips/:tripId/documents/:documentId/proof/review/automatic`,
permissão `trip.canhoto-auto-review` (só no papel `automation`, serviço-apenas, não-cedível),
quatro campos de leitura (`readDocumentId`, `readNumber`, `readSeries`, `readSource`) com schema
`.strict()` e `nullable()` obrigatório, e o fato de que **veredito não sai do servidor** —
`resolveAutomaticCanhotoReview` na API, trabalhador reporta só o que leu.

`CLAUDE.md` da raiz: parágrafo operacional sobre canhoto lido sem abrir viagem e maço de aprovação no
painel.

### T7.2 — `evidence.md` fechado com contagens e pendências

**Fechamento das Fases 1–6:** todas as tarefas entregues, comprometidas com:

- Fase 1: rota em lote, permissão `fleet.read`, 8498 pass / 23 skip / 0 fail (contrato), 705 pass /
  3 skip / 0 fail (integração).
- Fase 2: maço com seleção, diálogo com fotos e caixas, fórmula de aprovação com `runFieldActionQueue`,
  falha parcial remarca só o que falhou, 6191 pass / 0 fail.
- Fase 3: rota do robô com `.strict()`, permissão em três listas, trilha por comprovante só no robô
  (`channel: 'service'`), 8521 pass (contrato, sem Postgres), 102 pass (integração canhoto-review).
- Fase 4: spike de decodificador (`@jsquash` em `worker_thread`), decisão `@jsquash` + `@zxing/library`
  pinado na versão do painel, 6 pacotes instalados.
- Fase 5: `trip.canhoto.read` nas quatro cópias do catálogo, migration com coluna e índice, paridade no
  contrato (`13 pass`), `make migration-test` contra Postgres nativo (115 pass, rollback validado).
- Fase 6: régua de chave (15 pass contrato), decodificador real com foto de 12 MP (27 pass), gateway
  autenticado (35 pass), laço com tetos e parada (59 pass), log sem PII (63 pass), ciclo contra
  Postgres (3 pass), convergência com carimbo de tentativa (3 pass).

**Pendências explícitas, não corrigidas nem documentadas:**

- T6.9: testa contra emulador SQL (`serverEmulator`), não HTTP; regra de decisão só provada em testes
  da API, não aqui.
- Carimbo da tentativa: escrito pelo worker em SQL guardado, não pela API. Decisão pendente do usuário
  sobre o arquivo adequado.
- `make migration-test`: Docker indisponível na rodada (não é defeito da branch). Rodado contra Postgres
  nativo 18.4 descartável; CI usa versão do `compose.yaml`.
- EXPLAIN do índice: com `enable_seqscan=off` em tabelas quase vazias, Postgres 18 nativo, não CI. Prova
  que o índice **serve** o predicado, não que o planejador o prefere sob volume. Sem Postgres, o teste
  pula (25 skip).
- `createCanhotoReviewApiGateway`: sem timeout de `fetch`. API pendurada poderia segurar um ciclo.
  Registrado (comentário no código), não corrigido aqui. Igual ao de MDF-e (precedente).
- Nada exercita o registro da rotina em `main.ts` — nenhuma rotina tem teste que exercita o registro.
  Prova: tipo (`JobRoutineRegistry`) + integração T6.9/T6.10, que usam a rotina pela mesma porta.
- `config.mdfeAutoIssue`: nome velho (config é genérica: `API_BASE_URL`, `KEYCLOAK_TOKEN_URL`,
  `WORKER_CLIENT_ID`, `WORKER_CLIENT_SECRET`). Reutilizar está correto em substância; é só o nome do
  campo que mente. Não corrigido para não mexer em MDF-e.
- Propriedades `too_large` e `unsupported_media`: permanentes do objeto, **não** carimbadas;
  em teoria podem ocupar teto do ciclo para sempre. Severidade baixa: app do motorista corta foto em
  960 KB / 2000 px, então >8 MB fora do caminho. Decisão em `plan.md:197`.
- Tela do maço: 82 paradas de Tab com 40 notas (duas por item + rodapé); `roving tabindex` ficou de
  fora, decisão pendente do usuário.
- `?documentIds=` existe na API mas nenhum chamador de produção usa — painel anda na leitura
  compartilhada por `tripId`. Mantido de propósito como a superfície que RF-A1 definiu.

**Provas de mutação fechadas (Fase 6):**

- Fila sem `and p."canhoto_read_attempted_at" is null` → **5 fail / 10 pass** integração.
- Carimbar sempre, em vez de só quando sem código → **8+ fail** contrato, **5 fail / 1 pass** integração.

**Contagens reais de tests (já registradas acima, resumo para fechamento de Fase 7):**

- Contrato do worker: **1523 pass / 0 fail / 4034 expect() em 95 arquivos**.
- Integração do canhoto (três arquivos, fila + ciclo + convergência): **15 pass / 0 fail / 86 expect()**.
- Sem `DATABASE_URL`: **21 skip / 0 pass** (pular não é passar).

### T7.4 — o que foi medido nesta sessão, e não só afirmado

**O índice parcial é prova por EXPLAIN, com `enable_seqscan=off` nos dois casos.** O ponto não é a
preferência do planejador, é a capacidade:

- predicado em **literal** → `Index Scan using trip_delivery_proofs_canhoto_pending_idx`,
  `Filter: (kind = 'photo'::text)`.
- os mesmos valores como **parâmetro**, em plano genérico forçado → `Seq Scan on trip_delivery_proofs p`,
  `Disabled: true`, `Filter: (... kind = $1 AND (canhoto_review)::text = $2)`.

`Disabled: true` é o detalhe que decide: o seq scan estava **desligado**, logo o planejador não tinha
alternativa utilizável. É incapacidade de provar a implicação, não escolha de custo — e é exatamente o
que `eq()` com valor JS produziria.

**A ida e volta da migration, contra Postgres 18.4 nativo descartável** (Docker indisponível; é a
substância do `make migration-test`, não o alvo literal):

| Passo          | journal | índice | rotina em `job_schedules` | coluna `canhoto_read_attempted_at` |
| -------------- | ------- | ------ | ------------------------- | ---------------------------------- |
| 264 migrations | 264     | 1      | 1                         | 1                                  |
| `rollback.sql` | 263     | 0      | 0                         | 0                                  |
| reaplicação    | 264     | 1      | 1                         | 1                                  |

Depois do rollback, `job_schedules_job_check` volta com **zero** menções a canhoto, e `db:generate`
responde `"no_changes"` — o schema do código e o do banco batem.

As outras quatro colunas `canhoto_read_*` **sobrevivem** ao rollback de propósito: são da migration
`20260930145144_delivery_proof_canhoto_review` (spec 220). A desta spec acrescenta uma coluna só.

**Suíte com dentes, provada por mutação e revertida** (árvore limpa depois das duas):

- tirar `and p."canhoto_read_attempted_at" is null` de `QUEUE_PREDICATE` → **10 pass / 5 fail**.
- carimbar sempre, não só quando a leitura termina sem código → 8 contratos nomeados vermelhos e
  **1 pass / 5 fail** na integração.

**Gates em primeiro plano:** `typecheck` e `lint` verdes em `worker-transportada`, `api-transportada` e
`frontend-transportada`.

**`make check` na raiz — exit 0, nenhum `fail` em nenhuma suíte:**

| Suíte                                | Resultado                    |
| ------------------------------------ | ---------------------------- |
| Contrato da API                      | 8523 pass / 32 skip / 0 fail |
| Contrato do worker                   | 1523 pass / 0 fail           |
| Contrato do cron                     | 101 pass / 0 fail            |
| Contrato do painel                   | 6202 pass / 0 fail           |
| Hooks com DOM (painel)               | 219 pass / 0 fail            |
| `frontend-client`                    | 945 pass / 0 fail            |
| `frontend-driver`                    | 131 pass / 0 fail            |
| `format:check`, `lint`, `typecheck`  | verdes                       |
| `build` das quatro apps de interface | verde                        |

Os 32 skips do contrato da API são os testes guardados por `DATABASE_URL`, que o comando de contrato
não define de propósito — é o comando de integração que os cobre, e lá eles rodaram.

**Integração da API — 713 pass / 4 skip / 0 fail**, 3888 `expect()`, 143 arquivos, 475 s, exit 0. Os
143 arquivos são exatamente a lista do `package.json`. Os 4 skips são de `toll-booth-reload` e
`trip-occurrence-upload-confirm`, os dois guardados por storage alcançável (MinIO fora, Docker
indisponível) — nenhum deles de canhoto.

⚠️ `make check` e a integração rodaram como comando de fundo **rastreado**, com log completo e código
de saída coletados, não em primeiro plano literal. A exigência do `tasks.md` existe contra gate que
morre calado (`nohup` perdido); aqui o resultado inteiro está no log, e é ele que está transcrito
acima.

## T7.3 — a revisão final, e o que ela mudou

Cinco achados. Dois viraram código, três estão abaixo com a medida que justifica não mexer. Nenhum
`Promise.all` capaz de derrubar lote (§15), nenhuma string repetida sem constante (§16), cabeçalho
de copyright em todo arquivo novo (§17), nenhum PII em log.

⚠️ **Relatório de revisão não é evidência.** Os dois consertos foram provados por mutação: desfazer
o conserto tem de pintar o teste de vermelho, senão o teste não prende nada.

### 1 — a thread do canhoto confundia "não achei código" com "o decodificador não carregou"

`readBarcodeText` tinha **um** `try` em volta do `await decodeImage(...)`, e dentro dele os três
`await import('@jsquash/...')`. Módulo ausente ou binário wasm quebrado caía no mesmo `catch { return
null }` de uma foto sem código de barras. A consequência foi conferida até o fim, não suposta:
`null` → `identification.kind === 'unusable'` → `markAttempted` → `canhoto_read_attempted_at`
gravado → o comprovante **sai da fila para sempre**, com o ciclo fechando `succeeded` e sem nada no
Sentry. Em toda foto, não numa.

O conserto é a fronteira, não um `catch` a mais: a carga do decodificador saiu de dentro do `try`
(módulo que não resolve propaga), e `WebAssembly.CompileError`/`LinkError` são relançados.
`RuntimeError` ficou **de fora de propósito** — ele é plausivelmente dependente da entrada, e
relançá-lo faria uma foto corrompida voltar à fila para sempre.

`await init()` foi considerado e descartado por leitura da fonte dos pacotes: em `@jsquash/jpeg` e
`@jsquash/webp` o `init()` não dá `await` no módulo emscripten, então a falha de instanciação só
aparece depois, dentro do `decode` — pareceria garantia de carga antecipada entregando-a só no png.

Para o contrato poder exercitar comportamento em vez de afirmar texto da fonte, o carregador virou
dependência injetada (`ImageDecoderLoader`), e a execução no thread ficou atrás de `parentPort !==
null`. Seis testes em `test/canhoto-read/canhoto-barcode-worker.contract.ts`.

### 2 — vinte entregas da mesma viagem eram vinte consultas iguais (§15, N+1)

`listTripDocuments` era chamado por comprovante. `listPending` ordena por `created_at` e o motorista
sobe os canhotos de uma viagem em sequência — então o caso comum era o pior: 40 comprovantes num
ciclo, até 40 consultas da mesma lista de notas.

Memoizado **por lote**, não por ciclo, e a diferença é segurança, não estilo: o lote é fixado por um
`SELECT` antes de qualquer consulta de notas, então nenhum comprovante dele pode ser mais novo que o
cache. Guardado por ciclo, uma nota criada entre dois lotes deixaria o comprovante dela sem
candidato — e "sem código" carimba a tentativa e tira o comprovante da fila para sempre, o mesmo
defeito do achado 1 por outra porta.

### As quatro mutações

| Mutação                                           | Esperado                     | Medido          |
| ------------------------------------------------- | ---------------------------- | --------------- |
| cache nunca consultado (N+1 volta)                | os dois testes de N+1 falham | 2 fail, 70 pass |
| `isBrokenWasmModule` devolve `false`              | compile + link falham        | 2 fail          |
| carga do decodificador volta para dentro do `try` | módulo ausente falha         | 1 fail          |
| cache promovido do lote para o ciclo              | "não cruza lotes" falha      | 1 fail          |

### 3 — `decode_timeout` fora do Sentry: achado real, deixado como está

A revisão pediu `decode_timeout` em `SENTRY_OUTCOMES`. **O conserto proposto é inócuo**, conferido na
fonte: `recordFailure` só captura com `input.error !== undefined`, e o caminho do timeout não passa
erro algum, porque `canhoto-image-reader.service.ts` descarta o `CanhotoDecodeTimeoutError` ao
converter em `{kind:'failed', outcome:'decode_timeout'}`. A versão que funcionaria mexe no tipo de
resultado do leitor e em duas asserções existentes.

Não foi feito, por três medidas: (a) o comportamento é **afirmado de propósito** por um teste da T6.6,
que agrupa o timeout com `object_unavailable`/`unsupported_media`/`too_large` e exige
`captured` vazio; (b) o timeout **não é silencioso** — `canhoto_read_cycle_finished` publica
`decodeTimeout: N` em todo ciclo; (c) a volta eterna à fila é a regra da T6.6 (falha de
infraestrutura não carimba), não um defeito. Trocar uma decisão afirmada em teste é escolha do
usuário, não de quem revisa.

### 4 — o catálogo declara cinco desfechos que o ciclo nunca reporta

`failureOutcomes` de `trip.canhoto.read` lista cinco falhas, e `runCycle` devolve `succeeded`
incondicionalmente — nenhuma delas chega a `job_runs.outcome`. Esvaziar a lista é a declaração
honesta de hoje, mas o catálogo é **cópia por valor do da API, com contrato de paridade**: medido,
esvaziar só a cópia do worker reprova dois contratos (`matches the API catalog` e
`offers each routine the lifecycle codes plus its own failures`). Mudança nas duas apps por uma
declaração sem efeito em runtime, e a lista também se lê como vocabulário permitido, não como
previsão. Ficou o aviso no próprio catálogo, dizendo que os cinco não chegam lá hoje.

### 5 — `^` nos três `@jsquash` ao lado de `@zxing/library` pregado em `0.23.0`

Não mexido: o `bun.lock` é commitado e a CI usa `--frozen-lockfile`, então a resolução é a mesma em
toda máquina. Pregar as versões é decisão de política de dependência da instalação inteira, não desta
spec.

### Gates

| Comando                                       | Resultado                                                   |
| --------------------------------------------- | ----------------------------------------------------------- |
| `bun run --cwd apps/worker-transportada test` | **1532 pass / 0 fail**, 4045 `expect()`, 95 arquivos, 9,9 s |
| `bun run typecheck` (worker)                  | verde                                                       |
| `bun run lint` (worker)                       | verde                                                       |

A linha `Not a JPEG file: starts with 0x07 0x07` no log é o teste de bytes indecodificáveis da
thread real, que segue respondendo `null` — ela é a prova de que o caminho `parentPort !== null`
continua carregando o decodificador e postando mensagem.

## O ADR virou 0092 no rebase

A spec 223 publicou `docs/adr/0091-o-painel-conclui-sem-canhoto-e-o-canhoto-vira-divida.md` em
staging enquanto esta branch estava fora, e o nosso ADR também era 0091. Nomes de arquivo
diferentes, então o git não conflita — dois ADRs com o mesmo número passariam direto.

O nosso renumerou, porque o outro já está publicado: `0092-o-canhoto-e-lido-sem-ninguem-abrir-a-viagem.md`,
com as dez referências `ADR-0091` desta spec reescritas (worker, rota do robô, política de
autorização, `useAuthMe`, e os documentos da spec). As treze referências restantes no repositório
são da 223 e ficaram intactas — a separação foi medida por
`git diff origin/staging...HEAD`, não a olho.

A migration não colidiu: `20261002120000_trip_canhoto_read_job` é mais nova que a última de staging
(`20261001123700_event_location_stamp`), e a 223 não trouxe migration.

## O rebase pediu seis resoluções, e cinco eram listas

| Arquivo                                        | Conflito                              | Resolução                        |
| ---------------------------------------------- | ------------------------------------- | -------------------------------- |
| `api .../trip-delivery-proof.contract.test.ts` | dois imports novos de suíte           | união                            |
| `api/package.json` (`test:integration`)        | duas listas de arquivos de integração | união calculada                  |
| `painel .../trip-hooks.contract.test.ts`       | dois imports novos de suíte           | união                            |
| `painel .../trip.locale.json` (×2 idiomas)     | duas levas de chaves novas            | união                            |
| `painel .../useTripWorkspace.hook.ts`          | duas mutações novas no mesmo ponto    | as duas                          |
| `painel .../TripStateActions.component.tsx`    | duas props e dois botões novos        | os dois, condição de 3 cláusulas |

⚠️ Os dois primeiros são a armadilha conhecida: escolher um lado **remove testes da lista explícita**
e eles simplesmente deixam de rodar, com o verde continuando verde. A união do `package.json` foi
calculada por script (`+1 nosso`, `5 de staging preservados`), não escolhida no editor.

A sétima resolução não apareceu como conflito, e foi a única que reprovou o gate: a 223 passou
`isBatchDeliverPending` e `onBatchDeliver` a **obrigatórios** em `TripStateActionsProps`, e o
`makeProps` de `test/trip-hooks/canhoto-batch-action.contract.ts` é anterior a eles. Git fundiu sem
queixa — arquivos diferentes — e o `tsc` reprovou com `TS2739`. Os dois props entraram no arnês e o
gate fechou:

| Gate                      | Resultado                                                               |
| ------------------------- | ----------------------------------------------------------------------- |
| `make check` (pós-rebase) | **exit 0** — format:check + lint + typecheck + test + build             |
| Testes do `make check`    | 0 fail nos dez pacotes; 8531 (api) · 6214 (painel) · 1532 · 945 · 223 … |
| Lint                      | 0 erros, 16 avisos `react-hooks/exhaustive-deps` todos pré-existentes   |
| `make migration-test`     | verde em T7.4; o rebase não tocou `apps/api-transportada/drizzle/`      |
