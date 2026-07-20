# Plano técnico — Importação e distribuição de NF-e

## Contexto e evidência

O desenho parte dos contratos instalados de
`@adatechnology/fiscal-provider@0.1.0`:

- `importarNfeXml(xml: string): DfeItem`;
- `NfeDistribuicaoProvider.consultarDFe`, `consultarPorNsu`,
  `consultarPorChave` e `importarXml`;
- cursor inicial `000000000000000`, páginas de até 50 e continuidade por
  `temMais`;
- `NfeDistribuicaoConfig` exige CNPJ, UF, ambiente e certificado A1 em memória.

`DfeItem` contém XML e resumo, mas não todos os participantes, endereços,
produtos, volumes, protocolo e valores necessários ao domínio. O checkout local
também não possui teste público de NF-e. A evolução começa no package Ada com
contrato aditivo e fixture sintética.

O projeto já possui:

- contexto autenticado/tenant e permissões `invoices.import`/`invoices.read`;
- router modular sobre `Bun.serve`;
- PostgreSQL/Drizzle e idempotência tenant-scoped;
- `@adatechnology/rabbitmq-provider` com publisher confirm, prefetch, retry/DLX,
  DLQ e shutdown;
- RabbitMQ e MinIO locais no Compose;
- frontend React/Vite/TanStack Query/i18n/PWA;
- Makefile `make up`, `make dev`, `make check`, `make smoke` e `make down`.

Ainda não existem storage provider, outbox real, idempotência persistente no
worker, schemas/rotas NF-e ou consumers operacionais.

## Decisões arquiteturais

### 1. Evolução do package fiscal

O package Ada ganhará um resultado discriminado e normalizado para importação
de NF-e. A evolução deve ser estruturalmente compatível com `DfeItem`: callers
que usam o resumo continuam válidos, enquanto o TransportAdA consome a nova
parte tipada.

Contrato alvo conceitual:

```ts
type ImportedNfeXml =
  | {
      readonly kind: 'authorized-nfe'
      readonly summary: DfeItem
      readonly document: NfeDocumentData
    }
  | { readonly kind: 'unsigned-nfe'; readonly summary: DfeItem; readonly document: NfeDocumentData }
  | { readonly kind: 'nfe-event'; readonly summary: DfeItem; readonly event: NfeEventData }
```

O nome e a forma final serão fixados pelo contract test do package, sem alterar
silenciosamente `importarNfeXml`. O contrato:

- preserva strings decimais, não converte dinheiro/peso para `number`;
- valida chave de 44 dígitos e sua coerência com o XML;
- expõe participantes e `relatedCnpjs` canônicos;
- distingue `nfeProc`, `NFe` e `procEventoNFe`;
- rejeita DTD/ENTITY e conteúdo fora do limite antes do parse;
- não executa rede nem acessa certificado na importação local;
- não importa internals `src/sefaz` no TransportAdA.

### 2. Provider reutilizável de object storage

Será criado `@adatechnology/object-storage-provider` em
`adatechnology-packages`. A API pública será pequena, Bun-first e S3
compatível:

```ts
interface ObjectStorageProvider {
  put(input: PutObjectInput): Promise<StoredObject>
  get(input: GetObjectInput): Promise<ReadableStream<Uint8Array>>
  head(input: HeadObjectInput): Promise<StoredObject | undefined>
  delete(input: DeleteObjectInput): Promise<void>
  createSignedDownload(input: SignedDownloadInput): Promise<URL>
  health(): Promise<{ readonly status: 'up' | 'down' }>
}
```

O contrato exige:

- bytes/stream, `contentLength`, MIME e SHA-256 verificado;
- `put` com modo obrigatório `create-only`/`If-None-Match: *`, erro tipado de
  objeto existente e nenhuma operação implícita de overwrite;
- bucket e key validados sem path traversal;
- endpoints MinIO/AWS S3, path-style configurável e credenciais somente por
  ambiente;
