# Evidência — 260 O chat chega ao app do motorista

> Conferência somente-leitura de `~/Documents/personal/adatechnology-packages` em 2026-10-09
> (HEAD `0c0d532`; árvore com arquivos não rastreados alheios, nenhum tocado). Caminhos abaixo são
> relativos a `packages/`; `UI` = `frontend/conversations-ui/src`, `CC` = `backend/conversation-contracts/src`,
> `CM` = `backend/conversation-module/src`.

## T0.1 — o que o SDK tem / o que falta

| Peça                                                                                                                                       | Tem / falta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Evidência (arquivo:linha)                                                                                                                                                                             | Consequência para a Fase 1                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConversationsProvider` + `ConversationsApi`                                                                                               | **Tem**, mas o contrato é de operador: ~30 métodos, só 5 são de participante (`fetchMessages`, `fetchConversations`, `sendMessage`, `sendMedia`, `markRead`) + `getDocumentUrl`, `getMediaProxyUrl`, `transcribeAudio?`, `listQuickReplies?`. `sendTemplate`, `getContext`, `getDocuments` são **obrigatórios** e inúteis ao participante                                                                                                                                                                                                                  | `UI/providers/types.ts:98-228`; provider recebe `api` **e** `sse` obrigatórios `UI/providers/ConversationsProvider.tsx:12-20`                                                                         | A visão do participante não pode exigir `sendTemplate/getContext/getDocuments`. T0.3 decide: tipo próprio `ParticipantConversationsApi` (subconjunto) ou tornar esses três opcionais (quebra de contrato → major). Preferir subconjunto novo, sem tocar o existente                                                                                                                                                                                      |
| Métodos opcionais por ausência (takeover, release, finalize, templates, mensagens prontas, anexos guardados, transcrição, biblioteca, zip) | **Tem** o padrão "capacidade = função presente"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `takeover?/release?/finalize?` `types.ts:174-177`; `markAllRead?/listTemplates?` `:179-180`; `listQuickReplies?` `:186`; `sendStoredAttachments?` `:203`; `transcribeAudio?` `:227`                   | Reusar o mesmo padrão no tipo novo; nenhuma flag `hasX`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ConversationPane`                                                                                                                         | **Falta para o participante**: exige `conversation: ConversationSummary` (campos de operador `mode`, `assignedUserId`, `waitingHuman`, `currentState`, `lastInboundAt`, `whatsappNumber` obrigatórios), `now`, `busy`, `labels: ConversationsWorkspaceLabels` (objeto inteiro de 103 linhas, com rótulos de takeover/bulk) e `onBack`. Takeover/finish/return-to-bot/templates são opcionais, mas o painel de contexto, documentos, janela de sessão (`windowOf` + `WindowExpiredNotice`) e `botOwnsConversation` estão acoplados dentro dele (523 linhas) | `UI/workspace/ConversationPane.tsx:38-118` (props), `:251-253` (janela), `:340` (`mode !== 'human'`), `:437-441`; `UI/providers/types.ts:260-283` (`ConversationSummary`); `UI/workspace/labels.ts:6` | **T1.4**: `ParticipantThread` novo, componha `MessageBubble` + composer + `useConversationMessages` direto; **não** reaproveitar `ConversationPane` nem pedir ao produto para fabricar `mode:'human'`/`lastInboundAt` (contorno). Também sustenta a regra: nada de operador entra no export `/participant`                                                                                                                                               |
| `MessageBubble`                                                                                                                            | **Tem**, funciona sem operador: resolve mídia pelo contexto (`getDocumentUrl`/`getMediaProxyUrl`), transcrição só se `transcribeAudio` existir. **Falta** estado `queued`/"na fila": `MessagePayload.status` é `sent\|delivered\|read\|failed` e o `StatusTicks` cai em `sent` para qualquer outro valor                                                                                                                                                                                                                                                   | `UI/MessageBubble.tsx:36,79-97`; `UI/types.ts:75`; `UI/StatusTicks.tsx:8-14,31-37`                                                                                                                    | **T1.x novo (D5)**: acrescentar `queued` a `MessagePayload.status` e a `StatusTicks` (relógio + `title` "na fila · envia quando a rede voltar"), minor, com teste. Sem isso a T1b.3 (offline) viraria contorno no app. `sender` é `bot\|customer\|agent` (`types.ts:73`): para o participante "minha" = `direction` (outbound do ponto de vista dele é o inverso do operador) — **T0.3 define a convenção** (`own`/`direction` invertida) e a T1.4 testa |
| `MessageComposer`                                                                                                                          | **Tem**, sem takeover/template/bulk: `onSend` obrigatório, resto opcional (`onAttach`, `idleAction` para o microfone, `quickReplies` chips, `savedQuickReplies`, `channel`, `disabled`, `maxLength`). `channel` decide anexo/áudio/resposta rápida desabilitados com dica                                                                                                                                                                                                                                                                                  | `UI/MessageComposer.tsx:97-127`, `:186-189`; `RichMessageComposer` também existe (`UI/index.ts:10`)                                                                                                   | Usar o `MessageComposer` simples (T1.4/T1.6). Limites do canal vêm de `channelCapabilityFor`, não de constante nova                                                                                                                                                                                                                                                                                                                                      |
| `AudioRecorderButton`                                                                                                                      | **Tem**, exportado; liga por `idleAction` do composer (padrão do pane em `ConversationPane.tsx:462`)                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `UI/index.ts:19-24`; `UI/AudioRecorderButton.tsx`; `UI/workspace/ConversationPane.tsx:462`                                                                                                            | Compor na `ParticipantThread` quando `onRecordAudio` (ou equivalente) existir; ausente, sem microfone                                                                                                                                                                                                                                                                                                                                                    |
| Respostas rápidas (chips)                                                                                                                  | **Tem** como `quickReplies?: readonly QuickReply[]` no composer e `QuickRepliesPicker`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `UI/MessageComposer.tsx:120`; `UI/index.ts:262-263,285`                                                                                                                                               | T1.6: chips do participante vêm por prop (a lista do produto), sem cadastro de operador                                                                                                                                                                                                                                                                                                                                                                  |
| `StatusTicks`                                                                                                                              | **Tem** (ver `queued` acima)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `UI/StatusTicks.tsx`                                                                                                                                                                                  | idem                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `labels` e tema `.cv-*`                                                                                                                    | **Tem**: classes `.cv-*` sem Tailwind no `styles.css` (export `./styles.css`); `ConversationsTheme` com 6 cores; labels por objeto `DEFAULT_*_LABELS` + `Partial`. **Falta** labels/classes do participante (lista agrupada, cabeçalho de seção, selo "espera sua resposta", cartão do assunto)                                                                                                                                                                                                                                                            | `UI/styles.css:8,24,81`; `UI/types.ts:7-14`; `UI/workspace/labels.ts`                                                                                                                                 | T1.4/T1.5: `.cv-participant-*` no mesmo `styles.css`, `labels` default em pt-BR/en como `Partial`                                                                                                                                                                                                                                                                                                                                                        |
| `ConversationChannel` da UI inclui `app`?                                                                                                  | **Falta**: a UI declara `whatsapp\|messenger\|instagram\|webchat\|email` — **sem `app` nem `portal`**. `channelCapabilityFor('app')` não é expressável no tipo; o fallback para canal fora do contrato é a capacidade do WhatsApp (janela de 24 h, sem `queued`)                                                                                                                                                                                                                                                                                           | `UI/conversationChannel.ts:15-22`; `UI/channelCapability.ts:2-12,33-37`                                                                                                                               | **Task nova na Fase 1 (bloqueante)**: acrescentar `app` e `portal` ao `ConversationChannel` da UI (minor) + teste de que `channelCapabilityFor('app')` devolve a capacidade do contrato (25 MB, grava áudio, sem janela). Sem isso o composer do motorista aplicaria regra de WhatsApp                                                                                                                                                                   |
| Canal `app` em `getChannelCapabilities`                                                                                                    | **Tem**: `confirmsRead`, sem janela, anexo 25 MB sem teto total, grava e toca áudio, respostas rápidas, sem transporte, estados `queued/delivered/read`                                                                                                                                                                                                                                                                                                                                                                                                    | `CC/channelCapabilities.ts:60-67`; `getChannelCapabilities` `:88-90`; vocabulário `CC/vocabulary.ts:11` (`email,whatsapp,app,portal,webchat`)                                                         | Usa sem alterar. Cuidado: `portal` **não grava áudio** (`:68-73`) — o portal da contratante (T1b.4) herda isso sozinho                                                                                                                                                                                                                                                                                                                                   |
| Resumo de conversa por assunto exportado para a UI                                                                                         | **Falta**: nenhum tipo `subjectType/subjectId` no `conversation-contracts` (zero ocorrências de `subject` em `CC/` fora de `ports.ts`/`requestSchemas.ts`/teste) nem em `ConversationSummary` da UI (zero ocorrências em `UI/`). `attributes?: Record<string,string>` existe como saco opaco, mas sem semântica                                                                                                                                                                                                                                            | `grep -ri subject UI/` = vazio; `CC/ports.ts`, `CC/requestSchemas.ts` só no lado de gravação; `UI/providers/types.ts:260-283`                                                                         | **T1.1** confirmada: `ParticipantConversationSummary` (+ `subjectType/subjectId/subjectLabel/awaitingParticipant`) no `conversation-contracts`, vocabulário opaco, exportado e consumido pela UI                                                                                                                                                                                                                                                         |
| `conversation-module`: assunto genérico                                                                                                    | **Tem**: `subject_type`/`subject_id`/`audience` anuláveis, par por CHECK, único por `(company_id, subject_type, subject_id, coalesce(audience,''))`; `CreateConversationInput.subject` e `findBySubject` idempotente                                                                                                                                                                                                                                                                                                                                       | `CM/schema/schema.ts:52-55,74-76,83`; `CM/use-cases/Conversation.use-cases.ts:16-19,37-56`; `CM/repositories/ports.ts:53`                                                                             | Molde do D2 confirmado. O TransportAdA **não** consome o módulo (ADR-0072); a Fase 2 reproduz o par opaco nas tabelas do produto                                                                                                                                                                                                                                                                                                                         |
| Export "participant" / visão mobile hoje                                                                                                   | **Falta**: nenhum export `./participant`; subpaths atuais são `.`, `./flows`, `./whatsapp`, `./preview`, `./styles.css`. Nenhum `Participant*` no código                                                                                                                                                                                                                                                                                                                                                                                                   | `package.json` (campo `exports`); `grep -rin participant UI/` vazio                                                                                                                                   | **T1.5**: criar `src/participant/index.ts` + export `./participant`                                                                                                                                                                                                                                                                                                                                                                                      |
| Layout de uma coluna / `useIsNarrow`                                                                                                       | **Tem o hook**, mas o breakpoint é **1023 px** (tablet inclusive) e o modelo é master/detail do operador: `.cv-back` e `cv-only-*` trocam a 1024 px. **Falta** um layout dedicado "lista → conversa em tela cheia" por rota                                                                                                                                                                                                                                                                                                                                | `UI/useIsNarrow.ts:11-15`, exportado `UI/index.ts:134`; `UI/styles.css:110-136,159-167,289,405-418`                                                                                                   | `ParticipantInbox`/`ParticipantThread` são **sempre uma coluna** (a navegação lista↔conversa é do app, por rota — D6 `/conversas/:subjectType/:subjectId`), sem depender de `useIsNarrow`. Alvo ≥ 44 px segue `UI/styles.css:161`                                                                                                                                                                                                                       |
| Tempo real                                                                                                                                 | **Tem** `SSEProvider` (`connectConversationStream`, `connectGlobalStream`) obrigatório no provider; `useConversationRealtime` assina por `conversationId`                                                                                                                                                                                                                                                                                                                                                                                                  | `UI/providers/types.ts` (`SSEProvider`); `UI/hooks/useConversationRealtime.ts:13-30`                                                                                                                  | O app do motorista **não tem SSE** da conversa (183 usa o sino). T0.3 decide: `sse` opcional na visão do participante (polling/reabertura) em vez de o app inventar um fake                                                                                                                                                                                                                                                                              |
| Build / exports                                                                                                                            | **Tem** `tsup` com 4 entradas + `styles.css`, `--external react/react-dom/@xyflow/react`; `@xyflow/react` é peer **opcional** e só `flows/` o importa (nenhum arquivo fora de `UI/flows/` e do teste de build)                                                                                                                                                                                                                                                                                                                                             | `package.json` (`scripts.build`, `exports`, `peerDependenciesMeta`); `grep -rln xyflow UI/` = `flows/*` + `buildOutput.test.ts`                                                                       | `/participant` entra como **5ª entrada do `tsup` e novo `exports`**; precisa importar de arquivos-folha (não de `UI/index.ts`, que reexporta workspace/flows-free mas arrasta 310 KB de `dist/index.js`). T0.2 mede. `buildOutput.test.ts` ganha asserção de que `dist/participant` não contém `xyflow`                                                                                                                                                  |

