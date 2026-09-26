# Evidência — 211, o núcleo de conversa vira pacote

> Uma entrada por task. O modelo vai **com a versão exata** que rodou (`tasks.md` § "O modelo é por
> task"). As fases 1–3 moram no `adatechnology-packages`, branch `feat/conversation-core` (worktree
> `adatechnology-packages-wt/conversation-core`, a partir de `origin/main` `877e461`); o commit citado
> em cada task é de lá.

## Antes da Fase 1 — renumeração

A spec nasceu como 184 com a ADR-0075, e os dois números foram tomados em `origin/staging` por
outras sessões enquanto ela era escrita (`specs/184-fotos-da-carga-na-baixa`,
`docs/adr/0075-o-motorista-tem-app-propria.md`). Por decisão do dono do projeto (2026-09-26), a
spec passou a 211 e a ADR a 0085, numa branch nova `work/spec-211` a partir de `origin/staging`, com
os cinco commits de documentação trazidos por cherry-pick (commit `f338a7533`).

## Fase 1 — `conversation-contracts`

### T101 🧠 — contrato do vocabulário

- **Modelo:** Opus 5.5 (`claude-opus-5-5`) — classe pedida `opus`, atendida.
- **Commit:** `7f61176` (`packages/backend/conversation-contracts/src/vocabulary.test.ts`).
- **Visto falhar:** `bun test` → `Cannot find module './vocabulary'`, 0 pass / 1 fail.
- **Decisão de nome (contrato de host, RNF7):** o status se chama `MESSAGE_DELIVERY_STATUS`, e não
  `DELIVERY_STATUS` como o `plan.md` esboçou. O `notification-contracts` já exporta um
  `DELIVERY_STATUS` com outra lista (`skipped`, sem `read`), e o TransportAdA importa os dois
  pacotes: com o mesmo nome, o host teria de renomear na importação para sempre. Os valores são os
  da 183, na ordem dela.
- Os cinco vocabulários ficam fixos **na ordem** e congelados em runtime; acrescentar é minor,
  trocar ou tirar é major. `ATTACHMENT_KIND` = `audio | document | image`, o
  `ConversationAttachmentKind` da 183.

### T102 ⚙️ — o pacote nasce

- **Modelo:** Haiku 4.5 (`claude-haiku-4-5-20251001`).
- **Commit:** `fc114f6` (`packages/backend/conversation-contracts/{package.json, tsup.config.ts, tsconfig.json, CLAUDE.md, pnpm-lock.yaml}`).
- **Arquivos criados:** `package.json` (ESM+CJS exports, `sideEffects: false`, única dep `zod`), `tsup.config.ts` (molde notification-contracts), `tsconfig.json` (extends tsconfig.base.json), `CLAUDE.md` (8 invariantes do núcleo).
- **Teste (esperado falhar):** `pnpm --filter @adatechnology/conversation-contracts run test`

  ```
  bun test v1.3.14 (0d9b296a)

  src/vocabulary.test.ts:

  # Unhandled error between tests
  error: Cannot find module './vocabulary' from '...conversation-contracts/src/vocabulary.test.ts'

   0 pass
   1 fail
   1 error
  ```

### T103 — os tipos do T101

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Commit:** `722af55` (`packages/backend/conversation-contracts/src/{vocabulary.ts,index.ts}`).
- `src/vocabulary.ts` com os cinco vocabulários como tupla `as const` congelada
  (`Object.freeze`) e o schema `z.enum` de cada um; `src/index.ts` com barrel explícito, sem
  `export *`.
- **Gate:**

  ```
  $ pnpm --filter @adatechnology/conversation-contracts run check
  > tsc -p tsconfig.json --noEmit
  (sem saída — 0 erros)

  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)
   7 pass
   0 fail
   40 expect() calls
  Ran 7 tests across 1 file. [25.00ms]
  ```

### T104 — contrato da tabela de capacidades

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Commit:** `9447084` (`packages/backend/conversation-contracts/src/channelCapabilities.test.ts`).
- Fixa RF2/D3/D4: `confirmsRead`, `sessionWindowHours`, `attachments` (`accepted`, `maxBytes`,
  `maxTotalBytes`), `audio` (`plays`, `records`), `quickReplies`, `requiresTransport` e
  `reachableStatuses`, para os cinco canais. `email` nunca alcança `read`; `portal` ouve e não
  grava áudio e só alcança `delivered|read`; `whatsapp` tem janela de 24h.
- **Decisão de forma (não estava no `plan.md`, registrada no comentário do teste):**
  `attachments.maxBytes` é um número só por canal — o maior tipo aceito, lido de
  `CONVERSATION_ATTACHMENT_LIMITS` da 183 — porque o contrato do RF2 não abre por tipo de anexo.
  `webchat` não tem política de origem (nasce nesta spec); seu teto é o menor entre os tetos dos
  outros quatro canais, como o enunciado da task pediu, e ele alcança
  `queued | delivered | failed` — o mesmo formato de `app` (sem `read`, porque não confirma
  leitura) trocando `read` por `failed` (não confirma leitura, mas o transporte pode falhar).
  `quickReplies` saiu `true` para os cinco: a resposta rápida (183 T701) é texto que o operador
  ainda edita antes de mandar (D4), sem coluna de canal na tabela de origem
  (`company_quick_replies`) — não é capacidade de transporte.
- **Visto falhar:**

  ```
  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)
  src/channelCapabilities.test.ts:
  # Unhandled error between tests
  error: Cannot find module './channelCapabilities' from '...src/channelCapabilities.test.ts'
   7 pass
   1 fail
   1 error
  Ran 8 tests across 2 files. [25.00ms]
  ```

  (os 7 pass são o `vocabulary.test.ts` da T101, que continuou verde.)

### T105 — a tabela de capacidades

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Commit:** `fd1e6b2` (`packages/backend/conversation-contracts/src/{channelCapabilities.ts,index.ts}`).
- `CHANNEL_CAPABILITIES` congelada (o objeto e cada `attachments`/`audio`/`reachableStatuses`
  interno) e `getChannelCapabilities(channel)`. Exportada no barrel.
- **Gate:**

  ```
  $ pnpm --filter @adatechnology/conversation-contracts run check
  (sem saída — 0 erros)

  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)
   15 pass
   0 fail
   95 expect() calls
  Ran 15 tests across 2 files. [17.00ms]
  ```