- upload que não retorna sucesso antes da confirmação;
- erros estáveis sem bucket, chave ou credencial em mensagens/logs;
- download assinado curto como capacidade do provider, mas a rota inicial
  transmite pela API após autorização e não entrega URL pública.

### 3. Staging, normalização e original imutável

A API autentica e autoriza antes de ler o body. Cada request recebe limites
configuráveis conservadores:

| Limite inicial                    | Valor local/default |
| --------------------------------- | ------------------- |
| request comprimido total          | 25 MiB              |
| XML individual                    | 5 MiB               |
| arquivos recebidos                | 100                 |
| XMLs expandidos por importação    | 500                 |
| conteúdo expandido total          | 100 MiB             |
| profundidade de ZIP               | 1                   |
| razão máxima expandido/comprimido | 20:1                |

Fluxo:

1. criar `nfe_imports=PENDING` com idempotência/fingerprint tenant-scoped;
2. transmitir cada arquivo para staging usando chave opaca
   `tenants/{companyId}/nfe-imports/{importId}/staging/{objectId}`;
3. calcular SHA-256 durante o stream e registrar `stored_objects`;
4. confirmar `QUEUED` e outbox na mesma transação;
5. se upload/finalização falhar, marcar o processamento e remover/registrar
   staging órfão por compensação idempotente;
6. o worker expande ZIP com limites, processa cada XML e usa o package fiscal;
7. copiar/promover o original com escrita create-only para uma chave imutável
   opaca por documento ou evento; em conflito, o adapter compara o SHA-256:
   mesmo hash é replay, hash diferente é falha fatal;
8. persistir referência + hash antes de concluir o item;
9. objetos staging só são removidos depois da conclusão confirmada.

Nome original é metadado sanitizado e nunca participa da key. O XML não é
reformatado: o SHA-256 se refere aos bytes recebidos para XML direto e aos bytes
exatos da entrada extraída para ZIP.

Um reconciliador no worker reivindica, por lease, registros staging expirados.
Ele remove somente objetos associados a importações `FAILED`/abandonadas ou já
promovidos e registra o tombstone. Staging de job ativo não é removido; objetos
finais nunca entram nesse lifecycle. A correção funciona mesmo sem suporte a
lifecycle nativo do bucket.

### 4. Outbox, exchanges e consumidores

API não publica diretamente como condição de sucesso. Ela grava o agregado e
`processing_outbox` na mesma transação. Um relay no worker reivindica lotes com
`FOR UPDATE SKIP LOCKED`, lease com expiração, publisher confirms e marca
`published_at`.

Topologias independentes:

```text
{QUEUE_PREFIX}.nfe-import.v1.main.exchange
{QUEUE_PREFIX}.nfe-import.v1.main.queue
{QUEUE_PREFIX}.nfe-import.v1.retry.exchange
{QUEUE_PREFIX}.nfe-import.v1.retry.queue
{QUEUE_PREFIX}.nfe-import.v1.dead.exchange
{QUEUE_PREFIX}.nfe-import.v1.dead.queue

{QUEUE_PREFIX}.nfe-distribution.v1.main.exchange
{QUEUE_PREFIX}.nfe-distribution.v1.main.queue
{QUEUE_PREFIX}.nfe-distribution.v1.retry.exchange
{QUEUE_PREFIX}.nfe-distribution.v1.retry.queue
{QUEUE_PREFIX}.nfe-distribution.v1.dead.exchange
{QUEUE_PREFIX}.nfe-distribution.v1.dead.queue
```

Envelope mínimo:

```ts
type ProcessingEnvelopeV1 = {
  readonly eventId: string
  readonly type: 'transportada.nfe.import.requested' | 'transportada.nfe.distribution.requested'
  readonly version: 1
  readonly occurredAt: string
  readonly companyId: string
  readonly actorId: string
  readonly correlationId: string
  readonly payload: { readonly importId: string }
}
```

