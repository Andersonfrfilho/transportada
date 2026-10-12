# Tasks — 264 O áudio e a transcrição chegam à conversa por assunto

> Cada task responde: **Mecânica?** (tudo descrito) · **Aceite por comando?** (tsc/teste/`make check`). Duas
> respostas "sim" → `haiku`. Decisão local → `sonnet`. Decisão que outras tasks herdam → 🧠 `opus`.
> **Gate de toda task:** teste/contrato escrito **antes** e visto falhando; `tsc --noEmit` (ou `bun run typecheck`) +
> script `test` da app/pacote (nunca `bun test` cru) + commit isolado + evidência em `evidence.md`. Teste novo entra na
> lista explícita do `package.json` da app. Task que toca `test/integration/**` da API só fecha com
> `bun --env-file=../../.env.test run test:integration` (de `apps/api-transportada`). Lote com migration roda
> `make migration-test`. Tela mudou ⇒ smoke Playwright da app (o do painel é gate **local**: já derrubou deploy).
> **Escalada:** gate falhou 2× → sobe um nível (haiku → sonnet → opus) e registra em `evidence.md`.
> Repo de pacotes: `~/Documents/personal/adatechnology-packages`, **worktree próprio a partir de `origin/main`** (o
> checkout local está numa branch velha e suja), branch e PR próprios; **nada é publicado sem o passe opus**.

## Fase 0 — Contrato e medida (decisões que todo o resto herda)

> 🤖 Modelo: `opus` (T0.1 e T0.2 são 🧠; T0.3 → `haiku`)

- [x] **T0.1** 🧠 `opus` — **Desenho do contrato** (2026-10-11: contrato aprovado após 3 passes de revisão,
      `contract.md`) (validar com `architect` antes de qualquer T1.x/T3.x): nomes finais
      de `ParticipantAttachment.durationMs?`/`transcription?` e do vocabulário D4; prop de capacidade da gravação em
      `ConversationThread`/`ParticipantConversations` (molde `audioRecording?`) e o desenho do compositor (microfone no
      lugar do enviar com campo vazio?); chaves de `labels`; forma de `GET/PUT /company-settings/audio-transcription`;
      marco do "sem backfill" (D9: `enabled_since` ou constante da migration); se o serializador da tela antiga da
      ocorrência é o mesmo das rotas por assunto (D12). Conferir no `origin/main` do repo de pacotes se algum dos 9
      `*.golden.html` tem anexo de áudio. Saída: `contract.md` nesta pasta + emenda do `api-contract.md` da 263 se
      precisar.
- [x] **T0.2** 🧠 `opus` — **Spike de infra e modelo** (plano § d): serviço de staging temporário no workspace AdA
      Technology, mesmo plano do worker; imagem com `ffmpeg` + `whisper-cli` (tag fixada) + modelos `base` (piso),
      `small`, `small-q5_1`, `large-v3-turbo`, `large-v3-turbo-q5_0`; medir imagem, build, deploy, RAM de pico,
      fator de tempo real (10 s/1 min/2 min/5 min, áudio de teste gravado com consentimento, nunca de cliente),
      loop de repetição, erro de palavras numa amostra conferida à mão, impacto no `trip.canhoto.read`, menor cadência
      do agendador. Escolher pelo critério fechado e preencher a ADR-0103 (status **aceita**). **Para e pergunta** se
      nenhum modelo cumprir o critério no worker (saída de emergência). Derrubar o serviço temporário ao fim.
- [x] **T0.3** `haiku` — Registrar em `docs/SECURITY.md` (D10, D11): transcrição como dado pessoal (finalidade, base,
      retenção amarrada ao áudio, fora de log) e `microphone=(self)` no app do motorista. Aceite: `bunx prettier
--check` no arquivo.

## Fase 1 — Contratos e SDK (repo de pacotes, PR próprio)

> 🤖 Modelo: `sonnet` (T1.1 e T1.7 → `haiku`; T1.8 é 🧠 `opus`). Implementa contra o `contract.md` da T0.1.