### T106 — contrato da máquina de status

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Commit:** `1ffe37c` (`packages/backend/conversation-contracts/src/deliveryStatus.test.ts`).
- Porta exata da regra de `message-status.policy.ts` da 183: só avança, guarda horário ISO por
  transição, evento repetido é idempotente (`changed: false`), evento fora de ordem (`read` antes
  de `delivered`) avança sem inventar o horário que faltou, e falha só vale dentro da janela do
  canal (`failableUntil`) — falha depois de `delivered` é `stale`.
- **Decisão registrada no comentário do teste:** o que cada canal alcança vem de
  `getChannelCapabilities` (T105), não de uma lista duplicada — `read` no e-mail e `sent` no
  portal são recusados pela mesma tabela que a tela usa (D3). A idempotência por `(canal, id do
provedor)` é do banco (T202, `unique` da 183); esta função pura nunca vê o id do provedor.
- **Visto falhar:**

  ```
  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)
  src/deliveryStatus.test.ts:
  # Unhandled error between tests
  error: Cannot find module './deliveryStatus' from '...src/deliveryStatus.test.ts'
   15 pass
   1 fail
   1 error
  Ran 16 tests across 3 files. [29.00ms]
  ```

  (os 15 pass são vocabulary.test.ts + channelCapabilities.test.ts, que continuaram verdes.)

### T107 — a máquina de status

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Commit:** `61487fe` (`packages/backend/conversation-contracts/src/{deliveryStatus.ts,index.ts}`).
- `advanceDeliveryStatus({ channel, current, event })` — objeto único de parâmetro. Exportada no
  barrel.
- **Gate:**

  ```
  $ pnpm --filter @adatechnology/conversation-contracts run check
  (sem saída — 0 erros)

  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)
   23 pass
   0 fail
   109 expect() calls
  Ran 23 tests across 3 files. [17.00ms]
  ```

### T108 — as portas

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Commit:** `0cbc0b4` (`packages/backend/conversation-contracts/src/{ports.ts,ports.test.ts,index.ts}`).
- Só assinatura, sem comportamento de runtime: `ConversationChannelPort` (`sendText`,
  `sendAttachment`, devolve id opaco do provedor); `ConversationEmailTransportPort`
  (`deriveReplyAddress` — a fórmula HMAC da 143, com `replyAddressPrefix` como parâmetro do host;
  `verifyReplyToken` — comparação de tempo constante, porque HMAC não se inverte, a busca da
  candidata por hash continua sendo do host, como `findThreadByReplyTokenHash` da 143;
  `sendEmail` — `In-Reply-To`/`References` e `Idempotency-Key` = id da nossa mensagem;
  `recordRawInboundEmail` — MIME bruto e `sha256` antes de qualquer interpretação; `verifyDkim` —
  devolve `DkimResult`); `ClockPort` (`now(): Date`); `ObjectStoragePort` (`put`, `get`, `delete`,
  `createSignedDownload`, `createSignedUpload` — nomes espelham `object-storage-provider`, **sem
  importá-lo**, conferido por `grep` não encontrar a string do pacote em `src/`); `TranscriberPort`
  (opcional — ausência é anexo sem texto, ADR-0074).
- `src/ports.test.ts`: dublês simples de cada porta, compilando sob `strict` — não exercita
  comportamento (a porta é assinatura), só prova que a forma dos métodos é implementável.
- **Contrato das palavras proibidas (auto-conferido antes da T109):**
  `grep -rniE "occurrence|contractor|driver" src/` → nenhuma ocorrência.
- **Gate:**

  ```
  $ pnpm --filter @adatechnology/conversation-contracts run check
  (sem saída — 0 erros)

  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)
   26 pass
   0 fail
   115 expect() calls
  Ran 26 tests across 4 files. [25.00ms]
  ```

### T109 ⚙️ — contrato do CA01

- **Modelo:** Haiku 4.5 (`claude-haiku-4-5-20251001`).
- **Commit:** `4d65d14` (`packages/backend/conversation-contracts/src/productVocabulary.test.ts`).
- ADR-0085 §2: o núcleo de conversa nunca aprende o domínio do produto. Este contrato testa que
  nenhum arquivo do pacote contém palavras de transportadora (`occurrence`, `contractor`, `driver`).
  O detector varre recursivamente todos os `.ts` do `src/`, reporta arquivo e linha ao encontrar,
  e o próprio arquivo de teste contém as palavras **construídas por concatenação** (ex.:
  `'occ' + 'urrence'`) para passar por construção — a regex não encontra a palavra inteira no
  source, só em runtime.
- **Visto falhar (com probe `__probe.ts` contendo `occurrence`):**

  ```
  src/productVocabulary.test.ts:
  Violação do contrato:
    __probe.ts:1: export const probe = 'occurrence'
    productVocabulary.test.ts:59: const syntheticString = 'This is an occurrence of a forbidden word'

  error: expect(received).toEqual(expected)
  (fail) productVocabulary: núcleo rejeita vocabulário de produto > nenhum arquivo do núcleo contém vocabulário de produto [3.56ms]
   28 pass
   1 fail
  ```

- **Verde (sem probe):**

  ```
  bun test v1.3.14 (0d9b296a)
   29 pass
   0 fail
   122 expect() calls
  Ran 29 tests across 5 files. [37.00ms]
  ```

- **Gate:**

  ```
  $ pnpm --filter @adatechnology/conversation-contracts run check
  (sem saída — 0 erros)
  ```

## Fase 2 — `conversation-module`

### T201 🧠 — contrato do schema

- **Modelo:** Opus 5.5 (`claude-opus-5-5`) — classe pedida `opus`, atendida.
- **Commit:** `556307b` (`packages/backend/conversation-module/src/schema/schema.test.ts`).
- **Visto falhar:** `bun test` → `Cannot find module 'drizzle-orm/pg-core'` (o pacote do módulo ainda
  não existe; a T202 roda o teste de novo entre o andaime e o schema, para ver a falha em
  `./schema`).
