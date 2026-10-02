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