### Versões

| Onde                                         | Versão                                                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Publicada no npm (`latest`)                  | `@adatechnology/conversations-ui` **0.4.2** (`rc` = 0.1.0-rc.44, defasada); `packages/frontend/conversations-ui/package.json:3` também 0.4.2 |
| `apps/frontend-transportada/package.json:26` | `0.3.1`                                                                                                                                      |
| `apps/frontend-client/package.json:18`       | `0.3.1`                                                                                                                                      |
| `apps/frontend-driver/package.json`          | **não declara** `conversations-ui` nem `conversation-contracts` (T1b.1 adiciona)                                                             |

### Observações para o plano

- **Não há `pre.json`** em `.changeset/` hoje (só `config.json` e um changeset pendente de outro assunto); `latest` já é 0.4.2. A T1.7 diz "pre-mode, tag `rc`": confirmar com o dono se o export novo sai como `rc` (entrar em pre mode) ou como minor 0.5.0 em `latest`. O `publish.yml` só acerta a dist-tag `rc` quando há pre mode (`.github/workflows/publish.yml:150-162`).
- Os dois consumidores existentes estão em 0.3.1 e o pacote em 0.4.2: o salto de duas minors é parte da T1b.1 e deve passar `make check` + smoke antes de qualquer tela nova.
- `conversation-contracts` está em 0.3.0 (`backend/conversation-contracts/package.json`); o tipo novo da T1.1 exige bump e republicação **antes** da UI.

