# Evidência — spec 314 (T1–T4)

Rodado em `transportada-wt/dominio-do-contratante` (branch `work/dominio-do-contratante`), 2026-11-09. Nada contra staging/produção; Postgres local do `make postgres-up`.

| Gate | Comando | Resultado |
|---|---|---|
| Testes do worker (contrato) | `bun run test` em `apps/worker-transportada` | 3135 pass, 0 fail (antes da implementação: 2 fail nos testes novos do consumidor, e os do intake/resumo) |
| Testes da API | `bun run test` em `apps/api-transportada` | 14694 pass, 35 skip, 0 fail |
| Integração do worker (banco) | `bun test ./test/integration/nfe-xml-receipts.integration.ts ./test/nfe-import-repository.integration.test.ts` com banco `transportada_worker_integration` migrado | 23 pass, 0 fail (inclui domínio com contratante e a coluna na importação) |
| Migration + rollback | `make migration-test` | 231 pass, 0 fail |
| Typecheck | `bun run typecheck` (raiz) | sem erros |
| Lint | `bun run lint` em cada app | sem erros, `--max-warnings=0` |
| Prettier | `bunx prettier --check` nos arquivos alterados | limpo |
| Script de operação | `bash -n` + extração do JS embutido com `bun build --no-bundle` + chamadas inválidas | sintaxe ok; CNPJ inválido e argumentos errados recusados. **Não executado** contra Railway. |