- **O alvo que o teste fixa** (é o que a migração da Fase 6 vai ter de acertar):
  - schema Postgres próprio `conversation`, tabelas `conversations`, `participants`, `messages`,
    `attachments`, `reads`, `unassigned`, `quick_replies`, `uploads`;
  - `company_id uuid not null` em toda tabela, e todo unique começando por ele;
  - `subject_type`/`subject_id`/`audience` texto anulável, CHECK de par inteiro-ou-ausente, e
    unique **parcial** `(empresa, assunto, público)` só para a conversa com assunto — a conversa por
    pessoa não tem chave no banco, e a unicidade dela fica no caso de uso;
  - **nenhuma FK sai do schema do módulo**, e a conversa não tem FK nenhuma;
  - participante com exatamente `id, company_id, conversation_id, channel, identifier, created_at`;
  - mensagem com o unique idempotente `(empresa, canal, id do provedor)`, CHECK de autoria, e um
    CHECK por canal do status que ele alcança, derivado da tabela de capacidades da T105;
  - anexo com `sha256` e `object_key`, e nenhuma coluna `bytea` em tabela nenhuma;
  - nenhum nome de tabela, coluna, índice, CHECK ou FK com vocabulário de produto.
- **Desvios do `plan.md`, medidos no código:**
  - `occurrence_conversation_settings`, que o plan manda mover, **não existe** na 183 (nenhuma
    tabela, migration ou referência em `apps/api-transportada`). Não entra no núcleo.
  - O plan manda seguir o molde do `meta-whatsapp-module`, mas ele declara peer `drizzle-orm <1`, e o
    TransportAdA roda `1.0.0-rc.4` — é a "dívida de formato" que prende o TransportAdA na `0.1.0`
    daquele pacote. O molde passa a ser o `notification-module`: peer `>=0.36.0 <2` e `migrate`
    injetado pelo host, que é exatamente como o TransportAdA já roda as migrations dele
    (`notification-migration.service.ts`).
  - `public_ref` e o aviso de expiração de janela da 183 são genéricos (referência opaca exposta a
    canal externo; janela de canal) e ficam no núcleo; `contractor_id`/`driver_user_id`/
    `contractor_contact_id` saem (ADR-0085 §3).

### T202 — schema e migrations

- **Modelo:** Sonnet 5 (`claude-sonnet-5`) — classe pedida `sonnet`, atendida.
- **Onde:** `adatechnology-packages-wt/conversation-core` (branch `feat/conversation-core`),
  `packages/backend/conversation-module/`.
- **Commit:** `709896a` (`feat(conversation-module): schema e migrations do núcleo (T202)`).
- **Visto falhar (evidência da T201, completada aqui):** depois do andaime (`package.json` +
  `pnpm install` na raiz do worktree, `conversation-contracts` precisou de `pnpm --filter
@adatechnology/conversation-contracts run build` antes — sem `dist/` o import falhava com
  `Cannot find module '@adatechnology/conversation-contracts'`), `pnpm --filter
@adatechnology/conversation-module run test` → `error: Cannot find module './schema' from
'.../src/schema/schema.test.ts'`. Fecha o "visto falhar" que a T201 deixou pendente.
- **`src/schema/schema.ts`:** `pgSchema('conversation')`, oito tabelas (`conversations`,
  `participants`, `messages`, `attachments`, `reads`, `unassigned`, `quick_replies`, `uploads`),
  nenhuma FK saindo do módulo, `company_id` obrigatório com todo `unique`/índice único começando por
  ele. Vocabulário de canal, DKIM e tipo de anexo importados de `@adatechnology/conversation-contracts`
  — os sete CHECKs `messages_<canal>_reachable_status_check` são **gerados** por
  `CONVERSATION_CHANNEL.map(...)` sobre `CHANNEL_CAPABILITIES`, nunca lista escrita à mão (RF2).
- **Decisões tomadas no código, medidas contra o teste fixo da T201:**
  - `public_ref`: a origem (spec 183) era única na instalação inteira; como o módulo é
    multi-tenant por desenho, o `unique` ficou `(company_id, public_ref)` — satisfaz "todo unique
    começa por `company_id`" da T201. Documentado no comentário da coluna: um host que precisar de
    unicidade além da própria empresa garante isso na composição dele, não é invariante do núcleo.
  - Índice único parcial `conversations_subject_audience_unique` em `(company_id, subject_type,
subject_id, coalesce(audience, ''))` `where subject_type is not null`, via `uniqueIndex(...)
.on(...).where(...)` (mesmo padrão de `address-correction.schema.ts` no TransportAdA).
  - `messages_author_check`, `messages_dkim_result_check`, `unassigned` (sem `contractor_contact_id`,
    `mail_message_id` → `transport_ref text`, `+dkim_result`, canal no vocabulário inteiro),
    `quick_replies` (`audience` livre, sem CHECK de lista) e `uploads` (alvo `conversation_id`, FK
    composta para `conversations`, `object_key` único vira `(company_id, object_key)`) seguem
    exatamente o que o prompt da task especificou a partir da 183 + ADR-0085 §3.
- **Migration:** `pnpm --filter @adatechnology/conversation-module run db:generate` gerou
  `src/migrations/0000_round_zuras.sql` (8 tabelas). Editada à mão **uma linha**: `CREATE SCHEMA
"conversation"` → `CREATE SCHEMA IF NOT EXISTS "conversation"`, com comentário explicando o motivo
  (mesmo raciocínio do baseline do `notification-module`). `src/migrations.test.ts` (molde reduzido
  do `notification-module`, sem Postgres) prova essa linha por leitura, sem reproduzir o teste de
  "todo CREATE é condicional" inteiro — este módulo nasce sem predecessor a espremer.
- **Verde final:**
  - `pnpm --filter @adatechnology/conversation-module run test` → **12 pass / 0 fail** (10 do
    `schema.test.ts` da T201 + 2 do `migrations.test.ts` novo), 625 `expect()`.
  - `pnpm --filter @adatechnology/conversation-module run build` → `tsup` ok, `dist/migrations/`
    confirmado com o SQL e a pasta `meta/` copiados (o `onSuccess` do `tsup.config.ts`, copiado do
    `notification-module`).
  - `pnpm --filter @adatechnology/conversation-contracts run test` → **29 pass / 0 fail** (nada
    quebrou nos contracts).