`companyId` e `actorId` no envelope são claims de roteamento/correlação, nunca
autoridade. O consumer localiza o outbox/agregado por `eventId` + `importId`,
deriva tenant e ator do registro persistido e exige igualdade; divergência é
fatal e não seleciona dados. Não há XML, CNPJ, certificado, erro SEFAZ ou nome
de arquivo no envelope.

Cada consumer:

1. valida envelope estrito sem confiar em tenant/ator recebidos;
2. localiza outbox/agregado por IDs, deriva tenant/ator persistidos e rejeita
   qualquer divergência;
3. abre transação e reivindica agregado/item tenant-scoped;
4. consulta `processed_messages` por `(companyId,consumer,eventId)`;
5. executa efeito externo fora de uma transação longa quando necessário;
6. confirma resultado com version/lease/unique constraints;
7. grava `processed_messages` e commit;
8. retorna ack somente após o commit.

Retry inicial usa backoff configurável de 5 s, 30 s e 5 min. Como o provider
RabbitMQ atual oferece um delay fixo por topologia, o contract do package será
avaliado: ou recebe rotas de retry graduais de modo aditivo, ou o worker
persiste `next_attempt_at` e republica pelo relay. Não se simulará backoff
graduado com loops em memória.

### 5. Distribuição DFe e cursor

O comando de distribuição cria um `nfe_imports` com origem `DISTRIBUTION`.
Antes da rede, o worker:

- carrega perfil fiscal e um certificado A1 ativo da mesma empresa;
- decripta o envelope apenas em memória e zera referências assim que possível;
- adquire lease único por `(companyId,environment)`;
- respeita `next_allowed_at` persistido;
- monta `NfeDistribuicaoConfig` explicitamente.

Para cada página:

1. chamar gateway Ada com o `ultNSU` persistido;
2. armazenar e normalizar itens individualmente;
3. confirmar itens, contadores, `ultNSU` e `maxNSU` na mesma transação;
4. continuar somente quando `temMais=true` e o lease ainda pertence ao job.

Cursor nunca regride. Cada item distribuído persiste seu NSU e ambiente com
unique parcial `(companyId,environment,sourceNsu)`; página repetida ou
sobreposta é absorvida antes de qualquer contador/efeito. Uniques de evento e
documento oferecem uma segunda barreira. Resumo/evento fica em
`nfe_events`/item correlacionável; somente documento completo autorizado
cria/atualiza `nfe_documents` utilizável pelas features seguintes. A janela
equivalente ao `cStat 656` é persistida, pois a proteção do provider é apenas
em memória.

### 6. Aplicações independentes

```text
apps/api-transportada/src/
├── nfe-imports/{domain,application,infrastructure,presentation}
├── nfe-documents/{domain,application,infrastructure,presentation}
├── storage/{application,infrastructure}
└── database/{nfe.schema,processing.schema,storage.schema}.ts

apps/worker-transportada/src/
├── nfe-imports/{domain,application,infrastructure}
├── nfe-distribution/{domain,application,infrastructure}
├── outbox/{application,infrastructure}
├── storage/infrastructure
└── messaging/{processing-envelope.schema,nfe-topology}.ts

apps/frontend-transportada/src/modules/
├── nfe-imports/
└── nfe-documents/
```

API e worker declaram seus próprios ports e schemas locais. Ambos dependem
somente de packages Ada publicados. Nenhum importa `apps/*/src` alheio. O
contrato JSON dos envelopes é duplicado deliberadamente e validado por fixtures
contratuais canônicas, evitando um package específico do monorepo.

## API HTTP

Rotas definidas no `PROJECT.MD`:

```http
POST /nfe-imports/xml
POST /nfe-imports/distribution
GET  /nfe-imports
GET  /nfe-imports/:id
GET  /nfe-imports/:id/items
POST /nfe-imports/:id/reprocess

GET  /nfe-documents
GET  /nfe-documents/:id
GET  /nfe-documents/:id/xml
GET  /nfe-documents/:id/eligibility
```