### Tasks que passam a existir na Fase 1 (o que faltou vira task no pacote)

1. **T1.0a** `haiku` — `ConversationChannel` da UI ganha `app` e `portal`; `channelCapabilityFor('app')` cai na capacidade do contrato (teste: 25 MB, sem janela, grava áudio; `portal` não grava).
2. **T1.0b** `haiku` — `MessagePayload.status` e `StatusTicks` ganham `queued` (relógio + `title`), sem mudar os demais estados.
3. **T0.3 (ampliada)** 🧠 — decidir: `ParticipantConversationsApi` como subconjunto (em vez de tornar `sendTemplate/getContext/getDocuments` opcionais), `sse` opcional, convenção de "mensagem minha" (`direction` vs `sender`).
4. **T1.4 (ampliada)** — `ParticipantThread` **não** reaproveita `ConversationPane`; compõe `MessageBubble` + `MessageComposer` + `useConversationMessages`.
5. **T1.5 (ampliada)** — 5ª entrada no `tsup`, novo `exports["./participant"]`, asserção em `buildOutput.test.ts` de que o bundle não traz `xyflow`.

## T0.2 — bundle do export `/participant`

Medido em 2026-10-09 com `bun build` (browser, minify, `react`/`react-dom` externos) sobre uma entrada
descartável que reexporta só as folhas que o participante usa: `MessageBubble`, `MessageComposer`,
`StatusTicks` e `useConversationMessages` de `conversations-ui/src`.

| Medida                 | Resultado                                             |
| ---------------------- | ----------------------------------------------------- |
| Módulos empacotados    | 72                                                    |
| Tamanho minificado     | 164 KB                                                |
| Tamanho gzip           | 46 KB                                                 |
| Ocorrências `xyflow`   | 0 (o `@xyflow/react` só é importado em `src/flows/*`) |
| Referência: `index.js` | 310 KB (inclui o workspace de operador, documentos…)  |

Conclusão: importando de arquivos-folha, o `/participant` fica ~47% menor que o `index.js` e sem o
`@xyflow`. Falta somar `ParticipantInbox`/`ParticipantThread` (T1.4) — o teto de aceite da Fase 1 é **250 KB
minificado** e `buildOutput.test.ts` ganha a asserção "sem xyflow". Atenção: `MessageBubble` usa
`useConversations()` (provider de operador); o `/participant` precisa de um provider mais leve ou de
`ConversationsProvider` com `sse` opcional (decisão da T0.3).

## Fase 1 — andamento (repo `adatechnology-packages`, branch `feat/participant-conversations`, worktree `adatechnology-packages-wt/participant-conversations`)

| Task  | Commit    | Gate (conferido por mim, não só pelo relatório do executor)    |
| ----- | --------- | -------------------------------------------------------------- |
| T1.0a | `3c297f3` | `tsc` limpo · `bun test` 539 pass / 0 fail (4 vermelhos antes) |
| T1.0b | `9b2b728` | `tsc` limpo · 547 pass / 0 fail (8 vermelhos antes)            |
| T1.0c | `518859d` | `tsc` limpo · 548 pass / 0 fail                                |

| T1.1 | `50447f7` | contracts: 60 pass / 0 fail · `tsc` limpo · build ok (22 testes novos, vermelho antes) |
| T1.2 | `f7d0d44` | UI: 556 pass / 0 fail (8 novos, vermelho antes: módulo inexistente) |
| T1.3 | `c5509d6` | UI: 588 pass / 0 fail · `tsc` limpo · sem import do barril/provider/workspace (grep) |
| T1.4 | `473e0d7` | UI: 630 pass / 0 fail · `tsc` limpo · grep: sem Tailwind, sem palavra do TMS, sem barril/provider em `participant/` |
| T1.5 | `3f6a4dc` | UI: 639 pass / 0 fail · build ok · `dist/participant` 46 KB bruto / **101 KB minificado** (teto 250) · 0 ocorrências de `xyflow`/`ConversationsWorkspace` |
| T1.6 | `8c8ae65` | UI: 658 pass / 0 fail · build ok · testes revelaram 3 bugs reais (rascunho limpo antes de confirmar; bolha duplicada no mesmo `clientMessageId`; chip que substituía o texto) |
| T1.7 | `f80913e` | `changeset status`: contracts e conversations-ui em **minor** (sem pre mode); README do `/participant` entrou na T1.5 |

**Risco aberto para o passe da T1.8:** em falha de envio o rascunho permanece **e** a bolha `failed` também; reenviar pela bolha e enviar de novo pelo botão gera duas mensagens com `clientMessageId` diferentes. Decidir se a falha move o conteúdo para a bolha (e limpa o campo) em vez de duplicá-lo.