- [ ] **T1.1** `haiku` — `conversation-contracts/src/participant.ts` exatamente como o `contract.md` §1:
      `participantTranscriptionSchema` (`discriminatedUnion`, **sem `.strict()` e sem `refine`**) e `durationMs?`/
      `transcription?` no anexo; testes: os quatro estados, `text` fora de `ready` é **descartado e não aparece** no
      resultado, `status` desconhecido recusado, `text` no teto de 40 000 UTF-16, mensagem sem os campos válida.
      Changeset minor.
- [ ] **T1.2** `sonnet` — Ouro **antes**, contra `origin/main a7c5c85` e antes de qualquer código: congelar o cenário
      novo `thread-empty-draft` (compositor **vazio**, sem a prop; hoje todos os ouros usam rascunho `'abc'`) e prender
      que ele fica byte a byte igual sem a prop, com a prop no SSR e com a prop + `MediaRecorder` falso + `channel =
      'portal'`; teste de DOM com `MediaRecorder` presente e **sem** prop provando que o microfone não aparece
      (`contract.md` §2.4). Congelar também os 9 `*.golden.html` + ouro do operador (se não
      houver, criar para `MessageBubble`/`MessageComposer` com áudio) e escrever os cenários novos vermelhos
      (`thread-audio-player`, `thread-audio-transcription-{pending,ready,empty}`, `composer-audio-{idle,recording,
review,denied}`).
- [ ] **T1.3** `sonnet` — `contract.md` §0.1, §2.1, §2.3: extrair `src/audioRecorderFormat.ts` (reexportado pelo
      `AudioRecorderButton`, ouro do operador intacto); `useParticipantAudioRecorder` (estados `idle`, `requesting`, `recording`, `review`,
      `denied`, `unsupported`, `empty`, `tooLarge`; teto de duração) + `ParticipantAudioRecorderView` pura.
      Interrupção = `visibilitychange` oculto, `pagehide`, `track.onended` ou `track.onmute` **que persiste > 3 s**:
      em `recording` ⇒ para e vai a `review`; em `review` ⇒ **pausa e mantém**; unmount ⇒ descarta. **Token de
      cancelamento** no `getUserMedia` (resolveu depois de sair ⇒ `stop()` imediato das trilhas). `track.stop()` e
      `revokeObjectURL` em toda saída; `onCaptureChange?`. Testes com `MediaRecorder`/`getUserMedia` falsos.
- [ ] **T1.4** `sonnet` — `contract.md` §2, §2.1, §2.2: microfone **só pela prop** (o canal só desliga), no lugar do
      enviar com campo vazio, `type="button"`, desabilitado com o compositor, alvo ≥ 44 px. "Enviar áudio" ⇒
      `onSendAudio(file)` → `send({ files: [file] })`, **rascunho de texto e `draft.files` intocados**; recusa por
      tamanho/vazio antes de enviar; **trava por ref**, com teste de dois cliques síncronos ⇒ **uma** mensagem. Aceite:
      `thread-empty-draft` e os 9 ouros byte a byte iguais; cenários `composer-audio-*` verdes.
- [ ] **T1.5** `sonnet` — `contract.md` §3.1–§3.2: `ParticipantAudioPlayer` substituindo o `<audio controls>` em
      `ParticipantAttachmentItem`: **`<input type="range">`** estilizado, `preload="none"`, URL resolvida **no mount por
      `attachment.id`** e `src` atribuído já no mount, **`play()` síncrono** no toque, re-resolve uma vez em erro de
      mídia, duração por `durationMs` ou `loadedmetadata` (infinita tolerada), 1×/1,5×/2× com `defaultPlaybackRate`,
      um por vez. Aceite: `thread-audio-player` verde; nenhum outro ouro muda.
