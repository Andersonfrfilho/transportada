# Evidências — spec 295

## T1.1 / T1.2 — API `/me/picture` (commits `test(295)` e `feat(295)`)

- Contrato vermelho antes: `bun test ./test/me-picture.contract.test.ts` → 8 fail (módulo ausente).
- Depois: 8 pass. Contrato completo da API (`bun --env-file=../../.env.test test --timeout 120000`): 13119 pass, 1 fail — o
  `membership-policy-lock` (trava da spec 144 que lista quem usa a política de membership); corrigido incluindo
  `me-picture.routes.ts` e a assinatura das três rotas na trava; reexecutado: 549 pass, 0 fail.
- `tsc --noEmit` e `eslint --max-warnings=0` limpos. Sem teste de integração tocado (nenhuma consulta nova).
- Teto de requisições: a rota administrativa não tem; esta também não.

## T2.1 / T2.2 — App do motorista

- Contrato vermelho antes (módulos ausentes); depois `bun run test` do app: 2203 pass, 0 fail.
- `typecheck`, `lint` limpos; `bun run build` ok (6 pass em `dist.contract`); prettier limpo.
- CSP: `img-src` já inclui `blob:` e a origem da API — sem mudança.
- `<input type="file" accept="image/*">` sem `capture`: o seletor do sistema oferece câmera e galeria; `capture` forçaria só a câmera.

## Correções da revisão de código

- `DELETE /me/picture` idempotente (`remove({ idempotent: true })` só na rota própria; a administrativa mantém 404); o atributo do
  provedor é zerado também sem foto. GET `/me/picture` e da administrativa com `x-content-type-options: nosniff`.
- Contrato: DELETE duas vezes → 204/204 com o atributo zerado; 403 em GET/PUT/DELETE sem membership ativa e com service account.
- App do motorista: `useOwnPicture` zera as duas mutations ao iniciar trocar/remover (teste por contrato de fonte: sem DOM nesta app);
  `OWN_PICTURE_PATH` exportada e usada nos testes.

## Fase 4 — foto da CNH aplicada direto (T4.2, T4.3)

Base: `work/spec-091` + merge de `work/spec-295` (único conflito: as listas de teste do `package.json` da API, resolvidas por união).
Merge verificado antes de seguir: `tsc` limpo, contrato da API 13183 pass / 0 fail.

- **Origem (migration `20261105113107_user_picture_origin`, aditiva, com `rollback.sql`).** `identity_user_pictures.origin`
  VARCHAR com CHECK (`cnh|self|admin`), `DEFAULT 'admin'`. Decisão: foto existente entra como `admin`, porque até aqui só o
  escritório gravava (a rota própria da 295 ainda não foi publicada) e nenhum dado distingue o contrário. `db:generate` →
  `no_changes`; `make migration-test` → 231 pass (inclui a lista estática de migrations).
- **API.** `PUT /me/picture` grava `self`, a administrativa `admin`; `GET /me/picture` devolve `x-picture-origin`
  (`CORS_EXPOSE_HEADERS` ganhou `X-Picture-Origin`). Nova permissão só-serviço `driver.cnh-picture` (papel `automation`; entra
  em `SERVICE_ONLY_PERMISSIONS`, no catálogo e nos locales do painel) para `PUT /fleet/driver-attachments/:attachmentId/cnh-picture`.
  O usuário é resolvido pelo anexo (`cnh`, empresa do contexto); `saveFromCnh` é `ON CONFLICT … WHERE origin = 'cnh'`. Contrato
  vermelho antes (módulo ausente), 8 pass depois; integração contra Postgres (`user-picture-cnh-origin.integration.ts`, 3 pass):
  CNH sobre `self`/`admin` devolve `null` sem tocar a linha, envio próprio troca a origem, o `JOIN` respeita empresa e tipo.
  Contrato completo da API: 13192 pass, 0 fail (sem as falhas conhecidas de pedágio nesta árvore).
- **Worker.** `src/cnh-face/`: `cnh-face.worker.ts` (thread própria, console silenciado, pdf.js + sharp + onnxruntime-web 1.23.2 WASM,
  `numThreads = 1`) com UltraFace RFB-320 em `assets/ultraface-rfb-320.onnx` (sha256 conferido por contrato). Gancho em
  `extractAttachmentFields` depois da gravação dos campos, só para `subject = fleet_driver` e tipo `cnh`; melhor esforço
  (`failed` não recicla a mensagem). Aceita rosto único, nota ≥ 0,98, lado curto ≥ 120 px (`isAcceptableCnhFace`). A API é
  chamada pelo mesmo crachá de serviço do worker (`mdfeAutoIssue`); sem ele, o gancho fica inerte. Log só com desfecho e causa.
  Corrigido no caminho do spike: com mais de uma imagem candidata, o recorte pegava a primeira detecção mesmo sem rosto.
  Medido localmente com imagem pública (não é CNH, não entra no repositório): 1 rosto extraído (nota 0,99999, recorte 234 px,
  WebP de 13 KB), também girada 90°; imagem lisa → `no_face`; texto → `unsupported`; ~0,3 s por arquivo, no `src` e no `dist`.
  Worker: `tsc` e `eslint` limpos, `bun run test` 2913 pass / 0 fail, `bun run build` ok (thread e backfill empacotados).
- **Imagem Docker.** O modelo é arquivo do disco, não do bundle: `Dockerfile` copia `apps/worker-transportada/assets` ao lado de
  `dist/`, e `onnxruntime-web` é dependência de produção do worker (`bun install --frozen-lockfile` ok, `bun.lock` atualizado).
  Contrato `asset.contract.ts` cobre existência + sha256, o `COPY` e a entrada de build. O build completo da imagem não foi
  rodado aqui (inclui compilar o whisper.cpp); o caminho `dist/` → `../assets` foi exercitado empacotado.
- **App do motorista.** `ownPictureClient.read` devolve `{ blob, origin }`; o Perfil mostra o botão "Foto tirada da sua CNH —
  toque para trocar" (pt/en) enquanto a origem é `cnh`, abre o seletor, e some depois do envio (`self`). `bun run test` 2210 pass, `typecheck`,
  `lint`, `build` ok.
- **Backfill** `bun run backfill:cnh-picture` (idempotente; `--dry-run` padrão imprime só contagens; `--confirm` lê, detecta e entrega à
  API). Pendente = CNH `final` de motorista com usuário e sem foto, paginado por chave. Contrato (dry-run não lê nem chama
  nada) e integração (`cnh-picture-backfill.integration.ts`, Postgres) verdes. **Não foi executado em staging nem em produção.**
- **LGPD.** Entrada em `docs/SECURITY.md` (mudança de finalidade: documento de cadastro → foto de perfil).
- Pendente para publicar: aplicar a migration, ligar o crachá de serviço do worker (`mdfeAutoIssue`) — sem ele não há foto —
  e rodar o backfill com aprovação.
