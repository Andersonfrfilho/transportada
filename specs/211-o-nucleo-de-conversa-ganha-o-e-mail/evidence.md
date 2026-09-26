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