- ⚠️ **`pnpm --filter @adatechnology/conversation-module run check` (`tsc --noEmit`) FALHA**, e não é
  causado por este schema: `src/schema/schema.test.ts:189:50` — `error TS18048: 'name' is possibly
'undefined'` em `config.uniqueConstraints.map((item) => item.getName())`, cujo tipo em
  `drizzle-orm@0.45.2` é `getName(): string | undefined` (confirmado em
  `node_modules/drizzle-orm/pg-core/unique-constraint.d.ts:24`). O `tsconfig.json` deste pacote é
  idêntico ao do `notification-module` (`strict: true` herdado de `tsconfig.base.json`), então não é
  configuração deste pacote — é um `possibly undefined` real na T201, que é contrato fixo e **não foi
  alterado** por esta task, por instrução explícita. `bun test` não pega isso porque não type-checa.
  Fica registrado para decisão do dono da spec: ajustar o teste da T201 (ex.: `item.getName() ?? ''`)
  é a correção mínima, mas está fora do escopo autorizado desta task.
- **`pnpm-lock.yaml`:** o `pnpm install` também tocou uma entrada não relacionada
  (`jest-worker@27.5.1` → `@types/node` `22.20.2` → `24.13.4`); revertida à mão antes do commit —
  só sobraram as linhas de `packages/backend/conversation-module`.
- `git status --short` no `adatechnology-packages-wt/conversation-core`: limpo depois do commit.
- **Defeito achado pelo coordenador, corrigido no commit `a00603a`:** os sete CHECKs
  `messages_<canal>_reachable_status_check` interpolavam `${channel}` direto no template `sql` em
  vez de por `sql.raw`, e o `drizzle-kit generate` emitia `"channel" <> $1` — parâmetro de bind
  dentro de DDL, que o Postgres recusa (`CHECK` não tem plano de execução parametrizável).
  Corrigido trocando `${channel}` por `${sql.raw(\`'${channel}'\`)}` em `schema.ts`, no mesmo
  padrão do `inList` já usado nos outros CHECKs. Migration regenerada do zero (0000 e `meta/`
  apagados e recriados por `db:generate`) mantendo o `CREATE SCHEMA IF NOT EXISTS` comentado.
  `grep -n '\$[0-9]' src/migrations/*.sql` → vazio (confirmado duas vezes, antes e depois do
  `pre-commit` reformatar). `src/migrations.test.ts` ganhou o caso
  "nenhuma migration carrega parâmetro de bind — DDL é sempre literal", que reprova qualquer
  `$<n>`no SQL embarcado. Verde final:`check`limpo (o`getName()`do T201 também foi corrigido
em paralelo, commit`e8a95d4`, fora do escopo desta task), `test`**13 pass / 0 fail** (626`expect()`), `build`ok.`git status --short`: limpo depois do commit.

### T203 ⚙️ — companyId nunca no corpo

- **Modelo:** Haiku 4.5 (`claude-haiku-4-5-20251001`).
- **Onde:** `adatechnology-packages-wt/conversation-core` (branch `feat/conversation-core`),
  `packages/backend/conversation-contracts/src/`.
- **Commit:** `36d5597` (`packages/backend/conversation-contracts/src/strictness.test.ts`).
- Molde do `notification-contracts` adaptado aos quatro schemas de corpo do conversation-module
  (`openConversationBodySchema`, `sendMessageBodySchema`, `markConversationReadBodySchema`,
  `quickReplyBodySchema`). Oito testes, um para cada schema + `companyId` / `company_id`, verificando
  que nenhuma delas entra no dado parseado (schema `.strict()` recusa ou strip remove; aceita qualquer
  das duas desde que o campo não apareça no resultado).
- **Visto falhar (esperado até T206):**

  ```
  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)

  src/strictness.test.ts:

  # Unhandled error between tests
  error: Cannot find module './requestSchemas' from '...src/strictness.test.ts'

   29 pass
   1 fail
   1 error
   122 expect() calls
  Ran 30 tests across 6 files. [42.00ms]
  ```

  (os 29 pass são os testes anteriores das Fases 1–2, que continuaram verdes.)

- ⚠️ **`pnpm --filter @adatechnology/conversation-module run check` vai **falhar** até a T206**
  — os schemas de corpo não existem, e o arquivo importa de `./requestSchemas` (que será criado
  naquela task). A falha é esperada: `Cannot find module './requestSchemas'`. Não rode o `check`
  como gate desta task.

### T204 — repositórios atrás de porta

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Onde:** `adatechnology-packages-wt/conversation-core` (branch `feat/conversation-core`),
  `packages/backend/conversation-module/src/repositories/` e `src/testing/`.
- **Commit:** `f3cb36d` (`feat(conversation-module): repositórios atrás de porta, um por agregado (T204)`).
- Um tipo de porta por agregado em `repositories/ports.ts` — `ConversationRepositoryPort`
  (conversas+participantes), `MessageRepositoryPort` (mensagens+status), `AttachmentRepositoryPort`
  (anexos+uploads), `ReadRepositoryPort`, `UnassignedRepositoryPort`, `QuickReplyRepositoryPort` —
  e a implementação Drizzle de cada uma sobre o schema da T202, recebendo o `db` do host por
  construtor. Toda consulta carrega `eq(<tabela>.companyId, ...)`, no molde de
  `notification-module/repositories/NotificationRepository.ts`.
  - `ConversationRepository.findBySubject` resolve a idempotência da conversa **com** assunto
    (`company_id, subject_type, subject_id, audience`); `findOpenByParticipant` resolve a
    idempotência da conversa **sem** assunto, pelo `(canal, identificador)` do participante —
    junta `conversations` com `participants` e filtra `subject_type is null and status = 'open'`,
    nunca "a mais recente" (D7).
  - `MessageRepository.list` pagina por cursor `(created_at, id)` — `repositories/cursor.ts`, cópia
    adaptada de `notification-module/repositories/cursor.ts`.
  - `AttachmentRepository` cobre as duas tabelas do fluxo de upload em dois passos (`attachments` e
    `uploads`) que a T209/T210 vão usar; aqui só a forma, sem regra de negócio.
