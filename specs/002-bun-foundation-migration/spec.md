# Feature 002 — Migração da fundação para Bun

## Problema e resultado

A fundação executável usa uma stack superada pelas regras do projeto. O
resultado esperado é um baseline Bun local, reproduzível e testado, com API,
worker e frontend independentes e sem habilitar operação fiscal real.

## Fora do escopo

- autenticação e módulos de negócio;
- schema fiscal ou migration de dados de produção;
- emissão real, DACTE ou consulta de CT-e;
- deploy ou provisionamento no Railway;
- Kubernetes, Kong ou micro-frontends.

## Histórias priorizadas

### P1 — Desenvolvimento local Bun

**Given** um checkout limpo com Bun, Make e Docker, **When** o mantenedor executa
`make bootstrap`, `make up`, `make dev` e `make smoke`, **Then** frontend, API,
worker, PostgreSQL, RabbitMQ, MinIO e Mailpit ficam saudáveis com recursos
prefixados por projeto e ambiente.

### P1 — Aplicações separáveis

**Given** qualquer uma das três aplicações, **When** seus scripts são
executados a partir do próprio diretório, **Then** ela instala, testa, compila e
inicia sem importar fonte de outro app ou depender de package local.

### P1 — API e worker Bun

**Given** a fundação iniciada, **When** health e readiness são consultados,
**Then** a API responde por `Bun.serve` e o worker expõe somente o health
interno, ambos com correlation ID, erro tipado e shutdown gracioso.

### P1 — Persistência e mensageria

**Given** PostgreSQL e RabbitMQ locais, **When** os testes de integração rodam,
**Then** Drizzle conecta via Bun SQL e o broker comprova manual ack, prefetch,
retry/DLX, DLQ e encerramento sem perder mensagem.

### P1 — Frontend conforme regras

**Given** o frontend Vite, **When** build e smoke visual rodam, **Then** a SPA é
instalável como PWA, usa tokens e i18n, integra dados remotos por TanStack Query
e funciona em 375 px, 768 px e 1280 px.

## Requisitos funcionais

- Bun fixado como runtime, package manager e test runner;
- `Bun.serve` para HTTP; sem Nest, Express ou addon V8 uWebSockets.js;
- Drizzle/Bun SQL e migrations versionadas;
- RabbitMQ como broker do worker fiscal;
- React/Vite/PWA no frontend;
- packages Ada com versão fixa para integrações reutilizáveis;
- Makefile como única interface documentada de ambiente local.

## Requisitos não funcionais

- TypeScript estrito e sem `any`;
- apps instaláveis e executáveis isoladamente;
- nenhum segredo, certificado ou XML sensível em logs;
- emissão real desabilitada;
- migrations não executam no startup;
- dinheiro nunca é representado como ponto flutuante binário;
- gates locais completos antes de qualquer Railway.

## Casos extremos e falhas

- dependência Ada ainda não publicada bloqueia integração por versão; não usar
  `file:` como solução permanente;
- indisponibilidade do broker deixa readiness degradado e não derruba liveness;
- `SIGTERM` interrompe novos consumos, drena trabalho corrente e só então fecha;
- falha transitória usa retry; falha fatal/repetida vai para DLQ;
- frontend offline serve fallback e não armazena token sensível.

## Critérios de aceite

- `bun install --frozen-lockfile` passa na raiz;
- cada app passa lint, typecheck, testes e build isoladamente;
- `make check` e `make smoke` passam em checkout reproduzível;
- busca não encontra dependências ativas de pnpm, Nest, Express, Next, Prisma,
  BullMQ ou imports `@transportada/*`;
- migration baseline Drizzle aplica em banco vazio e não contém operação
  destrutiva;
- testes cobrem readiness degradado, redelivery/DLQ, shutdown e isolamento de
  configuração;
- evidência registra versões, comandos e resultados;
- nenhuma configuração ou deploy Railway é executado.

## Dúvidas

Nenhuma dúvida bloqueante. A ADR 0001 registra as decisões do mantenedor.
