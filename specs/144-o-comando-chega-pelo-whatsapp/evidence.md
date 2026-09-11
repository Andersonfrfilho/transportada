# Evidência

## T001 — Subir os pacotes WhatsApp (data 2026-09-11)

### Status: FECHADA por decisão — o upgrade foi revertido, a instalação fica na 0.1.0

**Decisão (2026-09-11):** o upgrade não é pré-requisito desta spec. Conferido por `npm pack` das três
0.1.0 e leitura dos `.d.ts`: `meta-whatsapp-module@0.1.0` já exporta `FlowInterpreter` e
`registerFlowAction(kind, handler: FlowActionHandler)` (`dist/index.d.ts:1093,1224`), aceita
`hooks?: MetaWhatsAppHooks` na fábrica (`:1141,1198`), e `meta-whatsapp-contracts@0.1.0` declara
`MetaWhatsAppHooks.onMessageReceived(message, session) => Promise<MessageHo…>` (`:2047`). O
provider 0.1.0 já tem `sendInteractiveList` e `sendInteractiveButtons`. O bump foi revertido (as
três apps seguem na 0.1.0, `runMetaWhatsAppMigrations(db)` inalterado), e o formato de migration
da 0.2.x/0.3.0 fica registrado abaixo como **dívida do pacote** — corrigi-la é changeset em
`adatechnology-packages`, com aprovação própria, e não bloqueia nada aqui.

**Prova depois do revert (6cdb98e6):** `make migration-test` contra Postgres descartável real —
**91 pass · 0 fail** (1101 `expect()`, 8 arquivos, 108,9 s). As 4 falhas da tentativa somem com a
volta à 0.1.0, o que confirma que eram do formato de migration do pacote e de nada mais.

O relato abaixo é o do upgrade tentado, preservado porque é o que justifica não subir.

### Versões escolhidas e por quê

Registry disponível: `meta-whatsapp-module` em `0.2.0-rc.0..31`, `0.2.0` e `0.3.0` (mais nova);
`meta-whatsapp-contracts` em `0.2.0` e `0.3.0`; `meta-whatsapp-provider` em `0.2.0` (só uma linha
estável acima da 0.1.0).

`npm view @adatechnology/meta-whatsapp-module@0.3.0 dependencies` mostra que a 0.3.0 do módulo
declara `meta-whatsapp-provider: 0.2.0` e `meta-whatsapp-contracts: 0.3.0` como as próprias
dependências — esse é o trio que o pacote mais novo já espera, então foi o escolhido:

| pacote                                   | antes | depois    | app(s)                                |
| ---------------------------------------- | ----- | --------- | ------------------------------------- |
| `@adatechnology/meta-whatsapp-module`    | 0.1.0 | **0.3.0** | api-transportada                      |
| `@adatechnology/meta-whatsapp-contracts` | 0.1.0 | **0.3.0** | api-transportada                      |
| `@adatechnology/meta-whatsapp-provider`  | 0.1.0 | **0.2.0** | api-transportada, worker-transportada |

Versões exatas, sem `^`, como o restante do `package.json` já faz.

### Breaking changes encontradas

1. **Confirmada a premissa do `plan.md`**: `runMetaWhatsAppMigrations` deixou de receber a conexão
   direto e passou a exigir `{ db, migrate }` — o mesmo arranjo que `notification-module` e
   `user-module` já usam neste repositório (`migrate` de `drizzle-orm/bun-sql/migrator`, injetado
   pelo host). Corrigido em
   `apps/api-transportada/src/database/meta-whatsapp-migration.service.ts`.
