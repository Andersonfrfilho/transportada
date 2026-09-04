# 082 — Tarefas

Uma por vez, na ordem. Task só fecha com evidência em `evidence.md`.
Legenda: 🧠 = exige `opus` mesmo dentro de fase barata · 📍 = roda no `transportada-mobile`

## Fase 0 — A API destrava o app

> 🤖 Modelo: `sonnet` · repositório: `transportada`

### T0.1 — `keycloak` na rota pública

- **Onde:** `landing/application/landing-settings.use-case.ts`, `landing/presentation/landing.schema.ts`, `config/`
- **O que:** acrescentar `keycloak: {url, realm, clientId}` a `PublicLandingSettings`, lido do env que
  já configura o realm. Não é tabela: é a mesma instalação para todo mundo.
- **Contrato antes:** a rota devolve o bloco; env ausente **derruba o boot**, não serve bloco vazio.
- **Aceite:** `curl` em staging devolve os três campos; `bun run --cwd apps/api-transportada test` verde.
- **Depende de:** nada. **É a tarefa que destrava a Fase 1.**

### T0.2 — `on_delivery_route` e as duas transições

- **Onde:** `database/trip.schema.ts`, `drizzle/`, `trips/domain/trip-state.policy.ts`, `trips/presentation/me-trip.routes.ts`
- **O que:** valor novo no enum e no CHECK; `POST /me/trips/current/confirm-load` e
  `.../start-route`, ambas `trip.report`.
- **Contrato antes:** transição manual não anda para trás (`tripStatusRank`); fechar nota em
  `dispatched` salta para `on_delivery_route`; repetir o toque converge, não erra.
- **Aceite:** `make migration-test` verde com rollback; contrato de máquina de estados verde.
- **Depende de:** nada.

### T0.3 — `wrong_address` e a distância aferida

- **Onde:** `database/trip.schema.ts`, `drizzle/`, `trips/presentation/occurrence.schema.ts`
- **O que:** sexto valor no CHECK de `TRIP_STOP_OCCURRENCE_KINDS`; colunas de distância em metros e
  do estado "não aferida".
- **Contrato antes:** ocorrência sem distância é aceita e marcada; distância acima de 5 km é gravada,
  nunca recusada.
- **Aceite:** `make migration-test` verde; contrato de ocorrência verde.
- **Depende de:** nada.

### T0.4 🧠 — O rastro expira sem depender da viagem

- **Onde:** `trips/application/`, `database/client-portal.schema.ts`, catálogo de rotinas
- **O que:** teto de idade do envio (viagem aberta há mais de N horas para de aceitar posição) e
  expurgo por idade do ping, independente de `purgeByTrip`.
- **Contrato antes:** viagem esquecida aberta na sexta **não** acompanha o motorista no fim de semana.
- **Aceite:** integração com relógio injetado, como o expurgo de 90 dias já faz.
- **Depende de:** nada. **Bloqueia a Fase 4.**

## Fase 1 — Entrar 📍

> 🤖 Modelo: `sonnet` · repositório: `transportada-mobile`

### T1.1 — Tokens nos dois temas

- **O que:** `theme.constant.ts` com claro e escuro, `scale()`, `TOUCH_TARGET`.
- **Contrato antes:** paridade com `frontend-transportada/src/styles/index.css` (cópia por valor,
  como `FUEL_TYPES`); nenhum literal de cor fora do arquivo.
- **Aceite:** `bun run check` verde.

### T1.2 — i18n

- **O que:** `onboarding.locale.json` e `.en.`, provider do i18next.
- **Contrato antes:** nenhum texto literal em `*.tsx`; acentuação do pt-BR guardada por blocklist.

### T1.3 — Guardar instalação e token

- **O que:** adaptador de armazenamento por trás da porta que `installationConfig.service.ts` já
  consome, e keychain para o token.
- **Contrato antes:** a URL vai para o armazenamento comum; **o token nunca**.
- ⚠️ Dependência nativa nova — decidir entre as opções antes de instalar.

### T1.4 — As duas faces da primeira tela

- **O que:** telas 1 a 6 do canvas, sobre `reduceOnboarding` (pronto, 15 contratos verdes).
- **Contrato antes:** ⚠️ **já existe** — `onboarding-state.contract.ts` cobre esta tarefa inteira.
- **Aceite:** as seis telas nos dois temas, com esqueleto e sem piscar.

### T1.5 — PKCE

- **O que:** `POST /login-hint`, authorization code + PKCE no navegador do sistema, `directAccessGrants` intocado.
- **Contrato antes:** a senha não passa pelo app; falha do `login-hint` segue com o digitado.
- **Depende de:** T0.1.

## Fase 2 — Ver a viagem 📍

> 🤖 Modelo: `sonnet`

- **T2.1** Cliente HTTP com token do keychain, 401 devolvendo à tela de entrar.
- **T2.2** `GET /me/trips/current` tipado + escolha entre duas viagens despachadas.
- **T2.3** Barra de navegação, faixa de offline, esqueletos com a forma do conteúdo.
- **T2.4** Viagem, paradas, parada, notas com cópia rápida.
- **T2.5** Conferir carga e iniciar trajeto. **Depende de T0.2.**

## Fase 3 — Agir na viagem 📍

> 🤖 Modelo: `sonnet` (T3.1 é 🧠)

- **T3.1** 🧠 Fila offline com idempotência do servidor, **incluindo arquivo**, com teto e descarte.
  **Contrato antes:** reenvio não duplica; a tela nunca diz "enviado" para o que está na fila.
- **T3.2** Chegada, entrega e devolução, com uma leitura de posição por confirmação.
  **Contrato antes:** recusa de GPS **não** bloqueia entrega.
- **T3.3** Quem recebeu: cinco papéis, preenchimento pelo próprio destinatário, campo do vizinho.
- **T3.4** Assinatura em tela cheia deitada, com trava de orientação **por tela**.
- **T3.5** Recorte do comprovante e conferência da numeração.
  **Contrato antes:** barras antes de OCR; divergência avisa e deixa enviar; leitura vazia não acusa.
- **T3.6** Ocorrência nos dois catálogos, prévia do template, regras de posição.
  **Contrato antes:** permissão negada bloqueia; sem sinal não; acima de 5 km avisa e grava.
  **Depende de T0.3.**

## Fase 4 — O que só o nativo faz 📍

> 🤖 Modelo: `opus` 🧠

- **T4.1** 🧠 Posição em segundo plano com as cinco travas do RF-7. **Depende de T0.4.**
- **T4.2** 🧠 Guia interno com provedor de roteirização e a saída obrigatória para o mapa do aparelho.
  ⚠️ `[NEEDS CLARIFICATION]` do provedor **precisa estar fechado** antes desta task.

## Fase 5 — Loja 📍

> 🤖 Modelo: `haiku` para o mecânico, `sonnet` para as justificativas

- **T5.1** Ícones, splash, identidade nativa.
- **T5.2** Justificativas de permissão, com a razão do segundo plano na tela antes do pedido.
- **T5.3** Build assinado nas duas lojas.

## Comandos de verificação

```bash
bun run check                       # no transportada-mobile: lint + typecheck + test
make check                          # no transportada: gate completo
make migration-test                 # migration + rollback em Postgres descartável
```

⚠️ Teste novo **não roda** se não for acrescentado à lista explícita do `package.json`.
