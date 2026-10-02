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