2. **Nenhuma outra assinatura usada por este repositório mudou.** Conferido contra
   `node_modules/@adatechnology/meta-whatsapp-module/dist/index.d.ts` (0.3.0) e
   `.../meta-whatsapp-provider/dist/index.d.ts` (0.2.0):
   - `createMetaWhatsAppModule({ db, config, nonceStore, ... })` — mesma forma, `hooks` e
     `inboundQueue` são novos e **opcionais**; sem eles o módulo se comporta como sempre (o próprio
     `.d.ts` documenta: "Sem fila o módulo se comporta como sempre: os hooks rodam dentro da
     requisição do webhook").
   - `NonceStoreInterface.setIfAbsent` — igual; ganhou um `confirm?` opcional que
     `drizzle-webhook-nonce.store.ts` não precisa implementar.
   - `verifyWebhookSignature({ rawBody, signatureHeader, appSecret })` — igual.
   - `ReceiveWebhookResult` ganhou três campos novos (`ignoredForeignNumber`,
     `accountEventsProcessed`, `unhandledEvents`), todos aditivos; `whatsapp-webhook.routes.ts` só
     lê `duplicate`, `messagesProcessed` e `statusesProcessed` e continua compilando.
   - `WhatsAppMessageProvider.sendText` / `.sendTemplate` (provider 0.2.0) — mesma assinatura que o
     código em `meta-whatsapp-sending.gateway.ts` e `whatsapp-code-sender.gateway.ts` já usa.
   - Não existe `CHANGELOG.md` publicado dentro de nenhum dos três pacotes instalados
     (`node_modules/.../dist` não traz o arquivo) — a conferência acima foi feita direto contra os
     `.d.ts` gerados e contra o uso real em `apps/api-transportada/src` e
     `apps/worker-transportada/src`.

### ⚠️ Achado bloqueante — não estava nas premissas do plan.md

**As migrations que o pacote `meta-whatsapp-module` embute mudaram de formato, e o formato novo é
incompatível com o `drizzle-orm` 1.0.0-rc.4 já instalado neste monorepo — em TODAS as versões da
linha 0.2.x/0.3.x, não só na escolhida.**

- Na 0.1.0 (a que estava pinada), `dist/migrations/` é o formato "por pasta" que o `drizzle-kit`
  atual também gera (`<timestamp>_<nome>/{migration.sql,snapshot.json}`, sem `meta/_journal.json`)
  — o mesmo formato de `apps/api-transportada/drizzle/*` e do `notification-module` já instalado.
- A partir da 0.2.0-rc.0 (conferido em 0.2.0-rc.22 — a versão citada no `plan.md` —, 0.2.0 e 0.3.0,
  as três baixadas e inspecionadas por `npm pack`), o pacote passou a publicar o formato antigo
  "por journal" (`dist/migrations/meta/_journal.json`, `"version": "7"`, arquivos `NNNN_nome.sql`
  soltos).
- O migrator do `drizzle-orm` 1.0.0-rc.4 (`drizzle-orm/migrator.js`, chamado por
  `drizzle-orm/bun-sql/migrator`) **recusa esse formato antigo de propósito**:
  ```
  error: We detected that you have old drizzle-kit migration folders. You must upgrade drizzle-kit
  and run "drizzle-kit up"
  ```
  "`drizzle-kit up`" é um comando de projeto (reescreve as pastas de migration do SEU projeto) —
  não existe forma de rodá-lo dentro de `node_modules` de uma dependência, e o
  `RunMetaWhatsAppMigrationsParams` do pacote (`{ db, migrate }`) não expõe nenhum parâmetro para
  apontar para um `migrationsFolder` alternativo que pudéssemos gerar nós mesmos.
- Reproduzido com `make migration-test` (Postgres descartável via Docker, real): 4 dos 91 testes do
  alvo `db:test` falham, todos na cadeia que chama `runMetaWhatsAppSchemaMigrations` — o teste
  "cria o schema de notificação" do pre-deploy também aparece na lista porque o pre-deploy roda as
  migrations de todos os módulos em sequência, e é o passo do WhatsApp que estoura no meio dela.
  Sem Postgres alcançável (`bun run --cwd apps/api-transportada test`, sem `make up`/Docker), os
  quatro testes de migration do WhatsApp são pulados (`4 skip`) em vez de passar — por isso o gate
  "testes da app" isolado não pegou o problema, e só `make migration-test` o revela.

**Isto não é algo que T001 possa corrigir dentro do escopo desta task**: não é para alterar o
repositório `adatechnology-packages` (changeset é de outra sessão, com aprovação), e reescrever o
runner de migration para ler o formato antigo à mão seria inventar um migrator paralelo dentro de
código que grava schema em produção — risco desproporcional a uma task que o próprio `tasks.md`
descreve como "isolada".

**Pedido de decisão, antes de continuar a Fase 0/1:**

1. Pedir ao mantenedor de `adatechnology-packages` para regravar as migrations do
   `meta-whatsapp-module` no formato de pasta atual (como o pacote já fazia na 0.1.0) — mais
   provável de ser a correção certa, já que o resto do pacote (contracts, provider, o próprio
   `drizzle-orm` como peer) está alinhado com o `drizzle-orm` novo.
2. Ou aceitar rodar esta instalação com uma versão de `drizzle-orm` que ainda leia o formato
   antigo — mudança bem maior que esta task, atravessa `api-transportada`, `worker-transportada` e
   `cron-transportada`, e pediria avaliação própria.

Este worktree fica com o `package.json`/`bun.lock` já nas versões 0.3.0/0.3.0/0.2.0 e a assinatura
`{ db, migrate }` já corrigida — o que **não** depende da decisão acima —, mas T001 continua
**aberta** em `tasks.md` até a decisão vir.

### Arquivos alterados

- `apps/api-transportada/package.json` — `meta-whatsapp-contracts`/`-module` 0.1.0 → 0.3.0,
  `meta-whatsapp-provider` 0.1.0 → 0.2.0.
- `apps/worker-transportada/package.json` — `meta-whatsapp-provider` 0.1.0 → 0.2.0.
- `apps/api-transportada/src/database/meta-whatsapp-migration.service.ts` — `runMetaWhatsAppMigrations`
  chamado com `{ db, migrate }` (migrator `drizzle-orm/bun-sql/migrator`, igual a
  `notification-migration.service.ts` e `user-migration.service.ts`).
- `bun.lock` — atualizado por `bun install`.

### Gates

| gate                                                    | resultado                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck` (raiz, 6 apps)                      | ✅ verde — `api-transportada`, `worker-transportada`, `cron-transportada`, `frontend-transportada`, `frontend-client`, `frontend-landing`                                                                                                                                                                                                            |
| `bun run --cwd apps/api-transportada test`              | ⚠️ 5042 pass / 23 skip / **1 fail** — `cargo-volume.contract.test.ts`, orçamento de 50ms excedido (80–114ms nas três repetições); teste de performance sensível à carga da máquina, sem relação com WhatsApp — meu diff não toca nada de `cargo-placement`. Os 4 testes de migration do WhatsApp aparecem como `skip` aqui (sem Postgres alcançável) |
| `bun run --cwd apps/worker-transportada test`           | ✅ 974 pass / 0 fail                                                                                                                                                                                                                                                                                                                                 |
| `make check` (format + lint + typecheck + test + build) | ⚠️ format ✅, lint ✅, typecheck ✅, `bun run build` ✅ (roda fora da cadeia por causa do `&&` truncado pelo teste) — `test` interrompe a cadeia com o mesmo 1 fail de `cargo-volume` acima                                                                                                                                                          |
| `make migration-test` (Postgres descartável real)       | ❌ **87 pass / 4 fail** — os 4 são a cadeia de migration do `meta-whatsapp-module`, pelo achado bloqueante acima                                                                                                                                                                                                                                     |

### Repetição da falha de `cargo-volume.contract.test.ts` (para separar do achado bloqueante)

Rodado três vezes em momentos diferentes desta sessão, sempre come tempos diferentes e sempre acima
do teto de 50ms (106ms, 114ms, 80ms) — típico de teste de orçamento de tempo competindo por CPU com
o resto da suíte, não uma regressão determinística. `git diff --stat` desta sessão toca só
`apps/api-transportada/package.json`, `apps/worker-transportada/package.json`,
`apps/api-transportada/src/database/meta-whatsapp-migration.service.ts` e `bun.lock` — nada em
`cargo-placement`.