- Os dublês em memória que a T205 vai consumir foram para `src/testing/inMemoryRepositories.ts`,
  exportados por `src/testing/index.ts` e pelo subpath `./testing` do `package.json` (adicionado
  `exports["./testing"]`, `tsup.config.ts` ganhou `src/testing/index.ts` como segundo entrypoint —
  mesmo desenho de `notification-module/testing`).
- Teste (`repositories/ports.test.ts`) declara cada dublê com o tipo da porta
  (`const port: ConversationRepositoryPort = createInMemoryConversations()`) e exercita o
  comportamento mínimo de cada agregado — a prova de forma que a task pede. A prova de que a
  implementação Drizzle atende à mesma porta é de tipo (`implements` na classe); a prova contra
  Postgres real é a T212, como a task deixa explícito.
- **Verde:**

  ```
  $ pnpm --filter @adatechnology/conversation-module run check
  tsc -p tsconfig.json --noEmit   (sem saída)

  $ pnpm --filter @adatechnology/conversation-module run test
  bun test v1.3.14 (0d9b296a)
   19 pass
   0 fail
   639 expect() calls
  Ran 19 tests across 3 files. [38.00ms]

  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)
   29 pass
   1 fail
   1 error
   122 expect() calls
  Ran 30 tests across 6 files. [24.00ms]
  ```

  O `1 fail`/`1 error` do `conversation-contracts` é o mesmo vermelho da T203, esperado até a T206
  fechar o `requestSchemas.ts` — não regrediu nada.

- Decisão: não criei um `UploadRepositoryPort` separado — o `AttachmentRepositoryPort` cobre as
  duas tabelas (`attachments` e `uploads`) porque são o mesmo agregado no fluxo de anexo (RF8), e
  a task lista "anexos+uploads" como um único item.

### T205 — teste dos casos de uso

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Onde:** `adatechnology-packages-wt/conversation-core` (branch `feat/conversation-core`),
  `packages/backend/conversation-module/src/use-cases/`.
- **Commit:** `f956f89`
  (`test(conversation-module): contrato dos casos de uso — abrir, enviar, receber, status, lida, listar (T205)`).
- Três arquivos de teste, um por agrupamento de caso de uso (molde `notification-module/use-cases/*.use-cases.ts`,
  que agrupa por área):
  - `Conversation.use-cases.test.ts` — `OpenConversationUseCase` pelo **mesmo** caminho com e sem
    assunto (CA02): idempotente por `(empresa, subject_type, subject_id, audience)` quando há
    assunto, idempotente pelo participante `(canal, identificador)` quando não há; audiências
    diferentes do mesmo assunto abrem conversas diferentes; participante é sempre registrado.
  - `Message.use-cases.test.ts` — `SendMessageUseCase` (grava `queued`, chama a
    `ConversationChannelPort` do canal, grava o id do provedor; `automatic` nunca carrega autor;
    canal sem porta lança `ChannelPortNotConfiguredError` — nunca aceita canal sem porta),
    `ReceiveMessageUseCase` (`sender_address` para canal externo, `author_user_id` para canal com
    conta do host), `UpdateMessageStatusUseCase` (avança via `advanceDeliveryStatus` do contracts;
    o mesmo evento duas vezes não muda nada — CA05; id de provedor desconhecido por
    `(canal, id)` é **ignorado sem erro**, não lança), `ListConversationMessagesUseCase` (pagina).
  - `Read.use-cases.test.ts` — `MarkConversationReadUseCase` marca a última lida e **só avança**:
    marcar uma mensagem mais antiga como lida depois de uma mais nova não retrocede. "Não avisa a
    outra parte" é provado por omissão: a dependência do caso de uso não inclui porta de
    notificação nenhuma — não há como avisar.
- Os testes já assumem o desenho que a T206 vai construir: `SendMessageUseCase` recebe
  `channels: Partial<Record<ConversationChannel, ConversationChannelPort>>` (porta ausente é
  `ChannelPortNotConfiguredError`, nunca flag `hasX` — ADR-0051 §4), e importam `ChannelPortNotConfiguredError`
  de `../errors` (ainda não criado).
- **Visto falhar (esperado até a T206):**

  ```
  $ pnpm --filter @adatechnology/conversation-module run test
  bun test v1.3.14 (0d9b296a)

  src/use-cases/Message.use-cases.test.ts:
  # Unhandled error between tests
  error: Cannot find module '../errors' from '.../Message.use-cases.test.ts'

  src/use-cases/Conversation.use-cases.test.ts:
  # Unhandled error between tests
  error: Cannot find module './Conversation.use-cases' from '.../Conversation.use-cases.test.ts'

  src/use-cases/Read.use-cases.test.ts:
  # Unhandled error between tests
  error: Cannot find module './Read.use-cases' from '.../Read.use-cases.test.ts'

   19 pass
   3 fail
   3 errors
   639 expect() calls
  Ran 22 tests across 6 files. [56.00ms]
  ```

  Os 19 pass são a suíte da T204, que continuou verde. `check` não foi rodado como gate desta
  task — os três módulos de caso de uso ainda não existem, então o typecheck também falharia por
  desenho, igual ao aviso já registrado na T203.

- Decisão: descobri em T205 que `MessageRepositoryPort.updateStatus` (T204) não tinha como gravar
  o `providerMessageId` depois do envio — só `status`/`statusTimes`. A T206 vai estender
  `UpdateMessageStatusParams` com um `providerMessageId` opcional (ou método dedicado) para o
  `SendMessageUseCase` fechar; registrado aqui para não parecer retrabalho silencioso quando a
  T206 tocar `repositories/ports.ts` de novo.

### T206 — os casos de uso e a factory `createConversationModule`

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Onde:** `adatechnology-packages-wt/conversation-core` (branch `feat/conversation-core`),
  `packages/backend/conversation-module/src/` e `packages/backend/conversation-contracts/src/`.
- **Commit:** `748f91e`
  (`feat(conversation-module): casos de uso e a factory createConversationModule (T206)`).
- Fechou a decisão pendente da T205: `UpdateMessageStatusParams` ganhou `providerMessageId?`
  (`repositories/ports.ts`), e `MessageRepository`/o dublê em memória passaram a gravá-lo quando
  presente — é o que o `SendMessageUseCase` usa para anexar o id do provedor sem um segundo método
  de porta.
