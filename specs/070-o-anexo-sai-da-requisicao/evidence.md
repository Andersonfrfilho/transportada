# 070 — Evidências

Todas colhidas no worktree `spec-069` (worktree criado antes da renumeração), branch `work/spec-069`, em 2026-09-01.

## Gate completo

```
bun run format:check   All matched files use Prettier code style!
bun run lint           limpo nas seis apps
bun run typecheck      limpo nas seis apps
bun run build          seis apps
```

## Testes

| Suíte                 | Resultado                                                                   |
| --------------------- | --------------------------------------------------------------------------- |
| `api-transportada`    | 3820 pass · 23 skip · 0 fail                                                |
| `worker-transportada` | 825 pass · 0 fail                                                           |
| `frontend-landing`    | 73 pass · 0 fail                                                            |
| `make migration-test` | 90 pass · 0 fail (Postgres descartável, migration + rollback + reaplicação) |

## Fase 1 — a API para de ler

- `test/fleet-application/aggregate-application-attachments.contract.ts`: a resposta do upload tem
  **só** `draftId` e `type`; o `correlationId` da requisição chega ao pedido de leitura.
- `test/fleet-application/aggregate-attachment-extraction.contract.ts` foi **removido** junto com o
  gateway de extração da API — ele não existe mais deste lado.
- `test/database-migration.contract.test.ts` (contra Postgres): a migration aplica, o rollback
  devolve a base ao estado anterior e a reaplicação funciona.

## Fase 2 — o worker lê

- `test/aggregate-attachment/envelope.contract.ts`: payload com bytes do documento é **recusado**
  (`security.md` §6), envelope com ator é recusado, topologia main/retry/dead.
- `test/aggregate-attachment/extraction.contract.ts`: leitura vazia grava `null` e fecha o ciclo;
  objeto ausente não vira escrita; falha de parse propaga; reentrega converge.
- `test/build-entrypoints.contract.test.ts` passou a cobrir `*.worker.ts` — thread cujo módulo não
  foi empacotado morre no contêiner, e o anexo fica esperando leitura para sempre.

### A thread foi medida, não presumida

```
tipo fora do ccmei -> null 122ms
pdf inválido -> aggregate attachment extraction failed: InvalidPDFException
```

Duas coisas que a medição corrigiu, e que não apareceriam em teste de unidade:

1. **`new Worker(url)` é caminho de arquivo de verdade** — o runtime não reescreve `.js` para `.ts`
   como faz com `import`. Fixar uma extensão quebra dev **ou** produção; a extensão sai do próprio
   `import.meta.url`.
2. **O pdf.js escreve avisos no console** ("Indexing all PDF objects"), e do worker eles caíam no
   stdout do processo — que é log. O canal é silenciado dentro da thread antes do parse.

Depois do build, `dist/aggregate-attachment/infrastructure/pdf-extraction.worker.js` existe.

## Fase 3 — a landing envia

- `test/application/attachment-upload.contract.ts`: multipart na rota pública; arquivo acima do teto
  **não sai do aparelho**; resposta sem `draftId` é falha; recusa e rede fora do ar não estouram.
- `test/application/attachment-wiring.contract.ts`: prova por texto de fonte que o campo envia além
  de ler, que o submit amarra os rascunhos e que a leitura local continua preenchendo. Esta app não
  tem DOM no teste, e foi exatamente uma fiação ausente — compilando e verde — que deixou a rota
  pública sem chamador nenhum desde a spec 066.

## Ponta a ponta, com infra de verdade

`make up` (Postgres, RabbitMQ, MinIO), e o caminho partido em duas metades porque nenhuma app
importa código-fonte de outra — o seam é a linha do outbox, afirmada dos dois lados.

**Metade de escrita**, `api-transportada/test/integration/aggregate-attachment-outbox.integration.ts`,
contra Postgres descartável com todas as migrations:

```
2 pass · 0 fail
```

Objeto, rascunho e evento na mesma transação; `extracted_fields` nasce **nulo** (ninguém leu na
requisição); o `payload jsonb` volta do banco como referência — `{attachmentId, bucket, objectKey,
type}`, sem bytes. E bucket fora do ar não deixa rascunho nem pedido de leitura: o worker consumiria
para sempre um objeto que nunca foi gravado.

**Metade de leitura**, `worker-transportada/test/integration/aggregate-attachment.integration.ts`,
com Postgres, RabbitMQ e MinIO de verdade — nenhum dublê:

```
1 pass · 0 fail  [775ms]
```

Um CCMEI sintético (PDF real, camada de texto real) vai ao bucket; a linha do outbox entra; o relay
publica no broker; o consumidor recebe, **baixa o objeto do MinIO**, roda o pdf.js na
`worker_thread`, e o CNPJ impresso no PDF aparece em `extracted_fields`. A linha do outbox termina
com `published_at` preenchido.

### O verde foi conferido contra falso positivo

Trocando o CNPJ esperado por outro valor, o teste **reprova**:

```
- Expected  - 1
+ Received  + 1
(fail) o CCMEI enviado chega ao anexo como campo lido…
 0 pass · 1 fail
```

Isso é o que separa "o caminho funciona" de "o teste não olha nada": o valor afirmado é o que a
thread leu do arquivo que atravessou bucket e broker, não uma constante que o próprio teste plantou.
Se a leitura do MinIO falhasse, o ciclo fecharia como `object_missing`, `extracted_fields` ficaria
nulo e a espera estouraria — o caminho inteiro é condição do verde.

## O que ficou de fora

- Expurgo de rascunho vencido (T015 da 066, ainda aberta).
- Serviço separado de extração — ADR-0053 o registra como próximo passo, não como o passo de agora.
- CNH e CRLV seguem sem extração; só CCMEI é lido.
- ⚠️ A rota pública de anexo **não tem rate limit de verdade** além do declarado na rota: não existe
  limitador central nesta API. É o mesmo achado já datado em `docs/SECURITY.md`.
