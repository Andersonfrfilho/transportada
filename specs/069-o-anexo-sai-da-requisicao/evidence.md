# 069 — Evidências

Todas colhidas no worktree `spec-069`, branch `work/spec-069`, em 2026-09-01.

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

## O que ficou de fora

- Expurgo de rascunho vencido (T015 da 066, ainda aberta).
- Serviço separado de extração — ADR-0053 o registra como próximo passo, não como o passo de agora.
- CNH e CRLV seguem sem extração; só CCMEI é lido.
- ⚠️ A rota pública de anexo **não tem rate limit de verdade** além do declarado na rota: não existe
  limitador central nesta API. É o mesmo achado já datado em `docs/SECURITY.md`.
