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

### T1.2 — Esqueleto de `apps/frontend-driver` (commit único com as linhas "T1.2" da D9)

No mesmo commit: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `index.html`, `vite.config.ts`
(`injectManifest` com `src/sw.ts`, `registerType: 'prompt'`), `src/sw.ts`, `server.ts` (HSTS e a
`Permissions-Policy` do painel), `Dockerfile`, os ícones 192, 512, maskable 512 e apple-touch 180,
`offline.html`, a tela provisória em `main.tsx` com `EnvironmentBanner`, a CSP e o
`environment.config.ts`; o `COPY apps/frontend-driver/package.json` nos seis `Dockerfile` de app e
no novo; o alvo `driver` em `changed-targets.sh` (e `apps/frontend-driver/` no alvo `api`); e
`pipeline-change-filter.contract.ts` com sete apps e o alvo `driver` nos dois sentidos da spec 078.
`bun install` gravou o workspace novo no `bun.lock` (29 linhas, nenhum pacote novo: o `workbox-*`
7.4.1 já vinha com o `vite-plugin-pwa` 1.3.0), que vai no mesmo commit.

O `icon-maskable-512.png` e o `apple-touch-icon-180.png` saíram do mesmo desenho do `icon.svg` pelo
`sharp` que já está no `node_modules`: o maskable com o desenho a 80% em volta do centro, dentro da
zona segura; o de 180 sem transparência.

Ajustes nos contratos da T1.1 feitos ao implementar, sem mudar o que eles cobram:

- `security-headers`: o padrão da linha aceita o valor sem aspas da CSP
  (`'Content-Security-Policy': contentSecurityPolicy`).
- `service-worker`: `event.data` é `any`, e o lint de tipos recusa `.type` sobre ele; o `sw.ts` lê
  por uma variável tipada, e o padrão aceita `data?.type`.
- `manifest`: `lang: 'pt-BR'` entrou no manifesto (sem ele o plugin emite `"lang":"en"`).
- `dist`: o `injectManifest` inlina o precache como JSON (`"url":"…"`). A primeira versão do padrão
  não achava nada, e o teste "o precache existe" reprovou o build, que é o papel dele.

Mutação conferida no `dist.contract.test.ts`: um `dist/assets/opencv-mutation.js` reprova "nada do
peso do painel" (5 pass / 1 fail); um `icon-512.png` de 1,7 MB reprova o orçamento (1.910.236 bytes,
5 pass / 1 fail); restaurado, 6 pass / 0 fail.

```
bun run --cwd apps/frontend-driver check
lint ok · typecheck ok · test 39 pass / 0 fail / 92 expect() · build ok
dist.contract.test.ts 6 pass / 0 fail
```

**Precache: 13 arquivos, 216.878 bytes (≈ 212 KiB) de 1.572.864 (1,5 MiB).** O plugin reporta
193,15 KiB por outra conta; o contrato soma o tamanho de cada arquivo do `dist` listado no `sw.js`.

`server.ts` servindo o `dist` na 53299: `/sw.js`, `/manifest.webmanifest` e `/` com
`Cache-Control: no-cache`; `/assets/index-*.js` com `public, max-age=31536000, immutable`; todos com
`Strict-Transport-Security: max-age=31536000` e `Permissions-Policy: camera=(self), geolocation=(self),
microphone=()`.

```
bun install --frozen-lockfile                       no changes
bash -n .github/scripts/changed-targets.sh          ok
BASELINE=HEAD~1 changed-targets.sh                  api=true · driver=true · client=false · landing=false

cd apps/api-transportada && bun --env-file=../../.env.test test test/deploy.contract.test.ts --timeout 120000
178 pass / 0 fail / 636 expect()   (dockerfile-workspace e pipeline-change-filter incluídos)

make check                                          exit 0
format:check ok · lint ok · typecheck ok
api 7309 pass / 0 fail · worker 1424 · cron 101 · frontend 5264 + 51 · client 55 · landing 111 · build ok
```

⚠️ O `make check` ainda **não** passa pela app nova: os scripts encadeados da raiz entram na T1.3.
Até lá a app é conferida pelo `check` dela, acima.

```
docker build -f apps/frontend-driver/Dockerfile .   exit 0
  bun install --frozen-lockfile com os sete manifestos · dist.contract.test.ts 6 pass / 0 fail
  precache: 13 arquivos, 216.814 bytes
docker run (PORT=8080) → GET /manifest.webmanifest
  200 · Strict-Transport-Security: max-age=31536000 · Cache-Control: no-cache · "name":"Minha viagem"
```