- [ ] **T1.6** `sonnet` — `contract.md` §3.3–§4: `ParticipantAudioTranscription` (D4, aviso de máquina, recolher em 6
      linhas, estado `too_long` com `{minutes}` do `maxDurationMs`); anúncio `pending → ready` pela **região viva que
      já existe** (`useAnnounceCopy()` → `ParticipantThreadLive`), **sem nó `aria-live` novo** (mudaria os 9 ouros);
      rótulos opcionais do §4 com defaults em inglês + CSS `.cv-p-audio*`/`.cv-p-transcription*` com contraste ≥ 4,5:1
      nos temas (`participantContrast`). Teste: nenhuma classe utilitária Tailwind.
- [ ] **T1.7** `haiku` — Changesets minor (contracts e UI) em inglês; o da UI com "Default markup and style change"
      listando os **seis itens do `contract.md` §3.4**; README da visão do participante com o exemplo da prop; medida de
      bundle do `/participant` antes/depois em `evidence.md`.
- [ ] **T1.8** 🧠 `opus` — **Passe de revisão obrigatório** (code-reviewer `opus`): impacto zero nos outros fluxos
      (diff de ouro do operador e dos cenários sem prop vazio), acessibilidade, vazamento de stream do microfone,
      changeset. Achado ALTO/bloqueante → task de correção + re-passe. Só então PR → `main` → publicação pela CI;
      conferir no npm a versão publicada.

## Fase 2 — API: transcrição na leitura e configuração (aditivo)

> 🤖 Modelo: `sonnet` (T2.1 → `haiku`)

- [x] **T2.1** `haiku` — Schema Drizzle + migration aditiva `…_conversation_audio_transcription` (as duas tabelas do
      plano § c com os ajustes do `contract.md` §5.5: `conversation_id`, `lease_token`, `max_duration_ms`,
      `enabled_since`, `routine_started_at`, CHECK de 20 000 caracteres, `company_disabled`; e o **índice parcial**
      `(created_at) where content_type like 'audio/%'` em `occurrence_conversation_attachments`; CHECKs por `inList`,
      sem ENUM) + `rollback.sql`; `db:generate` sem diferença depois. Aceite:
      `make migration-test` verde e contrato de tenant-safety das tabelas novas. ⚠️ O `make migration-test` não
      descobre migration sozinho: criar `*.static.contract.ts` + assertion e registrá-los em
      `test/database-migration.contract.test.ts` e `test/database-migration/database-migration.integration.ts`.
- [x] **T2.2** `sonnet` — Contratos **antes** (vermelhos): mapper `toParticipantTranscription` por tabela (ausente,
      `pending`, `ready`, `failed`, `ready` sem texto (expurgado)→ausente, `failed` de outro código→ausente, empresa desligada→`disabled`); rotas por assunto do motorista e do
      escritório com o campo; **ouro** das rotas antigas `/me/.../occurrences/**` e `/client/**` sem diferença;
      "transcrição fora de log" e "nunca decide" (texto de fonte, provados por mutação). Tabela espelhada em
      `participant-transcription.constant.ts` + **contrato de paridade** que faz `parse` de cada saída do mapper com
      `participantTranscriptionSchema` (`@adatechnology/conversation-contracts` como `devDependency` exata, importado
      só por `test/**`, com contrato de texto de fonte proibindo import em `src/**`; `contract.md` §5.2).
- [x] **T2.3** `sonnet` — Implementar a leitura em lote (`findTranscriptionsByAttachmentIds` + configuração da
      empresa) na montagem das páginas de mensagens das rotas por assunto; `durationMs` quando houver; e
      `transcriptionUpdatedAt` no resumo da lista do motorista (`contract.md` §5.2–5.3: agregação por
      `conversation_id` desnormalizado, sem junção). Integração com banco provando consultas constantes por página
      (sem N+1), `disabled` para empresa desligada sem nenhuma linha de transcrição e `transcriptionUpdatedAt` mudando
      quando a linha passa de `pending` a `ready`.
- [x] **T2.4** `sonnet` — `GET/PUT /v1/company-settings/audio-transcription` (`settings.manage`, `.strict()`,
      auditoria, padrão ligado sem linha); tabela de rotas, contrato e integração.