Esta feature implementa todas exceto a regra fiscal final de `eligibility`: a
rota retorna somente pré-condições estruturais conhecidas
(`authorizedDocument`, `companyRelated`, `hasOriginalXml`) e
`decision='PENDING_FREIGHT_AND_CTE_RULES'`. Ela não inventa CFOP/ICMS/tomador.

Regras:

- `POST` exige `Idempotency-Key`, `invoices.import` e retorna `202`;
- `GET` exige `invoices.read`, paginação cursor/limit e `Cache-Control: no-store`;
- IDs usam parâmetros tipados do router; nenhuma rota aceita `companyId`;
- reprocessamento aceita somente itens/processamentos em estados permitidos e
  cria nova tentativa/outbox;
- upload usa multipart; ZIP/XML são detectados por assinatura/parse, não apenas
  por MIME/extensão;
- erros HTTP são `400`, `401`, `403`, `404`, `409`, `413`, `415`, `422`, `429`
  ou `500/503`, com código interno e correlation ID.

O router atual suporta apenas paths exatos. Antes das rotas NF-e, será evoluído
por contract para parâmetros estáticos tipados, precedência determinística,
decodificação segura e autenticação/autorização antes do parser/body.

## Dados, migration e rollback

Schemas serão separados por domínio e agregados em `database.schema.ts`.
Constraints mínimas:

- unique `(company_id, access_key)` em `nfe_documents`;
- unique `(company_id, import_id, ordinal)` em itens;
- unique `(company_id, import_id, source_sha256, source_entry)` para replay de
  entrada;
- unique parcial `(company_id, environment, source_nsu)` quando `source_nsu`
  não é nulo, para qualquer resumo/documento/evento distribuído;
- unique `(company_id, access_key, event_type, event_sequence)` em eventos;
- unique `(company_id, environment)` em cursores;
- unique `(company_id, consumer_name, event_id)` em mensagens processadas;
- unique `(company_id, event_id)` e índice
  `(company_id,published_at,next_attempt_at,created_at)` no outbox;
- FK composta por empresa entre importação, item, documento, evento e objeto;
- checks de estado, hash hexadecimal, chave NF-e, contador não negativo e
  `processed <= received`;
- triggers append-only para auditoria/eventos onde a regra exigir.

A migration é aditiva e não roda no startup. O rollback manual remove primeiro
consumers/rotas em deploy, depois tabelas filhas, outbox e tabelas raiz. Depois
de existir XML real, rollback de dados é proibido: correção ocorre por
roll-forward e preserva objetos/histórico.

## Segurança e tenant

- autorização ocorre antes de body, query detalhada ou storage;
- toda query e unique de negócio inclui empresa;
- resposta `404` é igual para ausente/cross-tenant;
- XML, PFX, senha, ciphertext, resposta SEFAZ e nomes internos de bucket/key
  entram na lista de redaction;
- parser rejeita construções XML perigosas antes da biblioteca;
- ZIP é inspecionado sem escrever em disco, sem seguir links e com quotas;
- storage usa keys opacas tenant-prefixed e bucket não público;
- staging e objetos finais possuem lifecycle/retention explícitos;
- certificado é obtido e decriptado somente pelo worker de distribuição;
- logs usam IDs, estado, tamanho/faixa e hash truncado quando necessário, nunca
  payload;
- nenhuma fixture real de `example/` ou PFX entra em Git.

## Observabilidade

Métricas:

- imports por origem/estado e duração;
- itens por resultado;
- bytes recebidos/expandidos, sem nomes;
- outbox pendente/idade/claims;
- publish confirm/failure;
- tamanho e idade de main/retry/DLQ por topologia;
- consumer duration/redelivery;
- cursor lag `maxNSU-ultNSU` quando numérico e seguro;
- storage latency/error;
- distribuição vazia/rate-limit/rejeição por código interno.

