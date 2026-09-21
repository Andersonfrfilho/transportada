# Evidência — 161

## T001 — Fixtures de desafio Cloudflare (RF04)

`apps/cron-transportada/test/fixtures/cloudflare-challenge.fixture.ts`, contrato de integridade
`apps/cron-transportada/test/cloudflare-challenge-fixtures.contract.test.ts` (entrypoint adicionado à
**lista explícita** do `test` em `apps/cron-transportada/package.json`).

Cada assinatura de detecção do RF04 tem pelo menos uma fixture, mais a página normal como controle
negativo:

1. `CF_MITIGATED_HEADER_CHALLENGE` — header `cf-mitigated: challenge`, corpo limpo de propósito
   (a assinatura vive só no header, para o T002 testar a regra isolada);
2. `CLOUDFLARE_403_BLOCKED`, `CLOUDFLARE_429_BLOCKED`, `CLOUDFLARE_503_BLOCKED` — status 403/429/503
   com `server: cloudflare`, corpo sem marcador;
3. `MANAGED_CHALLENGE_200` — o caso extremo do spec.md: desafio com **status 200**, corpo com os
   quatro marcadores (`Just a moment...`, `challenges.cloudflare.com`, `cf-chl-`, `_cf_chl_opt`);
4. `ACCESS_DENIED_1020` — corpo com `Access denied` + `Cloudflare` (o status 1020 vive no corpo);
5. `NORMAL_CATALOG_PAGE` — ficha legítima atrás do Cloudflare (200 + `server: cloudflare`, sem
   nenhum marcador): prova que 200 + header de servidor sozinho não é bloqueio.

Tipo `CloudflareChallengeFixture` declarado **localmente** na fixture, não importado da política
(que só nasce no T002) — mesmo padrão do T001 da 160 (`gtin-catalog.fixture.ts`), duck typing
estrutural. Na T012 o mesmo dado vira resposta de `Bun.serve` local.

### Teste antes — vermelho → verde

```
$ bun test ./test/cloudflare-challenge-fixtures.contract.test.ts   ← antes da fixture existir
error: Cannot find module './fixtures/cloudflare-challenge.fixture.js'
 0 pass / 1 fail / 1 error      ← vermelho esperado (módulo da fixture ainda não existe)

$ bun test ./test/cloudflare-challenge-fixtures.contract.test.ts   ← após a T001
 7 pass / 0 fail / 24 expect() calls
```

O contrato trava os sinais no nível do **dado** (status, headers, corpo) — uma edição futura que
apague um marcador reprova aqui. Nenhuma política de detecção é exercitada: o mapeamento dos mesmos
sinais para `BLOCKED_BY_CHALLENGE` é do T002 (CA01).

### Gates

```
$ bun run typecheck   → 0 erros
$ bun run lint        → 0 problemas (--max-warnings=0)
$ bun run test        → 101 pass / 0 fail / 263 expect() calls (8 arquivos; 7 antes da T001)
```

Sem commit nesta sessão (não solicitado — o `tasks.md` pede commit por task, mas a instrução de
execução foi "registre em evidence.md e pare"). Os três arquivos estão no worktree
(`apps/cron-transportada/test/fixtures/cloudflare-challenge.fixture.ts`,
`test/cloudflare-challenge-fixtures.contract.test.ts` e o `package.json` ajustado) aguardando o
commit na próxima sessão.
