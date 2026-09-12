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

## Fase 1 — validação do architect antes da T003 (2026-09-11)

**Veredito: APROVADO COM AJUSTES.** O D1 e o D2 se sustentam; a T003 como estava escrita não. Os
ajustes foram incorporados à spec, ao plano e às tasks no mesmo commit desta seção.

| ajuste | o que muda                                                                                                  | por quê (evidência)                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1     | vínculo em `user_whatsapp_phones`, não em `login_identifiers`                                               | `rebuildLoginIdentifiers` faz delete + insert das linhas `source='profile'` (`drizzle-company-user.repository.ts:120-163`), e o `verified_at` sumiria na próxima edição da ficha |
| A2     | `whatsapp_phone_verification_requests` no molde de `password_reset_requests`, **sem** unique de `code_hash` | 6 dígitos são um milhão de códigos; o unique global só existe lá porque a rota é anônima                                                                                         |
| A3     | verificação **de entrada**, com o `from` casado; T004 vai para depois da T006                               | prova a posse do WhatsApp, dispensa template pago e o nono dígito                                                                                                                |
| A4     | `toWhatsAppPhone` + `isSameWhatsAppPhone`, cópia por valor no worker; `maskPhone` criado no logging         | `maskPhone` não existia (grep vazio na API e no worker)                                                                                                                          |
| A5     | `resolveCompanyForUser` extraído de `TenantContextService`                                                  | `resolveCompany` lê a empresa do JWT (`tenant-context.service.ts:41-72`); `resolveCompanyPermissions` já é pura (`authorization.policy.ts:138`)                                  |
| A6     | validade de 90 dias, admin só desfaz, trilha em `audit_logs`                                                | número reciclado pela operadora é o risco mais sério do D1                                                                                                                       |
| A7     | texto corrigido                                                                                             | `source='whatsapp'` não existe (CHECK `in ('profile','manual')`); os casos de recusa são **quatro**; o limitador existe, em memória e opt-in                                     |

Achado fora do escopo, registrado como task separada: `toMetaRecipient`
(`worker-transportada/src/whatsapp/infrastructure/whatsapp-code-sender.gateway.ts:100-102`) envia
sem o `55`, então o convite por WhatsApp da 062 T005 sai sem código de país.

## T002 — canonicalização do telefone (2026-09-11)

Arquivos:

- `apps/api-transportada/src/whatsapp-commands/domain/whatsapp-phone.policy.ts` — `toWhatsAppPhone`,
  `isSameWhatsAppPhone`
- `apps/worker-transportada/src/whatsapp/domain/whatsapp-phone.policy.ts` — cópia por valor, byte a
  byte
- `apps/api-transportada/src/logging/phone-mask.policy.ts` — `maskPhone`
- Contratos: `api-transportada/test/whatsapp-commands/whatsapp-phone.contract.ts`
  (`test/whatsapp-commands.contract.test.ts`), `api-transportada/test/logging/phone-mask.contract.ts`
  (`test/logging-redaction.contract.test.ts`), `worker-transportada/test/whatsapp-phone/whatsapp-phone.contract.ts`
  (mesma tabela) e `worker-transportada/test/whatsapp-phone/parity.contract.ts` (os dois arquivos da
  política idênticos), entrada `test/whatsapp-phone.contract.test.ts`. Os três entrypoints entraram na
  lista explícita de `test` dos `package.json`.

Vermelho, antes da implementação:

```text
api:    error: Cannot find module '../../src/logging/phone-mask.policy.js' … 0 pass · 2 fail · 2 errors
worker: error: Cannot find module '../../src/whatsapp/domain/whatsapp-phone.policy.js' … 0 pass · 1 fail · 1 error
```

Verde depois: API 31 pass (2 arquivos), worker 28 pass (1 arquivo).

Decisões de borda:

- **Comprimento decide, não o prefixo.** 10/11 dígitos é número local e ganha `55` — inclusive DDD 55
  (RS): `55999991234` vira `5555999991234`. 12/13 dígitos já têm país e só passam se casarem
  `^55[1-9][0-9]{9,10}$`.
- **Só grafia de telefone é aceita**: dígitos, espaço, `(`, `)`, `-`, `.` e `+` inicial. Letra no meio
  é recusa, não limpeza — `16a99991234` não vira telefone.
- **Nono dígito**: `isSameWhatsAppPhone` retira o `9` só do canônico de 13 dígitos com `9` logo
  depois do DDD; `5516899991234` × `551699991234` não casam. Entrada inválida nunca casa, nem com ela
  mesma.
- `maskPhone` descarta tudo que não é dígito e mostra `****` + os quatro últimos; menos de quatro
  dígitos é `****`.

| entrada                                       | `toWhatsAppPhone` |
| --------------------------------------------- | ----------------- |
| `16999991234`                                 | `5516999991234`   |
| `1633334444`                                  | `551633334444`    |
| `5516999991234`                               | `5516999991234`   |
| `551633334444`                                | `551633334444`    |
| `+55 16 99999-1234`                           | `5516999991234`   |
| `(16) 99999-1234`                             | `5516999991234`   |
| `16 3333 4444`                                | `551633334444`    |
| `55999991234`                                 | `5555999991234`   |
| `5533334444`                                  | `555533334444`    |
| `5555999991234`                               | `5555999991234`   |
| `''`, `'   '`, `abc`, `16a99991234`           | `undefined`       |
| `01699991234`, `5501699991234` (DDD 0)        | `undefined`       |
| `123`, `999991234`, `55123`, `55016999991234` | `undefined`       |
| `441633334444`, `4416999991234` (outro país)  | `undefined`       |

Gates:

- `bun run typecheck` → 0 erros
- `bun run --cwd apps/api-transportada test` → 5073 pass · 1 fail (a flaky conhecida: "o Atego de 1417
  caixas cabe no orçamento de 50 ms", 144 ms sob CPU concorrente); isolada,
  `bun test ./test/cargo-volume.contract.test.ts` → 303 pass · 0 fail
- `bun run --cwd apps/worker-transportada test` → 1002 pass · 0 fail
- `make check` → exit 0 (API 5074 pass, worker 1002 pass, frontend 3316 pass)

## T003 — o vínculo e o pedido de verificação (2026-09-11)

Só dados: duas tabelas, schema Drizzle, repositório, porta, erro tipado e cópia no worker. Casos de
uso, rotas e a verificação ficam para T004/T005.

### SQL essencial (`drizzle/20260911231025_whatsapp_phone_binding/migration.sql`)

```sql
CREATE TABLE "user_whatsapp_phones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL CONSTRAINT "user_whatsapp_phones_user_id_unique" UNIQUE,
  "phone" text NOT NULL,
  "verified_at" timestamp with time zone,
  "created_at" / "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_whatsapp_phones_phone_check" CHECK ("phone" ~ '^55[1-9][0-9]{9,10}$')
);
CREATE TABLE "whatsapp_phone_verification_requests" (
  "id" uuid PK, "company_id" uuid NOT NULL, "user_id" uuid NOT NULL, "phone" text NOT NULL,
  "code_hash" text NOT NULL, "attempt_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamptz NOT NULL, "consumed_at" timestamptz, "created_at" timestamptz,
  CHECK ("phone" ~ '^55[1-9][0-9]{9,10}$'), CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
  CHECK ("attempt_count" between 0 and 5), CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "user_whatsapp_phones_phone_verified_unique"
  ON "user_whatsapp_phones" ("phone") WHERE "verified_at" is not null;
CREATE UNIQUE INDEX "whatsapp_phone_verification_requests_company_id_user_id_live_unique"
  ON ... ("company_id","user_id") WHERE "consumed_at" is null;
CREATE INDEX "whatsapp_phone_verification_requests_company_id_phone_live_idx"
  ON ... ("company_id","phone") WHERE "consumed_at" is null;
-- FKs: user_id → identity_users ON DELETE CASCADE;
--      company_id → companies RESTRICT;
--      (user_id, company_id) → user_company_memberships(user_id, company_id) RESTRICT
```

`rollback.sql` ao lado derruba só as duas tabelas e apaga a linha do diário por nome **e** hash,
com `ROW_COUNT <> 1` abortando.

### Decisões

- **O padrão do CHECK sai da policy da T002.** `WHATSAPP_PHONE_PATTERN` passou a ser exportado de
  `whatsapp-phone.policy.ts` e o schema o lê por `.source`, como `TAX_ID_PATTERN` em
  `aggregate-application.schema.ts`. A mudança foi feita **nas duas cópias** (API e worker), de
  forma idêntica, porque `worker-transportada/test/whatsapp-phone/parity.contract.ts` exige os dois
  arquivos byte a byte iguais; mudar só o da API reprovaria a paridade.
- **O teto 5 é constante** (`whatsapp-phone-verification.constant.ts`), lido pelo CHECK e pelo
  `WHERE` de `incrementAttempt`, para o contador nunca passar do que o banco aceita.
- **A membership tem `unique(user_id, company_id)`**, então a FK composta do molde de
  `password_reset_requests` coube sem ajuste.
- **Sem unique em `code_hash`** (plan § Dados item 3), e o contrato de schema afirma a ausência.
- **`findLiveRequestByCompanyAndPhone` devolve lista**, mais recente primeiro: dois usuários da
  mesma empresa podem ter declarado o mesmo número, e quem desempata é o código (T004).
- **A colisão é decidida pelo índice parcial, não por leitura prévia**: `saveVerified` faz upsert por
  `user_id` e traduz o `23505` de `user_whatsapp_phones_phone_verified_unique` em
  `WhatsAppPhoneTakenError` (`WHATSAPP_PHONE_TAKEN`, 409), no padrão `ApiError` de
  `company-user.error.ts`. O repositório não tem `DomainError`/`codes.ts` central; segui o vigente.
- **O SQL gerado vinha com deriva de migrations escritas à mão** (pedágio, eixos, colunas de viagem
  já aplicadas): foi recortado para só as duas tabelas. O `snapshot.json` ficou inteiro, porque ele
  descreve o schema resultante.
- **FK do usuário com nome explícito**: sem ele o kit emite `_fkey` e o Drizzle reporta `_fk`, e o
  contrato conferiria um nome que não existe no banco.
- **`apps/api-transportada/Dockerfile` ganhou `COPY src/whatsapp-commands/domain`**: o pre-deploy
  (migrations + seed) importa `database.schema.ts`, que agora importa o padrão canônico e a constante
  de lá; sem a linha, `pre-deploy.contract.ts` reprova (e a imagem quebraria no pre-deploy).

### Vermelho → verde

- Vermelho: `bun test ./test/whatsapp-phone-schema.contract.test.ts` → 0 pass · 1 fail (módulo
  `user-whatsapp-phone.schema.ts` inexistente).
- Primeira `make migration-test` → 89 pass · 2 fail: lista explícita de migrations em
  `static-migration.contract.ts` e o grafo do pre-deploy sem `src/whatsapp-commands/domain`.
  Corrigidos os dois (lista + Dockerfile).
- Verde: contrato de schema + tenant-safety → 16 pass · 0 fail.

### Gates

- `bun run typecheck` → 0 erros (seis apps)
- `bun run --cwd apps/api-transportada db:check` → "Everything's fine"
- `make migration-test` → 91 pass · 0 fail (aplica, desfaz com os rollbacks e reaplica, com as duas
  tabelas em `WHATSAPP_PHONE_TABLES`)
- `test/integration/whatsapp-phone-repository.integration.ts` contra Postgres → 4 pass · 0 fail
  (mesmo número verificado para dois usuários → `WhatsAppPhoneTakenError`; declarado não colide;
  troca e desvínculo; pedido fecha o anterior e não sai da empresa)
- `make check` → format, lint, typecheck verdes; API 5089 pass · 1 fail — só a flaky conhecida "o
  Atego de 1417 caixas cabe no orçamento de 50 ms" (167 ms). Isolada e sozinha,
  `bun test ./test/cargo-volume.contract.test.ts` → 303 pass · 0 fail (rodada em paralelo com as
  suítes do worker e do frontend ela falhou de novo, 302/1: é carga de CPU, não código).
- Como o `make check` para na primeira falha, o restante foi rodado à parte: worker 1002 pass ·
  cron 94 pass · frontend 3316 pass · frontend-client 18 pass · frontend-landing 107 pass, todos
  0 fail; `bun run build` → exit 0.

## T005 — quem fala é quem tem membership (2026-09-11)

`TenantContextService.resolveCompanyForUser` e `resolveWhatsAppActor`. Nenhuma rota, nenhum webhook
(T006).

### Forma

- `AuthenticatedIdentity` ganhou `channel?: AuthenticationChannel` (`'whatsapp'`), **opcional**: o
  token HTTP segue sem o campo, e nenhum consumidor que monta identidade precisou mudar. Na identidade
  de canal `issuer` é o próprio canal, `companyIdClaim` é a empresa do canal e
  `subject`/`externalIdentityId` ficam vazios — não há token. `platformAdmin` e `serviceAccount` são
  sempre `false`.
- `resolveCompanyForUser({ userId, companyId, channel })` devolve
  `AuthenticatedContext<CompanyContext> | null`, congelado como o do HTTP. Recusa é `null`, não 403:
  no canal ela é fluxo esperado.
- **A delegação é pelo núcleo, não pelo método público.** `resolveCompany` e `resolveCompanyForUser`
  chamam o mesmo `resolveCompanyScope` privado (`findActiveByUserAndCompany` +
  `resolveCompanyPermissions`); `resolveCompany` embrulha o escopo com a identidade **do JWT**, que é
  o que o caminho HTTP sempre devolveu. Chamar o método público e trocar a identidade depois seria o
  mesmo resultado com um objeto jogado fora.
- `resolveWhatsAppActor` devolve `{status:'authorized', context}` | `{status:'denied', reason}`, com
  `reason ∈ unknown_phone · unverified_or_expired · no_membership · suspended` — para log, nunca para
  o número. Erro de infraestrutura propaga.

### Decisões

- **Nono dígito na busca.** O repositório casa exato; o caso de uso procura pela forma recebida **e**
  pela alternativa (13 dígitos com `9` na posição 4 → sem ele; 12 dígitos → com `9` inserido), a
  mesma equivalência de `isSameWhatsAppPhone`, em `Promise.all`. A forma recebida vence quando as
  duas existem. Inserir o `9` em qualquer número de 12 dígitos (inclusive fixo) é coerente com a
  política da T002, que já trata os dois como o mesmo número; como o vínculo é gravado como a Meta o
  vê (D1), a alternativa é rede de segurança, não o caminho comum.
- **90 dias inclusivo** (`WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS`): exatamente 90 dias vale, 1 ms
  depois não. Vencido nem chega a ler membership.
- **Duas leituras só no caminho de recusa**, para a razão do log: `hasUnverifiedBindingByPhone`
  (porta de telefone) separa número desconhecido de declarado-sem-verificação, e
  `DrizzleMembershipRepository.findStanding` separa `absent` de `suspended` (membership existe, mas
  ela ou a empresa está desativada). `MembershipStanding` mora em `identity/…/tenant-context.port.ts`
  para `identity` não depender de `whatsapp-commands`. `MembershipRepositoryPort` **não** mudou — os
  fakes de `tenant-context`, `cors` e `auth-me` seguem intocados; `findStanding` é porta à parte.
- Telefone que não canonicaliza é `unknown_phone` e não toca o banco.

### Vermelho → verde

- Vermelho: `bun test ./test/whatsapp-commands.contract.test.ts` → 0 pass · 1 fail (módulo
  `resolve-whatsapp-actor.use-case.ts` inexistente).
- Verde: mesma suíte + `tenant-context`, `service-account`, `auth-me`, `cors`, `http` → 175 pass · 0
  fail, **sem editar nenhum contrato existente**. A paridade HTTP × canal está em
  `resolve-whatsapp-actor.contract.ts` ("o escopo é o mesmo que o HTTP monta"), e o caminho HTTP
  continua coberto por `test/tenant-context.contract.test.ts` (imutabilidade, 403 único, service
  account, claim vence o pedido) e `test/service-account.contract.test.ts`.

### Gates

- `bun run typecheck` → 0 erros (seis apps)
- `make check` → format, lint, typecheck verdes; API 5104 pass · 1 fail — só a flaky conhecida "o
  Atego de 1417 caixas cabe no orçamento de 50 ms" (360 ms, load average ~12). Isolada:
  primeira rodada 302/1, segunda `bun test ./test/cargo-volume.contract.test.ts` → 303 pass · 0 fail.
- Como o `make check` para na primeira falha, o restante à parte: worker 1002 · cron 94 · frontend
  3316 · frontend-client 18 · frontend-landing 107, todos 0 fail; `bun run build` → exit 0.
- Sem integração contra Postgres para `findStanding` e `hasUnverifiedBindingByPhone` (duas consultas
  de uma linha, só no caminho de recusa); cobrir junto do webhook na T006.

## T006 — o despachante (2026-09-11)

`createWhatsAppCommandDriver` no hook `onMessageReceived`, ligado por empresa no resolver. Nenhuma
FlowAction de negócio ainda (T004, T015+); nenhuma mensagem sai para a Meta nos testes.

### Forma

- **Hook tardio.** O hook entra na construção do módulo, mas o despachante precisa do `channel`, do
  `flows.interpreter` e do `conversations.repository` **da própria instância**. O resolver passa um
  objeto `hooks` vazio a `createMetaWhatsAppModule` e o preenche logo depois, com
  `buildMessageHook({ accessToken, module, phoneNumberId })`. Vale porque o `ReceiveWebhookUseCase`
  lê `hooks.onMessageReceived` a cada mensagem (medido no dist 0.1.0, `index.js:1222`). Sem
  `buildMessageHook` o resolver se comporta como na 062.
- **Duas metades.** `createWhatsAppCommandHookFactory` (`infrastructure/`) monta **uma vez** o que é
  da instalação (ator, grafo, limitador, log, `withAuthorizedActor`) e, **por instância**, o que é da
  empresa (canal, interpretador, sessões e o `WhatsAppMessageProvider` dos botões, com o mesmo
  token). O limitador é um só em `main.ts`: a instância é refeita quando o token muda, e o teto não
  pode zerar junto.
- Algoritmo por mensagem, nesta ordem:
  1. teto de 30/10 min por número (chave `companyId` + telefone canônico), **antes de qualquer
     banco**; estourou → `whatsapp.command.denied` `reason=rate_limited`, `handled`;
  2. `session.mode === 'human'` → `continue`;
  3. `resolveWhatsAppActor`; recusa → resposta neutra única (`WHATSAPP_DENIED_REPLY`) no máximo 1×
     por 24 h por número (limitador próprio), log com a razão, `handled`;
  4. resposta = `button_reply.id` | `list_reply.id` | `text.body` aparado;
  5. sem posição (ou nó que sumiu numa republicação) → roda o grafo raiz do nó inicial e renderiza;
  6. nó de escolha: resposta fora de `options` → `fallbackMessage` e
     `context.whatsappInvalidAttempts + 1`; na 2ª → `requestHuman` + "🙋 Vou chamar uma pessoa." e
     posição limpa;
  7. válida → `interpreter.run`; `awaiting-answer` grava posição e contexto (tentativas zeradas) e
     renderiza; `terminal` limpa a posição e envia o `directMessage` do último nó visitado;
     `cross-flow` segue no grafo de destino (até 5 saltos); `max-steps-exceeded`/grafo ausente →
     `whatsapp.command.flow_aborted` e posição limpa.
- `withAuthorizedActor(policy, handler)` re-resolve o ator por `session.companyId` +
  `session.whatsappNumber` **a cada chamada** e confere com o mesmo `AuthorizationService` do HTTP;
  recusa é `WhatsAppCommandDeniedError`, que o despachante converte na resposta neutra, com posição
  limpa e `reason` (`permission` ou a do ator) no log. `registerWhatsAppFlowActions` é o único
  caminho de registro, então nenhuma ação entra no interpretador sem o guarda. Em `main.ts` a lista
  é vazia.

### Decisões

- **O despachante valida antes do `step`.** O interpretador trata qualquer resposta de nó de escolha
  como id e cai no `byAnswer.default` (`index.js:946`), então texto livre avançaria. A guarda é
  `isOfferedOption` (`domain/whatsapp-answer.policy.ts`), e é ela que cumpre a D8.
- **A renderização da escolha é substituível** (`renderChoice`, padrão `renderWhatsAppChoice`): ≤3
  botões, 4–10 lista, >10 lista das 10 primeiras. A política definitiva (teto de título, emoji,
  paginação) é da T007. ⚠️ Até lá, opção acima da décima não é alcançável.
- **O interpretador não envia nada.** A mensagem de encerramento é o `directMessage` do último nó
  de `visited`.
- **Falha de envio ou de banco não sobe para o webhook.** O despachante registra
  `whatsapp.command.failed` com `errorName` e devolve `handled`. Um 500 ali levaria a Meta a
  desativar o webhook de todas as empresas.
- **Nada de ator, permissão ou PII no `context`.** Só a posição e o contador de tentativas. Log só
  com `companyId`, telefone por `maskPhone` e a razão. Nenhum corpo de mensagem.
- **Grafo raiz mínimo em código** (`WHATSAPP_ROOT_FLOW`: menu → "ℹ️ O que já dá" → aviso de que os
  comandos estão chegando), servido por `createStaticWhatsAppFlowGraphProvider` até a T008 publicar o
  seed versionado.
- ⚠️ **As respostas do bot não passam por `conversations.send`**, então não entram no histórico de
  mensagens da inbox da 062. Isso fica aberto para quando a inbox precisar mostrar o lado do bot.
- ⚠️ **Os botões saem pelo provider**, não pelo adaptador de canal, que na 0.1.0 não tem botão. A
  janela de 24 h vencida chega como erro do provider, e não como `WindowExpiredError`, e cai no
  `whatsapp.command.failed`.
- O arquivo do despachante foi dividido: a execução do fluxo (run, settle, render, limpeza de
  posição) mora em `whatsapp-flow-step.service.ts`.

### Vermelho → verde

- Vermelho: `bun test ./test/whatsapp-commands.contract.test.ts` → 0 pass · 1 fail (módulo
  `with-authorized-actor.service.ts` inexistente).
- Verde: a mesma suíte → 62 pass · 0 fail (16 contratos do despachante, 5 do `withAuthorizedActor`);
  junto do registro de testes e dos contratos do webhook da 062 → 111 pass · 0 fail.
- Integração `test/integration/whatsapp-command-driver.integration.ts` → 5 pass · 0 fail. Rota do
  webhook real com HMAC válido → `module.webhook.receive.execute` → hook → Graph API **fake**
  (servidor Bun local em `127.0.0.1:0`), com Postgres real e `runAllDatabaseMigrations` (a sessão
  mora no schema `meta_whatsapp`, que `runDatabaseMigrations` sozinho não cria). Cobre o menu em
  botões com `Bearer` do canal, o avanço até o fim com posição limpa na sessão real, e **as quatro
  recusas pelo banco**: `unknown_phone`, `unverified_or_expired` (fecha
  `hasUnverifiedBindingByPhone`, pendência da T005), `no_membership` e `suspended` (fecham
  `findStanding`). Cada uma sai como a mesma resposta neutra, e o log não traz nem o telefone nem o
  texto.

### Gates

- `bun run typecheck` → 0 erros (seis apps). `bun run lint` → verde.
- `make check` → exit 2 no `format:check`, **só por** `specs/144-…/tasks.md`: outra sessão reescreveu
  as T009–T014 e a T018 nesse arquivo durante esta task. Esse conteúdo **não entra neste commit**, que
  leva do `tasks.md` só a linha da T006. O restante do `check` rodou à parte:
  `prettier --check . '!specs/144-…/tasks.md'` verde; API 5123 pass · 2 fail; worker 1002 · cron
  94 · frontend 3316 · frontend-client 18 · frontend-landing 107, todos 0 fail; `bun run build` →
  exit 0.
- As 2 falhas da API são orçamento de tempo, com load average de 27–33 (19 sessões na máquina): "o
  Atego de 1417 caixas cabe no orçamento de 50 ms" (a flaky conhecida) e "uma viagem de 300 notas
  cabe em 50 ms". Isolado, `bun test ./test/cargo-volume.contract.test.ts` → 300 pass · 3 fail, os
  mesmos dois orçamentos mais um timeout de 5 s em `cargo-placement`. Nenhum arquivo de carga está
  neste diff.
- Integração vizinha: `whatsapp-command-driver` + `whatsapp-phone-repository` + `whatsapp-channel` +
  `tenant-context` → 18 pass · 0 fail com `--timeout 120000`. No padrão de 5 s os `beforeAll` que
  migram banco descartável estouraram por CPU; o Postgres estava saudável (42 de 100 conexões,
  consulta em 159 ms). Há 113 bancos `transportada_*` descartáveis acumulados de rodadas antigas,
  que não foram apagados.

## Fase 3 — revisão do critic antes da T009–T014 (2026-09-11)

Duas revisões em `opus`, antes de qualquer código da Fase 3.

**T009/T010 — APROVADO COM AJUSTES.** O desenho de dados se sustenta (o perfil de CT-e já é quem
escolhe o perfil que rege a nota, e `nfse_emission_profiles` não casa com nota nenhuma), mas a
paridade prometida pela D3 não se sustentava sem três ajustes, incorporados em `ecba5fe7`:

| achado                                                                  | onde                                                                               | ajuste                                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| a tela continuaria aceitando CT-e da nota que o perfil manda para NFS-e | `drizzle-nfe-document.repository.ts:699`, `cte-batch-selection.service.ts:125-142` | motivo `CTE_BATCH_DOCUMENT_OUTPUT_NFSE` na seleção do lote **e** no `cteBlockReason`     |
| a classificação refaria a elegibilidade                                 | `:699`/`:700`, `nfse-document-block.policy.ts:25-36`                               | `classifyDocumentOutput` deriva dos dois vereditos que a listagem já calcula             |
| `no_profile` junta quatro situações                                     | `emission-profile-resolution.policy.ts:100-130`                                    | `noProfileReason` (`unmatched`·`ambiguous`·`not_cnpj`); perfil `manual` nunca classifica |
| perfil NFS-e apontado pode estar inativo                                | `drizzle-nfe-document.repository.ts:454-470`                                       | motivo `CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE`, status no mesmo SELECT                     |
| taker e regra de frete do perfil de CT-e viram campos mortos em `nfse`  | `nfse.schema.ts:152-153`                                                           | vale o perfil NFS-e; o formulário esconde os campos                                      |

**T013 — REPROVADO**, com três premissas falsas conferidas no código:

1. **"Na mesma transação do pedido" é inviável**: lote (`drizzle-cte-batch.repository.ts:567-572`),
   NFS-e (`drizzle-nfse-invoice.repository.ts:188-193`) e emissão (`cte-issuance.use-case.ts`) abrem
   cada um a própria transação, e nenhum aceita uma externa. → Confirmação por **diário de passos**,
   estado `confirming` e retomada idempotente.
2. **Criar lote não emite**: o lote nasce `draft`; quem transmite é `issue`
   (`cte-issuance.routes.ts:104-120`), que já faz o submit. → Emitir é `create` → `issue`, com duas
   chaves.
3. **O faturamento só conhece CT-e** (`billing_invoice_items.cte_document_id not null`,
   `billing.schema.ts:124`) e exige `dueDate` (`billing.use-case.ts:62,260`), e o worker não tem
   use-case de billing.

Também incorporados: o hash cobre o que o usuário viu (valor e versão dos perfis, não só ids); o
estado final é declarado numa policy (`reconciliation_required` é pendente, `cancelled` não fatura);
`name` e `period` saem só do pedido congelado, porque entram na digital de idempotência.

**Decisão do usuário (2026-09-11), pergunta direta:** "Fatura só os CT-e" — uma fatura por tomador
só com os CT-e autorizados, vencimento escolhido na prévia (7/15/30 dias), NFS-e no resumo como
"autorizada, sem fatura", e a fatura sai por **procuração revalidada**: o worker chama uma rota da
API com token de máquina (papel `automation`, permissão nova `whatsapp.settle`, molde do
`mdfe-auto-issue`), e a API fatura com `actor_user_id` depois de conferir que a membership ainda
está ativa e pode faturar. ADR-0064 na T018.

**Commits desta seção:** `ecba5fe7` (spec e plan) e o commit que traz esta seção junto da
reescrita da Fase 3 no `tasks.md`. ⚠️ A reescrita do `tasks.md` foi feita com a T006 em andamento
no mesmo worktree, e o pre-commit (lint-staged) do agente da T006 chegou a colá-la no commit dele;
ele refez o próprio commit local (`0fdc758c`, mesmo tree, só com o `[x]` da T006) e deixou a
reescrita na árvore para ser commitada aqui. Lição para as próximas tasks: **documento de spec só
se edita com o worktree parado**.

## T004 — o número se prova pela mensagem (2026-09-11)

O painel pede o código e a mensagem que chega **daquele** número o confirma. Nenhuma rota verifica.

### Forma

- `POST /me/whatsapp-phone/verification` → `{ phone }` (Zod estrito; `toWhatsAppPhone`; inválido →
  **400 `WHATSAPP_PHONE_INVALID`**). Responde **201** `{ data: { code, companyNumber, expiresAt } }`
  com `cache-control: no-store`. O código sai de `crypto.randomInt(10⁶)` com zero à esquerda, e só o
  `sha256` hex é gravado (`openVerificationRequest`, que fecha o pedido vivo anterior na mesma
  transação). `companyNumber` é o `display_phone_number` do canal **ativo** da empresa; canal
  ausente, desativado ou com número vazio → **409 `WHATSAPP_CHANNEL_NUMBER_MISSING`**, sem abrir
  pedido.
- **Pré-passo no despachante**, e não FlowAction, porque ele roda antes de existir ator: com o ator
  recusado e o texto casando `^\s*(\d{6})\s*$`, `verifyPhone` busca os pedidos vivos da empresa do
  canal **pelo `from`** (as duas grafias do nono dígito, `buildWhatsAppPhoneCandidates`, extraído da
  T005 para o domínio), descarta vencido (`expires_at <= now`) e esgotado (5), e compara o digest com
  `timingSafeEqual` contra **todos** os pedidos, sem parar no primeiro. Erro → `incrementAttempt` em
  todos os pedidos vivos daquele número. Acerto → `completeVerification`, uma transação: fecha o
  pedido (`stale` se outra mensagem fechou antes) → upsert do vínculo verificado, **como a Meta
  entrega o número** (D1) → `audit_logs`. Depois disso "✅ Número verificado.", a posição é limpa e
  o menu raiz é renderizado.
- Número verificado de outra pessoa → o `23505` do índice parcial vira `WhatsAppPhoneTakenError`, a
  transação desfaz, e `closeRequestAfterCollision` mata o pedido e grava a colisão (`result='denied'`)
  noutra transação. Na conversa, **qualquer** recusa (`invalid_phone · no_live_request ·
code_mismatch · phone_taken · stale`) é a resposta neutra única da T006, no máximo 1× por 24 h por
  número. A razão fica só no log `whatsapp.phone.verification_rejected`.
- `DELETE /me/whatsapp-phone` e `DELETE /company-users/:id/whatsapp-phone` (`users.manage`) → **204**
  e idempotentes: `unbindWithAudit` apaga e grava a trilha na mesma transação, e sem vínculo não há
  nem erro nem trilha. O administrador só alcança quem tem membership (qualquer situação) na empresa
  dele (`findStanding !== 'absent'`); fora disso, **404 `COMPANY_USER_NOT_FOUND`**.
- Trilha: `entity_type='user_whatsapp_phone'`, `entity_id`/`target_id` = usuário, `permission=
'whatsapp.phone'`, ações `whatsapp_phone.{verified,verification_collision,unbound}`,
  `correlation_id` = `wamid` da mensagem (ou o id de correlação da rota), e `metadata.phone`
  **mascarado** por `maskPhone`. O ator da verificação é o próprio usuário; no desvínculo pelo
  administrador, o administrador.

### Decisões

- **"Qualquer membership ativa" virou política própria.** `authorize` recusava política `undefined`,
  e nenhuma permissão do catálogo cobre todos os papéis: o motorista tem só `trip.read`/`trip.report`,
  e o contratante, `deliveries.track`/`charges.decide`. `MembershipAuthorizationPolicy`
  (`{ membership: 'active', scope: 'company' }`, com `permission?: never`) passa qualquer contexto de
  empresa e recusa o de plataforma. A membership ativa já foi exigida pelo `tenant-context`. O
  `permission?: never` existe para os contratos que leem `route.policy?.permission` de listas de
  rota (`me-routes`, `aggregate-attachment-review`) seguirem compilando sem edição. Criar uma
  permissão nova teria mexido no catálogo e nos contratos de papel inteiros por uma rota que só toca
  dado do próprio usuário.
- **Canal desativado também é 409.** Canal com `status='disabled'` não recebe mensagem, e o código
  não teria para onde ir. Isso vai além do texto do pedido (inexistente ou número vazio) e é da mesma
  natureza.
- **Suspensão.** `change-company-user-status` passou a desfazer o vínculo quando a suspensão tira a
  **última** membership ativa (o mesmo `shouldDisableIdentity` que desabilita no Keycloak), depois de
  gravar o status. Com outra empresa ativa, o número segue valendo lá. Esse desvínculo **não grava
  trilha**, porque o caso de uso não recebe o ator e a própria suspensão também não é auditada hoje.
  ⚠️ **Remover** a membership (`remove-company-user-membership`) não desfaz o vínculo. Isso fica
  para a T018, junto da auditoria da suspensão. O ator continua recusado sem membership ativa
  (`no_membership`), então não há acesso indevido, só credencial órfã.
- **Sem gerador OpenAPI.** Não existe nenhum no repositório (grep vazio em `src/`; só menções em
  `docs/`). As rotas ficam documentadas aqui e no contrato de rotas.
- `package.json` de `test:integration` estava com dois caminhos colados sem espaço, desde a T006
  (`whatsapp-command-driver.integration.ts./test/integration/delivery-charge-…`). Separei os dois
  junto com a entrada nova.
- ⚠️ O `CLAUDE.md` da raiz **não** foi atualizado (§14 pede isso em rota nova), porque esta task
  só pode editar a própria linha do `tasks.md` e acrescentar ao `evidence.md`. Fica para quem
  fechar a spec.

### Vermelho → verde

- Vermelho: `bun test ./test/whatsapp-commands.contract.test.ts` → 0 pass · 1 fail (módulo
  `request-whatsapp-phone-verification.use-case.ts` inexistente).
- Primeiro verde parcial: 88 pass · 4 fail, os quatro de erro HTTP. O harness chamava `router.handle`,
  que lança o `ApiError`; passou a usar `createRequestHandler`, como a fixture de identidade.
- Verde: `whatsapp-commands` 92 pass · 0 fail (26 novos: pedido, digest, `from` divergente, nono
  dígito, vencido, 5 tentativas, dois usuários no mesmo número, colisão com trilha, outra empresa,
  desvínculo idempotente, admin 404, 5 do despachante com varredura de log sem telefone e sem código,
  e 10 de rota e política). Com `user-administration-application` (2 novos de suspensão) → 174 pass.
- Integração `test/integration/whatsapp-phone-verification.integration.ts` com Postgres real e
  Graph API local → 4 pass. Rota → código → webhook assinado com o código → "✅ Número verificado." +
  menu → `resolveWhatsAppActor` **autoriza** o usuário, e a trilha tem uma linha, com o telefone
  mascarado. Também: `from` divergente (neutra, sem vínculo e sem trilha), colisão (pedido morto,
  trilha `denied`, vínculo do dono intacto) e `DELETE /me` duplo (uma trilha). Junto das vizinhas
  (`whatsapp-command-driver`, `whatsapp-phone-repository`, `tenant-context`) → 14 pass · 0 fail, com
  `bun --env-file=../../.env.test test --timeout 120000` (o `.env` é link na raiz e o Bun não o lê de
  `apps/api-transportada`; sem a flag os 13 casos pulam).

### Gates

- `bun run typecheck` → 0 erros (seis apps). `bun run lint` → verde. `prettier --check` → verde.
- `make check` → exit 2, **só** pela flaky conhecida: format, lint e typecheck verdes; API 5156 pass
  · 1 fail ("o Atego de 1417 caixas cabe no orçamento de 50 ms", 142 ms). Rodando antes a suíte da API
  sozinha, 5153 · 4 fail, todos de orçamento de tempo de carga (spec 094, 115 e 118).
  `bun test ./test/cargo-volume.contract.test.ts` isolado → 300 pass · 3 fail, os mesmos orçamentos,
  com load average de 40 (19 sessões). Nenhum arquivo de carga está neste diff.
- À parte, porque o `make check` para na primeira falha: worker 1002 · cron 94 · frontend 3316 ·
  frontend-client 18 · frontend-landing 107, todos 0 fail; `bun run build` → exit 0.

## T007 — o menu cabe no canal (2026-09-11)

Política de menu pura (`domain/whatsapp-menu.policy.ts` + `whatsapp-menu.constant.ts` +
`whatsapp-menu.error.ts`) e o renderizador provisório da T006 (`renderChoice`) trocado pela
implementação definitiva. O driver da T006 passa a resolver `__more__`/`__back__` antes de validar
a resposta.

### Números confirmados na doc oficial da Meta

Fonte: `developers.facebook.com/documentation/business-messaging/whatsapp/messages/` — as duas
páginas de mensagem interativa (`interactive-reply-buttons-messages` e
`interactive-list-messages`), lidas via `WebFetch` em 2026-09-11.

| limite                             | valor confirmado | onde vive                                                   |
| ---------------------------------- | ---------------- | ----------------------------------------------------------- |
| Botões por mensagem                | 3                | `WHATSAPP_CHOICE_LIMIT.buttons`                             |
| Título do botão                    | 20 caracteres    | `WHATSAPP_CHOICE_LIMIT.buttonTitle`                         |
| Corpo (botões)                     | 1024 caracteres  | `WHATSAPP_CHOICE_LIMIT.body`                                |
| Rodapé                             | 60 caracteres    | não usado hoje (sem rodapé no despachante)                  |
| Id do botão                        | 256 caracteres   | não usado hoje (ids curtos, `[a-z0-9_]+`)                   |
| Linhas por lista (todas as seções) | 10               | `WHATSAPP_CHOICE_LIMIT.listRows`                            |
| Seções por lista                   | 10               | não usado hoje (uma seção só)                               |
| Título da seção                    | 24 caracteres    | `WHATSAPP_CHOICE_LIMIT.sectionTitle` (não usado hoje)       |
| Título da linha                    | 24 caracteres    | `WHATSAPP_CHOICE_LIMIT.listRowTitle`                        |
| Descrição da linha                 | 72 caracteres    | `WHATSAPP_CHOICE_LIMIT.listRowDescription` (não usado hoje) |
| Texto do botão que abre a lista    | 20 caracteres    | `WHATSAPP_CHOICE_LIMIT.listButtonText`                      |
| Corpo (lista)                      | 4096 caracteres  | ⚠️ divergente do de botões — ver abaixo                     |

⚠️ **O corpo tem dois tetos diferentes por formato, e a constante usa o mais restritivo.** A doc de
botões diz 1024; a de lista diz 4096. `planChoiceMessage` decide o formato pela contagem de opções
depois de o corpo já estar escrito, então validar o corpo por um teto único e conservador (1024)
evita que o mesmo texto passe para lista e falhe se algum dia entrar como botão. Nenhum teste desta
task exercita o limite de corpo — nenhum corpo do despachante hoje chega perto de 1024 caracteres.

`listRowDescription`, `sectionTitle` e `listButtonText`\* seguem documentados na constante mesmo sem
consumidor: o `WhatsAppMessageSenderPort.sendList` (porta do despachante) só leva `{id, title}` por
linha — o `ChannelAdapterInterface.sendInteractiveList` do `@adatechnology/meta-whatsapp-module@0.1.0`
não expõe descrição nem seção — então `listRowDescription`/`sectionTitle` não têm como ser
verificados por teste de contrato hoje; ficam prontos para quando a porta ganhar esses campos. \*`listButtonText` **é** usado (`WHATSAPP_LIST_BUTTON_TEXT = 'Ver opções'`, 10 graphemes, dentro do
teto).

### `planChoiceMessage`

- ≤3 opções → botões; 4–10 → lista sem paginação; acima de 10 depende da origem (`source`):
  - `'graph'` (nó estático do grafo): **nunca pagina** — lança `WhatsAppMenuPolicyViolationError`
    (`too_many_options`). `validateFlowGraphForWhatsApp` deveria ter recusado isso na publicação;
    chegar aqui em runtime é bug, não estado esperado (conversation-flow.md §2: "acima de 10 ❌ não
    existe — quebrar em dois nós").
  - `'dynamic'` (lista vinda do banco — viagens, notas, emitentes, tipos de ocorrência, ainda sem
    consumidor nesta spec): pagina — página 1 com 9 opções + "➡️ Mais" (`__more__:2`); da página 2
    em diante, "⬅️ Voltar" (`__back__:<página anterior>`) mais até 8 opções e, se sobrar mais,
    "➡️ Mais" outra vez. Nenhuma página passa de 10 linhas, navegação incluída. Testado com 11, 12 e
    27 opções (3 e 4 páginas), sem furo e sem repetição de id real.
  - Título de opção `dynamic` acima do teto trunca com "…", id preservado. Título de opção `graph`
    acima do teto **lança** — nunca truncado em silêncio (mandado no prompt da task): título grande
    de nó estático é bug de publicação, e uma mensagem quebrada na Meta é pior que um erro alto aqui.
  - Quem decide `source` é o renderizador (`renderWhatsAppChoice`), pela contagem: mais de
    `WHATSAPP_CHOICE_LIMIT.listRows` só pode ter vindo de uma lista dinâmica, porque um nó estático
    validado nunca passa desse teto — nenhum campo novo em `FlowNodeData` foi necessário.

### `validateFlowGraphForWhatsApp`

Devolve **todas** as violações de um nó, não a primeira (`title_too_long` e `missing_emoji` juntos
quando os dois valem). Regras: título acima do teto do formato que o nó vai usar (grapheme, via
`Intl.Segmenter`, não `.length` — emoji com variation selector conta um caractere para quem lê, não
dois); opção sem emoji **só** em nó de ≤3 (lista não exige, conversation-flow.md §3: "quando o
texto couber"); id fora de `^[a-z0-9_]+$` (§7); nó de escolha sem `fallbackMessage`; mais de 10
opções (nó estático nunca pagina); nó sem `next` que não seja `type: 'action'` — ação é terminal por
si (`directMessage` ou handler registrado), os demais tipos (`menu`, `question`, `condition`,
`entrada_choice`) precisam de rota de saída, senão a conversa morre calada (conversation-flow.md §5).
`WHATSAPP_ROOT_FLOW` (o grafo publicado hoje) passa sem violação — contrato próprio.

### `parseMenuPageNavigation` + wiring no despachante

`__more__:N`/`__back__:N` são ids de sistema, nunca de opção autorada — não passam pelo padrão do
§7 e não contam como resposta inválida (D8 é sobre texto livre, não sobre navegação de página). O
despachante (`advanceConversation`) checa isso **antes** de `isOfferedOption`: página válida →
`renderChoicePage` (mesmo nó, página nova, sem chamar `runWhatsAppFlow`, sem persistir posição nem
contexto, sem contar tentativa); nem uma nem outra → cai no fluxo normal de validação da T006.

### Vermelho → verde

- Vermelho: os dois testes de `command-driver.contract.ts` que hoje exercitam paginação
  (`__more__`/`__back__`) falhavam antes desta task por módulo/comportamento inexistente
  (`renderChoice` provisório só cortava nas 10 primeiras, sem navegação).
- Verde: `bun test ./test/whatsapp-commands.contract.test.ts` → 124 pass · 0 fail (62 do despachante
  e da política nova, incluindo `whatsapp-menu-policy.contract.ts`; o resto do módulo inalterado).
- Integração `test/integration/whatsapp-command-driver.integration.ts` (`bun --env-file=../../.env.test
test --timeout 120000`, a partir de `apps/api-transportada`) → 5 pass · 0 fail — cobre o menu em
  botões de ponta a ponta com o Graph API fake; nenhum grafo real desta spec ainda tem opção
  dinâmica, então a paginação em produção segue sem exercício de integração (fica para quando um nó
  `dynamic` existir, Fase 3+).

### Gates

- `bun run typecheck` → 0 erros. `bunx eslint src/whatsapp-commands test/whatsapp-commands
test/whatsapp-commands.contract.test.ts` → 0 erros.
- `make check` → exit 1, **só** pela flaky conhecida e já registrada em T006/T004: API 5188 pass ·
  1 fail ("o Atego de 1417 caixas cabe no orçamento de 50 ms", 91 ms — orçamento de tempo sob carga
  de CPU, spec 115), 23 skip, 37400 expect() calls, 166 arquivos; `format:check`, `lint` e
  `typecheck` das seis apps verdes antes disso. Isolado, `bun test
./test/cargo-volume.contract.test.ts` → 302 pass · 1 fail, o mesmo orçamento (74–91 ms neste
  ambiente). Nenhum arquivo de carga está neste diff.
- À parte, porque o `check` para na primeira falha de teste: `bun run build` (raiz, todas as apps) →
  exit 0.

## Revisão de segurança antecipada — commits `053860f2..93fa655b` (2026-09-11)

`security-reviewer` em `opus`, só sobre o que estava commitado (lido por `git show 93fa655b:`), antes
da Fase 3. **Veredito: LIBERA COM CORREÇÕES ANTES DA FASE 3.** Nível de risco MÉDIO — 0 crítico,
1 alto, 4 médios, 6 baixos. O desenho central se sustenta: o código de verificação **não** é
bearer, porque só vale vindo do `from` assinado por HMAC; não há tomada de conta direta, nem
travessia de tenant sem membership, nem PII nos logs novos.

| id  | severidade | achado                                                                                                                         | onde                                                                                            |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| A1  | ALTO       | token de service account vazado vincula um número e age com as permissões do worker por 90 dias; rotacionar o token não revoga | `authorization.service.ts:23`, `resolve-whatsapp-actor.use-case.ts:68-70`                       |
| M1  | MÉDIO      | vínculo vencido mantém `verified_at` e ocupa o número para sempre — o chip reciclado que a D1 promete cobrir não se vincula    | índice `user_whatsapp_phones_phone_verified_unique`, `verify-whatsapp-phone.use-case.ts:96-100` |
| M2  | MÉDIO      | `MembershipAuthorizationPolicy` não tem trava global contra uso fora de `/me/*`                                                | `authorization.policy.ts:237-252`                                                               |
| M3  | MÉDIO      | a desvinculação por suspensão não grava trilha e roda fora da transação                                                        | `change-company-user-status.use-case.ts:89-93`                                                  |
| M4  | MÉDIO      | tetos do despachante são por processo (N réplicas = 30×N), e a chave não colapsa o nono dígito                                 | `main.ts`, `whatsapp-command-driver.service.ts:326-329`                                         |
| B1  | BAIXO      | o código de verificação fica em texto no log de mensagens do pacote e na inbox                                                 | `ReceiveWebhookUseCase` (dist 0.1.0, 1206-1217)                                                 |
| B2  | BAIXO      | U2 declara o número de U1 e pede a U1 que mande o código — atribuição errada e bloqueio de U1                                  | resposta de sucesso sem nome da conta                                                           |
| B3  | BAIXO      | a unicidade não cobre a equivalência do nono dígito                                                                            | índice por string exata                                                                         |
| B4  | BAIXO      | pedidos de verificação ilimitados (5 tentativas é por pedido)                                                                  | `POST /me/whatsapp-phone/verification`                                                          |
| B5  | —          | oráculo: sem achado — recusas indistinguíveis, 201/409 só para o membro autenticado                                            | —                                                                                               |
| B6  | BAIXO      | contexto sintético com `subject: ''`; usuário desativado direto no Keycloak segue ativo pelo bot até 90 dias                   | `resolve-whatsapp-actor.use-case.ts`                                                            |

**Consequência:** as correções viram a **T005b**, inserida entre a T007 e a T008. A ordem é T007 →
T005b → T008, e nenhuma FlowAction de negócio (Fases 3 e 4) é registrada antes dela. Hoje o impacto
de A1 é nulo porque `flowActions: []` em `main.ts`; na Fase 3 viraria emissão fiscal.

## T005b — as correções da revisão de segurança (2026-09-11)

TDD: os contratos foram escritos primeiro e rodados contra o código da T007 — **18 vermelhos**
unitários (`whatsapp-commands`, `whatsapp-phone-schema`, `user-administration-application`) e **3
vermelhos** de integração Postgres (`whatsapp-phone-repository.integration.ts`). Depois da correção,
todos verdes.

| achado | contrato que reprovava                                                                                                                                                                                                                                                                                                 | correção                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1     | `phone-verification-routes.contract.ts` § "quem não é pessoa não pede código": service account, plataforma e contexto de canal → 403 e nenhum pedido aberto; `authorize` recusa os três; `resolve-whatsapp-actor.contract.ts` "vínculo pré-existente de service account é recusado como service_account"               | `authorization.service.ts` — a política de membership recusa `serviceAccount`, `platformAdmin` e `channel`; `resolve-whatsapp-actor.use-case.ts` nega `service_account` quando a membership traz papel de `SERVICE_COMPANY_ROLES` (`automation`, ADR-0047) — a marca que já existe, nenhuma coluna nova                                                                                                                                                                                                       |
| M2     | `membership-policy-lock.contract.ts` (novo): o roteador não sobe com rota de membership fora de `/me/`; a allowlist por extenso é `DELETE /me/whatsapp-phone` e `POST /me/whatsapp-phone/verification`; nenhum outro arquivo de `src/` declara a política                                                              | `router.service.ts` — `assertMembershipRoutesUnderMe` em `createRouter`. `createApplicationRoutes` não é montável sem banco e Keycloak, mas **toda** rota passa por `createRouter`: a trava em runtime derruba o boot, e o contrato por texto de fonte cobre a allowlist                                                                                                                                                                                                                                      |
| M1     | `phone-verification.contract.ts` "vínculo vencido há mais de 90 dias libera o número, na grafia equivalente, com trilha" e "dentro dos 90 dias o dono continua dono"; integração "vínculo vencido é liberado na mesma transação, com trilha mascarada" e "dentro dos 90 dias o dono continua dono e quem chega colide" | `drizzle-whatsapp-phone.repository.ts` — `releaseExpiredBindings` dentro da transação de `completeVerification`, depois de fechar o pedido e antes do upsert: zera `verified_at` de outro usuário na mesma `phone_key` com `verified_at < agora − WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS` e grava `whatsapp_phone.expired_released` com o telefone mascarado                                                                                                                                                 |
| M3     | `keycloak-sync.contract.ts` "suspender na última empresa ativa desfaz o vínculo" (agora com `audit`) e "falha ao desvincular o número reprova antes de suspender"                                                                                                                                                      | `change-company-user-status.use-case.ts` usa `unbindWithAudit({ audit: { actorUserId, companyId, correlationId }, userId })`; a rota passa o `correlationId`. O vínculo mora noutro repositório e o provedor não entra em transação, então a ordem é **desvincular → desabilitar no Keycloak → suspender**: falha em qualquer passo seguinte deixa o usuário ativo e sem número, nunca suspenso com número calado — o contrato prova que `setEnabled` e `setMembershipStatus` não rodam quando o unbind falha |
| B3     | `schema.contract.ts` (coluna gerada, índice único parcial sobre `phone_key`, índice antigo ausente, migration sem DROP de dado); integração "as duas grafias do nono dígito não ficam verificadas em donos diferentes"                                                                                                 | coluna gerada `phone_key` (`left(phone, 4) \|\| right(phone, 8)`) e índice `user_whatsapp_phones_phone_key_verified_unique`; `findVerifiedByPhone` busca por `phone_key`. Mesma conta em TS: `domain/whatsapp-phone-key.policy.ts`                                                                                                                                                                                                                                                                            |
| B4     | `phone-verification-routes.contract.ts` "o sexto pedido do mesmo usuário em dez minutos é 429 com Retry-After"                                                                                                                                                                                                         | `router.service.ts` aceita `rateLimit` em rota autenticada, com balde por `context.scope.userId` depois da autorização; a rota declara `WHATSAPP_PHONE_VERIFICATION_REQUEST_LIMIT` (5 / 10 min)                                                                                                                                                                                                                                                                                                               |
| M4     | `phone-verification.contract.ts` "a resposta neutra conta as duas grafias do nono dígito como um número só"                                                                                                                                                                                                            | `buildLimitKey` usa `toWhatsAppPhoneKey`. O teto em memória por processo fica registrado em `docs/SECURITY.md`                                                                                                                                                                                                                                                                                                                                                                                                |
| B2     | `phone-verification.contract.ts` — a confirmação é "✅ Número vinculado a _Maria Motorista_."; nome com marcação sai limpo; conta sem ficha recebe "✅ Número vinculado."                                                                                                                                              | `verify-whatsapp-phone.use-case.ts` devolve `displayName` (`identity_user_profiles.name`, nunca e-mail nem CPF); `domain/whatsapp-verified-reply.policy.ts` monta a frase                                                                                                                                                                                                                                                                                                                                     |
| B1, B6 | — (sem código: registro)                                                                                                                                                                                                                                                                                               | `docs/SECURITY.md`, entrada de 2026-09-11                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Migration** `20260912014639_whatsapp_phone_key`: `DROP INDEX` do índice por `phone` +
`ADD COLUMN phone_key ... GENERATED ALWAYS AS (...) STORED` + `CREATE UNIQUE INDEX` sobre
`phone_key`. O drizzle-kit pediu a dica rename-ou-create para o índice; o `--explain` com
`create` mostrou só índice e coluna gerada, nenhum DROP de coluna ou de dado. Duplicata que
travaria o índice novo: **impossível hoje** — a migration do vínculo (`20260911231025`) não está
em `origin/staging` nem em `main`, e a tabela não existe no banco local. `rollback.sql` devolve o
índice por `phone` e remove a coluna gerada (recalculável, nada se perde).

**Gates**

- `bun run typecheck` (raiz) → exit 0.
- `bun run --cwd apps/api-transportada test` → 5204 pass · 2 fail: o orçamento de 50 ms do
  `cargo-volume` (177 ms neste ambiente, CPU — conhecido) e o contrato estático de migrations, que
  lista as migrations por extenso e ganhou a nova linha; depois disso, só o `cargo-volume`.
- `bun --env-file=../../.env.test test --timeout 120000` nas três suítes de WhatsApp → 16 pass ·
  0 fail. `test:integration` inteiro → 227 pass · 4 skip · 2 fail, os dois do
  `cte-archive-gateway.integration.ts` com `Object storage is unavailable` (MinIO fora do ar; nada
  de CT-e ou storage no diff).
- `bun run db:check` → "Everything's fine".
- `make migration-test` → 91 pass · 0 fail (migration + rollback em Postgres descartável).
- `make check` → formato, lint e typecheck verdes; para no teste da API pelo mesmo orçamento de
  50 ms do `cargo-volume` (5205 pass · 1 fail).

## T008 — a conversa nasce do código e não se perde (2026-09-11)

### Arquivos

- Grafo definitivo: `whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.ts`
  (`WHATSAPP_ROOT_FLOW_GRAPH`, chave `transportada_root`) — menu com as três opções de D2
  (`emitir_documentos`, `minha_viagem`, `viagens_armazem`), cada uma apontando para um nó terminal
  `type: 'action'` com `directMessage` "… está chegando. Por enquanto, use o painel." (§5: nó sem
  saída é proibido — `action` termina por si). O grafo provisório da T006
  (`domain/whatsapp-root-flow.constant.ts`) continua existindo só para os testes do despachante que
  não montam o publicador; produção não o usa mais.
- Filtro de permissão (D2): `domain/whatsapp-root-menu.policy.ts` —
  `WHATSAPP_ROOT_MENU_OPTION_PERMISSIONS` (tabela opção → permissões, qualquer uma basta) e
  `filterMenuOptionsByPermission`/`filterWhatsAppRootFlowGraph` (funções puras). Fiado no
  despachante: `whatsapp-command-driver.service.ts` ganhou `findFlowGraph` — o único ponto por onde
  qualquer grafo raiz é lido (tanto para render quanto para validar a resposta) — que aplica o
  filtro sempre que `graph.key === deps.graphs.rootFlowKey`. `advanceConversation` passou a receber
  `permissions: ReadonlySet<string>`, vindas de `actor.context.scope.permissions` (o mesmo ator já
  resolvido em `dispatch`); `verifyEntry` resolve o ator de novo depois da verificação (D1/D2: sem
  isso o primeiro menu depois de vincular o número não tinha permissão nenhuma para filtrar).
- Histórico append-only: `database/whatsapp-flow-graph-version.schema.ts`
  (`whatsapp_flow_graph_versions`: `id, company_id, flow_key, version, nodes, start_node_id, label,
published_by, source, created_at`; unique `(company_id, flow_key, version)`), migration
  `drizzle/20260912021312_whatsapp_flow_graph_versions/` com o mesmo trigger `BEFORE UPDATE OR
DELETE` de `audit_logs`/`trip_dispatch_snapshots` (`reject_whatsapp_flow_graph_versions_mutation`),
  `rollback.sql` que recusa apagar histórico com linha gravada. Tabela e migration entraram em
  `test/database-migration/support.ts` (`WHATSAPP_FLOW_GRAPH_TABLES`),
  `static-migration.contract.ts` (lista de diretórios + teste do trigger/rollback) e
  `database-migration.integration.ts` (lista completa pós-migração).
- Publicador: `application/publish-whatsapp-flow-graph.use-case.ts`
  (`createPublishWhatsAppFlowGraphUseCase`, `previewWhatsAppFlowGraphPublication`) +
  `application/whatsapp-flow-graph-publisher.port.ts` (portas `WhatsAppFlowGraphModulePort` —
  recorte de `FlowGraphRepository` do pacote — e `WhatsAppFlowGraphHistoryPort`) +
  `infrastructure/drizzle-whatsapp-flow-graph-history.repository.ts` (insert só) +
  `infrastructure/whatsapp-flow-graph-publisher.factory.ts`
  (`createDrizzleWhatsAppFlowGraphPublisher`, a fiação transacional real).
- Comando: `scripts/whatsapp-flow-publish.ts` — `--company <id>` (opcional, `resolveSingleCompany`
  na ausência) e `--confirm`, no molde de `scripts/address-comparison-batch.ts`.
- `main.ts`: o `graphs` do `whatsappCommandHook` deixou de ser `createStaticWhatsAppFlowGraphProvider`
  e passou a `createModuleWhatsAppFlowGraphProvider` sobre `new FlowGraphRepository(database.db)` —
  o despachante lê a versão **publicada**, nunca o grafo em código direto.

### Forma do grafo raiz

```
menu (type: menu, options: [emitir_documentos, minha_viagem, viagens_armazem])
 ├─ emitir_documentos → emitir_documentos_em_breve (type: action, directMessage "…chegando…")
 ├─ minha_viagem      → minha_viagem_em_breve      (type: action, directMessage "…chegando…")
 └─ viagens_armazem   → viagens_armazem_em_breve   (type: action, directMessage "…chegando…")
```

Passa `validateFlowGraphForWhatsApp` sem violação nenhuma (`test/whatsapp-commands/flow-graph.contract.ts`):
3 opções ≤ teto de botão (3), cada uma com emoji, ids em `^[a-z0-9_]+$`, `fallbackMessage` no nó de
escolha, todo nó com saída.

### Decisões

1. **A `version` do grafo passado a `save` é ignorada pelo pacote** — medido no `dist/index.js` da
   `0.1.0`: `save` grava `expectedVersion + 1` sozinho, sem ler `graph.version`. O publicador não
   inventa número de versão nenhum; só o teto da trava otimista.
2. **`create` não grava histórico.** Grafo novo não tem "versão atual" para guardar — o histórico
   nasce só quando o próximo `save` está prestes a substituir alguma coisa. A primeira versão do
   código escrevia a própria linha criada no histórico também, e isso quebrou o publicador na
   segunda chamada: a versão 1 recém-criada colidia com a versão 1 que o passo de `save` tentava
   registrar de novo (unique `(company_id, flow_key, version)`) — achado pelo teste de integração
   com Postgres real, não pelos fakes. Corrigido removendo o `history.record` do ramo `create`.
3. **Transação real, não "grave antes e documente a janela".** `FlowGraphRepository` e o repositório
   de histórico usam a conexão que receberam na construção — então basta construir os dois de novo
   dentro de `db.transaction(async (tx) => ...)`, atados ao `tx`, para as duas escritas comitarem
   juntas. Não há janela para documentar: `createDrizzleWhatsAppFlowGraphPublisher` faz isso, e o
   teste de integração prova create→save→histórico na mesma transação.
4. **`diffWhatsAppFlowGraphs` não pode comparar por `JSON.stringify` cru.** O `jsonb` do Postgres não
   promete devolver a mesma ordem de chave em que o objeto foi inserido; o primeiro teste de
   integração acusava `about`/`menu` como "alterados" depois de um `create` → `get` sem nenhuma
   mudança real. Trocado por `canonicalStringify` (ordena chaves recursivamente antes de comparar).
5. **Pré-deploy não semeia.** O `pre-deploy.service.ts` semeia templates de notificação, mas o
   `PreDeployReport` é conferido por `toEqual` exato em `pre-deploy.contract.ts` — acrescentar um
   campo novo ali quebraria esses testes por peso de código sem relação com esta task. O caminho
   "base nasce com conversa publicada" é só o comando (`scripts/whatsapp-flow-publish.ts`); nada
   semeia no boot da API. Documentado no cabeçalho do script.
6. **Ator resolvido de novo depois da verificação de telefone.** `verifyEntry` (T004) não tinha
   permissão nenhuma disponível para filtrar o primeiro menu depois de vincular o número — corrigido
   chamando `resolveActor` outra vez (mesma filosofia de "confere de novo" do `with-authorized-actor`);
   sem membership no momento, cai na mesma recusa neutra de D1.

### Gates

- `bun run typecheck` (API) → limpo.
- `bun run lint` (API) → limpo.
- `bun test ./test/whatsapp-commands.contract.test.ts` → 165 pass · 0 fail (inclui as quatro suítes
  novas: `root-menu-permission`, `flow-graph-diff`, `flow-graph`, `publish-flow-graph`).
- `bun run test` (API, 166 arquivos) → 5234 pass · 23 skip · 0 fail.
- `make migration-test` → 92 pass · 0 fail (rodado duas vezes nesta task: a primeira pegou
  `whatsapp_flow_graph_versions` faltando na lista completa de `database-migration.integration.ts`,
  corrigida em seguida).
- `bun --env-file=../../.env.test test ./test/integration/whatsapp-flow-graph-publish.integration.ts --timeout 120000`
  → 2 pass · 0 fail (create→unchanged→updated→histórico, e trigger append-only recusando
  `UPDATE`/`DELETE`).
- `bun --env-file=../../.env.test test --timeout 120000` a partir de `apps/api-transportada` (a
  suíte de integração completa, 47 arquivos) → 230 pass · 4 skip · 2 fail. As 2 falhas são
  `cte-archive-gateway.integration.ts` ("Object storage is unavailable") — MinIO fora do ar neste
  ambiente, achado de ambiente já sinalizado antes desta task, sem relação com T008.
- `make check` (rodado três vezes) → format:check, lint e typecheck sempre verdes; `test` da API
  para no orçamento de 50 ms do `cargo-volume` (`test/cargo-placement/real-mixed-cargo.contract.ts`,
  "spec 115") em toda tentativa nesta máquina — 51 ms, 86 ms, 226 ms e 79/94 ms de excesso medidos em
  execuções sucessivas, inclusive isolando só esse arquivo (`bun test
./test/cargo-volume.contract.test.ts` → 302 pass · 1 fail dessa vez). É a mesma flakiness de CPU
  já registrada nas evidências de T005b/T007 — orçamento de tempo, não regressão desta task: nenhum
  arquivo tocado por T008 aparece no motivo da falha, e a contagem de todo o resto (5233
  pass · 23 skip · 1 fail, sempre o mesmo teste) é estável entre as rodadas. Registrado, não
  consertado, como pedido.

## T015 — o motorista entrega pelo WhatsApp (2026-09-11)

### O que existe

- `src/whatsapp-commands/domain/whatsapp-driver-flow.constant.ts` — ids de nó, `actionKind`, chaves
  de `context` (todas opacas: `tripId`, `documentId`, marcador de passo, página, motivo) e as
  traduções pt-BR de `TripTransitionBlock` e dos cinco motivos de devolução.
- `src/whatsapp-commands/application/register-driver-flow-actions.ts` — `createDriverWhatsAppFlowActions`,
  as oito `FlowAction`s do ramo "Minha viagem": `currentTrip` (`trip.read`) e sete de escrita
  (`trip.report`) — lista de notas, roteador de nota, roteador de devolução, lista de tipos de
  ocorrência, roteador de tipo, prompt e roteador de observação.
- `src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.ts` — `minha_viagem` deixou de
  apontar para `minha_viagem_em_breve` (removido) e passa a apontar para `driver_current_trip`;
  `buildDriverTripFlowNodes()` acrescenta os 13 nós do ramo aos outros dois ("emitir_documentos" e
  "viagens_armazem", intactos).
- `src/main.ts` — `driverWhatsAppFlowActions` composto com as MESMAS dependências que
  `createMeTripRoutes` já injeta (`findCurrentDriverTrip`, `reportDocumentDelivery`/
  `reportDocumentReturn`, `registerDriverOccurrence`, `resolveDriverId`), passado a
  `createWhatsAppCommandHookFactory({flowActions: ...})` no lugar do `[]` da T006.

### Correção de premissa: qual função a rota do PWA chama

O prompt desta task apontava `transitionTripDocument` (`transition-trip-document.use-case.ts`) como
"o que `POST /me/trips/current/documents/:documentId/{deliver,return}` chama". **Medido, não é**:
`me-trip.routes.ts` chama `dependencies.reportDelivery`/`reportReturn`, compostas em `main.ts` como
`reportDocumentDelivery`/`reportDocumentReturn` (`report-document-delivery.use-case.ts`) — a função
que já existia para o motorista, com idempotência por status **e** o encadeamento de fechar parada
e viagem (`completeStopIfSettled`/`completeTripIfSettled`), que `transitionTripDocument` não faz.
`transitionTripDocument` é a função genérica usada pelo **escritório**
(`trip.routes.ts`/`tripDocumentActionRoute`, `trip.manage`) — um caminho diferente, não o do
motorista. As `FlowAction`s de T015 chamam `reportDocumentDelivery`/`reportDocumentReturn` — a mesma
função, os mesmos efeitos, nenhum caminho novo.

### Como a lista dinâmica evita PII no `context`

Não existe campo em `FlowNodeData` para opções dinâmicas por sessão — só `node.options`, estático,
validado na publicação. O padrão adotado (`action → entrada_choice → action` "roteador"): o nó de
ação busca os dados e manda a mensagem ela mesma, direto por `channel.sendInteractiveList` (nunca por
`context`, que é jsonb persistido) — o título "número · destinatário" nunca toca o banco de sessão.
O nó `entrada_choice` que sucede não tem opções estáticas (`isChoiceNode` falso pelo tipo), então a
resposta — o `id` da linha tocada, que é o `documentId`/`occurrenceTypeId` cru — é capturada sem
validação de oferta; o roteador que segue valida re-consultando o domínio (`findReachableDocument`,
`findOccurrenceType`), a mesma defesa que o PWA já tem. `parseMenuPageNavigation` (T007) decide se a
captura é `__more__`/`__back__` (reencaminha para o nó de ação, que refaz a busca e a página) ou uma
resposta real.

⚠️ **Efeito colateral aceito, não corrigido**: como `ChannelAdapterInterface` desta instalação é a
0.1.0 (sem `sendInteractiveButtons` — o mesmo achado que já levou `meta-whatsapp-message-sender.gateway.ts`
a usar o provedor de botões separado), toda lista dinâmica sai como **lista**, nunca como botão,
mesmo quando `planChoiceMessage` classificaria ≤3 opções como botão. E como o nó `entrada_choice`
não tem opções, `renderNode` (T006/T007, `whatsapp-flow-step.service.ts`) sempre manda uma segunda
mensagem — o `question` do nó (`"Toque numa nota da lista acima."` etc.) — depois da lista da
`FlowAction`. Duas mensagens por passo dinâmico, de propósito: era a alternativa a estender o
`context` persistido com título/PII para poupar uma mensagem.

### Idempotência e portão recusado

`reportDocumentDelivery`/`reportDocumentReturn` já resolvem `checkTripDocumentTransition` antes de
gravar: repetir a mesma transição devolve `alreadySettled: true` sem gravar evento novo — a
`FlowAction` traduz isso para "Já estava registrada." O 409 `STATE_TRANSITION_NOT_ALLOWED`
(`TripStateTransitionNotAllowedError`) vira a tradução pt-BR de `TRIP_TRANSITION_BLOCK` em
`DRIVER_TRANSITION_BLOCK_MESSAGES`; nota inalcançável (`TripDocumentNotReachableError`) vira "Essa
nota não está mais disponível na sua viagem." Nenhum erro cru chega ao motorista.

### Fora do escopo (spec § Fora do escopo)

Mídia enviada pelo motorista (foto de canhoto) não é tratada por nenhuma `FlowAction` — o
despachante (T006) só extrai `text`/`interactive`; uma mensagem de mídia captura texto vazio e cai
no fallback do nó atual. Ficou fora de propósito: adicionar aqui um "a prova com foto é pelo app"
exigiria uma `FlowAction` nova só para reconhecer mídia fora de contexto, e a spec já resolve isso
implicitamente (o motorista nunca vê essa opção oferecida).

### Gates

- `bunx tsc --noEmit` (API) → limpo.
- `bun run lint` (API) → limpo (removido import não usado em `driver-flow-actions.contract.ts`).
- `bun test ./test/whatsapp-commands.contract.test.ts` → 185 pass · 0 fail (as 20 novas de
  `driver-flow-actions.contract.ts`, mais o ajuste em `flow-graph.contract.ts` — "minha_viagem" saiu
  do grupo "ainda sem ação" e ganhou teste próprio).
- `bun run test` (API, 166 arquivos) → 5253 pass · 23 skip · 1 fail — o mesmo `cargo-volume`
  (orçamento de 50 ms) já registrado em T005b/T007/T008; nenhum arquivo desta task no motivo.
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/whatsapp-driver-flow-actions.integration.ts`
  → 1 pass · 0 fail — AC7: webhook assinado real → "oi" → menu em botões → "🚚 Minha viagem" → menu
  da viagem em botões → "📦 Entregar" → lista dinâmica com a nota certa → toque na nota →
  "Entrega registrada. ✅" → `trip_documents.separation_status = 'delivered'` e `trip_stop_events`
  com uma linha `kind: 'delivered'` (o mesmo evento que `reportDocumentDelivery` grava para o PWA) →
  a viagem (uma parada, uma nota) fecha sozinha (`status: 'completed'`, spec 056 D1) e some de
  `findCurrentDriverTrip`.
- `bun --env-file=../../.env.test test --timeout 120000` (suíte de integração completa, 48
  arquivos, incluindo a nova) → 231 pass · 4 skip · 2 fail — as mesmas 2 falhas de
  `cte-archive-gateway.integration.ts` (MinIO fora do ar) já registradas antes desta task.
- `make check` → format:check, lint e typecheck verdes nas seis apps; `test` da API para no mesmo
  `cargo-volume` (57 ms medidos nesta rodada) — registrado, não consertado, como nas tasks
  anteriores. `bun run build` (chamado separadamente, já que `make check` interrompe no primeiro
  script que falha) → as seis apps constroem sem erro.

## T016 — o armazém opera pela conversa (2026-09-12)

FlowActions do operador, mesmo molde da T015: `register-operator-trip-flow-actions.ts` +
`whatsapp-operator-flow.constant.ts` (ids de nó, `actionKind`, chaves de contexto), o ramo "Viagens
do armazém" do grafo (T008) e os contratos (`test/whatsapp-commands/operator-flow-actions.contract.ts`,
`test/integration/whatsapp-operator-flow-actions.integration.ts`).

### Nenhuma tabela nova — a mesma máquina do painel

`checkTripAcceptsDocumentWork` (`trips/domain/trip-state.policy.ts`) **não era exportada**; a única
mudança de domínio desta task é acrescentar `export` a ela — nenhuma linha de lógica mudou.
`resolveOperatorTripActions` (`trips/domain/operator-trip-actions.policy.ts`) é a função pura que o
menu do WhatsApp consulta, e ela **deriva**, nunca redecide:

```
separar/carregar/ocorrência ⟺ checkTripAcceptsDocumentWork({action: 'separate', tripStatus}) === null
despachar ⟺ checkTripTransition({action: 'dispatch', hasRoute, tripStatus}).outcome === 'applied'
            E nenhuma nota pendente (pending/separated, viva)
```

Tabela estado → ações oferecidas (o que o contrato prova, espelhando o mesmo corte de
`state-gates.contract.ts` do frontend — separar/carregar/ocorrência sempre juntos, porque o mesmo
portão decide os três):

| `tripStatus`                                                    | sem pendência                            | com pendência                 |
| --------------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| `draft`                                                         | nenhuma                                  | nenhuma                       |
| `route_planned` / `separating` / `loading`                      | separar, carregar, ocorrência, despachar | separar, carregar, ocorrência |
| `dispatched` / `in_transit` / `on_delivery_route` / `completed` | nenhuma                                  | nenhuma                       |
| `cancelled`                                                     | nenhuma                                  | nenhuma                       |

⚠️ Sem roteiro planejado (`hasRoute: false`), despachar nunca entra — mesmo sem pendência. E como os
três estados de barracão só se alcançam depois de `route_planned` (a própria `checkTripAcceptsDocumentWork`
recusa separar/carregar em `draft` com `TRIP_ROUTE_NOT_PLANNED`), `WarehouseTrip.hasRoute` na
listagem é sempre `true` por construção — não há consulta extra a fazer para o **menu**. A conferência
**autoritativa** de verdade continua sendo a real: `dispatchTrip`/`DrizzleTripRouteRepository.readPreconditions`,
que é quem de fato lê `trip_stops` no `POST /dispatch` — o teste de integração precisou semear uma
parada real, porque sem ela o despacho de verdade recusa com `TRIP_HAS_NO_ROUTE` mesmo com
`status = 'route_planned'` gravado à mão.

### As mesmas funções compostas do painel, nunca um caminho paralelo

`separateDocument`/`loadDocument` → `tripLifecycle.separate/load.execute` → `transitionTripDocument`
com `DrizzleTripDocumentRepository` — a mesma porta de `POST /trips/:id/documents/:documentId/{separate,load}`.
`batchTransition` → `transitionTripDocumentsBatch` com `DrizzleTripDocumentBatchRepository` — a
mesma de `POST /trips/:id/documents/batch-status` ("Todas as pendentes"). `dispatchTrip` → a mesma
`dispatchTrip` (`dispatch-trip.use-case.ts`) com `DrizzleTripRouteRepository`, **sem `force`**: o
WhatsApp nunca despacha forçado (D7) — nota pendente esconde a opção do menu (acima), e se ainda
assim a transição for tentada (menu desatualizado numa sessão antiga), `TripHasUnloadedDocumentsError`/
`TripHasUnscheduledStopsError` viram mensagem "despache pelo painel." em vez de forçar. A ocorrência
usa `registerTripOccurrence` direto (não o `registerDriverOccurrence` do motorista, que exige
`driverId` — o operador não é motorista), com `productCode: ''` (nota inteira) e catálogo filtrado
por `stage: 'separation'`.

⚠️ As instâncias de `DrizzleTripDocumentRepository`/`DrizzleTripDocumentBatchRepository`/
`DrizzleTripRouteRepository` do WhatsApp são uma **segunda instância** das mesmas classes que
`tripLifecycle` usa nas rotas do painel — não dá para importar `tripLifecycle` porque ele nasce mais
adiante em `main.ts` (depois do hook do WhatsApp, pelo mesmo motivo já registrado na T015 com
`whatsappDriverTripRepository`). Mesma tabela, mesma função pura, segunda instância da classe —
não um segundo caminho.

### Duas transições sem discriminador — resolvido pelo estado anterior

`transitionTripDocument` devolve `{document, tripStatus}` em `applied` e em `unchanged`, sem
sinalizador (ao contrário de `reportDocumentDelivery`, que tem `alreadySettled` porque foi desenhada
para o PWA). O requisito "unchanged → 'Já estava registrada.'" (item 4 da task) é resolvido
**antes** de chamar a transição: `documentRouter` relê o estado atual da nota
(`listWarehouseTrips`) e compara contra o alvo da ação — se já está lá, a mensagem é "Já estava
registrada." mesmo chamando a transição de novo (idempotente, sem gravar evento novo).

### Confirmação de despacho — nó estático, não `FlowAction`

"Despachar é irreversível" (item 3) é um nó `type: 'menu'` **estático** do grafo
(`dispatchConfirmMenu`), com duas opções fixas ✅ Confirmar/🔙 Voltar — igual ao `returnReasonMenu`
do motorista, e por isso sai como **botão de verdade** (o interpretador do módulo renderiza `menu`
com botão nativo quando ≤3 opções; só as listas dinâmicas das `FlowAction`s saem sempre como lista,
porque a instalação 0.1.0 não tem `sendInteractiveButtons`). "🔙 Voltar" nunca chama `dispatchTrip` —
provado no contrato com um espião que falha o teste se for chamado.

### Um menu que encadeia — a contagem de mensagens por turno

Como `tripActionMenu` e `listDocuments` são nós `action` (não `menu`), o interpretador os executa
**na mesma resposta** de quem os aponta como `next` — por isso `documentRouter` (que primeiro manda
a confirmação por `channel.sendText` e depois retorna `next: tripActionMenu`) produz **três**
mensagens no mesmo turno: a confirmação, a lista de ações de novo, e o "nudge" de texto do
`entrada_choice` que sucede. O teste de integração assevera a confirmação em `.at(-3)`, não `.at(-1)`
— documentado ali para a próxima pessoa não reabrir a mesma investigação.

### Permissão: leitura versus gestão

`listTrips`/`tripRouter` (achar a viagem) usam `fleet.read` — a mesma `TRIP_READ_POLICY` do painel.
Todo o resto (menu de ações, separar, carregar, despachar, ocorrência) usa `trip.manage`. O papel
`separator` já tem as duas (CLAUDE.md), então o operador nunca percebe a diferença; ela existe para
o dia em que outro papel tiver só uma das duas.

### Fora do escopo desta task

Despacho **forçado** (nota pendente + confirmação com motivo) continua exclusivo do painel — a
CLAUDE.md e o prompt da task são explícitos: ação de exceção fica onde o operador vê a lista
completa das pendências, não numa lista de WhatsApp. `unscheduledStopIds` (agendamento do cliente,
spec 060) não entra na decisão do **menu** (não há dado disso em `WarehouseTrip`); se acontecer, a
tentativa real de despacho ainda recusa e a `FlowAction` traduz para "Há paradas sem agendamento —
despache pelo painel." — só não impede a oferta do botão de antemão, porque isso exigiria mais uma
consulta na listagem por um caso raro (nota carregada + parada sem agendamento).

### Gates

- `bunx tsc --noEmit` (API) → limpo.
- `bun run lint` (API) → limpo.
- `bun test ./test/whatsapp-commands.contract.test.ts` → 214 pass · 0 fail (as ~30 novas de
  `operator-flow-actions.contract.ts`, mais o ajuste em `flow-graph.contract.ts` — "viagens_armazem"
  saiu do grupo "ainda sem ação" e ganhou teste próprio, como "minha_viagem" na T015).
- `bun run test` (API, 166 arquivos) → 5282 pass · 23 skip · 1 fail — o mesmo `cargo-volume`
  (orçamento de 50 ms, 50,29 ms medidos nesta rodada em primeiro plano) já registrado em
  T005b/T007/T008/T015; nenhum arquivo desta task no motivo.
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/whatsapp-operator-flow-actions.integration.ts`
  (isolado, em primeiro plano) → 1 pass · 0 fail — webhook assinado real → "oi" → "🏭 Viagens do
  armazém" → lista dinâmica com a viagem certa → menu de ações em lista (separar/carregar/ocorrência,
  sem despachar — nota pendente) → "📦 Separar" → toque na nota → "Separação registrado. ✅"
  (`separation_status = 'separated'`) → "📥 Carregar" → toque na nota → "Carregamento
  registrado. ✅" (`separation_status = 'loaded'`) → "🚚 Despachar" (agora oferecido, sem pendência)
  → confirmação em botões → "✅ Confirmar" → "Viagem despachada. 🚚" (`trips.status = 'dispatched'`)
  → a viagem some de `listWarehouseTrips`.
- `bun --env-file=../../.env.test test:integration` (suíte de integração completa, 49 arquivos,
  incluindo a nova, em primeiro plano) → 232 pass · 4 skip · 2 fail — as mesmas 2 falhas de
  `cte-archive-gateway.integration.ts` (MinIO fora do ar) já registradas nas tasks anteriores;
  nenhuma delas em arquivo desta task.
- `make check` (raiz, em primeiro plano, timeout 600000 ms) → `format:check`, `lint` e `typecheck`
  verdes nas seis apps; `test` da API interrompe no mesmo `cargo-volume` (registrado acima) —
  falha de orçamento por CPU, não desta task. Como `make check` para no primeiro script que falha,
  `bun run build` foi chamado em separado nas seis apps (`api-transportada`, `worker-transportada`,
  `cron-transportada`, `frontend-transportada`, `frontend-client`, `frontend-landing`) → todas
  constroem sem erro.

## T009 — o perfil diz qual documento sai (2026-09-11)

Primeira task da Fase 3. Os números de linha do critic foram conferidos contra o HEAD
(`2b25c080`) antes de editar: `cte-emission-profile.schema.ts` e `nfse.schema.ts` não tinham se
deslocado.

### Migration `20260912044229_cte_profile_output_document` (aditiva)

Gerada por `db:generate` e recortada: o SQL gerado trazia de novo o `CREATE TABLE
whatsapp_flow_graph_versions` e a FK dela (deriva da migration da T008, escrita à mão). O
`snapshot.json` ficou inteiro.

```sql
ALTER TABLE "cte_emission_profiles" ADD COLUMN "output_document" text DEFAULT 'cte' NOT NULL;
ALTER TABLE "cte_emission_profiles" ADD COLUMN "nfse_emission_profile_id" uuid;
ALTER TABLE "cte_emission_profiles" ADD CONSTRAINT "cte_emission_profiles_company_nfse_profile_fk"
  FOREIGN KEY ("company_id","nfse_emission_profile_id")
  REFERENCES "nfse_emission_profiles"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- CHECKs: ..._output_document_check (in ('cte','nfse')), ..._nfse_profile_check
-- ((output_document = 'nfse') = (nfse_emission_profile_id is not null)),
-- ..._output_municipal_check (output_document = 'cte' or municipal_service_policy = 'allow')
```

A lista do CHECK sai de `CTE_OUTPUT_DOCUMENTS` (`as const`), e a FK tem nome explícito. O
`rollback.sql` confere a entrada do journal e derruba os três CHECKs, a FK e as duas colunas.
`cte-emission-profile.schema.ts` passou a importar `nfse.schema.ts`, que já importava o primeiro.
O ciclo é seguro porque as duas referências vivem no callback da tabela, que o Drizzle avalia tarde.

### A prova no banco (`make migration-test`)

`test/database-migration/cte-profile-output-constraints.assertion.ts`, ligada ao
`database-migration.integration.ts`, faz o seguinte:

1. Desfaz só esta migration e grava um perfil no esquema antigo, com `municipal_service_policy = 'block'`.
2. Reaplica a migration. A linha sai com `output_document = 'cte'`, ponteiro nulo e **todas as
   outras colunas idênticas** (`to_jsonb` antes e depois).
3. Cobra os três CHECKs.
4. Cobra a FK composta recusando o perfil NFS-e de **outra empresa** (`23503`) e o `restrict`
   impedindo apagar o perfil NFS-e apontado.

### API (`cte-profiles/`)

- `outputDocument` e `nfseEmissionProfileId` ficam em `settings` e voltam no detalhe, no
  serializador da rota e no snapshot do audit log.
- **Os dois campos são opcionais no corpo, e a ausência preserva o que estava gravado.** A API sobe
  antes da tela, e um formulário antigo aberto não pode devolver a `cte` um perfil que já emite
  NFS-e. Os dois andam em par: mandar só o documento solta o ponteiro. Quem resolve isso é
  `resolveSettings`, no use-case.
- As combinações proibidas pelos CHECKs são recusadas antes do banco por
  `domain/output-document.policy.ts`, com **todos os motivos de uma vez**: 400
  `CTE_PROFILE_OUTPUT_DOCUMENT_INCOHERENT` com `details[]` por campo.
- Perfil NFS-e que não está `active` recebe 422 `CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE`, no mesmo
  padrão de `CTE_PROFILE_NOT_ACTIVATABLE`. **O perfil de outra empresa responde igual ao inativo.**
  Um 404 ali diria que ele existe em algum lugar. A conferência vale no `POST` e no `PATCH`.

### Frontend (`cte-profiles/`)

- O novo bloco "Documento fiscal" tem dois selects do design system: o documento (CT-e/NFS-e) e,
  em NFS-e, o perfil NFS-e, com opções só dos ativos.
- Em NFS-e a tela esconde o bloco de cobrança (regra de frete), o tomador, os CFOPs, o trio de ICMS
  e a política municipal, e mostra a frase de que valem os do perfil NFS-e. O corpo enviado força
  `municipalServicePolicy: 'allow'` em NFS-e e ponteiro nulo em CT-e.
- A lista vem de `createNfseSettingsClient().listProfiles()` (o cliente de `nfse-invoice`), sob uma
  chave de consulta própria. A chave de lá guarda outro formato, e esta tela não invalida nada de
  outro módulo.
- O guard aceita a **ausência** dos dois campos: `OPTIONAL_SETTINGS_KEYS` fica fora das chaves
  exigidas, e a ausência vira `cte`/`null`.
- ⚠️ **Defeito achado pelo contrato do cliente:** `cteProfilesClient.service.ts` monta o corpo por
  `pickKeys(settings, SETTINGS_KEYS)`. Sem acrescentar as chaves opcionais, o formulário escolheria
  NFS-e e o pedido nunca levaria a escolha, sem erro nenhum.

### Worker e cron

`grep -rl "cte_emission_profiles\|cteEmissionProfiles" apps/worker-transportada/src
apps/cron-transportada/src` não devolve nada. Nenhuma cópia de schema lê a tabela, então não há o
que atualizar.

### Contratos

| Arquivo                                                    | O que cobra                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| API `cte-profiles-schema/profiles.contract.ts`             | colunas e os três CHECKs                                                       |
| API `cte-profiles-schema/tenant-safety.contract.ts`        | FK composta com nome                                                           |
| API `cte-profiles-application/output-document.contract.ts` | combinações, inativo, outra empresa, preservação e round-trip                  |
| API `cte-profiles-http/output-document.contract.ts`        | 400 com todos os campos e round-trip                                           |
| frontend `cte-profiles/output-document.contract.ts`        | guard tolerante, corpo coerente, campos escondidos por texto de fonte, locales |

Todos entram por entrypoints que já estão na lista explícita do `package.json`.

### Gates (primeiro plano)

- `bun run typecheck` (raiz) → as seis apps limpas.
- Contratos de perfil da API (schema, domínio, aplicação, infraestrutura, HTTP, lote, migration) →
  216 pass · 0 fail.
- `make migration-test` → 92 pass · 0 fail, com a asserção nova.
- `make check` → formatação, lint e typecheck verdes. A API teve 5297 pass · 0 fail (23 skip, os
  de integração), o worker 1002, o frontend 3324, e as demais suítes também passaram. A flaky
  `cargo-volume.contract.test.ts` passou desta vez.

## T010 — a nota sabe para que documento vai (2026-09-11)

**Classificação** (`cte-profiles/domain/document-output.policy.ts`): `classifyDocumentOutput` recebe
o perfil que rege a nota (ou o motivo de não haver um) e os **dois vereditos que a listagem já
calculava** — `cteBlockReason` e `nfseBlockReason` — e não refaz elegibilidade nenhuma. Forma:

```ts
type DocumentOutputClassification =
  | { output: 'cte' }
  | { output: 'nfse'; nfseProfileId: string }
  | { output: 'blocked'; reason: string }
  | { output: 'no_profile'; reason: 'ambiguous' | 'not_cnpj' | 'unmatched' }
```

`cte` → bloqueio do CT-e ou `cte`; `nfse` → perfil NFS-e não ativo (`CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE`,
antes do bloqueio da própria NFS-e) → bloqueio da NFS-e → `nfse`; sem perfil → `no_profile`.

**Motivo de "sem perfil"**: `explainEmissionProfile` em `emission-profile-resolution.policy.ts`
devolve `{ resolution }` ou `{ reason }`. `findEmissionProfile` virou uma linha que delega a ela e
continua devolvendo `null` — nenhum consumidor mudou, `resolveMunicipalServicePolicy` incluso.
Perfil `manual` nunca classifica (cai em `unmatched`).

**Uma fonte para o código**: `CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE` virou constante em
`cte-profile.error.ts`, lida pela classe de erro da rota (422) e pela classificação. Nenhum código
novo com o mesmo nome.

**`CTE_BATCH_DOCUMENT_OUTPUT_NFSE`** em `CTE_BATCH_BLOCK_REASON`, aplicado em dois lugares:

- seleção do lote (`cte-batch-selection.service.ts`), depois de o perfil ser resolvido e antes da
  regra de frete — vale também para o perfil escolhido à mão;
- `cteBlockReason` da listagem, **depois** dos motivos que já existiam: o vínculo com NFS-e é o que
  acende o atalho para a nota de serviço na tela, e não pode ser engolido por "vai para NFS-e".

Com o padrão `cte` nada muda: os contratos anteriores de lote, domínio de CT-e, perfis e listagem
passaram **sem edição**.

**Listagem**: `loadActiveEmissionProfiles` passou a trazer `output_document`,
`nfse_emission_profile_id` e o status do perfil NFS-e por `leftJoin` em `(company_id, id)` na
**mesma** consulta — sem N+1. Isso cobre a lacuna que a T009 deixou: ativar o perfil de CT-e não
confere o status do perfil NFS-e, e a classificação agora o lê a cada página. Cada linha ganha
`documentOutput`. Os dois filtros saíram como `buildActiveEmissionProfileFilters` e
`buildNfseProfileJoin`, cobertos pelo tenant-safety.

**Porta do bot**: `NfeDocumentOutputClassifierPort.classifyDocumentOutputs({ context, documentIds })`,
implementada pelo mesmo repositório e passando pelo **mesmo** `mapSummary` da página. Nota de outra
empresa fica fora do mapa, sem erro. A T012 consome esta porta.

**Frontend**: o guard aceita `documentOutput` **ausente** (a API sobe primeiro) e aceita saída
desconhecida sem recusar a linha — a lição do `VEHICLE_DETAIL_KEYS`. A tabela de Notas ganhou a
coluna "Documento" (CT-e · NFS-e · Bloqueada — motivo · Sem perfil — motivo), **visível por
padrão**, porque o módulo não tem colunas escondidas por padrão. Linha sem classificação fica com
`—`, nunca com "CT-e" por omissão. Os dois motivos novos ganharam rótulo em pt-BR e em inglês. A
seleção não mudou além do que o `cteBlockReason` já fazia.

**Prova de paridade** (`test/integration/nfe-document-output.integration.ts`, Postgres descartável):
quatro notas, uma por cenário (`cte`, `nfse` com perfil ativo, `nfse` com perfil inativo, sem
perfil), mais uma segunda empresa. `list()` e `classifyDocumentOutputs()` devolvem o mesmo
resultado para cada nota. A nota de NFS-e sai com `cteBlockReason = CTE_BATCH_DOCUMENT_OUTPUT_NFSE`.
O status inativo chega pelo join, e a nota da outra empresa fica fora do mapa → **1 pass · 0 fail,
13 expects**.

**Contratos novos**:

- `cte-profiles-domain/document-output.contract.ts`: tabela da classificação, todas as combinações.
- `cte-profiles-domain/profile-explanation.contract.ts`: os três motivos, o perfil `manual`, e
  `findEmissionProfile` igual à variante.
- `cte-batch-application/output-document-selection.contract.ts`: a seleção recusa a saída `nfse` e
  mantém `cte`.
- `nfe-documents/document-output-listing.contract.ts`: a rota serializa as quatro saídas.
- Duas asserções novas em `nfe-schema/document-block-tenant-safety.contract.ts`.
- Frontend: `nfe-workspace/document-output-column.contract.ts`. Os entrypoints estão todos na lista
  explícita.

Os contratos nasceram vermelhos: import ausente e seleção aceitando a nota, `56 pass · 2 fail ·
1 error`.

**Edições em teste existente**, e o motivo de cada uma:

- os fixtures HTTP da API (`nfe-http.types.ts`, `nfe-http-payload.fixture.ts`) ganharam o campo
  novo do corpo;
- `view-preferences-serialization.contract.ts` lista a ordem de colunas por extenso e ganhou
  `documentOutput`;
- `nfe-workspace.fixture.ts` espelha o tipo exato do item.

**Gates**:

- `bun run typecheck` → limpo nas seis apps.
- `make check` → exit 0: API 5317 pass · 0 fail, worker 1002, cron 94, frontend 3329,
  frontend-client 18, landing 107, todos com 0 fail.
- A flaky `cargo-volume.contract.test.ts` não falhou nesta rodada.
- Integração com `--env-file=../../.env.test --timeout 120000`: `nfe-document-output` +
  `tenant-context` + `alphanumeric-cnpj-end-to-end` → 3 pass · 0 fail.

⚠️ **Fora do escopo, visto no caminho**: `CTE_BATCH_DOCUMENT_MUNICIPAL_SERVICE` não tem rótulo em
`cteEmission.blockReason` nos dois locales. A tela imprime a chave crua quando o portão municipal
bloqueia. É anterior a esta task.

## T011 — o pedido e o diário de passos (2026-09-11)

Só dados: duas tabelas, schema Drizzle, porta, repositório e cópia no worker. Prévia, confirmação e
liquidação ficam para T012–T014.

### SQL essencial (`drizzle/20260912132407_whatsapp_command_requests/migration.sql`)

```sql
CREATE TABLE "whatsapp_command_requests" (
  "id" uuid PK, "company_id" uuid NOT NULL, "actor_user_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL, "kind" text NOT NULL, "selection" jsonb NOT NULL,
  "classification" jsonb NOT NULL, "preview_sha256" text NOT NULL, "due_date" date,
  "period" text, "grouping_mode" text, "status" text DEFAULT 'previewed' NOT NULL,
  "expires_at" timestamptz NOT NULL, "confirmed_at" / "settled_at" timestamptz,
  "settlement_outcome" text, "last_error_code" text, "created_at" / "updated_at",
  UNIQUE ("company_id","id"),
  CHECK kind in ('document_issuance'), CHECK status in (7 estados),
  CHECK grouping_mode is null or in ('per_invoice','sender_recipient'),
  CHECK preview_sha256 ~ '^[0-9a-f]{64}$', CHECK period is null or length(period) <= 60,
  CHECK jsonb_typeof(selection|classification) = 'array', CHECK expires_at > created_at,
  CHECK confirming/dispatched/settled* ⇒ confirmed_at, CHECK settled* ⇒ settled_at
);
CREATE TABLE "whatsapp_command_documents" (
  "id", "company_id", "request_id", "document_kind", "group_key", "idempotency_key",
  "status" DEFAULT 'pending', "document_id" uuid, "last_error_code", timestamps,
  UNIQUE ("request_id","document_kind","group_key"),
  CHECK idempotency_key ~ '^[A-Za-z0-9._:-]+$' and length between 16 and 256,
  CHECK status not in ('created','issued') or document_id is not null
);
CREATE INDEX ..._company_id_status_idx ON requests ("company_id","status");
CREATE INDEX ..._in_flight_idx ON requests ("status","confirmed_at")
  WHERE "status" in ('dispatched', 'confirming');
-- FKs: documents (company_id, request_id) → requests (company_id, id) CASCADE (request_fk);
--      requests company_id → companies RESTRICT;
--      requests (actor_user_id, company_id) → memberships (user_id, company_id) RESTRICT;
--      requests (membership_id, company_id) → memberships (id, company_id) RESTRICT
```

`rollback.sql` derruba só as duas tabelas (diário primeiro) e apaga a linha do diário de migrations
por nome **e** hash (`008024bb…df9e298`), com `ROW_COUNT <> 1` abortando. Aditiva, sem default que
mude linha existente.

### Decisões

- **A membership coerente com o ator sem tocar em `user_company_memberships`.** Ela tem
  `unique(user_id, company_id)` e `unique(id, company_id)`, mas não um de três colunas. Em vez de
  acrescentar um unique na tabela de identidade, são **duas FKs** sobre os uniques existentes (ator
  na empresa; membership na empresa), e `createPreview` **não recebe** `membershipId`: resolve por
  `(company_id, actor_user_id)`, que é único, então a membership gravada é a do ator por
  construção. Sem membership, `createPreview` devolve `undefined` — não há pedido sem vínculo.
- **O Postgres recusa `{16,256}` numa regex** (`invalid repetition count(s)`: o teto de repetição é
  255). O CHECK da chave de idempotência virou classe de caracteres `+` com
  `length(...) between 16 and 256`, que diz o mesmo que o `IDEMPOTENCY_KEY` das rotas. A regex das
  rotas continua exportada como `WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN`, para o caso de uso validar
  antes de gravar, e o contrato de schema afirma as duas formas.
- **`classification` é lista de `{ documentId, classification: DocumentOutputClassification }`**, com
  o tipo da T010 importado por `import type`. O pre-deploy conta imports de tipo no grafo, então o
  `Dockerfile` ganhou `COPY src/cte-profiles/domain` — mesmo remédio da T003.
- **O diário nasce na mesma transação do `claim`**, e só se o `UPDATE … WHERE status='previewed' and
preview_sha256=$1 and expires_at>$now RETURNING` pegar a linha. Os passos saem com o mesmo
  `created_at`, então `listJournal` desempata por `array_position` em `WHATSAPP_COMMAND_DOCUMENT_KINDS`
  (CT-e → NFS-e → fatura) e por `group_key`: com o `id` aleatório a ordem mudava de uma rodada para
  a outra.
- **`listForSettlement` recebe `companyId`** (plan: "todo repositório novo recebe o companyId"), e o
  parâmetro `now` do pedido saiu: a janela das 2 horas é decisão da policy da T014 sobre os
  `dispatched`, e o único corte temporal da consulta é `stuckConfirmingBefore`.
- **`settlement_outcome` sem CHECK**: o vocabulário do resumo é da T014, e `markSettled` hoje grava
  o próprio estado final (`settled`/`settled_partial`). `markSettled` só vale `where status =
'dispatched'`, então repetir é inofensivo.
- **O gerador veio limpo desta vez**: o SQL só com as duas tabelas, sem deriva a recortar; o
  `snapshot.json` inteiro. ⚠️ Um cabeçalho montado com `head` passou pelo hook do rtk, que reescreveu
  a saída com um `// ... N more lines` literal — a migration quebrou com `syntax error at or near
"//"` antes de ser recomposta em Python. Quem montar SQL por shell neste ambiente não use
  `head`/`cat` para gravar arquivo.
- **Cópia no worker** (`src/database/whatsapp-command.schema.ts`) só com o que a liquidação lê —
  pedido: `id`, `company_id`, `actor_user_id`, `due_date`, `status`, `expires_at`, `confirmed_at`;
  diário: `id`, `company_id`, `request_id`, `document_kind`, `status`, `document_id` — e um contrato
  próprio que confere os nomes e a ausência de CHECK/FK/unique.

### Vermelho → verde

- Vermelho: `bun test ./test/whatsapp-command-schema.contract.test.ts` → 0 pass · 1 fail (módulo
  `whatsapp-command.schema.ts` inexistente).
- Primeira integração → 4 pass · 2 fail (`invalid repetition count(s)` no CHECK). Primeira
  `make migration-test` → 91 pass · 1 fail (grafo do pre-deploy sem `src/cte-profiles/domain`).
- Segunda integração → 5 pass · 1 fail: ordem do diário não determinística e `rejects` sobre um
  builder do Drizzle (thenable, não `Promise`). Corrigidos a ordenação e o teste.
- Verde: contrato de schema + tenant → 14 pass · 0 fail; cópia do worker → 3 pass · 0 fail.

### Concorrência (prova)

`test/integration/whatsapp-command-repository.integration.ts`, contra Postgres (`.env.test`) → **6
pass · 0 fail**:

- **oito** `claimForConfirmation` simultâneos sobre o mesmo pedido → exatamente **um** devolve o
  pedido; o diário tem **duas** linhas `pending` (não dezesseis) e o pedido está `confirming`;
- hash divergente → `undefined`, pedido segue `previewed` e o diário vazio;
- `now = expires_at` → não reivindica, e `markExpired` passa a `expired`;
- outra empresa → nem `findById` nem `claim` alcançam o pedido;
- `UPDATE … set status='issued'` sem `document_id` → recusado pelo CHECK; `markJournalStep` com o
  documento grava; `markSettled` antes de `dispatched` → `false`; o `confirming` parado aparece em
  `listForSettlement`; depois de `markDispatched`, o primeiro `markSettled` vale e o segundo não;
- ator sem membership → `createPreview` devolve `undefined`; com membership, a gravada é a dele.

### Gates

- `bun run typecheck` → 0 erros; `bun run --cwd apps/api-transportada db:check` → "Everything's
  fine"
- `make migration-test` → **92 pass · 0 fail** (aplica, desfaz com os rollbacks e reaplica, com as
  duas tabelas em `WHATSAPP_COMMAND_TABLES`; migration na lista por extenso de
  `static-migration.contract.ts`)
- `make check` → exit 0: format, lint, typecheck; API 5331 pass · worker 1005 · cron 94 · frontend
  3329 · frontend-client 18 · frontend-landing 107, todos 0 fail; build verde. A flaky conhecida de
  `cargo-volume.contract.test.ts` não disparou nesta rodada.

## T012 — a prévia que se confirma (2026-09-11)

O ramo "Emitir documentos" deixou de ser "Em breve.": critério → parâmetros um por mensagem →
volumetria → pedido congelado com o botão ✅ Confirmar carregando o id dele. Nada emite ainda — a
confirmação é a T013.

### Arquivos

- Domínio (`whatsapp-commands/domain/`): `whatsapp-issuance-flow.constant.ts` (nós, `actionKind`,
  chaves de `context`, 7·15·30 dias, TTL 15 min); `document-selection.policy.ts` (`nextSelectionStep`,
  `parseDocumentNumber`, `parseBrazilianDate`, `toIssueDateWindow`, `resolveDueDate`,
  `buildEmitterKey`, `readSelectionState`); `issuance-preview-digest.policy.ts`
  (`buildPreviewDigest`); `issuance-volumetry.policy.ts` + `whatsapp-issuance-labels.constant.ts`;
  `issuance-idempotency.policy.ts` (as chaves `whatsapp:${requestId}:cte:${profileId}` e
  `…:nfse:${nfseProfileId}:${takerTaxId}`, que a T013 reusa).
- Aplicação: `preview-document-selection.use-case.ts` + `preview-nfse-blocks.service.ts`;
  `register-issuance-flow-actions.ts` (start, roteador de parâmetro, roteador de confirmação),
  `issuance-flow-prompt.service.ts` (o nó que pergunta e renderiza a prévia),
  `issuance-answer.service.ts` (validação do texto livre pedido), `issuance-flow-context.service.ts`,
  `document-selection.port.ts`.
- Infraestrutura: `drizzle-document-selection.repository.ts` (só **escolhe ids**, com os filtros
  exportados para o contrato de tenant).
- Grafo: `emitir_documentos` → `issuance_start`; o nó `emitir_documentos_em_breve` saiu. Ramos
  `minha_viagem` e `viagens_armazem` intocados. O grafo passa `validateFlowGraphForWhatsApp` sem
  violação, e a integração publica pelo publicador da T008 antes da primeira mensagem.
- Fora do módulo, três mudanças pequenas:
  - `nfe-documents`: `describeDocumentOutputs` na porta da T010 (`classifyDocumentOutputs` passou a
    delegar a ela) e `mapSummary` → `describeDocument`, que devolve também o perfil que rege a nota.
    O perfil carregado na página ganhou `taker` e `version`, no mesmo SELECT;
  - `with-authorized-actor.service.ts` aceita uma lista de políticas em que **qualquer uma** basta;
  - `canonicalStringify` passou a ser exportado de `whatsapp-flow-graph-diff.policy.ts`.
- `main.ts`: segunda instância de `DrizzleNfeDocumentRepository`, `DrizzleNfseInvoiceRepository` e
  `createNfseInvoiceUseCase` dentro de `bootstrap()` (o hook nasce antes de `createApplicationRoutes`,
  mesmo precedente da T016). O repositório de NF-e exige gateway de storage, e ele foi criado igual
  ao da rota; a classificação não o usa.

### Forma do digest

`sha256(canonicalStringify({ documents, dueDate, period, profiles }))`, em hexadecimal:

- `documents`: uma tupla por nota, ordenada por `documentId` — `[documentId, output,
reason|null, profileId, nfseProfileId, takerTaxId canônico, freightAmount]`;
- `profiles`: `[kind, profileId, version]`, ordenado por `kind:profileId` — a versão do perfil de
  CT-e de toda nota que ele rege, e a do perfil NFS-e das que saem NFS-e;
- fora do hash: `expires_at`, ids de mensagem e rótulos.

O `freightAmount` é o frete previsto da listagem (`mapSummary`) na nota de CT-e. Na de NFS-e é o
`calculatedAmount` da prévia de NFS-e do grupo, que é o valor que a nota vai emitir. A versão do
perfil NFS-e vem de `nfse_emission_profiles.version`, lida na empresa do contexto.

### Decisões

1. **Remetente é o emitente da NF-e.** `nfe_participants` só tem `emitter`, `recipient`, `delivery`
   e `pickup`, e o remetente do CT-e é `invoice.sender` = emitente (`resolveTakerParty`, tomador
   `0`). O critério "Remetente" traz **só as notas pendentes** do emitente: sem janela nenhuma, ele
   traria o histórico inteiro. Faixa, data e viagem trazem todas as notas do critério, e a já
   vinculada aparece como bloqueada — é o que faz a volumetria bater com a tela.
2. **O emitente entra no `context` por chave opaca** (`em_` + 16 hex do SHA-256 do documento
   canônico), que também é o id da linha da lista. O documento é resolvido em memória, relendo a
   lista; chave forjada não acha ninguém. Produtor rural emite com CPF, e o CPF nunca sai do
   servidor.
3. **Bloqueio na prévia sem reescrever regra.** A credencial usa o mesmo `loadNfseCredential` do
   `create`, e a falta vira `NFSE_CREDENTIAL_MISSING`/`NFSE_FISCAL_SETTINGS_MISSING`, códigos que já
   existiam. O endereço do tomador sai da mesma `nfseInvoices.preview` do painel
   (`NFSE_DOCUMENT_MISSING_TAKER_ADDRESS`). Erro de domínio do perfil NFS-e (regra sem versão) marca
   só as notas daquele perfil.
4. **O teto conta antes de trazer.** `resolveSelection` faz `count(*)`; acima de
   `CTE_BATCH_MAX_DOCUMENTS` devolve o número achado e nenhum id, e a classificação nem roda.
5. **Perguntas condicionais.** O vencimento é perguntado só com CT-e; o período, só com NFS-e. As duas
   respostas vêm antes do congelamento, porque entram no hash. "Pular" grava `''`, e em branco é
   omitido no pedido, como na tela.
6. **A chave de idempotência é validada antes de gravar**, com `WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN`
   sobre as chaves de cada grupo que a T013 vai usar.
7. **Nenhum valor somado na volumetria.** A mensagem só conta notas; não existe soma de frete
   estimado sem marca.
8. **A confirmação é provisória até a T013.** O botão do pedido desta sessão responde "A
   confirmação pelo WhatsApp ainda não está disponível. Por enquanto, emita pelo painel." e volta ao
   menu. O pedido expira sozinho em 15 minutos, sem emitir nada. Botão de outro pedido é recusado.
9. **Lista dinâmica sai como lista**, mesmo com ≤3 opções (0.1.0 sem `sendInteractiveButtons`),
   mesma ressalva da T015/T016.

### ⚠️ Risco datado (2026-09-11): perfil `manual` em produção não foi medido

A medição de perfis com `match_mode='manual'` em produção **não foi feita**, porque o ambiente
bloqueou o acesso a produção. Perfil manual nunca classifica (D3), então a nota que só ele
alcançaria aparece na volumetria como `no_profile`/`unmatched`, e o número real dessas notas é
desconhecido. A mensagem diz o motivo ao operador em linguagem clara, sem código: "Nenhum perfil
automático casa com a nota (perfil manual só se usa pelo painel)". Quem tiver acesso a produção
mede antes da T019.

### Vermelho → verde

- Vermelho: `bun test ./test/whatsapp-commands.contract.test.ts` → **0 pass · 1 fail · 1 error**
  (`preview-document-selection.use-case.js` inexistente).
- No caminho: o contrato de tenant esperava o prefixo sem os parênteses que o `and()` do Drizzle
  põe em cada condição, e o critério `sender` contava parâmetros de empresa onde as subconsultas da
  nota pendente se correlacionam por `"nfe_documents"."company_id"`. O contrato passou a contar as
  igualdades de `company_id` por subconsulta.
- Verde: **295 pass · 0 fail** no entrypoint, com os seis contratos novos:
  - `preview-digest`: estável sob reordenação; muda com o valor, a classificação, o motivo, o
    tomador, o período, o vencimento e a versão; ignora `expires_at` e máscara de CNPJ;
  - `document-selection-policy`: passos por critério, número, data, janela em -03:00, vencimento em
    Brasília, chave opaca;
  - `issuance-volumetry`: "51 notas · 38 CT-e · 11 NFS-e · 2 bloqueadas", segunda mensagem só com
    bloqueados, "e mais K", nenhum código cru;
  - `preview-document-selection`: teto de 1000 sem truncar, vazio, perguntas condicionais, endereço
    e credencial bloqueando na prévia, erro de perfil NFS-e, congelamento, período no hash, nota de
    outra empresa fora, nada a emitir, sem membership;
  - `issuance-flow-actions`: guarda `cte.submit` **ou** `nfse.issue`, chave opaca na lista, série
    única pulada, validação de número, data e período, prévia com o documento resolvido em memória,
    botão com o id do pedido, recusa do teto com o número;
  - `document-selection-tenant-safety`: todo critério começa pela empresa, e toda subconsulta a
    repete.
  - `flow-graph` também mudou: o teste do "Em breve." virou "nenhum nó promete o que não existe", mais
    o apontamento de `emitir_documentos` e os quatro critérios.

### Prova do AC3 (`test/integration/whatsapp-issuance-preview.integration.ts`, Postgres)

Webhook assinado real e Graph API fake. A conversa foi `oi` → 📄 Emitir documentos → 🔢 Faixa de
número → emitente (única linha, pela chave) → a série única não é perguntada → `1200` → `1250` →
📅 15 dias → ⏭️ Pular.

A mensagem sai exatamente **"51 notas · 38 CT-e · 11 NFS-e · 2 bloqueadas"**, e a seguinte
**"Bloqueadas:\n• Sem peso da carga: 1201, 1233"**.

O cenário semeado:

- um emitente com dois perfis:
  - o de CT-e casa pela **raiz** do emitente;
  - o de NFS-e casa pelo destinatário B **completo**, e precisão completa vence raiz;
- credencial da Nota RP ativa e endereço do tomador completo;
- as notas 1201 e 1233 sem volume;
- uma segunda empresa com o mesmo emitente e números da mesma faixa.

O pedido fica congelado:

- `previewed`, com hash de 64 hex;
- vencimento = hoje em Brasília + 15, e período nulo;
- 51 notas, nenhuma da outra empresa.

A classificação congelada é, **nota por nota**, igual ao `documentOutput` que a listagem de Notas
publica para o painel sobre as mesmas notas. **1 pass · 0 fail · 75 expects** (1,94 s).

### Gates (primeiro plano)

- `bun run typecheck` (raiz, seis apps) → limpo.
- `bun run lint` (API) → limpo.
- `bun run test` (API) → **5412 pass · 23 skip · 0 fail** (167 arquivos).
- `bun --env-file=../../.env.test run test:integration` (API, 52 arquivos, com a nova) → **240 pass ·
  4 skip · 2 fail**. As duas falhas são as de `cte-archive-gateway.integration.ts` ("Object storage
  is unavailable"), com o MinIO fora do ar, falha de ambiente já registrada.
- `make check`: format, lint e typecheck verdes. O `test` da API parou só na flaky conhecida do
  orçamento de 50 ms ("o Atego de 1417 caixas", 131,58 ms medidos, 5411 pass · 1 fail).
  - Isolada, `bun test ./test/cargo-volume.contract.test.ts` deu **303 pass · 0 fail**: é CPU sob
    carga, não regressão.
  - Como o `make check` para no primeiro script que falha, o resto foi rodado à parte:
    - `bun run format:check` → verde;
    - testes das outras apps → worker 1005 · cron 94 · frontend 3329 · frontend-client 18 ·
      frontend-landing 107, todos 0 fail;
    - `bun run build` → as seis apps constroem.

## T013 — confirmar é emitir o que foi visto (2026-09-11)

O ✅ Confirmar deixou de responder "ainda não está disponível". Agora ele confere as permissões,
recalcula o hash, reivindica o pedido numa transação curta e emite grupo a grupo pelos casos de uso
das rotas, **sem transação única**. Cada use-case abre a sua transação, e é o diário que diz de onde
a retomada continua.

### Arquivos

- Domínio (`whatsapp-commands/domain/`):
  - `issuance-confirmation.policy.ts`: grupos lidos do pedido congelado, permissões exigidas, nome do
    lote e rótulo do grupo na resposta;
  - `issuance-idempotency.policy.ts`: ganhou `buildCteIssueIdempotencyKey` e `buildNfseGroupKey`, e
    a chave de NFS-e passou a ser montada a partir do `group_key`.
- Aplicação:
  - `confirm-document-selection.use-case.ts`: `confirm` e `resume`, este exportado para a T014;
  - `issuance-journal.service.ts`: o diário de passos;
  - `issuance-confirmation-reply.service.ts`: o que o bot responde;
  - `preview-document-selection.use-case.ts`: passou a exportar `classifySelectedDocuments`,
    `digestPreviewEntries` e `freezeIssuancePreview`, para o recálculo seguir **o mesmo caminho** da
    prévia;
  - `issuance-flow-prompt.service.ts`: exporta `sendVolumetryMessages` e `sendConfirmationList`;
  - `register-issuance-flow-actions.ts`: troca a resposta provisória pela confirmação real.
- Infraestrutura: `findCteProfileNames`, com `buildCteProfileNameFilters` no contrato de tenant.
- Schema (só tipo, jsonb, **sem migration**): `WhatsAppCommandClassificationEntry` ganhou
  `profileId`, `profileName` e `takerTaxId`, todos opcionais.
- `main.ts`: `createCteBatchUseCase` e `createCteIssuanceUseCase` com instâncias próprias no
  `bootstrap()`, com as mesmas dependências das rotas. É o mesmo precedente da T012: o hook nasce
  antes de `createApplicationRoutes`.

### Máquina de estados final

```text
Pedido
  previewed  ──toque: pedido do ator, permissões, não vencido, hash confere, claim──>  confirming
  previewed  ──hash divergiu──>  superseded   (e nasce outro pedido em previewed)
  previewed  ──expires_at <= now──>  expired
  confirming ──todos os passos finais──>  dispatched  ──T014──>  settled | settled_partial
  confirming ──erro que não é de domínio──>  confirming   (fica para o resume)

Passo do diário
  CT-e   pending ──create──> created ──issue──> issued
  NFS-e  pending ──create──> issued          (a NFS-e nasce agendada: create é o passo inteiro)
  qualquer ──ApiError──> failed  (last_error_code; o próximo grupo segue)
```

Toque em cada estado:

- `confirming` → "Este pedido já está sendo enviado" (**não** retoma);
- `dispatched`/`settled*` → "Este pedido já foi enviado";
- `expired` → "Prévia expirada." com 🔁 Refazer;
- `superseded`, ou pedido de outro usuário → "Esse pedido não vale mais. Refaça a seleção."

### Decisões

1. **O grupo é congelado na prévia, nunca reclassificado na confirmação.** Depois do primeiro lote
   a nota já está vinculada e a classificação muda, então a retomada reconstruiria os grupos errado.
   O `profileName` também vai congelado, porque o `name` do lote entra na digital do `create`: se o
   perfil fosse renomeado entre a queda e a retomada, o replay virava `IDEMPOTENCY_KEY_REUSED`. Pedido
   anterior à T013, sem o grupo, é tratado como prévia vencida pela base: `superseded` e prévia nova.
2. **O recálculo é o da prévia**, sobre a `selection` congelada (ids), com `dueDate` e `period`
   congelados. Nota que chega ao critério depois da prévia não é detectada: o hash cobre o que foi
   visto, não o critério.
3. **Permissões, antes de tocar em qualquer coisa:** `cte.manage` **e** `cte.submit` com grupo CT-e,
   `nfse.issue` com grupo NFS-e, pelo mesmo `authorize` do router. A recusa é "Seu acesso não permite
   emitir todos os documentos desta prévia", sem nomear permissão. A guarda do ramo continua sendo
   "qualquer uma das duas".
4. **O toque num pedido `confirming` não retoma.** Dois processos correriam o mesmo grupo, e dois
   `create` concorrentes com a mesma chave podem dar `23505` em vez de replay. A retomada é o `resume`,
   exportado para a T014 chamar nos `confirming` parados.
5. **A digital do `issue` foi conferida e é estável.** `ISSUE_OPERATION` assina
   `[companyId, batchId]` (`cte-issuance.use-case.ts:532-535`), e o `batchId` volta igual do replay
   do `create`. Nada instável entre tentativas, então não foi preciso parar.
6. **Chaves**, todas no formato da rota:
   - lote: `whatsapp:${requestId}:cte:${profileId}`;
   - emissão: `whatsapp:${requestId}:cte-issue:${profileId}`;
   - NFS-e: `whatsapp:${requestId}:nfse:${nfseProfileId}:${takerTaxId}`.

   O `group_key` é o `profileId` no CT-e e `${nfseProfileId}:${takerTaxId}` na NFS-e. O `correlationId`
   é o id do pedido. O nome do lote é `WhatsApp ${requestId.slice(0, 8)} · ${profileName}`, cortado em
   100 caracteres, que é o teto da rota.

7. **Erro de domínio é `ApiError`**, e ele fecha o grupo como `failed` com o código. Qualquer outro
   erro para a execução e deixa o pedido em `confirming`.
8. `document_id` do diário: o id do lote no CT-e, o id da nota de serviço na NFS-e.
9. **A prévia nova do `superseded` reusa o vencimento e o período já respondidos.** Se ela precisar
   de uma pergunta que a antiga não fez (CT-e sem vencimento, ou NFS-e que antes não havia), o bot
   manda refazer a seleção em vez de decidir sozinho.

### ⚠️ Achado datado (2026-09-12): o `create` de NFS-e travou dentro da transação

Rodando a integração nova inteira, a retomada **travou em 3 de 5 rodadas**, com timeout de 120 s. O
`afterAll` também estourou, porque a conexão não fecha. Sozinha, a mesma retomada passou.

Medição com o teste travado, em `pg_stat_activity` do banco descartável:

- `pg_blocking_pids` vazio em todas as sessões: **não é espera de lock**;
- uma conexão `idle in transaction`, `wait_event = ClientRead`, com a idade subindo de 10 s para
  **2 min 04 s** na mesma pid;
- o último comando dela: `select "access_key", "id", "issued_at", "number", "series", "status",
"total_value" from "nfe_documents" …`.

Esse `select` é o primeiro elemento do `Promise.all([select, loadParties(queryable)])` de
`findNfseSelectionDocuments` (`nfse-invoice-selection.query.ts:92`). No `create`, o `queryable` é a
transação aberta pelo próprio caso de uso. O servidor terminou a primeira consulta, e a segunda
nunca chegou.

**Hipótese, não prova:** consultas concorrentes sobre uma conexão de transação às vezes não
resolvem. É código anterior à T013, o mesmo caminho do `POST /nfse-service-invoices` do painel, e
não foi alterado aqui. `cte-batch-selection.query.ts:206` tem o mesmo padrão, com quatro consultas.

- A primeira hipótese, um advisory lock de sessão vazado pela reserva do número fiscal, foi
  **refutada**: `reserveFiscalNumber` incrementa a sequência pela própria transação, sem advisory
  lock.
- A retomada da integração passou a semear **só CT-e**. O ponto dela é `created → issue` sem duplicar,
  e a NFS-e continua provada no AC5, que passou em todas as rodadas. Com isso, o arquivo passou em
  **3 de 3 rodadas seguidas** (34 expects cada).
- A investigação ficou para uma task separada, sugerida nesta sessão: reproduzir, confirmar e só
  então serializar.

### Vermelho → verde

- Vermelho: `bun test ./test/whatsapp-commands.contract.test.ts` → **0 pass · 1 fail · 1 error**
  (`confirm-document-selection.use-case.js` inexistente).
- No caminho:
  - o contrato da prévia esperava a classificação congelada sem o grupo, e foi atualizado para o
    formato novo. O nome congelado da nota de NFS-e é o do perfil de CT-e que a rege;
  - na integração, três problemas eram de dado do cenário, não da confirmação: o CNPJ da
    transportadora é único na instalação (cada cenário semeia o seu); sem sequência fiscal de CT-e o
    `issue` recusa com `CTE_ISSUANCE_FISCAL_SEQUENCE_MISSING`; sem item de nota ele recusa com
    `CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT`. Nos dois últimos o diário fez o certo: marcou o
    grupo `failed` com o código e seguiu para o próximo.
- Verde: **323 pass · 0 fail** no entrypoint do módulo. Entram 20 casos da confirmação, 7 das
  FlowActions e 1 de tenant.

Os casos da confirmação (`confirm-document-selection.contract.ts`, com fakes):

- grupo a grupo: dois lotes (um por perfil) criados e emitidos, uma NFS-e por (perfil, tomador) e o
  pedido em `dispatched`;
- toda chave usada casa `WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN`;
- permissões: seis combinações faltando (só CT-e, só NFS-e e misto) → `forbidden`, com o pedido
  ainda `previewed`, diário vazio e nenhum `create`; e o caso positivo de cada lado;
- hash divergente → `superseded` e prévia nova com o mesmo vencimento e período, sem emitir; nota
  bloqueada como já vinculada (AC4) → `superseded`;
- vencida → `expired`;
- dois toques concorrentes → um `dispatched`, um `in_progress`; dois lotes, uma NFS-e, três passos;
  o terceiro toque → `already_dispatched`;
- `ApiError` no 2º grupo → `issued`, `failed` (com o código), `issued`;
- erro que não é de domínio → o pedido fica `confirming`, com o 1º passo em `created`;
- retomada após queda entre `created` e `issue`, e após queda entre `create` e anotar → nenhum lote
  nem emissão duplicados;
- `resume` de pedido despachado não emite; pedido de outro usuário é `not_found`;
- `name`/`period` saem só do pedido congelado: o perfil renomeado depois não muda o nome do lote.

### Prova dos AC4, AC5 e da retomada (`test/integration/whatsapp-issuance-confirm.integration.ts`)

Os casos de uso reais de lote, emissão e NFS-e rodam contra Postgres. **Nenhuma chamada fiscal:** o
`issue` e a NFS-e só gravam tentativa e outbox, e quem fala com a SEFAZ e a prefeitura é o worker.

- **AC4.** Depois da prévia, a nota 1200 entra num lote pelo painel. O toque devolve `superseded`:
  - o pedido antigo fica `superseded`, sem nenhum lote `whatsapp:%`, nenhuma NFS-e e o diário vazio;
  - o pedido novo nasce `previewed`, com o mesmo vencimento e período, e a 1200 aparece
    `blocked · CTE_BATCH_DOCUMENT_ALREADY_LINKED`.
- **AC5.** Dois `confirm` em `Promise.all` → um `dispatched` e um `in_progress`/`already_dispatched`:
  - o diário tem `cte_batch issued` e `nfse_invoice issued`, com as chaves exatas;
  - sai **um** lote `whatsapp:%`, submetido, com o nome `WhatsApp ${id8} · Perfil CT-e T013`;
  - sai **uma** NFS-e;
  - são 4 tentativas de emissão, uma por nota;
  - o terceiro toque → `already_dispatched`, com as mesmas contagens.
- **Retomada.** A queda simulada antes do `issue` deixa o diário em `created`, com zero tentativas. O
  `resume` → `dispatched`: um lote só, o mesmo `document_id`, 4 tentativas. Um segundo `resume` →
  `already_dispatched`, e as tentativas continuam 4.

### Gates (primeiro plano)

- `bun run typecheck` (API) → limpo.
- `bun run lint` (API) → limpo.
- `bun --env-file=../../.env.test run test:integration` (API, 53 arquivos, com a nova) → **243 pass ·
  4 skip · 2 fail**. As duas falhas são as de `cte-archive-gateway.integration.ts` ("Object storage
  is unavailable"), com o MinIO fora do ar: falha de ambiente já registrada.
- `make check` → **exit 0**, depois do prettier nos `.md`:
  - format verde;
  - API **5440 pass · 0 fail** (167 arquivos);
  - worker 1005 · cron 94 · frontend 3329 · frontend-client 18 · frontend-landing 107, todos 0 fail;
  - as seis apps constroem.

  A flaky conhecida de `cargo-volume.contract.test.ts` não disparou nesta rodada.

## T014 — a liquidação fatura em nome de quem confirmou (2026-09-11)

O pedido `dispatched` deixou de ficar parado. O worker varre a cada batida, e quando os documentos
chegam a estado final (ou passam de 2 horas) chama a API com token de máquina. A API recalcula tudo
pelo banco, **revalida** quem confirmou e fatura os CT-e autorizados, uma fatura por tomador, em nome
dele. O `confirming` parado há mais de 15 minutos é retomado pelo `resume` da T013, pela mesma rota.

### Arquivos

- API, domínio:
  - `whatsapp-command-settlement.policy.ts` (pura): estado final de cada documento e veredito do
    pedido. É cópia por valor no worker, com o corpo idêntico abaixo da marca
    `// ── corpo compartilhado ──`;
  - `issuance-idempotency.policy.ts`: `buildBillingInvoiceIdempotencyKey`, ao lado das chaves de CT-e
    e NFS-e.
- API, aplicação:
  - `settle-whatsapp-command.use-case.ts`: a liquidação e a retomada;
  - `whatsapp-command-settlement.port.ts`: a leitura do estado de cada documento;
  - `whatsapp-command-settlement-summary.service.ts`: o texto do resumo;
  - `whatsapp-command.port.ts`: `recordJournalStep`, e `markSettled` passou a receber
    `settlementOutcome` separado do status.
- API, infraestrutura: `drizzle-whatsapp-command-settlement.repository.ts`, e o
  `drizzle-whatsapp-command.repository.ts` com o `recordJournalStep` (upsert pelo unique do diário).
- API, apresentação: `whatsapp-command-settlement.routes.ts` —
  `POST /whatsapp-command-requests/:id/settlement`.
- API, schema: `WHATSAPP_COMMAND_SETTLEMENT_OUTCOMES` e o CHECK de `settlement_outcome`.
- API, identidade: `whatsapp.settle` no catálogo, concedida só ao papel `automation`.
- Catálogo de jobs: `whatsapp.command.settle` na API, no worker e no cron.
- API, `main.ts`: a liquidação é montada no `bootstrap()`, com uma instância própria de
  `createBillingUseCase` (mesmas dependências da rota) e a rota ao lado de `createApplicationRoutes`.
- Migration `20260912153407_whatsapp_command_settlement`, aditiva, com `rollback.sql`:
  - CHECK de `settlement_outcome`;
  - `whatsapp.command.settle` nos dois CHECKs de job;
  - a janela de 300 s em `job_schedules`.

  O `db:generate` não trouxe deriva: o SQL gerado era só isso, mais o `INSERT` acrescentado à mão.

- Worker, `src/whatsapp-command-settlement/`:
  - `domain/` (a cópia da policy);
  - `application/` (porta e rotina);
  - `infrastructure/drizzle-settlement-candidate.repository.ts` e
    `whatsapp-command-settlement-api.gateway.ts` (molde de `automatic-manifest-api.gateway.ts`).

  A rotina entra no registro do `main.ts` só com o crachá do worker declarado.

- Frontend: a permissão nova na allowlist de `useAuthMe.query.ts`, no grupo `billing` e nos dois
  `identity*.locale.json`. Os contratos de paridade do frontend a cobram; foi o que reprovou a
  primeira rodada do `make check`.

### Policy de estados

| Status do documento                                                                                                                                           | Estado                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `authorized`                                                                                                                                                  | sucesso (fatura, se for CT-e) |
| `rejected`, `failed`, `cancelled`, `discarded`                                                                                                                | falha                         |
| `reconciliation_required`, `pending`, `in_flight`, `retry_scheduled`, `requested`, `issuing`, `pending_authorization`, `cancellation_requested`, desconhecido | pendente                      |

- Por nota, o status do CT-e é o do documento fiscal quando ele existe (autorizado ou cancelado);
  senão, o da última tentativa de emissão; senão, `pending`.
- Um grupo do diário que falhou na confirmação conta como falha. Um grupo `pending` conta como
  pendente.

| Pedido                                              | Veredito                                           |
| --------------------------------------------------- | -------------------------------------------------- |
| `dispatched`, todos finais                          | `settle` → `settled`                               |
| `dispatched`, pendente e `now − confirmed_at > 2 h` | `settle_partial` → `settled_partial` (`timed_out`) |
| `dispatched`, pendente dentro das 2 h               | `wait`                                             |
| `confirming` parado há mais de 15 min               | `resume` (T013)                                    |
| `confirming` recente, e todo o resto                | `wait`                                             |

O `settlement_outcome` ganhou vocabulário e CHECK:

- `completed` é o único código de `settled`;
- `timed_out`, `actor_not_authorized` e `billing_failed` são de `settled_partial`, nessa precedência
  inversa: ator recusado vence falha de fatura, que vence o prazo.

### Permissão e papel

- `whatsapp.settle`, escopo `company`, concedida só ao papel `automation`, que fica com
  `['mdfe.auto-issue', 'whatsapp.settle']`. Nenhum papel de gente a recebe, e o contrato do usuário
  do seed local a exclui como exclui `mdfe.auto-issue`.
- O serviço **não** recebe `billing.create`: quem fatura é a API, em nome do ator.
- A empresa chega pelo `x-company-id`, validado contra a membership sintética do serviço (ADR-0047
  §3). O token vem de `config.mdfeAutoIssue`, que é o crachá já validado no boot; o segredo não sai
  em erro nem em log.

### Decisões

1. **O tomador congelado coincide com o do faturamento, e foi conferido no código, não suposto.**
   São dois caminhos que resolvem o mesmo `taker` do perfil sobre a mesma coluna:
   - na prévia, `resolveProfileTakerTaxId` (`drizzle-nfe-document.repository.ts:802`) lê
     `nfe_participants.tax_id` do papel `emitter` (`0`) ou `recipient` (`3`);
   - na emissão, `resolveTakerParty` (`cte-receiver-ie.policy.ts:18`) lê o `sender`, que é
     `SENDER_ROLE = 'emitter'` (`cte-issuance-payload.query.ts:56`), ou o `recipient`, e grava
     `cte_issuance_payloads.taker_tax_id`, que é o que `buildBillingTakerJoin` lê.

   A integração afirma os dois tomadores no payload antes de liquidar. Por isso não foi preciso
   parar. Divergência residual (o perfil mudar de `taker` entre a confirmação e a emissão) cairia no
   `assertSingleCustomer` do faturamento como erro de domínio, e o pedido liquidaria como
   `billing_failed`, nunca com a fatura errada.

2. **O resumo sai pelo worker, não pela API.** Isto desvia do texto do pedido da task, e segue o
   plano:
   - o plano (§ Dados) já pôs a cópia de `user_whatsapp_phones` no worker "porque o resumo da
     liquidação sai para o número vinculado";
   - a API não tem remetente por empresa fora do webhook de entrada.

   A API devolve o texto na resposta. O worker lê o número verificado e envia pelo mesmo envio de
   **texto livre** do código de convite, sem template (`createWhatsAppCodeSender` com template
   `undefined`).

3. **Revalidação pelo mesmo caminho do canal.** `tenantContext.resolveCompanyForUser` exige
   membership ativa e empresa ativa. Depois vem o `authorize` de `billing.create`, o mesmo do
   router. Falhou qualquer um: `settled_partial` com `actor_not_authorized`, nenhuma fatura, nenhum
   passo no diário, e o resumo diz por quê.
4. **Retomada serializada pela linha de `job_executions`, provada em contrato:**
   - o schema da API declara `job_executions_open_unique` sobre `job` com `finished_at` nulo;
   - a mesma execução entregue duas vezes é reivindicada uma vez só (escrita condicional do lease),
     e o `resume` corre uma vez.

   O toque em ✅ Confirmar continua **não** retomando.

5. **CT-e que já está numa fatura ativa de outra chave fica de fora** (o painel faturou antes). O que
   está na fatura da **própria** chave entra: é o replay, e tirá-lo mudaria a digital e viraria
   conflito de idempotência.
6. **Recusa do faturamento é passo `failed` no diário**, com o código, e o outro tomador segue. Erro
   que não é de domínio sobe e o pedido fica `dispatched` para a próxima batida.
7. **A rota relata em vez de recusar:** aguardar, já liquidado e não achado são `200` com o desfecho.
   Recusa virava nova tentativa a cada batida sem nada mudar.
8. **Chave da fatura:** `whatsapp:${requestId}:billing:${takerTaxId}`, com o tomador canonicalizado.
   O diário grava `billing_invoice` com `group_key` = tomador e `document_id` = fatura.

### ⚠️ Achados datados (2026-09-12)

- **Resumo perdido se a resposta cair.** Se a API liquidar e a resposta HTTP não chegar ao worker, a
  repetição devolve `already_settled` sem texto, e o resumo não sai. A fatura está certa. Só a
  mensagem se perde.
- **Janela de 24 h da Meta.** Texto livre fora da janela é recusado. A recusa é contada
  (`summariesUndelivered`) e logada só com o nome do erro, **sem** template forçado. Mandar o resumo
  fora da janela pede um template aprovado próprio.
- **A D6 diz que "agir em nome do usuário" ganha ADR.** A ADR não foi escrita nesta task.
- **O catálogo de jobs do frontend já divergia**: não tem `geocoding.refine`, e agora também não tem
  `whatsapp.command.settle`. Não há contrato de paridade dele com a API, e não mexi.
- A junção de CT-e do repositório do worker só tem prova por contrato de tenant. A integração do
  worker cobre diário e NFS-e por `failed`/`pending`; a leitura de CT-e com tentativa e documento
  fiscal é provada do lado da API, no AC6.
- O `create` de NFS-e (`nfse-invoice-selection.query.ts:92`) não foi tocado. Na integração a NFS-e
  entra semeada já `authorized`, com o passo gravado pelo `recordJournalStep`.

### Vermelho → verde

- Vermelho: `bun test ./test/whatsapp-commands.contract.test.ts` → **0 pass · 1 fail · 1 error**
  (`whatsapp-command-settlement.routes.js` inexistente).
- Verde: `whatsapp-commands` + `whatsapp-command-schema` → **382 pass · 0 fail**.
- Worker: `whatsapp-command-settlement.contract.test.ts` + catálogo → **26 pass · 0 fail**.
- No caminho:
  - o contrato de catálogo da API cobra o seed de toda rotina, e a migration nova entrou em
    `SEED_MIGRATIONS`;
  - o contrato da T011 passou a gravar `settlement_outcome` com o código (`timed_out`), porque o
    CHECK novo recusaria o status no lugar dele;
  - o contrato de tenant do `automation` agora espera as duas permissões.

### Contratos

- `whatsapp-command-settlement-policy.contract.ts`: a tabela inteira, com `reconciliation_required`
  pendente, `cancelled` falha, desconhecido pendente e as duas janelas.
- `settle-whatsapp-command.contract.ts`:
  - uma fatura por tomador, com os CT-e autorizados, `context.userId` = ator, vencimento e chave;
  - ator suspenso e ator sem `billing.create` → nenhuma fatura;
  - `cancelled` não fatura;
  - `reconciliation_required` espera dentro das 2 h e sai nomeado depois delas;
  - repetição e corrida do `markSettled` → `already_settled`;
  - CT-e de outra chave fica fora, e o da própria chave entra;
  - recusa do faturamento → `billing_failed`; erro que não é de domínio → segue `dispatched`;
  - grupo falho no resumo; pedido de outra empresa não é achado;
  - retomada, espera e `resume_denied`;
  - **o log não carrega o resumo, número de nota nem documento do tomador**.
- `settlement-routes.contract.ts`:
  - nenhum papel além de `automation` concede `whatsapp.settle`;
  - administrador com tudo o que fatura recebe **403** e nada é chamado;
  - o token de máquina recebe 200 na empresa do contexto;
  - id que não é UUID é recusado.
- Tenant: os cinco filtros do leitor (lote, tentativa, documento fiscal, item de fatura ativo, NFS-e)
  levam a empresa como primeiro parâmetro. No worker, as três junções da varredura carregam a
  empresa.
- Worker:
  - paridade linha a linha da policy;
  - rotina: quem é chamado, com que dica, em que empresa; resumo ao número verificado; sem número;
    Meta recusando; API fora num pedido não impede os outros; parada entre pedidos; log sem resumo,
    telefone nem motivo;
  - gateway: bearer, `x-company-id`, token reusado, erro só com status;
  - serialização.

### Prova do AC6 e da revalidação (`test/integration/whatsapp-command-settlement.integration.ts`)

Prévia, confirmação e emissão são os casos de uso reais. A SEFAZ é simulada escrevendo o que o worker
escreveria:

- a nota 1238 fica `rejected`, com `539` e `Rejeicao: Duplicidade de CT-e`;
- as outras 38 ficam `authorized`, com documento fiscal;
- a NFS-e entra `authorized`.

- **AC6**, 39 notas de tomador `3`: as pares vão ao tomador A e as ímpares ao B.
  - O payload tem os dois tomadores.
  - O desfecho é `settled` / `completed`.
  - Saem **2 faturas**, com as chaves `whatsapp:${id}:billing:44555666000109` e
    `…:77888999000105`. As duas têm `actor_user_id` = quem confirmou, o `due_date` congelado na
    prévia, e o cliente = o tomador.
  - São **38 itens ativos**.
  - O diário tem dois passos `billing_invoice` `created`, com os ids das faturas.
  - O resumo traz "38 CT-e autorizados", "NF-e 1238: 539 — Rejeicao: Duplicidade de CT-e",
    "1 NFS-e autorizada, sem fatura" e "tomador final 0109: 19 CT-e" / "0105: 19 CT-e".
  - A repetição devolve `already_settled`, com 2 faturas e 38 itens.
- **Revalidação.** A membership vai a `disabled` antes da liquidação:
  - o desfecho é `settled_partial` / `actor_not_authorized`;
  - **nenhuma fatura** sai;
  - o resumo traz "Nenhuma fatura foi criada" e "3 CT-e autorizados".
- Resultado: **2 pass · 0 fail · 30 expects**.
- Worker (`test/whatsapp-command-settlement.integration.test.ts`), contra o banco provisionado e
  migrado como o `make worker-integration` faz: **2 pass · 0 fail**.
  - A fonte devolve os `dispatched` e o `confirming` parado, com o estado de cada documento; o
    `previewed` e o `confirming` recente ficam fora.
  - A rotina chama a API com `settle_partial` (3 h), `resume` (30 min) e `settle` (grupo falho), na
    ordem de `confirmed_at`, e entrega o resumo ao número verificado.

### Gates (primeiro plano)

- `bun run typecheck`: limpo na API, no worker e no cron.
- `bun run lint`: limpo na API, no worker e no cron.
- `make migration-test` → **92 pass · 0 fail** (migration e rollback em Postgres descartável).
- `bun --env-file=../../.env.test run test:integration` (API, 54 arquivos) → **245 pass · 4 skip ·
  2 fail**. As duas falhas são de `cte-archive-gateway`, com "Object storage is unavailable": o
  MinIO está fora do ar, falha de ambiente já registrada.
- Integrações da T011 e da T013 isoladas → **9 pass · 0 fail**. `markSettled` e o diário continuam
  valendo.
- `make check` → **exit 0**:
  - format verde;
  - API **5485 pass · 0 fail**, worker **1026**, cron **94**, frontend **3329**, frontend-client
    **18**, frontend-landing **107**, todos 0 fail;
  - as seis apps constroem.

  A primeira rodada reprovou os dois contratos de paridade de permissão do frontend, e a
  permissão entrou ali. A flaky conhecida de `cargo-volume.contract.test.ts` não disparou.