Logs estruturados incluem `correlationId`, `eventId`, `importId`, `itemId`,
`companyId` opaco, tentativa e código seguro. Auditoria registra solicitação,
reprocessamento, download e resultado terminal.

## Frontend

Vite continua suficiente: é um painel autenticado sem SEO/SSR. O módulo terá:

- página de importações com dropzone/selector acessível;
- resumo antes do envio, validação de limites e limpeza da seleção;
- progresso por polling TanStack Query com backoff e parada terminal;
- tabela/lista responsiva de itens e erros seguros;
- ação de distribuição e reprocessamento condicionada à permissão;
- lista/detalhe da NF-e e download autenticado;
- estados loading/empty/partial/failure/offline;
- i18n e design tokens existentes;
- service worker sem cache de multipart, XML ou respostas `no-store`.

## Estratégia de testes

1. **Package fiscal:** contracts públicos com XML sintético mínimo para
   `nfeProc`, `NFe`, evento, decimais, participantes, chave inválida,
   DTD/ENTITY e limites.
2. **Object storage package:** contract e integração MinIO para put
   create-only/get/head, conflito de overwrite/hash, streaming, erro,
   path-style, signed URL curta e shutdown.
3. **Schema/migration:** constraints, apply/rollback, baseline/vazio e dois
   tenants.
4. **API contract:** auth antes do body, multipart/limites, idempotência,
   paths dinâmicos, paginação, no-store e anti-enumeração.
5. **API integração:** staging MinIO, transaction/outbox, duplicidade,
   compensação e reconciliação de órfãos sem tocar objetos finais.
6. **Worker contract:** envelope, topology, claim/lease, classificação de erro,
   parser/ZIP e cursor.
7. **Worker integração:** PostgreSQL, RabbitMQ e MinIO reais; publisher confirm,
   redelivery, retry/DLX, DLQ, restart e duas instâncias.
8. **Fiscal:** fake gateway em unidade/integração; páginas sobrepostas e replay
   do mesmo NSU não duplicam efeito; nenhum teste automático chama SEFAZ.
9. **Frontend:** contracts de DTO/query/permissions, testes de componentes e
   Playwright em 375/768/1280.
10. **Final:** frozen install, checks independentes dos três apps, migration,
    `make dev` gerenciado, smoke e `make down`.

Fixtures fiscais são sintéticas e não derivam por cópia de `example/`. Os
arquivos locais reais podem participar apenas de um smoke manual redigido e
aprovado, sem snapshot, log ou commit.

## ADRs

1. `ADR 0006 — XML fiscal imutável em object storage e staging compensável`;
2. `ADR 0007 — Outbox, idempotência e cursor da importação/distribuição NF-e`.

## Riscos e mitigação

| Risco                                           | Mitigação                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| Package atual normaliza poucos campos           | contract público sintético antes da implementação e bump Ada            |
| Checkout e pacote instalado divergirem          | `.d.ts` instalado é fonte normativa; pack/instalação limpa antes do pin |
| ZIP bomb/XXE/path traversal                     | quotas, assinatura, parser seguro, sem disco e contracts adversariais   |
| Upload S3 e commit DB não serem atômicos        | estado PENDING, staging, finalização/outbox e compensação idempotente   |
| DB commit e publish se separarem                | outbox transacional, relay com claim e publisher confirm                |
| Redelivery duplicar documento/contador/objeto   | processed messages + uniques + transações e keys determinísticas        |
| Cursor/regra anti-656 existir apenas em memória | cursor, lease e `next_allowed_at` persistidos                           |
| XML/certificado vazar em logs/fila/UI           | envelopes mínimos, redaction, no-store e scanners de testes             |
| Apps ficarem acoplados pelo monorepo            | packages publicados, ports próprios e teste de imports proibidos        |
| Escopo misturar regras CT-e                     | eligibility estrutural explícita e regras fiscais deferidas             |
| Railway/SEFAZ consumir custo antes da hora      | Makefile local obrigatório e gates manuais separados                    |
