# Feature 161 — Dimensão de caixa por leitura de site público (scraping agendado)

## Problema e resultado

A spec 160 liga o catálogo de GTIN por **API**, e as APIs com dimensão de caixa master (Cosmos, GS1)
cabem em 25 e 30 consultas por dia. Com 643 caixas pendentes, a fila leva semanas para andar só por
API. Parte desses produtos tem a ficha técnica — com dimensão da caixa de embarque — publicada em
páginas públicas (site do fabricante, ficha de produto de catálogo).

O resultado desta feature é um **cron que, de tempo em tempo, lê a lista de produtos que ainda
precisam de caixa cadastrada, visita a página pública de cada um e extrai as dimensões**, entregando
o resultado ao mesmo pipeline da 160: sanidade → consenso → proposta na fila ou promoção.

Scraping é **mais uma fonte**, não um atalho: entra como provedor `scraper:<site>` atrás da
`PackageBoxCatalogPort`, e nada que ele traz pula a sanidade nem vence medida humana.

## Postura diante do Cloudflare (regra da feature, não detalhe de implementação)

Boa parte dos sites alvo fica atrás do Cloudflare (Bot Management, Turnstile, "Just a moment...").
**O cron não contorna verificação anti-bot.** Contornar é violar a política do site e, na prática,
entra na categoria de evasão de detecção — um produto de mercado não pode depender disso.

- Desafio do Cloudflare detectado = **"bloqueado"**, nunca "tentar de novo com outro disfarce".
- Proibido: plugins _stealth_, falsificação de fingerprint TLS/JA3, resolvedores de CAPTCHA/Turnstile,
  proxies residenciais rotativos, reaproveitar cookie `cf_clearance` obtido por humano, rotação de
  User-Agent para parecer navegador.
- O cron se identifica com User-Agent honesto (`TransportAdA-BoxCatalogBot/1.0 (+URL de contato)`),
  respeita `robots.txt` e `Crawl-delay`, e roda em ritmo baixo.
- Caminho legítimo quando um site bloqueia: pedir ao dono do site para liberar o bot (Cloudflare
  "Verified Bots" / allowlist por IP ou header), usar a API oficial dele, ou tirar o site da lista.

## Fora do escopo

- Qualquer técnica de burlar Cloudflare, WAF, rate limit ou login (seção acima).
- Site que exige conta/login para ver a ficha.
- Sobrescrever medida humana (herdado da 160, RF08).
- Crawling aberto: o cron só visita URLs montadas a partir de um produto da fila, nunca segue links.

## Histórias priorizadas

### P1 — O produto pendente ganha medida proposta pela página pública

**Given** uma caixa em `nfe_package_boxes` com dimensões nulas, `carton_gtin` (ou código do fabricante)
preenchido, e um site habilitado que tem receita de busca para aquele produto
**When** o cron de scraping roda
**Then** ele baixa a página, extrai as dimensões pela receita do site, passa na sanidade da 160 e
grava uma proposta com `source = 'catalog'`, `engine = 'scraper:<site>'`, URL e data da leitura.

### P2 — Cloudflare bloqueia, o cron recua

**Given** o site responde com desafio do Cloudflare (ver RF04)
**When** o cron detecta o desafio
**Then** registra `BLOCKED_BY_CHALLENGE`, **não** tenta de novo naquela execução, abre o circuito do
site com recuo exponencial (1 h → 2 h → 4 h … teto de 7 dias) e, após 3 bloqueios seguidos, desliga
o site e emite um log `warn` único pedindo ação humana. Nenhum outro site é afetado.

### P3 — O site não quer ser lido

**Given** o `robots.txt` do site proíbe o caminho da ficha para o nosso User-Agent (ou para `*`)
**When** o cron vai montar a visita
**Then** não faz a requisição, registra `DISALLOWED_BY_ROBOTS` e o site fica desligado até alguém
revisar a configuração.

### P4 — A página mudou de layout

**Given** a receita de extração não encontra os campos esperados
**When** o parser roda
**Then** registra `EXTRACTION_FAILED` com hash do HTML (não o HTML), e com 5 falhas seguidas no mesmo
site o site é desligado com log `warn` — layout quebrado não vira milhares de requisições inúteis.

### P5 — Ninguém é lido duas vezes à toa

**Given** um produto já consultado naquele site
**When** o cron roda de novo
**Then** reusa o cache de `gtin_catalog_lookups` (achado, não achado, rejeitado), e só revisita
"não achado" depois de 30 dias.

## Requisitos funcionais

- RF01 — Gateway genérico `scraper-package-box-catalog.gateway.ts` que implementa a
  `PackageBoxCatalogPort` da 160, parametrizado por uma **receita de site** (`SiteRecipe`):
  `siteKey`, `baseUrl`, montagem da URL a partir do produto (GTIN / código do fabricante /
  busca), extrator das dimensões e do peso bruto, unidade declarada.
- RF02 — Receitas são código revisado (`*.recipe.ts`), uma por site, com teste de contrato sobre
  HTML salvo. Nada de seletor vindo de banco ou env.
- RF03 — Allowlist de sites habilitados por env (`BOX_SCRAPER_SITES=siteA,siteB`); vazio = cron
  termina sem fazer nada. Um site só entra na allowlist depois de revisão de `robots.txt` e termos de
  uso registrada no `plan.md` (tabela "Sites avaliados").
