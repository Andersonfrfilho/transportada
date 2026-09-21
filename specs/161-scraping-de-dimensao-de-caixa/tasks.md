# Tasks

> 🤖 Modelo: `sonnet` (T013 é 🧠 — `opus`)

## Fase 1 — Políticas puras, sem rede

> 🤖 Modelo: `sonnet`

- [ ] T001 [P] Fixtures de desafio Cloudflare (headers + HTML: `cf-mitigated`, "Just a moment...",
      `_cf_chl_opt`, 1020, managed challenge com 200) e página normal —
      `apps/cron-transportada/test/fixtures/cloudflare-challenge.fixture.ts`
- [ ] T002 [P] Contrato + `cloudflare-challenge.policy.ts` — CA01 (teste antes, vermelho → verde)
- [ ] T003 [P] Contrato + `robots-txt.policy.ts` (User-agent específico vs `*`, Allow/Disallow,
      Crawl-delay) — CA03
- [ ] T004 [P] Contrato + `site-circuit.policy.ts` e `site-rate-limit.policy.ts` com relógio falso —
      CA02, CA04
- [ ] T005 `scraper-verdict.constant.ts` + `site-recipe.types.ts`; testes novos na lista explícita
      do `package.json` do cron

## Fase 2 — Persistência e cliente HTTP

> 🤖 Modelo: `sonnet`

- [ ] T006 Migration aditiva `box_scraper_site_state` — `make migration-test` verde
      (depende da Fase 2 da spec 160)
- [ ] T007 `drizzle-box-scraper-site-state.repository.ts` — contrato do repositório
- [ ] T008 `polite-http.client.ts` (UA honesto, timeout 15 s, corpo ≤ 2 MB, só text/html) + schema
      zod das envs do plano — contrato
- [ ] T009 Teste do CA08: manifesto sem `puppeteer-extra*`, `playwright-extra`, `*stealth*`,
      `*captcha*`, `cloudscraper`, `undici` com proxy agent

## Fase 3 — Gateway genérico e cron

> 🤖 Modelo: `sonnet`

- [ ] T010 `scraper-package-box-catalog.gateway.ts` com receita de exemplo **fictícia** sobre HTML
      salvo — CA05, CA06
- [ ] T011 `run-scraper-cycle.use-case.ts` + `package-box-scraper.job.ts` (allowlist, robots, ritmo,
      circuito, deadline 20 min, retomada)
- [ ] T012 Integração com `Bun.serve` local simulando página boa, desafio, robots negando e 429 —
      CA07

## Fase 4 — Primeiro site real (bloqueada por [NEEDS CLARIFICATION])

> 🤖 Modelo: `sonnet` (T013 🧠 `opus`)

- [ ] T013 🧠 Avaliar sites candidatos e preencher a tabela "Sites avaliados" do `plan.md` —
      decisão humana antes de seguir
- [ ] T014 `recipes/<site>.recipe.ts` com HTML real salvo + contrato
- [ ] T015 Serviço cron em `.railway/railway.ts` com `cronSchedule` confirmado — `railway config plan`
      sem surpresa (não aplicar sem aprovação)
- [ ] T016 `make check` completo + evidência consolidada em `evidence.md`

## Prompt de execução (Fases 1–3; a Fase 4 espera as respostas das Dúvidas)

```text
/oh-my-claudecode:autopilot Execute as Fases 1 a 3 da spec specs/161-scraping-de-dimensao-de-caixa/
(leia spec.md, plan.md e tasks.md — e specs/160-medida-de-caixa-por-catalogo-gtin/ para a porta,
a sanidade e o cache que esta spec reusa). Uma task por vez, na ordem do tasks.md.
Modelos: Fases 1–3 → executor model=sonnet · revisão final → code-reviewer model=opus.
Regra dura: o cron NÃO contorna Cloudflare. Desafio detectado = BLOCKED_BY_CHALLENGE + recuo.
Nada de stealth, fingerprint falso, resolvedor de CAPTCHA/Turnstile, proxy rotativo ou
cf_clearance reaproveitado — se algo parecer exigir isso, pare e pergunte.
Cada task fecha com typecheck + testes (teste antes da implementação) + commit isolado,
evidência em evidence.md. Teste novo entra na lista explícita do package.json do cron.
Se a Fase 2 da spec 160 não estiver pronta, pare antes da T006 e avise.
Pare e pergunte antes de: deploy, migration destrutiva, iniciar a Fase 4, qualquer
[NEEDS CLARIFICATION].
```