- [x] **T2.5** `haiku` — Documentar rotas e campos em `api-contract.md` desta pasta e em
      `docs/ai-context/api-transportada.md`; núcleo em `apps/api-transportada/CLAUDE.md` (seção da conversa).

## Fase 3 — Worker: rotina, porta e imagem

> 🤖 Modelo: `sonnet` (T3.1 → `haiku`; T3.5 é 🧠 `opus` só se a T0.2 mudou o desenho da imagem)

- [ ] **T3.1** `haiku` — Cópia por valor do schema Drizzle das duas tabelas no worker + contrato de paridade (molde dos
      quatorze arquivos de `src/database/`).
- [ ] **T3.2** `sonnet` — `speech-to-text.port.ts` + `whisper-local-speech-to-text.gateway.ts` sobre
      `createWhisperLocalTranscriber` (dependência `@adatechnology/audio-transcription-provider` em versão exata);
      variáveis no schema de ambiente do worker (plano § d); sem `AUDIO_TRANSCRIPTION_MODEL_PATH` a rotina não é
      registrada. Contrato: classificação de erro retriável/definitivo → código (RF14), sem mensagem do erro.
- [ ] **T3.3** `sonnet` — Contratos **antes** da rotina com transcritor falso: criação de `pending` só depois do marco
      (`greatest(enabled_since, routine_started_at)`, janela de 72 h; `PUT` antes da rotina não faz backfill) e de
      empresa ligada, com `on conflict do nothing`; reivindicação `SKIP LOCKED` com `lease_token` e `attempts` subindo
      **na reivindicação** (duas execuções concorrentes, só a dona da posse grava); backoff 1/5/30 min e
      `attempts_exhausted`; definitivo; `too_long` **sem chamar o transcritor** com anexo **sem `duration_ms`**
      (medido por `ffprobe`; WebM sem duração no cabeçalho medido por decodificação com teto); `company_disabled`
      fora do alerta; `sha256_mismatch`;
      `object_missing`; empresa desligada fecha sem motor; expurgo (`text = null`, `ready` mantido) com objeto `deleted`; nenhum
      log com texto (mutação). Também os testes listados no `contract.md` §5.8 (inteiros) e (§5.6, §5.8): reivindicação filtra `attempts < 3` e a varredura do
      início do ciclo fecha `attempts >= 3` com lease vencido como `attempts_exhausted` (transcritor falso que "mata o
      processo" não gira para sempre); lease **por linha**; texto com U+0000 gravado sem ele; timeout do
      `ffprobe`/`ffmpeg` sobre arquivo que trava ⇒ retriável; toda mudança exposta faz `updated_at = now()`;
      **executor em processo**: com o transcritor falso preso, um job-run de `trip.canhoto.read` publicado depois é
      confirmado antes de a transcrição terminar, e um segundo ciclo não abre outra execução.
- [ ] **T3.4** `sonnet` — Implementar `conversation.audio.transcribe` (`src/conversation-audio-transcription/`) e o
      `AudioTranscriptionRunner` do `contract.md` §5.8; registrar em `main.ts` (o executor entra nos `closeables` do
      `WorkerShutdown`) e **nas três cópias do catálogo de rotinas** (`job-catalog.constant.ts` da API, do cron e do
      worker, ao lado de `trip.canhoto.read`, com contrato de paridade; sem a do cron nunca é agendado) + rótulo no
      painel (`frontend-transportada/src/modules/shared/jobCatalog.constant.ts`), com os desfechos `completed`,
      `already_running` e `runner_lock_expired` na lista fechada (`isJobOutcome`); agendamento conforme a cadência
      medida na T0.2; métricas por estado/código e alerta (exceto `company_disabled`). Aceite: contratos da T3.3 verdes + `make worker-integration`.
- [ ] **T3.5** `sonnet` — `apps/worker-transportada/Dockerfile`: estágio de build do `whisper-cli` (tag da ADR-0103),
      modelo com `sha256` conferido, `ffmpeg` no runtime, sem ferramentas de build no estágio final; variáveis
      `preserve()` em `.railway/railway.ts` (conferir contra os `railway.json`, CLAUDE.md raiz). Aceite: `docker build`
      local + `whisper-cli --help` + transcrição de um áudio de teste no contêiner; contrato de build dos entrypoints.
- [ ] **T3.6** `haiku` — Documentar a rotina em `docs/ai-context/worker-transportada.md` e o núcleo em
      `apps/worker-transportada/CLAUDE.md`.

## Fase 4 — App do motorista

> 🤖 Modelo: `sonnet` (T4.1 → `haiku`)

- [ ] **T4.1** `haiku` — Subir `conversations-ui`/`conversation-contracts` para a versão publicada na T1.8 **nas três
      apps juntas** (versão exata; `conversation-contracts` **e** `conversations-ui` na mesma subida — só o UI deixaria
      duas cópias do contracts descartando campos em silêncio), sem ligar a gravação; **já leva as chaves do player e
      da transcrição** (`contract.md` §4) para os `.locale.json` das três apps em pt-BR e en (o player novo aparece para
      todo host nessa subida); a `devDependency` de teste da API sobe junto (senão a paridade testa o schema velho;
      `contract.md` §1); `make check` das três + smoke do portal sem mudança. Vale para toda subida futura do
      contracts.
- [ ] **T4.2** `sonnet` — Contratos antes (importados no agregador `test/conversation.contract.test.ts` /
      `test/shared.contract.test.ts`): `Permissions-Policy` com `microphone=(self)` exato; CSP com `media-src 'self'
blob: <storage>` (hoje ausente); adapter valida `transcription` com `participantTranscriptionSchema.safeParse`
      **por anexo** e `durationMs` por guarda (inválido ⇒ campo some, a página nunca cai; molde `readChannels`);
      `diffConversationSnapshots` compara `transcriptionUpdatedAt` (`contract.md` §5.3); outbox aceita o áudio com o
      teto `CONVERSATION_OUTBOX_LIMIT` (100 itens; 48 MiB **só para mensagem com arquivo** — texto sempre entra até o
      teto de itens) conferido antes de gravar e `QuotaExceededError` tratado como recusa; a recusada fica só em
      memória e se perde ao recarregar (§5.4), dono, "Sair" descarta; gravação aberta registrada no `captureRegistry`.
- [ ] **T4.3** `sonnet` — Implementar a T4.2 + prop de gravação em `DriverConversations.page.tsx` + locales `pt-BR`/`en`
      (conferir as chaves de `participantLabels` da versão nova) + demo API com áudio nos quatro estados e
      `__debug` para avançar `pending → ready`.
- [ ] **T4.4** `sonnet` — Smoke Playwright do `frontend-driver` (Chromium com microfone falso): gravar, ouvir, enviar,
      enviar offline e reconectar sem duplicar, microfone negado, ver "Transcrevendo…" e o texto com o aviso. Atualizar
      `apps/frontend-driver/CLAUDE.md` § Conversas e `docs/ai-context/frontend-driver.md`.

## Fase 5 — Painel do escritório

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** `sonnet` — Contratos antes + implementação: `SubjectConversationPanel` passa a prop de gravação; adapter
      `subjectThreadApi.service.ts` mapeia os campos; a tela antiga da ocorrência **intocada** (contrato/ouro).
- [ ] **T5.2** `sonnet` — Configurações: "Transcrever áudios das conversas" (`settings.manage`, frase do que acontece
      ao desligar, D9, e a do limite de 10 minutos, RF15), query/mutação, locales `pt-BR`/`en`, contrato.
- [ ] **T5.3** `sonnet` — Smoke Playwright do painel (gate local): gravar e enviar na conversa por assunto, ver a
      transcrição, desligar e ver só o player. Atualizar `apps/frontend-transportada/CLAUDE.md` e
      `docs/ai-context/frontend-transportada.md`.

## Fase 6 — Publicação em staging e medida

> 🤖 Modelo: `sonnet`

- [ ] **T6.1** `sonnet` — Gate completo (`make check`, `make migration-test`, integração da API, `make worker-integration`,
      smokes das três apps, `bunx prettier --check` nos `.md`); `git fetch` + rebase em `origin/staging` +
      `bun install --frozen-lockfile` + gates de novo; conferir numeração de spec/ADR/migration contra `origin/*`.
- [ ] **T6.2** `sonnet` — Publicar em staging **na ordem do plano § f** (apps tolerantes → banco/API → worker → telas),
      conferindo cada etapa no ar antes da seguinte.
- [ ] **T6.3** `sonnet` — Medida em staging: áudio de 1 min do app até o texto (tempo), RAM/CPU do worker durante a
      transcrição, nenhuma rotina vizinha atrasada, `failed` por código; registrar em `evidence.md` e na ADR-0103.

## Fase 7 — Revisão de design e usabilidade (obrigatória, termina a spec)

> 🤖 Modelo: `sonnet`

- [ ] **T7.1** `sonnet` — Prints do app a 375 px (tema escuro: gravando, revisar, bolha com player, transcrição
      `pending`/`ready`) e do painel a 1440 px, lado a lado com os prints da 183 T705 e da 263 (web.md §15); alvo
      ≥ 44 px medido, leitor de tela (player, slider, aviso de máquina, anúncio do `pending → ready`), contraste
      ≥ 4,5:1 nos dois temas, uso com uma mão; conferir em iPhone real (Safari grava `audio/mp4`, permissão no toque,
      `play()` depois de re-resolver URL vencida — `contract.md` §3.2).
      Divergências viram ajuste, não nota.

**Fora das tasks (aprovação humana):** produção (PRs por etapa staging → main), remover a tela antiga da ocorrência e os
`ConversationAudio*` do painel (Fase 10 da 189), qualquer provedor hospedado (ADR nova).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/264-o-audio-e-a-transcricao-chegam-a-conversa-por-assunto/
(leia spec.md, plan.md e tasks.md antes de começar; leia também docs/adr/0103-*, specs/183-* (D8, RF17, RF18,
T705/T706) e specs/263-*). Se for outra sessão, crie o próprio worktree: make worktree NAME=spec-264. A Fase 1 roda
no repo ~/Documents/personal/adatechnology-packages, em worktree próprio a partir de origin/main, branch e PR
próprios, e NÃO publica versão sem o passe opus (T1.8). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → T0.1 🧠 opus (validar com architect antes de T1.x) · T0.2 🧠 opus (spike de modelo/infra no
Railway; para e pergunta se nenhum modelo cumprir o critério) · T0.3 haiku · Fase 1 → executor model=sonnet
(T1.1/T1.7 haiku; T1.8 🧠 → code-reviewer opus) · Fase 2 → executor model=sonnet (T2.1/T2.5 haiku) · Fase 3 →
executor model=sonnet (T3.1/T3.6 haiku) · Fase 4 → executor model=sonnet (T4.1 haiku) · Fases 5, 6 e 7 → executor
model=sonnet · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com teste escrito antes + tsc --noEmit + script `test` da app/pacote (nunca `bun test` cru) +
commit isolado, evidência em evidence.md. Task de API que toque integração só fecha com
`bun --env-file=../../.env.test run test:integration`; lote com migration roda make migration-test; worker roda
make worker-integration; tela mudou ⇒ smoke Playwright do frontend-driver E do painel (gate local).
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates, prettier nos .md;
conferir numeração de spec/ADR/migration contra origin/*. Staging na ordem do plano § f.
Proibido nos subagentes: git reset, amend, stash. Pare e pergunte antes de: deploy em produção, migration destrutiva,
remover tela antiga (ocorrência do painel / ConversationAudio*), ligar provedor hospedado, a saída de emergência da
T0.2, qualquer [NEEDS CLARIFICATION].
```
