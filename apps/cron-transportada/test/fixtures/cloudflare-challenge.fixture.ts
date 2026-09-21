/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 (RF04, CA01): amostras de resposta HTTP de desafio do Cloudflare — cada assinatura de
 * detecção do RF04 tem pelo menos uma fixture, mais uma página normal como controle negativo.
 *
 * Assinaturas cobertas (RF04, "qualquer uma basta"): header `cf-mitigated: challenge`; status
 * 403/429/503 com header `server: cloudflare`; corpo com `challenges.cloudflare.com`, `cf-chl-`,
 * `_cf_chl_opt` ou o título `Just a moment...`; corpo com "Access denied" + "Cloudflare"
 * (erro 1020). O managed challenge às vezes vem com status 200 (caso extremo do spec.md) — por
 * isso a detecção também olha o corpo, e a página normal (200, `server: cloudflare`, sem marcador)
 * existe para provar que 200 + header de servidor sozinho não é bloqueio.
 *
 * ⚠️ O tipo abaixo é definido aqui, não importado de `cloudflare-challenge.policy.ts`: a fixture
 * nasce na T001, antes da política existir (T002) — o formato é o mesmo por desenho estrutural
 * (duck typing do TS), sem acoplar a fixture a um módulo que ainda não existe. Na T012 o mesmo
 * dado vira resposta de `Bun.serve` local.
 */
export type CloudflareChallengeFixture = {
  readonly body: string
  readonly headers: Readonly<Record<string, string>>
  readonly status: number
}

/**
 * Assinatura 1 do RF04 — header `cf-mitigated: challenge`. Corpo neutro de propósito: a
 * assinatura vive só no header, e o contrato de integridade (T001) garante que não há marcador
 * no corpo quando a detecção for isolada a esta fixture.
 */
export const CF_MITIGATED_HEADER_CHALLENGE: CloudflareChallengeFixture = {
  body: `<!doctype html>
<html lang="en">
<head><title>Challenge</title></head>
<body>
  <p>Verifying your browser...</p>
</body>
</html>
`,
  headers: { 'cf-mitigated': 'challenge' },
  status: 403,
}

/**
 * Assinatura 2 do RF04 — status 403 com header `server: cloudflare` (página de bloqueio). Corpo
 * sem marcador de desafio: o sinal é o par status + header, não o conteúdo.
 */
export const CLOUDFLARE_403_BLOCKED: CloudflareChallengeFixture = {
  body: `<!doctype html>
<html lang="en">
<head><title>Sorry, you have been blocked</title></head>
<body>
  <h1>Sorry, you have been blocked</h1>
  <p>You are unable to access this website.</p>
</body>
</html>
`,
  headers: { server: 'cloudflare' },
  status: 403,
}

/** Assinatura 2 do RF04 — status 429 com header `server: cloudflare` (rate limit do WAF). */
export const CLOUDFLARE_429_BLOCKED: CloudflareChallengeFixture = {
  body: `<!doctype html>
<html lang="en">
<head><title>Error 429</title></head>
<body>
  <h1>Too many requests</h1>
  <p>Slow down and try again later.</p>
</body>
</html>
`,
  headers: { server: 'cloudflare' },
  status: 429,
}

/** Assinatura 2 do RF04 — status 503 com header `server: cloudflare` (WAF em manutenção/sobrecarga). */
export const CLOUDFLARE_503_BLOCKED: CloudflareChallengeFixture = {
  body: `<!doctype html>
<html lang="en">
<head><title>Service Temporarily Unavailable</title></head>
<body>
  <h1>Service Temporarily Unavailable</h1>
  <p>The site is temporarily unable to handle the request.</p>
</body>
</html>
`,
  headers: { server: 'cloudflare' },
  status: 503,
}

/**
 * Caso extremo do spec.md — managed challenge às vezes vem com status 200. Assinatura 3 do RF04:
 * o corpo carrega os quatro marcadores (`Just a moment...`, `challenges.cloudflare.com`,
 * `cf-chl-`, `_cf_chl_opt`). O `server: cloudflare` com 200 não é bloqueio por si só — a
 * detecção por header exige status 403/429/503.
 */
export const MANAGED_CHALLENGE_200: CloudflareChallengeFixture = {
  body: `<!doctype html>
<html lang="en">
<head>
  <title>Just a moment...</title>
  <meta name="robots" content="noindex,nofollow"/>
</head>
<body>
  <div class="cf-chl-container">
    <input type="hidden" name="_cf_chl_opt" value="6c9d0f9d5d7a"/>
    <div class="cf-chl-engine" data-payload="H7sY2pQ4mZ9kV1wL"></div>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  </div>
  <p>Checking if the site connection is secure...</p>
</body>
</html>
`,
  headers: { server: 'cloudflare' },
  status: 200,
}

/**
 * Assinatura 4 do RF04 — corpo com `Access denied` + `Cloudflare` (erro 1020). O status 1020
 * aparece no corpo, não no status HTTP.
 */
export const ACCESS_DENIED_1020: CloudflareChallengeFixture = {
  body: `<!doctype html>
<html lang="en">
<head><title>Access denied | exemplo.com used Cloudflare to restrict access</title></head>
<body>
  <h1>Access denied</h1>
  <p>You do not have access to exemplo.com.</p>
  <p>The site owner set access rules that limit access. Error 1020.</p>
</body>
</html>
`,
  headers: { server: 'cloudflare' },
  status: 403,
}

/**
 * Controle negativo — ficha de produto legítima servida por trás do Cloudflare (200,
 * `server: cloudflare`), sem nenhum sinal de desafio. A sanidade da spec 160 é quem avalia o
 * conteúdo; aqui o único compromisso é que a página não carrega assinatura do RF04.
 */
export const NORMAL_CATALOG_PAGE: CloudflareChallengeFixture = {
  body: `<!doctype html>
<html lang="pt-BR">
<head>
  <title>Caixa Master — Produto Exemplo 500g | Catálogo do Fabricante</title>
</head>
<body>
  <main>
    <h1>Caixa master para transporte — Produto Exemplo 500g</h1>
    <dl class="specs">
      <dt>Dimensões da caixa de embarque</dt>
      <dd>365 mm × 220 mm × 256 mm</dd>
      <dt>Peso bruto</dt>
      <dd>10,5 kg</dd>
      <dt>GTIN da caixa master</dt>
      <dd>17896098909765</dd>
    </dl>
  </main>
</body>
</html>
`,
  headers: { server: 'cloudflare', 'content-type': 'text/html; charset=utf-8' },
  status: 200,
}
