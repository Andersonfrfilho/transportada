# ADR 0001 — Fundação Bun e aplicações separáveis

- Status: aceito
- Data: 2026-07-18
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

A fundação 001 comprovou o bootstrap local, mas foi construída com
pnpm/Turborepo, NestJS, Next.js, Prisma e BullMQ. As regras vigentes e a decisão
do mantenedor exigem Bun, API baseada em uWebSockets, Drizzle, worker Bun, Vite
e bibliotecas reutilizáveis no repositório Ada.

O pacote oficial `uWebSockets.js` é um addon V8 para Node. Bun incorpora
uWebSockets no próprio servidor HTTP/WebSocket e o expõe por `Bun.serve`.

## Decisão

1. Usar Bun como runtime, package manager, workspace runner e test runner.
2. Implementar HTTP com `Bun.serve`; não instalar o addon Node
   `uWebSockets.js`.
3. Substituir NestJS por composition roots Bun finos.
4. Substituir Prisma por Drizzle com Bun SQL e migrations versionadas.
5. Usar RabbitMQ para jobs fiscais críticos, com outbox, manual ack, retry/DLX,
   DLQ e idempotência.
6. Substituir Next.js por React/Vite SPA/PWA.
7. Manter cada app executável e extraível sem importar fonte de outro app.
8. Implementar bibliotecas reutilizáveis em `adatechnology-packages` e consumir
   versões publicadas. Código de domínio exclusivo permanece no app que o
   possui.
9. Manter Railway apenas como alvo futuro. Primeiro, todos os gates rodam
   localmente via Makefile.

## Consequências

- A feature 001 permanece como evidência histórica, mas sua stack é superada
  pela feature 002.
- O diretório local `packages/`, pnpm, Turbo, Nest, Next, Prisma e BullMQ serão
  removidos somente depois de paridade comprovada.
- Redis deixa de ser broker; só volta por necessidade concreta de cache,
  sessão ou pub/sub.
- API, worker e frontend terão package, configuração, imagem e comando próprios.
- Migração e rollback podem ocorrer app a app.

## Segurança fiscal

Emissão real permanece desabilitada. Antes de habilitá-la, o provider Ada deve:

- remover transporte TLS permissivo e validar a cadeia de confiança;
- substituir saídas diretas em stdout/stderr por logger com redaction;
- passar testes de contrato ESM/CommonJS no Bun;
- passar assinatura PFX e comunicação em homologação sem persistir segredo.

DACTE e consulta de CT-e continuam fora do contrato até existirem exports
públicos confirmados.

## Rollback

Cada task gera commit atômico. Apps podem voltar ao artefato anterior
independentemente. Pacotes Ada voltam por pin de versão, nunca por unpublish.
Worker antigo é drenado antes de iniciar o novo e envelopes de mensagem são
versionados. Nenhuma migration destrutiva faz parte desta decisão.