- `Conversation.use-cases.ts` (`OpenConversationUseCase`), `Message.use-cases.ts`
  (`SendMessageUseCase`, `ReceiveMessageUseCase`, `UpdateMessageStatusUseCase`,
  `ListConversationMessagesUseCase`) e `Read.use-cases.ts` (`MarkConversationReadUseCase`)
  implementam exatamente o que a T205 testou — os 3 arquivos de teste que estavam vermelhos
  ficaram verdes sem alteração de asserção.
- `errors.ts`: hierarquia própria do módulo (`ConversationModuleError`), molde de
  `notification-contracts/errors.ts` — `ChannelPortNotConfiguredError` (canal sem porta, usado pelo
  `SendMessageUseCase`), `ConversationNotFoundError`, `MessageNotFoundError` (usado pelo
  `MarkConversationReadUseCase` quando o `lastReadMessageId` não existe), `ConfigMissingError`, e
  três erros reservados para T209/T210 (`AttachmentsDisabledError`, `AttachmentTypeMismatchError`,
  `AttachmentTooLargeError`) e dois para o upload em dois passos (`UploadNotFoundError`,
  `UploadExpiredError`) — declarados agora porque a hierarquia é um único arquivo, mas ainda não
  lançados por nenhum caso de uso desta task.
- `ConversationModule.ts`: `createConversationModule({ config, features, providers })`.
  `ConversationModuleConfig`/`ConversationModuleFeatures` são `Record<string, never>` — reservados,
  vazios de propósito, porque o que liga/desliga canal e recurso é sempre a porta em `providers`,
  nunca uma flag (ADR-0051 §4). `providers.channels` tem o tipo
  `Partial<Record<Exclude<ConversationChannel,'email'>, ConversationChannelPort>>` — `email` não é
  membro comum do mapa de canais porque o transporte dele é outra porta
  (`ConversationEmailTransportPort`, com assunto e threading, ainda não consumida por nenhum caso
  de uso desta task). `enabledChannels` é derivado: as chaves de `providers.channels` mais `'email'`
  só quando `providers.emailTransport` vem preenchido. Instanciei só os repositórios que os seis
  casos de uso desta task consomem (`conversations`, `messages`, `reads`) — `Attachment`/
  `Unassigned`/`QuickReply` ficam para T208/T210/T211, para o factory não carregar dependência que
  nada usa ainda.
- `conversation-contracts/src/requestSchemas.ts`: os quatro schemas `.strict()` que o
  `strictness.test.ts` (T203) importa — `openConversationBodySchema`, `sendMessageBodySchema`,
  `markConversationReadBodySchema`, `quickReplyBodySchema`. `channel` é tipado `z.string()`, não o
  enum do vocabulário — o teste de tipo do T203 exige `Exact<SendMessageBody['channel'], string>`,
  e um `z.enum(...)` infere o tipo literal da união, não `string`, o que quebraria a asserção
  (mesmo padrão de `notification-contracts/strictness.test.ts`, que só faz o `Exact` contra `string`
  nos campos que já eram `z.string()`). `quickReplyBodySchema.bodyText` tem teto fixo `500` (não
  importa `CONVERSATION_QUICK_REPLY_MAX_LENGTH` do module — contracts nunca depende de module,
  sentido inverso da dependência real do monorepo; comentário no arquivo registra a duplicação
  intencional).
- **O vermelho da T203 fechou aqui** — confirmado pelo `test` abaixo: os 30 testes de
  `conversation-contracts` (que tinham 1 fail/1 error) foram para 38 pass (os 8 novos são os do
  próprio `requestSchemas.ts`/`strictness.test.ts`, mais 0 novos de regressão).
- **Verde:**

  ```
  $ pnpm --filter @adatechnology/conversation-module run check
  tsc -p tsconfig.json --noEmit   (sem saída)

  $ pnpm --filter @adatechnology/conversation-module run test
  bun test v1.3.14 (0d9b296a)
   35 pass
   0 fail
   664 expect() calls
  Ran 35 tests across 6 files. [44.00ms]

  $ pnpm --filter @adatechnology/conversation-module run build
  ... DTS ⚡️ Build success in 1534ms (dist/index.js, dist/testing/index.js, .d.ts de ambos)

  $ pnpm --filter @adatechnology/conversation-contracts run check
  tsc -p tsconfig.json --noEmit   (sem saída)

  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)
   38 pass
   0 fail
   131 expect() calls
  Ran 38 tests across 6 files. [22.00ms]
  ```

- Decisão: não criei nenhuma rota HTTP nem wiring de `module-http` nesta task — a task pede só "os
  casos de uso e a factory". Rotas ficam para a Fase 5 (consumo pelo TransportAdA), no mesmo
  desenho que `notification-module/NotificationModule.ts` reserva `routes`/`worker` para depois.

### T207 — teste da atribuição genérica

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Onde:** `adatechnology-packages-wt/conversation-core` (branch `feat/conversation-core`),
  `packages/backend/conversation-module/src/use-cases/`.
- **Commit:** `efa2d35` (`test(conversation-module): contrato da atribuição genérica (T207)`).
- Li `whatsapp-attribution.policy.ts` (spec 183, só leitura) para portar a **regra**, não o
  vocabulário: lá é `contractorId`/`driverUserId`/`context.id`; aqui é `(canal, identificador)` +
  uma referência de resposta já resolvida pelo transporte do host, e a regra de "quem pode ver essa
  conversa" (o `optedInContractorIds` da origem) vira porta opcional (`filterCandidates`) — o
  produto injeta a própria regra de atribuível, o núcleo não conhece contratante nem motorista.
- `Attribution.types.ts`: `FilterConversationCandidatesPort` — porta opcional; ausente, todas as
  conversas abertas do participante contam como candidatas.
- `Attribution.use-cases.test.ts` cobre `AttributeInboundMessageUseCase`:
  - referência de resposta (`replyConversationId`) válida da mesma empresa → atribui direto,
    **sem** olhar candidatas;
  - referência de outra empresa → **não** é aceita cegamente: cai no fluxo por candidatas (que aqui
    dá `no_candidate`, porque o teste não registrou participante nenhum);
  - sem referência, candidata única → atribui; **duas candidatas → fila, nunca "a mais recente"**
    (D7, "nunca palpite" — testado explicitamente); nenhuma candidata → `no_candidate` **sem
    gravar nada** (nem mensagem, nem entrada na fila — as duas listas ficam vazias no teste);
  - `filterCandidates` reduz o conjunto e muda o resultado de "duas candidatas → fila" para "uma
    candidata → atribui";
  - idempotência pelo id do provedor, testada nos dois desfechos (conversa e fila): chamar duas
    vezes com o mesmo `providerMessageId` não duplica nem mensagem nem entrada na fila.
  - `AssignUnassignedToConversationUseCase`: atribuição manual grava mensagem + `assigned_*` juntos
    (RF7).