Ambiente: o baseline só fica verde depois de `pnpm run build` em `conversation-contracts`,
`meta-whatsapp-contracts` e `conversations-ui` (dists gitignored); sem isso há falha de resolução anterior a
qualquer mudança. Atribuição do commit da T1.0a saiu como "Haiku 5.5" (modelo real do executor).

## T1.8 — passe de revisão `opus` (2026-10-09): **REPROVADO para publicar nesta forma**

Gates conferidos pelo revisor: contracts 60 pass · UI 658 pass · tsc e build limpos. Contrato e arquitetura
**aprovados**; 0 críticos, **4 ALTO**, 10 MÉDIO, 10 BAIXO. Os dois ALTO mais fortes foram reconfirmados por grep
(`isSending` nunca ligado em `ParticipantThreadScreen`; nenhuma rolagem no pacote; `loadMore` não exposto;
`newMessagesCount` nunca passado).

Bloqueiam a publicação (viram T1.8a/T1.8b): (1) envio duplo — o campo segue preenchido durante o envio e a falha deixa
rascunho **e** bolha; (2) sem rolagem para a última mensagem; (3) falha de rede vira "sem conversas"; (4) inbox sem
paginação; (5) `queued` remove a bolha local cedo; (6) `resolveAttachmentUrl` perde o `this`, `api` instável zera a
conversa; (7) `markRead` não reage a `visibilitychange` com `subscribe`; (8) `isSending`/`newMessagesCount` não ligados;
(9) README/contrato: eco de `clientMessageId` obrigatório, `api` estável, `schema.parse`/`encodeURIComponent`, aviso de
`styles.css`. Decisão de comportamento público da 0.5.0, por isso corrige-se **antes** de publicar.

Ficam como tasks posteriores: colisão de chaves de seção, ordenação por `Date.parse`, buraco após 30+ mensagens offline,
allowlist de esquema de URL, anexo por `id`, label i18n e contraste do `StatusTicks`, foco ao trocar de tela, palavras
do TMS em comentário/README/preview, `buildOutput.test` medindo com externos, happy-dom + Testing Library para hooks.

Consumidores TransportAdA (grep real): usam só `MessageText`, `StatusTicks`, `DateDivider`, helpers e o tipo
`MessagePayload` (que só **constroem**); nenhum `switch`/`Record` sobre o `ConversationChannel` do SDK — nada quebra
com `app`/`portal`/`queued`/`bounced`. Risco fora do grep: Sakura/quickcart sem `styles.css` perdem formatação.

## T1.8a–T1.8c — correções do passe opus e prova por tarball

| Task  | Commit    | Gate (conferido por mim)                                                                                                   |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| T1.8a | `06bac72` | UI 673 pass / 0 fail · `tsc` e build limpos · envio duplo, `queued`, `this`, visibilidade                                  |
| T1.8b | `d55bf51` | UI 708 pass / 0 fail · rolagem, loading/erro, paginação da inbox, props obrigatórias                                       |
| fix   | `0ff1dea` | UI 709 pass / 0 fail · `MessageText` volta a copiar por padrão (compat. 0.3.1); o participante passa `copyOnClick={false}` |

A T1.8b havia invertido o padrão de `copyOnClick` (de copiar para não copiar) — mudança de comportamento para
`frontend-transportada` e `frontend-client` num release **minor**. Corrigido em `0ff1dea`; `copiedLabel` passa a ter
padrão "Copied" (a 0.3.1 mostrava "Copiado!" fixo): os apps passam `copiedLabel="Copiado!"` ao subir (T1b.1).

**T1.8c — instalação por tarball num worktree descartável (removido ao final, sem commit/push/publish):**
`pnpm pack` de `conversation-contracts` e `conversations-ui`; `bun` resolveu os dois tarballs interdependentes por
`overrides`. Baseline (0.3.1) × depois (tarballs):

| App                   | typecheck | lint                              | test antes → depois         | build |
| --------------------- | --------- | --------------------------------- | --------------------------- | ----- |
| frontend-transportada | ok        | 0 erros, 16 warnings (= baseline) | 7736 + 1176 pass → idêntico | ok    |
| frontend-client       | ok        | ok                                | 89 → 89 pass / 0 fail       | ok    |
| frontend-driver       | ok        | ok                                | 1528 pass / 0 fail          | ok    |

`import()` de `@adatechnology/conversations-ui/participant` no Vite do driver: chunk de **41,95 kB (12,82 kB gzip)**,
chunk principal 695,75 → 695,95 kB, CSS inalterado. Sem regressão.

**Não executado:** `make smoke` (Playwright), `make check` completo (`format:check` da raiz), integração, e verificação
visual de `MessageText`/`StatusTicks` no navegador. O baseline de teste do driver não foi medido.

**Achados da publicação:** (1) o tarball da UI declara `conversation-contracts` por versão fixa — **publicar o
contracts ANTES da UI**; (2) o pacote não tem campo `files`, então um `pnpm pack` local levou lixo de `.omc/` (ignorado
pelo git, não pelo npm; a publicação sai do checkout limpo do CI) — removido de `src/participant/`; (3) o tarball inclui
`src/` e os testes (política já vigente da 0.4.2: 217 arquivos).

## T1.8d/T1.8e — re-passe `opus`: **APROVADO COM RESSALVAS** → ressalvas corrigidas

Os 9 bloqueantes do primeiro passe foram conferidos como resolvidos no código (arquivo:linha). Ressalvas corrigidas em
`a26f10a`: **M1** "novas mensagens" falso ao carregar histórico (sonda dava 2, agora 0) · **M2** mensagem enviada some ao
sair/voltar (a entrada fica em `sent` até o eco) · **M3** `aria-live` fora da árvore (sr-only no lugar de `display:none`) ·
**B1** limites do host no README · **B2** allowlist `https:`/`http:`/`blob:` nos anexos · **B5** chave dos anexos · **B6**
`role="button"`/`tabIndex` padrão do `MessageText` no changeset.

Estado final do SDK (branch `feat/participant-conversations`, 14 commits sobre `b9f1ef6`): UI **716 pass / 0 fail** ·
contracts **60 pass / 0 fail** · `tsc` e build limpos · `changeset status`: contracts 0.4.0 **minor**, conversations-ui
0.5.0 **minor**, conversation-module 0.4.1 **patch** (por dependência), nenhum major.

**Fica para depois (tasks posteriores):** M4 (erro de revalidação fora do `__scroll`), B3 (`datetime` com offset), B4
(`ResizeObserver` para imagem tardia), botão "ir para o fim", colisão de chaves de seção, `Date.parse` na ordenação,
buraco após 30+ mensagens offline, happy-dom + Testing Library para hooks.

