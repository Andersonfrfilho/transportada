## frontend-driver

A **app do motorista** (ADR-0075, spec 189): o PWA que ele instala, com bundle, `Dockerfile`,
serviço e domínio próprios, em `motorista.<zona>` (local na `53200`). Molde: `apps/frontend-client`.
Nenhuma app importa código de outra: o que vem do painel ou do portal é **cópia por valor**, e o
arquivo copiado começa com `/* Cópia por valor de <origem> (ADR-0075 §7). */`.

**O service worker é `injectManifest`, com `src/sw.ts`, e `registerType: 'prompt'`** (ADR-0075 §5).
O `sw.ts` tem só precache, fallback de navegação para `index.html`, `clientsClaim()` e a mensagem
`SKIP_WAITING_MESSAGE` (`src/modules/shared/serviceWorker.constant.ts`, o valor que o `workbox-window`
manda). ⚠️ Sem listener de `sync` e sem cache de API — `test/shared/service-worker.contract.ts`
reprova os dois. O `push` da spec 147 entra no mesmo `sw.ts`.

**O orçamento de precache é gate de build.** `build` é `vite build && bun test
test/dist.contract.test.ts`: o precache soma no máximo 1,5 MiB e nada de `opencv`,
`background-removal`, `canhoto-ocr`, `maplibre`, `tesseract` ou `pdfjs` chega ao `dist`. Por isso o
`dist.contract.test.ts` não está na lista de `test`: sem `dist/` ele não tem o que ler.

**CSP e cabeçalhos** (ADR-0075 §4): `connect-src` é a própria origem, a API e o Keycloak, e um
contrato varre `https://` em `src/`; origem só de `window.open` vai para `NON_FETCH_ORIGIN`.
`img-src` é `'self' blob:` e a origem da API. `Permissions-Policy` abre câmera e posição para a
própria origem (o valor do painel) e o servidor emite `Strict-Transport-Security: max-age=31536000`,
sem `includeSubDomains` e sem `preload`. O `server.ts` não sobe sem a CSP emitida no build.

Envs: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_DRIVER_APP_URL` (obrigatória aqui; no painel é só o
interruptor da ADR-0075 §6), `VITE_IDENTIFIER_FIRST_LOGIN` e `VITE_KEYCLOAK_*`. Toda `VITE_*` lida
em `src/` tem `ARG` no `Dockerfile` (`test/shared/vite-build-args.contract.ts`), menos
`VITE_SMOKE_AUTH_BYPASS`, que nunca entra numa imagem.