- `ConversationRepositoryPort` ganhou `listOpenByParticipant` (T204 estendida de novo, mesmo padrão
  do `providerMessageId` na T205→T206): todas as conversas abertas do participante, **com ou sem**
  assunto — diferente de `findOpenByParticipant`, que só resolve a idempotência da conversa sem
  assunto e por isso nunca devolveria as candidatas de uma conversa **com** assunto.
- **Visto falhar (esperado até a T208):**

  ```
  $ pnpm --filter @adatechnology/conversation-module run test
  bun test v1.3.14 (0d9b296a)

  src/use-cases/Attribution.use-cases.test.ts:
  # Unhandled error between tests
  error: Cannot find module './Attribution.use-cases' from '.../Attribution.use-cases.test.ts'

   35 pass
   1 fail
   1 error
   664 expect() calls
  Ran 36 tests across 7 files. [66.00ms]
  ```

  `check` também falha por desenho (`TS2307: Cannot find module './Attribution.use-cases'`) — mesmo
  padrão da T203/T205, não é regressão.

### T208 — a atribuição genérica

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Onde:** `adatechnology-packages-wt/conversation-core` (branch `feat/conversation-core`),
  `packages/backend/conversation-module/src/`.
- **Commit:** `9d5d2a8` (`feat(conversation-module): a atribuição genérica (T208)`).
- `Attribution.use-cases.ts` implementa exatamente o que a T207 testou:
  `AttributeInboundMessageUseCase.execute` — primeiro confere idempotência pelo
  `providerMessageId` (em mensagens **e** na fila, porque o desfecho anterior pode ter sido
  qualquer um dos dois); depois, se há `replyConversationId`, resolve por `conversations.findById`
  (empresa errada ou id inexistente devolve `undefined`, cai no fluxo seguinte — nunca aceita
  referência cega); sem atribuição por referência, busca `listOpenByParticipant` (T207), aplica
  `filterCandidates` quando presente, e decide por contagem: 1 → atribui, >1 → fila,
  0 → `no_candidate` sem gravar nada. `AssignUnassignedToConversationUseCase.execute` resolve a
  entrada e a conversa (ambos 404 tipado se não existem), grava a mensagem e só então chama
  `unassigned.assign` com os três campos (`assignedMessageId`/`assignedByUserId`/`assignedAt`)
  juntos numa única chamada de porta — nunca dois `UPDATE` separados que pudessem deixar o
  `num_nonnulls(...) in (0, 3)` do schema (T202) pela metade.

### T209 — teste do anexo

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Onde:** `adatechnology-packages-wt/conversation-core` (branch `feat/conversation-core`),
  `packages/backend/conversation-module/src/domain/` e `src/use-cases/`.
- **Commit:** `9f052e3`
  (`test(conversation-module): contrato do anexo — tipo pelos bytes, teto por canal, upload em dois passos (T209)`).
- Li `conversation-attachment.policy.ts` e `conversation-attachment.service.ts` (spec 183, só
  leitura) para portar a **regra**, não o vocabulário — a tabela de teto por `(canal × tipo)` da
  origem **não** foi portada: a T105 já decidiu teto só por canal em `CHANNEL_CAPABILITIES`
  (`attachments.maxBytes`/`maxTotalBytes`), e a T209 usa essa fonte, sem reabrir a decisão.
- `domain/attachmentType.test.ts`: `attachmentKindOf` (content-type → `audio|document|image` do
  vocabulário fechado — fora da lista é `undefined`), `matchesAttachmentSignature` (assinatura de
  bytes copiada da origem: PNG/PDF/JPEG por magic number; **PNG declarado como
  `application/pdf` é recusado** — é o teste que prova "tipo pelo conteúdo, não pela extensão"),
  `normalizeAttachmentFileName` (só o último segmento do caminho, nome vazio/`.`/`..` vira
  "anexo").
- `use-cases/Attachment.use-cases.test.ts`:
  - `RequestAttachmentUploadUseCase` — chave opaca **sem** id interno (o teste confere que
    `objectKey` não contém `conversationId` nem `requestedByUserId`); recusa content-type fora do
    vocabulário (`AttachmentTypeMismatchError`) e tamanho acima do teto do canal
    (`AttachmentTooLargeError`, testado no `webchat`, que tem o menor teto —10 MB); sem
    `objectStorage`, `AttachmentsDisabledError`.
  - `LinkAttachmentUploadsUseCase` — liga o pedido `pending`, calcula `sha256` de verdade (o teste
    confere o formato hex de 64 caracteres), **copia para uma chave final nova e apaga a da
    subida** (dois asserts no dublê de storage: a chave antiga sumiu, a nova existe); um teste à
    parte prova que **nenhum byte vai para o banco** — as chaves do registro persistido nunca
    incluem `bytes`/`body`; tipo mentindo (PDF declarado, bytes de PNG) é recusado; pedido
    expirado é recusado (`UploadExpiredError`); bytes acima do teto do canal são recusados mesmo
    que o `declaredSizeBytes` batesse; sem `objectStorage`, desligado.
  - `CreateAttachmentDownloadUrlUseCase` — devolve `URL`.
- **Visto falhar (esperado até a T210):**

  ```
  $ pnpm --filter @adatechnology/conversation-module run test
  bun test v1.3.14 (0d9b296a)

  src/use-cases/Attachment.use-cases.test.ts:
  # Unhandled error between tests
  error: Cannot find module './Attachment.use-cases' from '.../Attachment.use-cases.test.ts'

  src/domain/attachmentType.test.ts:
  # Unhandled error between tests
  error: Cannot find module './attachmentType' from '.../attachmentType.test.ts'

   44 pass
   2 fail
   2 errors
   689 expect() calls
  Ran 46 tests across 9 files. [55–65ms]
  ```

  `check` também falha por desenho (módulos ausentes) — mesmo padrão das tasks de teste
  anteriores, não é regressão.

