
## T103 — schema, repositório e use-case leem e gravam os dois campos

```
$ bunx tsc --noEmit                        # sem saída
$ bunx eslint src test drizzle.config.ts   # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7185 pass · 23 skip · 0 fail · 24250 expect() · 183 arquivos [34.43s]
$ bun --env-file=../../.env.test run test:integration
 566 pass · 7 skip · 0 fail · 105 arquivos [785.89s]
```

⚠️ A primeira execução da integração foi descartada: dois processos rodavam contra o mesmo banco de
teste (um meu, um do agente), e resultado de suíte concorrente não é evidência. Os números acima são
de uma execução única, com os outros processos encerrados.

## T200 — chave de idempotência na ocorrência do motorista

`registerDriverOccurrence` não tinha chave de idempotência (RF13, revisão de arquitetura de 23/09).
A escrita mora agora dentro de `DriverFieldReportUnitOfWork.execute` + `withFieldReport`, reservando
e liquidando a chave na mesma transação da escrita — o padrão que `/deliver`, `/return` e a
ocorrência de parada já usam. Dois métodos novos em `DriverFieldReportTransactionPort`
(`saveDocumentOccurrence`, `findDocumentOccurrenceById`), implementados reaproveitando
`saveTripOccurrence` (o mesmo `insert` que o escritório usa) dentro da transação. A rota
(`me-trip.routes.ts`) passa a ler a chave com `parseIdempotencyKey(request)`; o caminho do WhatsApp
(`register-driver-flow-actions.ts`) gera a chave com `randomUUID()`, como `reportDelivery`/
`reportReturn` já fazem ali.

```
$ bunx tsc --noEmit                        # sem saída
$ bunx eslint src test drizzle.config.ts   # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7187 pass · 23 skip · 0 fail · 24253 expect() · 183 arquivos [28.17s]
$ bun --env-file=../../.env.test run test:integration
 566 pass · 7 skip · 0 fail · 3272 expect() · 105 arquivos [705.33s]
```

Execução única, em primeiro plano, sem suíte concorrente.

## Bloqueio antes de T201/T202 — upload direto ao storage (RF2)

Levantamento no repositório (`grep` por `getSignedUrl`/`createPresignedPost`/`PutObjectCommand` em
`apps/api-transportada/src`): **nenhum caminho de upload assinado existe hoje.** O único gateway de
storage (`NfeStorageGateway`, sobre `@adatechnology/object-storage-provider`) expõe
`put/get/head/delete/createSignedDownload` — não há `createSignedUpload` nem equivalente. Construir
um exigiria estender o pacote `@adatechnology/object-storage-provider` (fora deste repositório, em
`~/Documents/personal/adatechnology-packages`) e desenhar como o servidor confere tipo/tamanho/sha256
de um objeto que ele nunca viu em bytes — hoje `stored_objects.sha256`/`size_bytes` são `not null` e
só existem depois do upload, o que não combina com criar a linha antes de emitir a URL. A revisão de
arquitetura de 23/09 (`architecture-review.md`) não avaliou esta parte porque assumia multipart; isto
é desenho novo, com implicação de segurança (RF2b), e por isso parei aqui para pedir a decisão em vez
de inventar o formato do endpoint de confirmação sem revisão.

## T201/T202 — upload direto ao storage por URL assinada

```
$ bunx tsc --noEmit                        # sem saída
$ bunx eslint src test drizzle.config.ts   # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7205 pass · 0 fail
$ make migration-test
 110 pass · 0 fail  (inclui trip_occurrence_uploads, com rollback ida-e-volta)
$ bun --env-file=../../.env.test run test:integration
 566 pass · 7 skip · 0 fail · 105 arquivos [648.80s]
```

⚠️ Duas execuções anteriores da integração foram descartadas: a primeira competia com um processo do
subagente, a segunda morreu junto com o encerramento dele. A terceira rodou destacada (`nohup`), sem
concorrência — é a que vale.
