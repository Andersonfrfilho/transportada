# 082 — Plano

## A ordem tem uma razão, e ela não é a das telas

O app não pode ser construído tela a tela na ordem em que o motorista as vê, porque **a primeira tela
é a que mais depende da API**: sem o bloco `keycloak` em `/public/landing-settings`, nenhuma
instalação real é aceita, e nada depois dela pode ser exercitado com dado de verdade.

Então a ordem é: **destravar a API → entrar → ver a viagem → agir na viagem → o que só o nativo faz**.
Cada fase termina com algo que roda contra a instalação de staging, não com uma tela bonita.

## Fases

### Fase 0 — A API destrava o app (neste monorepo)

> 🤖 Modelo: `sonnet` (T0.4 é 🧠 — o expurgo do rastro mexe em dado pessoal; validar com `opus`)

Sem isto o app é maquete. São quatro mudanças pequenas em `api-transportada`, e três delas já têm ADR
escrita.

- **T0.1** `keycloak: {url, realm, clientId}` em `PublicLandingSettings`, servido pela rota anônima
  que já existe. Vem de env, não de tabela: é o mesmo realm que a app web usa.
- **T0.2** `on_delivery_route` em `TRIP_STATUSES` (migration + CHECK), e as duas transições manuais
  em `/me/trips/current` (`trip.report`). `resolveDerivedCandidate` passa a conviver com elas via
  `tripStatusRank`.
- **T0.3** `wrong_address` no CHECK de `TRIP_STOP_OCCURRENCE_KINDS`, mais a distância aferida e o
  estado "não aferida" em `trip_stop_occurrences`.
- **T0.4** 🧠 Teto de idade do envio de posição e expurgo próprio do rastro, independente do
  fechamento da viagem. É o que a ADR-0056 §2 exige antes de qualquer segundo plano.

**Aceite da fase:** `make check` verde, `make migration-test` verde, e `GET /public/landing-settings`
de staging devolvendo o bloco `keycloak`.

### Fase 1 — Entrar (no `transportada-mobile`)

> 🤖 Modelo: `sonnet`

Os dois serviços puros **já existem e estão verdes** (37 contratos). O que falta é tela e sessão.

- **T1.1** Tokens de tema nos dois modos, `scale()`, e o contrato de paridade com `styles/index.css`.
- **T1.2** i18n com os dois `*.locale.json`, e o contrato de acentuação.
- **T1.3** Armazenamento da instalação (adaptador nativo por trás da porta que a máquina de estados
  já consome) e keychain para o token.
- **T1.4** As duas faces da primeira tela, sobre `reduceOnboarding`, que já está pronto e testado.
- **T1.5** PKCE no navegador do sistema, com `POST /login-hint` antes.

**Aceite:** entrar de verdade numa instalação de staging, no aparelho, nos dois temas.

### Fase 2 — Ver a viagem

> 🤖 Modelo: `sonnet`

- **T2.1** Cliente HTTP com token do keychain e o tratamento de 401.
- **T2.2** `GET /me/trips/current` tipado, com a escolha entre duas viagens despachadas.
- **T2.3** Barra de navegação, faixa de offline, esqueletos.
- **T2.4** Viagem, paradas, parada e as notas com cópia rápida.
- **T2.5** Conferir a carga e iniciar trajeto (T0.2).

**Aceite:** uma viagem real de staging aberta no aparelho, com as duas transições funcionando.

### Fase 3 — Agir na viagem

> 🤖 Modelo: `sonnet` (T3.1 é 🧠 — a fila é onde o dado se perde)

- **T3.1** 🧠 Fila offline com idempotência do servidor, **incluindo arquivo**, com teto e descarte.
- **T3.2** Chegada, entrega, devolução, com posição por confirmação.
- **T3.3** Quem recebeu, com os cinco papéis e o campo do vizinho.
- **T3.4** Assinatura em tela cheia deitada.
- **T3.5** Recorte do comprovante e conferência da numeração (barras, depois OCR).
- **T3.6** Ocorrência nos dois catálogos, com prévia do template e as regras de posição.

**Aceite:** ciclo completo no aparelho **com o modo avião ligado no meio**, e tudo subindo depois.

### Fase 4 — O que só o nativo faz

> 🤖 Modelo: `opus` 🧠 — as duas tarefas mexem em dado pessoal e em custo recorrente

- **T4.1** 🧠 Posição em segundo plano, com as cinco travas do RF-7. **Depende de T0.4.**
- **T4.2** 🧠 Guia interno com provedor de roteirização, e a saída para o mapa do aparelho.

**Aceite:** rastro aparecendo no portal do contratante com a tela do motorista apagada, e o guia
levando até uma parada real.

### Fase 5 — Loja

> 🤖 Modelo: `haiku` para o mecânico, `sonnet` para as justificativas

Ícones, splash, identidade `br.com.adatechnology.transportada`, e as justificativas de permissão —
localização em segundo plano é o item que reprova revisão quando a razão não está escrita na tela.

## O que decidimos não fazer nesta spec

Chat, recalcular, reordenar, tempo de chegada, histórico de viagens, releitura de comprovante e
documento do recebedor. Cada um é ADR própria, e três deles revertem decisão existente.

## Riscos

| Risco                                   | O que fazemos                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| A fila de arquivo enche o aparelho      | Teto e descarte declarados na T3.1, não depois                                        |
| O provedor de rota vira custo sem teto  | A saída para o mapa do aparelho (RF-3.2) é o plano B, e ela é obrigatória             |
| Revisão da loja recusa o segundo plano  | A razão vai na tela antes do pedido (RF-7.2), não só na ficha da loja                 |
| Duas sessões no mesmo repositório       | Uma árvore por sessão; o conflito de 03/09 custou meio dia                            |
| Divergência de contrato entre app e API | Contrato de paridade por texto de fonte, como `FUEL_TYPES` e `VEHICLE_TYPES` já fazem |
