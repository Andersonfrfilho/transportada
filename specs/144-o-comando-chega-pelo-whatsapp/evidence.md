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
