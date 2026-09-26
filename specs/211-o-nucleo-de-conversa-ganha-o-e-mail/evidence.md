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