- RF04 — Detecção de desafio do Cloudflare, qualquer uma basta:
  - header `cf-mitigated: challenge`;
  - status 403/429/503 com header `server: cloudflare`;
  - corpo contendo `challenges.cloudflare.com`, `cf-chl-`, `_cf_chl_opt` ou título `Just a moment...`;
  - status 1020 no corpo (`Access denied | ... Cloudflare`).
    Resultado: `BLOCKED_BY_CHALLENGE`, sem retry na execução (P2).
- RF05 — `robots.txt` baixado uma vez por execução por site, cacheado 24 h, interpretado para o
  User-Agent do bot; `Crawl-delay` respeitado quando maior que o intervalo padrão.
- RF06 — Ritmo: uma requisição por vez por site, intervalo mínimo de 10 s entre requisições ao mesmo
  site, teto de `BOX_SCRAPER_MAX_REQUESTS_PER_SITE_PER_RUN` (padrão 50) por execução.
- RF07 — 429 com `Retry-After` (sem desafio) = parar o site nesta execução e respeitar o tempo pedido.
- RF08 — Extração devolve o mesmo `CatalogLookupResult` normalizado da 160 (mm inteiro, g inteiro),
  com a unidade de origem guardada; conversão de unidade só a declarada na página — reinterpretação
  continua sendo rejeição `UNIT_AMBIGUOUS` (RF06 da 160).
- RF09 — Seleção da fila: caixas com dimensão nula, ordenadas pela quantidade de caixas pendentes que
  compartilham o mesmo GTIN (maior ganho primeiro), sem repetir GTIN já no cache do site.
- RF10 — Fonte scraper conta como **uma** fonte no consenso da 160 (RF07 dela): sozinha só vira
  proposta; promove apenas concordando com outra fonte independente (API ou outro site).
- RF11 — Resultado de cada tentativa persistido em `gtin_catalog_lookups` com `provider =
'scraper:<siteKey>'`, código do veredito e URL; estado do circuito por site em
  `box_scraper_site_state` (global, sem `company_id`).

## Requisitos não funcionais

- RNF01 — Sem browser headless na primeira entrega: `fetch` nativo do Bun. Página que só renderiza
  com JavaScript fica fora (registrar como `REQUIRES_JAVASCRIPT` na avaliação do site). Se um dia
  entrar Playwright, é para renderizar, nunca para contornar desafio — e exige ADR.
- RNF02 — Timeout de 15 s por requisição; corpo limitado a 2 MB; só `text/html` é parseado.
- RNF03 — Log sem HTML, sem cookie, sem PII; loga `siteKey`, `gtin`, código do veredito, status e
  duração. O `robots.txt` negado e o bloqueio por desafio viram métrica por site.
- RNF04 — Dado global, não de tenant (igual ao RNF01 da 160).
- RNF05 — Execução one-shot em `apps/cron-transportada`, sem estado em memória entre execuções; teto
  de duração da execução de 20 min (encerra limpo e retoma na próxima).

## Casos extremos

- Site devolve 200 com página de desafio (Cloudflare "managed challenge" às vezes vem 200): a
  detecção é pelo corpo também (RF04), não só pelo status.
- Página achada mas com dimensão **do produto unitário**, não da caixa de embarque: receita tem de
  distinguir; se não distinguir, a sanidade rejeita por `GROSS_WEIGHT_BELOW_CONTENT`.
- Busca retorna vários produtos: só aceita resultado cujo GTIN exibido na página bate com o
  consultado; senão `AMBIGUOUS_MATCH`.
- DNS/TLS falhando: erro de rede, não conta como bloqueio nem consome teto do site.

## Critérios de aceite

- CA01 — Contrato: cada assinatura de desafio do RF04 (fixtures de HTML/headers) vira
  `BLOCKED_BY_CHALLENGE` e **zero** requisições adicionais ao site na mesma execução.
- CA02 — Contrato: três bloqueios seguidos desligam o site; recuo exponencial calculado certo.
- CA03 — Contrato: `robots.txt` que proíbe o caminho impede a requisição (contador de fetch = 0).
- CA04 — Contrato: intervalo mínimo entre requisições e teto por execução respeitados (relógio falso).
- CA05 — Contrato: receita de exemplo extrai dimensões de HTML salvo; HTML alterado dá
  `EXTRACTION_FAILED`; cinco falhas desligam o site.
- CA06 — Contrato: resultado do scraper sozinho não promove; com outra fonte concordando, promove.
- CA07 — Integração: cron completo contra servidor HTTP local (Bun.serve) que simula página boa,
  página de desafio, robots negando e 429 — fila e cache no estado esperado.
- CA08 — Nenhuma dependência de stealth/captcha/proxy no `package.json` (verificado por teste que lê
  o manifesto e por revisão).

## Dúvidas

- [NEEDS CLARIFICATION] **Quais sites entram na primeira receita?** Para cada um: URL da ficha,
  se o `robots.txt` permite, se os termos de uso permitem leitura automatizada, e se está atrás do
  Cloudflare com desafio para bots. **Bloqueia só a Fase 4** (receita real); o motor (Fases 1–3) é
  agnóstico de site e pode ser feito já.
- [NEEDS CLARIFICATION] Frequência do cron: proposta `0 */6 * * *` (a cada 6 h). Confirmar.