- Também `createInMemoryObjectStorage` em `testing/inMemoryRepositories.ts`: dublê do
  `ObjectStoragePort` que guarda bytes em memória por `bucket/key`, exportado por
  `testing/index.ts`.

### T210 — o anexo em três passos

- **Modelo:** Sonnet 5 (`claude-sonnet-5`).
- **Onde:** `adatechnology-packages-wt/conversation-core` (branch `feat/conversation-core`),
  `packages/backend/conversation-module/src/domain/`, `src/use-cases/`, `src/ConversationModule.ts`.
- **Commit:** `f8e255e` (`feat(conversation-module): o anexo em três passos (T210)`).
- `domain/attachmentType.ts` implementa exatamente o que a T209 testou —
  `ATTACHMENT_CONTENT_TYPE_KINDS`/`attachmentKindOf`, `matchesAttachmentSignature` (assinatura de
  bytes copiada byte a byte da política de origem) e `normalizeAttachmentFileName`. Os 8 testes de
  `attachmentType.test.ts` ficaram verdes sem alteração de asserção.
- `use-cases/Attachment.use-cases.ts`:
  - `RequestAttachmentUploadUseCase` — `AttachmentsDisabledError` sem `objectStorage`; tipo fora
    do vocabulário fechado (`AttachmentTypeMismatchError`); tamanho acima do teto do canal
    (`AttachmentTooLargeError`, lido de `getChannelCapabilities(channel).attachments`); grava o
    pedido `pending` com a chave `newObjectKey()` — token de 256 bits (`randomBytes(32)`,
    `base64url`) sob o prefixo `conversation-attachments/`, sem id interno nenhum embutido — e
    devolve a URL assinada de 15 minutos.
  - `LinkAttachmentUploadsUseCase` — para cada `uploadId`: confere `pending` + mesma conversa
    (`assertPendingUpload`, senão `UploadNotFoundError`) e prazo (`UploadExpiredError`); baixa os
    bytes do storage, confere a assinatura contra o `declaredContentType`
    (`AttachmentTypeMismatchError` se não bate — é o "extensão mentindo" da T209), confere teto do
    canal e teto total acumulado quando `maxTotalBytes` não é `null` (`AttachmentTooLargeError`
    nos dois casos); calcula `sha256` de verdade (`createHash('sha256')`), **copia os bytes para
    uma chave final nova e só depois apaga a chave da subida** (a ordem importa: um erro no `put`
    da cópia final deixa a subida original intacta, reenviável); grava o anexo — a linha
    persistida (`ConversationAttachmentRow`) nunca carrega `bytes`/`body`, só
    `sha256`/`sizeBytes`/`objectKey`/`contentType`/`kind`/`fileName` — e marca o upload
    `attached`.
  - `CreateAttachmentDownloadUrlUseCase` — URL de 5 minutos; `AttachmentNotFoundError` (novo em
    `errors.ts`) se o anexo não existe.
- `createConversationModule` ganhou `config.attachmentsBucket?` — **obrigatório só quando
  `providers.objectStorage` vem preenchido** (checado na entrada da factory,
  `ConfigMissingError('attachmentsBucket')` se faltar; sem `objectStorage`, o campo nunca é lido,
  porque os três casos de uso já recusam antes de tocar no bucket). `AttachmentRepository` passou
  a ser instanciado no factory, e os três casos de uso entraram em `useCases`.
- **Verde:**

  ```
  $ pnpm --filter @adatechnology/conversation-module run check
  tsc -p tsconfig.json --noEmit   (sem saída)

  $ pnpm --filter @adatechnology/conversation-module run test
  bun test v1.3.14 (0d9b296a)
   63 pass
   0 fail
   724 expect() calls
  Ran 63 tests across 9 files. [45–60ms]

  $ pnpm --filter @adatechnology/conversation-module run build
  ... DTS ⚡️ Build success in 1494ms

  $ pnpm --filter @adatechnology/conversation-contracts run check
  tsc -p tsconfig.json --noEmit   (sem saída)

  $ pnpm --filter @adatechnology/conversation-contracts run test
  bun test v1.3.14 (0d9b296a)
   38 pass
   0 fail
   131 expect() calls
  Ran 38 tests across 6 files. [25ms]
  ```

- Decisão: mesma chave-prefixo (`conversation-attachments/`) tanto para o pedido quanto para a
  cópia final — a origem usava `occurrence-conversations/<token>` para as duas também; o que
  garante que a chave da subida não sobrevive é o `delete` explícito depois do `put` da cópia,
  não um prefixo diferente.
- T204–T210 fecham a Fase 2 até aqui — falta **T211** (respostas rápidas, CRUD sem regra nova,
  fora do escopo desta sessão) e **T212** (integração contra Postgres real).
- `createConversationModule` ganhou `providers.filterCandidates?` (opcional, RF7) e os dois casos
  de uso novos em `useCases`; `UnassignedRepository` passou a ser instanciado no factory (antes só
  os três repositórios que T206 usava).
- `UnassignedNotFoundError` em `errors.ts` (404 tipado).
- **Verde:**

  ```
  $ pnpm --filter @adatechnology/conversation-module run check
  tsc -p tsconfig.json --noEmit   (sem saída)

  $ pnpm --filter @adatechnology/conversation-module run test
  bun test v1.3.14 (0d9b296a)
   44 pass
   0 fail
   689 expect() calls
  Ran 44 tests across 7 files. [44–62ms, medido duas vezes]

  $ pnpm --filter @adatechnology/conversation-module run build
  ... DTS ⚡️ Build success in 1587ms
  ```

- Decisão: `AttributeInboundMessageUseCase` sempre grava `senderAddress: input.identifier` na
  mensagem recebida (nunca `authorUserId`) — a atribuição genérica é definida para "canal externo"
  (a task explicita isso), e o CHECK do schema (`messages_author_check`, T202) já restringe
  `sender_address` a `email|whatsapp|webchat`. Host que precisar atribuir mensagem de canal com
  conta própria (`app`/`portal`) usa `ReceiveMessageUseCase` (T206) direto, não esta atribuição.