**Risco da publicação:** `changeset publish` não é topológico nem atômico; a UI 0.5.0 fixa `conversation-contracts@0.4.0`.
Se o contracts falhar e a UI subir, a UI fica com dependência inexistente até reexecutar o `workflow_dispatch`
(idempotente; o passo "Verificar que os pacotes publicados estão acessíveis" deixa o job vermelho). Depois do run,
conferir `npm view` das três versões **antes** de subir os apps (T1b.x).

**Ainda não executado antes do merge:** `make smoke` (Playwright) e verificação visual de `MessageText`/`StatusTicks`
no painel e no portal.

## T1.8 — publicação (aprovada pelo usuário; feita pela CI/CD)

PR [adatechnology-packages#128](https://github.com/Andersonfrfilho/adatechnology-packages/pull/128) (CI verde, `MERGEABLE/CLEAN`)
mergeado em `f869d81c4`. O `publish.yml` publicou, conferido por `npm view`: `conversation-contracts@0.4.0`,
`conversations-ui@0.5.0` (depende de `conversation-contracts` **0.4.0** exato) e `conversation-module@0.4.1`. Ordem
resolvida sem a janela de `ETARGET`. Smoke Playwright e conferência visual de `MessageText`/`StatusTicks` ficaram
**depois** do merge (aceito pelo usuário) — feitos na T1b.5/T4.2.

## Fase 1b — andamento (apps do TransportAdA, branch `work/spec-260`)

| Task  | Commit                   | Gate (conferido por mim)                                                                                                                                                      |
| ----- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1b.1 | `767097d54`, `840546a1f` | os 3 apps em `conversations-ui@0.5.0`; transportada 7736+1176 pass, client 89, driver 1528; `bun install --frozen-lockfile` sem mudança; `copiedLabel` pt-BR nos dois painéis |
| T1b.2 | `20fb674ac`              | driver: 1554 pass / 0 fail · typecheck/lint/build limpos · página 89 linhas · chunk lazy do `/participant` **37 KB (11,85 KB gzip)**, chunk principal sem `cv-p-`             |
| T1b.3 | `1f758f8b7`              | driver: 1572 pass / 0 fail · typecheck/lint/build limpos · outbox próprio no IndexedDB, mesma `Idempotency-Key`, servidor falso conta POSTs                                   |

Divergências aceitas: `frontend-client` não tem i18n (usa constante nomeada `COPIED_LABEL`, como o resto do app); a API
devolve **200** (não 409) para a mesma chave e o mesmo pedido — 409 `IDEMPOTENCY_KEY_REUSED` é recusa real; a lista de
conversas não traz direção, então `awaitingParticipant` é aproximado no adapter (temporário até **T2.5**) e o eco de
`clientMessageId` é decorado no adapter (temporário até **T2.4**).

**Não provado ainda:** nada foi visto em navegador; o store IndexedDB real não tem teste (sem `fake-indexeddb`); `navigator.locks`
e os gatilhos reais (`online`, `pageshow`, visibilidade) não foram exercitados — vão para a T1b.5 (smoke) e a conferência no navegador.

## Verificação no navegador — preview do app do motorista (2026-10-09, árvore `spec-260`, viewport 375×812, tema escuro)

Servidores subidos **a partir do worktree** (`motorista-api-demo` na 53901 e `motorista-local` na 53200; o `preview_start`
pelo launch.json partia da árvore principal `/transportada`, que não tem o chat — conferido por `lsof` e descartado).
API de demonstração ganhou as rotas de conversa (`782f4ecf7`): 4 conversas de ocorrência, uma delas com 35 mensagens,
idempotência por chave, `fail-next`, `office-reply`, `reset`.

| Verificação                                              | Resultado                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/conversas` renderiza (sem erro de console)             | "Espera sua resposta (1)", conversa de avaria com "2 não lidas", demais por assunto         |
| Abrir a conversa: cartão do assunto, mensagens, composer | ok                                                                                          |
| **Composer visível** (`textarea.bottom <= nav.top`)      | **falhou** (771 > 766) → corrigido em `2244f20a5` → **690–735 com a barra em 751**          |
| Enviar texto                                             | campo limpa na hora; bolha "Eu … Enviada"; 1 mensagem no servidor                           |
| **Receber** resposta do escritório com a conversa aberta | **falhou** (nunca chegava) → corrigido em `1b7bc9b08` → **chega em ~10,5 s** sem recarregar |
| Falha 503: "Na fila · envia quando a rede voltar"        | ok: servidor 0 msgs, campo limpo; ~28 s depois **1 mensagem**, bolha "Enviada"              |

**Não provado:** selo da aba (a demo devolve `unreadCount: 0` depois de ler); reenvio por toque em bolha `failed` (4xx
permanente); anexo/foto; tela com leitor de acessibilidade; cenário com sessão expirada; navegador real do celular
(a aba do Browser reporta `visibilityState = hidden`, então o ticker foi exercitado forçando `visible`). Latência da fila
de ~28 s vem do relógio de 30 s do flush (o 503 não dispara `online`).

Limite conhecido do ticker: mensagem que chega entre a abertura da conversa e o primeiro snapshot só aparece na próxima mudança ou revalidação.

## Release 2 do SDK — protocolo (D8) + canais e ícone do assunto (D9) — branch `feat/participant-protocol`

| Commit    | O quê                                                                                                                       | Gate (conferido por mim) |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `63dca09` | `protocol?` no resumo; exibir na linha e no cabeçalho, copiar, buscar                                                       | UI 742 · contracts 64    |
| `203ecdf` | correções do 1º passe: chips/contagens sem a busca, campo persiste, cópia com confirmação visível                           | UI 761                   |
| `05c7414` | `channels?` e `iconName?`; selos de canal na linha e no cabeçalho; `renderSubjectIcon`                                      | UI 773 · contracts 67    |
| `e12be29` | 2º passe: contraste do WhatsApp (2,97 → ≥ 3,54), selos da linha em `<span>` (sem `ul/li` em `button`), filtro preso → "All" | UI 779 · contracts 67    |

Passe `opus` do release: 1º (63dca09) **aprovado com ressalvas** → corrigidas em `203ecdf`; 2º (63dca09..05c7414)
**aprovado com ressalvas** (2 bloqueantes: contraste e `ul/li` dentro de `button`) → corrigidas em `e12be29`. Dúvida
decidida: o ícone do assunto fica **só na linha** (D9). Versões esperadas: contracts 0.5.0, UI 0.6.0, module 0.4.2 (patch).

## Fase 2 — andamento (API, [ADR-0101](../../docs/adr/0101-a-conversa-tem-assunto-e-protocolo.md))

| Task  | Commit      | Gate (conferido por mim)                                                                                                                                                                               |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T2.1  | `29551f80e` | ADR-0101 (arquiteto `opus`), conferida contra o código; ADR 0099 pertence à spec 251 em outra branch                                                                                                   |
| T2.0  | `793769ed9` | driver: 1609 pass / 0 fail · typecheck limpo · o sino aceita `trip.subject-conversation-message` (13 vermelhos → 18 verdes)                                                                            |
| T2.3a | `a6d458171` | migration `20261009170338_conversation_subject` · `db:generate` = no_changes · `db:check` ok · typecheck limpo · rollback com trava · teste de ouro das respostas antigas (byte a byte)                |
| T2.3b | `c78e236de` | migration `20261009171836_conversation_protocol` · protocolo por trigger · colisão forçada por `setseed`, esgotamento 23505, imutabilidade (55000), meia-noite UTC→SP · `make migration-test` 191 pass |
| —     | —           | suíte de contrato da API (`bun --env-file=../../.env.test run test`): **11160 pass / 25 skip / 0 fail**, 208 arquivos                                                                                  |

Desvios aceitos: (1) o `CHECK` do `client_message_id` usa `char_length between 16 and 256` + `~ '^[A-Za-z0-9._:-]+$'` — o regex
`{16,256}` do desenho estoura no Postgres (limite de repetição 255) só no primeiro INSERT; (2) o trigger sorteia **6** vezes (o
inicial + 5 repetições); (3) o trigger de UPDATE é `BEFORE UPDATE OF "protocol"`, então o upsert do `retarget` nunca o dispara;
(4) o backfill cria um índice temporário e o remove (até 50 sorteios por linha, para o deploy não cair por colisão rara).

**Pendente fora do código:** medir `count(*)` de `occurrence_conversations` em produção antes do backfill; integração completa
(`test:integration`, ~17 min) ainda não rodou — só os arquivos de conversa e de migration.

## Fase 2 — T2.4 (rotas do motorista por assunto)

| Parte   | Commit      | Gate (conferido por mim)                                                                                                                                                        |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| leitura | `f63482804` | contrato 11207 pass / 25 skip / 0 fail · typecheck e lint limpos · lista com **4 consultas com 1, 10 e 30 conversas** (sem N+1; teto de 7 com os 3 assuntos)                    |
| escrita | `8fb71edc1` | contrato 11237 pass / 0 fail · integração dos 3 arquivos novos **13 pass / 0 fail contra o Postgres real (reproduzido por mim)** · golden das rotas antigas verde sem alteração |

Decisões do executor aceitas: rotas com `pathParameterFormat: 'raw'` (o roteador exige UUID em todo parâmetro e `:subjectType` não é);
cursor `<iso>::<uuid>` validado na rota e `date_trunc('milliseconds')`; `applySubjectStatus` em lote (a antiga é linha a linha);
`open` por SELECT + INSERT em savepoint (23505 do protocolo repete 1x; 23505 do assunto relê quem venceu) em vez de `ON CONFLICT`;
ocorrência pelas rotas novas usa a **mesma operação de idempotência** das antigas (provado por mutação e por teste cruzado: enviada pela
rota antiga e reenviada pela nova não duplica); resposta/upload sem `open` prévio: resposta faz find-or-create, upload dá 404.
Prova de que a conversa não decide: varredura dos arquivos novos por `tripOccurrenceCases`/`deliveryCharges`, com o detector provado por mutação.

**Não coberto:** colisão real do protocolo (23505 na repetição do INSERT) — o trigger já resolve dentro do banco, então a repetição no
código não tem teste de colisão; assinatura real de URL do S3 (storage de teste é dublê em memória, como já era na 183).

## Fase 2 (continuação) e Fase 1b — protocolo, canais e ícone no app

| Task / marco            | Commit / PR                           | Gate (conferido por mim)                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK release 2           | PR #129 → `79ab60a`                   | publicados `conversation-contracts@0.5.0`, `conversations-ui@0.6.0`, `conversation-module@0.4.2` (a UI fixa contracts 0.5.0); 3 passes `opus`; **0 diferenças em 48 casos** de markup contra o tarball 0.4.2 publicado (regra: SDK não impacta outros fluxos) |
| T2.4b escritório        | `daa355374`                           | contrato 11272 pass / 0 fail · integração 18 pass (3 arquivos, Postgres real)                                                                                                                                                                                 |
| T2.5 aviso do sino      | `77ff97b60`                           | contrato 11283 pass · integração 11 pass · golden do aviso da ocorrência byte a byte                                                                                                                                                                          |
| fix preview painel      | `a41132a1d`                           | `NOTIFICATION_PREVIEW_PAYLOAD` sem `subjectLabel` quebrava o contrato do painel (herança da T2.5) → painel 7831 + 1233 pass / 0 fail                                                                                                                          |
| T1.10 / T1b.10 / T1b.11 | `9690f34f2`, `58b8df372`, `5ef2d208d` | 3 apps em 0.6.0 / 0.5.0; painéis sem `copiedLabel` (padrão volta a "Copiado!"); driver 1615 pass; rotas novas por assunto **com fallback** para as antigas (404 sem `CONVERSATION_NOT_FOUND` ou 501)                                                          |

### Verificação no navegador (375×812, tema escuro, árvore `spec-260`)

- Lista: protocolo (`261009-K7M2`), selo de canal por item (`app`; `app` + `whatsapp` na recusa), ícone por tipo (alerta, câmera, relógio, nota, balão, caminhão), seção "Espera sua resposta", filtros por assunto (Todas / Ocorrências / Notas fiscais / Viagem), campo de busca.
- Busca: `f8g3` (minúsculo, sem traço) achou só "NF 4521 · Casa Verde"; chips mantiveram as contagens.
- Conversa de nota (`/conversas/document/…`): cabeçalho com protocolo, botão "Copiar protocolo" (44 px), selo "App", cartão "Nota fiscal", composer acima da barra.
- **Defeito achado só no navegador:** a faixa de filtros media 21 px com chips de 44 px (`flex-shrink` em coluna flex com `overflow:auto`). Regra injetada → 65 px, chips inteiros. Correção no SDK: **PR #130** (patch 0.6.1, só `.cv-p-*`, teste por parser de CSS + mutação). Pendente de passe `opus` e merge.
- Armadilha de ambiente: depois de subir a versão do pacote o Vite serviu o bundle antigo (cache de dependências); reiniciado com `--force`.

## T2.6 — integração completa da API (a que faltava)

`bun --env-file=../../.env.test run test:integration` (a lista inteira do script, 267 arquivos, Postgres do host 65432, banco descartável por teste):
**1462 pass / 8 skip / 0 fail** em 2189 s (~36 min; mais lento que os ~17 min das notas por ter dividido a máquina com a suíte de
contrato e os executores). `EXIT:0`. Inclui as migrations (`database-migration.contract.test.ts`), as 3 suítes de conversa por assunto
(motorista leitura/escrita, escritório), o aviso do sino e o protocolo. Conferido no log, não no relatório de agente.

## Fase 3 — escritório e motorista abrem a conversa

| Task        | Commit      | Gate (conferido por mim)                                                                                                  |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| T3.1 / T3.2 | `b455c93a1` | painel: typecheck limpo · 7854 + 1245 pass / 0 fail · só arquivos novos no módulo de conversa (a de ocorrência não mudou) |
| T3.3        | `877e00ff2` | driver: 1665 pass / 0 fail · typecheck e lint limpos · golden do cartão da parada                                         |
| remendo CSS | `1e64bdd96` | faixa de filtros 21 px → **65 px**, 4 chips de 44 px (medido no navegador)                                                |

**O que o usuário viu "estranho" em `/conversas`:** a faixa de filtros cortada. Causa no SDK (`.cv-p-filters` encolhia em coluna flex);
correção publicável no **PR #130** (patch 0.6.1, aprovado com ressalvas pelo `opus`, ressalvas de teste fechadas); remendo equivalente
no CSS do app até a 0.6.1 entrar.

**Não provado:** o painel do escritório e o botão "Falar com o escritório" do motorista nunca foram vistos rodando (o painel exige API real
e Keycloak; a demo do motorista agora serve `conversations/open`); smoke Playwright (T1b.5); descarte do outbox no logout (T1b.7).

## Design da conversa (iteração com o dono, 2026-10-09) — SDK `conversations-ui` 0.7.0 (PR #131)

Do pedido "botão de voltar estranho" + "inspire-se no WhatsApp" ao resultado aprovado. Quatro passes `opus` sobre o PR; o último
confirmou 0 diferenças de markup em 58 casos contra a 0.4.2 publicada e golden G1–G10 intactos (o SDK **não impacta outros fluxos**).

| Etapa                                 | Commit    | O que                                                                                                                           |
| ------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| cabeçalho enxuto + avatar de iniciais | `7d7a34b` | copiar só ícone, canais inline, `avatars="initials"`                                                                            |
| rabinho da bolha                      | `0e92f91` | triângulos com borda contínua, tema reto e arredondado                                                                          |
| correções do passe                    | `40378d4` | foco do título visível (B1), toque do copiar sem invadir o título (B2), forced-colors (B3), minor (B4), 8 mutações mortas (B5)  |
| redesenho "WhatsApp no nosso estilo"  | `fa9eba1` | voltar em ícone, tile do assunto, wallpaper, pílula de dia, hora+ticks na bolha, compositor com ícones                          |
| achados do 3º passe                   | `a72f745` | auto-grow sem barra fantasma, teste de dia independente de fuso (mutação morta em UTC/SP/Auckland), propriedades lógicas, print |

**Defeitos que só o navegador mostrou nesta rodada:** botão de voltar "‹" em caixa desalinhada; ícone do canal solto numa linha própria;
botão largo "Copiar protocolo"; título repetido no cartão do assunto; a faixa de filtros cortada (21 px) — corrigida na 0.6.1 (PR #130).
**Armadilha de ambiente:** o Vite pré-otimiza o pacote do SDK com cache imutável; trocar o conteúdo sem mudar a versão deixa o navegador
com a cópia velha (página em branco). No worktree de preview o pacote ficou fora do `optimizeDeps`.

## T5.4 — Estados de entrega (ticks) da mensagem do motorista (2026-10-09)

**O que mudou.** Antes toda mensagem do motorista (`inbound`, status nulo no banco) chegava ao app como `sent` (um tick) e nunca virava lida.
Agora, nas rotas novas `/me/trips/current/conversations/**`: `delivered` (✓✓ cinza) ou `read` (✓✓ azul, quando um usuário do escritório —
diferente do motorista da conversa — tem em `occurrence_conversation_reads` uma leitura com `created_at` >= o da mensagem). Uma consulta em lote
por página (`readOfficeReadHorizon`), sem coluna nem migration; rotas antigas intactas. Política pura `driver-own-message-status.policy.ts`.
O app já aceitava `delivered`/`read` (`PARTICIPANT_MESSAGE_STATUSES`) e os rótulos pt-BR/en já existiam; o outbox mapeia `queued` (relógio) e
`failed` (reenviar) direto. Demo API: mensagem do motorista nasce `delivered`; `POST /__debug/conversations/office-read {subjectId}` a leva a `read`.

**Gates (números reais).**

| Gate                                                                                       | Resultado                                      |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| API `bun run typecheck`                                                                    | limpo                                          |
| API `eslint` em `src/occurrence-conversation` + testes tocados                             | limpo                                          |
| API `bun --env-file=../../.env.test test --timeout 120000` (contrato)                      | 11310 pass, 25 skip, 0 fail                    |
| API integração `driver-subject-conversation.integration.ts` (Postgres, caso novo de ticks) | 4 pass, 0 fail                                 |
| App `bun run typecheck` / `bun run lint`                                                   | limpos                                         |
| App `bun run test`                                                                         | 1681 pass, 0 fail                              |
| Smoke `conversation.smoke.spec.ts` (build + preview, porta 53112, bypass)                  | 10 passed (1,8 min), 2 novos: "ticks", "falha" |

**Mutações (a correção arrancada faz o teste falhar).**

- Política `<=` trocada por `>=`: contrato da API 3 fail. Use case sem `status: deriveOwnMessageStatus(...)`: 2 fail.
- SQL sem o filtro `ne(reads.userId, motorista)` (leitura do próprio motorista contaria): integração 1 fail (esperava `delivered`).
- App: `'read'` fora de `PARTICIPANT_MESSAGE_STATUSES`: 1 fail; outbox view fixando `state: 'queued'`: 3 fail; demo API nascendo `sent`: 1 fail.
- Smoke: `office-read` da demo gravando `delivered` em vez de `read`: "ticks" falha por timeout de 20 s esperando `.cv-status-ticks--read`.

**Observações.** Os dois testes de smoke antigos que esperavam o texto "Enviada" agora aceitam "Enviada" ou "Entregue" (o servidor passou a
confirmar a mensagem). A falha de teste de "reenviar" usa `fail-next` com status 422 (recusa permanente → estado `failed` do outbox).

## T5.5 — ✓✓ azul com a conversa aberta (2026-10-09)

**Defeito (medido no preview).** Com a conversa aberta, quando o escritório lia, o ✓✓ azul só aparecia ao recarregar: o refresh de 15 s compara só
a lista de conversas, e ler não muda `lastMessageAt` nem `unreadCount`, então nenhum `conversation-changed` disparava.

**O que mudou (aditivo).** API: o resumo de `GET /me/trips/current/conversations` e do `/open` ganha `officeReadAt` (ISO, ausente se ninguém do
escritório leu até uma mensagem do motorista), por `readOfficeReadAtByConversation` — uma consulta em lote por página. App: o snapshot guarda
`officeReadAt` por conversa (lido do payload cru: o schema do pacote não o recebe) e `diffConversationSnapshots` marca a conversa como alterada
quando ele muda. Demo API: o resumo o devolve e `POST /__debug/conversations/office-read` o atualiza. Rotas antigas da 183 e SDK intactos.

**Gates (números reais).**

| Gate                                                                          | Resultado                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| API `bun run typecheck` / `eslint` (src + testes tocados)                     | limpos                                                |
| API `bun --env-file=../../.env.test test --timeout 120000` (contrato)         | 11312 pass, 25 skip, 0 fail                           |
| API integração `driver-subject-conversation`, `-write`, `-scale` (Postgres)   | 15 pass, 0 fail                                       |
| App `bun run typecheck` / `bun run lint`                                      | limpos                                                |
| App `bun run test`                                                            | 1684 pass, 0 fail (+3 novos)                          |
| Smoke `conversation.smoke.spec.ts` (build + preview 53112, bypass), 11 testes | 11 passed (2,5 min); novo "ticks sem recarregar" 46 s |

**Dois testes de integração estavam desatualizados e foram acertados.** `-write` esperava `status: null` na resposta do envio (a T5.4 passou a
devolver `delivered`) e `-scale` fixava 4 consultas por lista (agora 5, a do `officeReadAt`, constante com 1, 10 e 30 conversas).

**Mutações (a correção arrancada faz o teste falhar).**

- API contrato: resumo sem o spread de `officeReadAt`: 2 fail (lista e open). Lista em loop (uma consulta por conversa): 1 fail (exige uma só chamada em lote).
- API integração: SQL sem `ne(reads.userId, driverUserId)` (leitura do próprio motorista contaria): 1 fail. `exists` aceitando também `outbound`
  (leitura que não alcança mensagem do motorista contaria): 1 fail. N+1 no use case: `-scale` mede 34 consultas com 30 conversas, 1 fail.
- App: diff sem a comparação de `officeReadAt`: 3 fail (diff, ticker e adapter com payload cru).
- Smoke: com o diff mutado, "ticks sem recarregar" falha por timeout de 20 s esperando `.cv-status-ticks--read`.

**Armadilha do próprio teste.** O smoke "ticks" antigo passava mesmo com o defeito: o ciclo de 15 s que absorve a mensagem recém-enviada
(`lastMessageAt` novo) refazia a conversa e já trazia o `read`. O teste novo espera primeiro uma resposta da lista (o ciclo que absorve o envio)
e só então posta `office-read`; também prova que o documento não foi recarregado (marcador em `window`).

## T5.3 — Respostas prontas no app do motorista (D11)

**O que mudou.** `driverQuickReplies.service.ts` busca `GET /me/trips/current/quick-replies` pelo cliente HTTP do módulo e guarda a **última
lista boa** no `localStorage` (chave por dono da sessão; sem dono, sem cache). O cache só vale quando a resposta **não chegou** (rede, token,
5xx); 4xx (`409 DRIVER_NOT_REGISTERED`) esvazia lista e cache; corpo ilegível ou item malformado = lista vazia sem apagar o cache (portal
de rede devolve 200 com HTML). Nunca lança: a tela não cai por causa de chip. `useDriverQuickReplies` (react-query, `networkMode: 'always'`,
senão a consulta pausa offline) mapeia `{id,text}` para o `QuickReply` do participante (`title` cortado em 40, `body` inteiro) e
`DriverConversations.page.tsx` passa em `quickReplies`; tocar PREENCHE e não envia (comportamento do pacote). Locales: `quickRepliesGroup`
já existia nos dois. Demo API: rota com 4 textos e `POST /__debug/conversations/quick-replies` `{texts, status}` (`reset` restaura).

**Gates (números reais).**

| Gate                                                                          | Resultado                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| App `bun run typecheck` / `bun run lint` (cwd `apps/frontend-driver`)         | limpos                                           |
| App `bun run test`                                                            | 1691 pass, 0 fail (+7: 6 do serviço, 1 da demo)  |
| Smoke `conversation.smoke.spec.ts` (build + preview 53112, bypass), 13 testes | 13 passed (2,6 min); 2 novos "respostas prontas" |

**Mutações (a correção arrancada faz o teste falhar).**

- Serviço: sem leitura do cache: 1 fail ("sem rede"). Todo erro tratado como queda: 2 fail (409 e malformada). Sem validar item: 1 fail
  (malformada). Sem gravar o cache: 2 fail (sucesso e "sem rede"). Chave sem exigir dono: 1 fail (sem dono não há cache).
- Demo: `reset` sem restaurar a lista: 1 fail.
- Smoke: página sem `quickReplies={quickReplies}`: "chips no compositor" falha (4 chips esperados). Cache ignorado: o mesmo teste falha no
  trecho sem rede (rota abortada + reload). Debug ignorando `status`: "sem lista" falha (chips aparecem).

**Limites honestos.** "Tocar preenche e não envia" é do pacote (o smoke prova o efeito: campo preenchido, zero mensagem no servidor, nenhuma
bolha), então não há mutação nossa que o quebre. O `abort` do Playwright não põe `navigator.onLine` em falso: `networkMode: 'always'` fica
provado só pelo raciocínio (a consulta pausada offline nunca chamaria a busca), não por mutação.
