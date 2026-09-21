# Plano — 161

## Onde encaixa

```
cron-transportada/src/package-box-scraper/
  package-box-scraper.job.ts               entrypoint one-shot (lê env, monta deps, roda ciclo)
  application/
    run-scraper-cycle.use-case.ts          seleciona fila → por site → resolve via pipeline da 160
    select-scraper-queue.port.ts
  domain/
    cloudflare-challenge.policy.ts         detectChallenge(response) → boolean (RF04), pura
    robots-txt.policy.ts                   isPathAllowed({ robotsTxt, userAgent, path }), pura
    site-circuit.policy.ts                 próximo estado/recuo exponencial (P2, P4), pura
    site-rate-limit.policy.ts              próximo horário permitido (RF06/RF07), pura
    scraper-verdict.constant.ts            BLOCKED_BY_CHALLENGE, DISALLOWED_BY_ROBOTS,
                                           EXTRACTION_FAILED, AMBIGUOUS_MATCH, REQUIRES_JAVASCRIPT
    site-recipe.types.ts                   SiteRecipe
  infrastructure/
    scraper-package-box-catalog.gateway.ts implementa PackageBoxCatalogPort (160)
    polite-http.client.ts                  fetch + UA honesto + timeout + limite de corpo
    drizzle-box-scraper-site-state.repository.ts
    recipes/<site>.recipe.ts               uma por site (Fase 4)
```

O cron reusa a sanidade, o consenso e `gtin_catalog_lookups` da 160 — **depende da Fase 2 da 160**
(tabelas de cache/cota). Se a 160 ainda não tiver fechado a Fase 2, a Fase 2 desta espera.

Parser HTML: `HTMLRewriter` nativo do Bun (sem dependência nova). Se uma receita precisar de
seletor mais rico, avaliar `linkedom` pelo §13 do code-standart antes.

## Tabela nova (migration aditiva)

`box_scraper_site_state`: `site_key varchar PK`, `status varchar` (`enabled|backoff|disabled`),
`consecutive_blocks int`, `consecutive_extraction_failures int`, `next_allowed_at timestamptz`,
`last_verdict varchar`, `updated_at`. Sem `company_id`, sem ENUM.

## Env (validado por zod no config do cron)

| Variável                                    | Padrão                       | Nota                           |
| ------------------------------------------- | ---------------------------- | ------------------------------ |
| `BOX_SCRAPER_SITES`                         | vazio                        | allowlist; vazio desliga o job |
| `BOX_SCRAPER_CONTACT_URL`                   | obrigatório se sites ≠ vazio | vai no User-Agent              |
| `BOX_SCRAPER_MAX_REQUESTS_PER_SITE_PER_RUN` | 50                           |                                |
| `BOX_SCRAPER_MIN_INTERVAL_MS`               | 10000                        | `Crawl-delay` maior prevalece  |
| `BOX_SCRAPER_RUN_DEADLINE_MS`               | 1200000                      | 20 min                         |

## Agendamento

Serviço cron novo em `.railway/railway.ts` (não em `railway.json` — depreciado para serviço novo),
`cronSchedule` a confirmar (proposta `0 */6 * * *`), mesmo Dockerfile do cron com comando próprio.

## Sites avaliados

| Site                            | Ficha tem caixa master? | robots.txt        | Termos permitem? | Cloudflare desafia bot?                                         | Decisão                                                   |
| ------------------------------- | ----------------------- | ----------------- | ---------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| cosmos.bluesoft.com.br (página) | sim                     | inacessível (403) | não verificado   | **sim — 403 "Just a moment..." até no robots.txt** (2026-09-21) | fora; usar a API oficial (`scripts/box-catalog-harvest/`) |

Regra: qualquer "não" nas colunas 3–5 → site fora, ou pedido de allowlist ao dono do site.
