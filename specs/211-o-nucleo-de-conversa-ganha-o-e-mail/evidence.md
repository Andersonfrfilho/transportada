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
