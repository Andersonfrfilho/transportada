# Evidência — 186

## T001–T003 — a corrida

Contratos escritos antes e vistos vermelhos: caso de uso 3 falhas (banco e provedor ao mesmo tempo,
provedor sem esperar o banco, completo antes da falha do banco); gateway 4 falhas (três ao mesmo
tempo, perdedor abortado, três provedores falhando, provedor não configurado).

Depois da implementação, 24/09/2026:

- `bun test test/addresses-application.contract.test.ts` — 32 pass, 0 fail
- `bun test test/addresses-infrastructure.contract.test.ts` — 23 pass, 0 fail

## T004 — configuração

- `bun run typecheck` (todas as apps) — exit 0
- `bun run --cwd apps/api-transportada lint` — sem erro
- `bun --env-file=../../.env.test test --timeout 120000` (api) — 7233 pass, 23 skip, 0 fail, 183 arquivos
- `bun --env-file=../../.env.test test ./test/integration/auth-me.integration.ts ./test/integration/server.integration.ts`
  — 5 pass, 0 fail
- `POSTAL_CODE_AWESOME_API_URL=https://cep.awesomeapi.com.br/json` criada no serviço `api` de staging
  com `--skip-deploys`, antes do push

## T005 — documentação

`docs/SECURITY.md` (atualização do achado de 2026-08-21), emenda na ADR-0040, `apps/api-transportada/CLAUDE.md`.

## T007 — Google na corrida

Contratos vistos vermelhos antes (leitura do corpo do Google e corrida com a chave presente), depois
24/09/2026:

- `bun test test/addresses-infrastructure.contract.test.ts` — 27 pass, 0 fail
- `bun run lint` e `bun run typecheck` (todas as apps) — exit 0
- `bun --env-file=../../.env.test test --timeout 120000` (api) — 7237 pass, 23 skip, 0 fail
- integração `auth-me` + `server` — 5 pass, 0 fail
- `bun run --cwd apps/api-transportada build` — ok
- Chave de staging conferida contra o Geocoding: `14412-314` → OK em 0,70 s, `long_name` da rota por
  extenso; `14780-000` e `00000-000` → `ZERO_RESULTS`

`make check` para no `format:check` em `specs/185-carregou-tudo-a-viagem-sai/{plan,tasks}.md`, que
vieram de `origin/staging` sem formatação — fora desta spec; os arquivos desta mudança passam no
`prettier --check`.
