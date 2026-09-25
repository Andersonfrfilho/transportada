# Evidence — Feature 189

## Fase 1 — A app existe, vazia e servida

### T1.1 — Contratos da app, antes do código

Arquivos em `apps/frontend-driver/test/`: o entrypoint `shared.contract.test.ts` importa
`content-security-policy`, `environment-banner`, `manifest`, `security-headers`, `service-worker` e
`vite-build-args`; `dist.contract.test.ts` fica fora da lista de `test`, porque roda depois do
`vite build`.

Vermelhos pela razão certa: o código da app ainda não existe.

```
cd apps/frontend-driver && bun test test/shared.contract.test.ts
error: Cannot find module '../../src/modules/shared/serviceWorker.constant' …
0 pass / 1 fail / 1 error

bun test test/dist.contract.test.ts
error: Cannot find module '../src/modules/shared/webManifest.constant' …
0 pass / 1 fail / 1 error
```

**Commit próprio, separado da T1.2.** Sem `apps/frontend-driver/package.json`, o diretório não é
membro do workspace `apps/*`: `dockerfile-workspace` e `pipeline-change-filter` só contam diretório
com `package.json`, e os scripts da raiz (`lint`, `typecheck`, `test`, `build`) não chegam à app. O
único gate que vê estes arquivos é o `format:check`. Conferido com a T1.1 sozinha na árvore:

```
cd apps/api-transportada && bun --env-file=../../.env.test test test/deploy.contract.test.ts --timeout 120000
178 pass / 0 fail / 630 expect() calls

bun run format:check   (raiz)
All matched files use Prettier code style!
```
