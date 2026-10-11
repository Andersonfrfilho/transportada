# Plano técnico — 264

## Contexto medido (2026-10-10, `origin/staging` e `adatechnology-packages@origin/main a7c5c85`)

- **SDK** (`conversations-ui@0.9.0`, `conversation-contracts@0.5.0`; o checkout local do repo de pacotes está numa branch
  17 commits atrás de `main` — trabalhar em **worktree próprio** a partir de `origin/main`):
  - `participant/ParticipantAttachmentItem.tsx:57-64` já desenha `kind: 'audio'` com `<audio controls preload="none">`
    nativo, em `.cv-p-attachment--audio`. **Não há** gravador, velocidade, duração nem transcrição na visão do
    participante; `participantApi.types.ts` não tem `transcribeAudio`.
  - Envio é **uma etapa** no pacote: `sendMessage({ subject, clientMessageId, text?, files? })`
    (`useParticipantSend.ts:38-42`); quem sobe em duas etapas é o host (adapter do app e do painel).
  - `AudioRecorderButton` (só `File`, sem duração; teto 5 min; formatos OGG→M4A→WEBM; revisão antes de enviar),
    `AudioPlayer` (sem velocidade) e `AudioTranscription` (`pending|done|failed|unsupported`, sem aviso de máquina) são
    **Tailwind** — os testes da visão do participante exigem só `cv-p-*`, então não entram nela.
  - Ouro: `participantGolden.test.tsx` compara `renderToStaticMarkup` byte a byte com 9 `test-fixtures/*.golden.html`;
    os cenários usam `channel = 'app'`, que **grava** (`records: true`): um microfone ligado pela capacidade do canal
    mudaria o ouro. Por isso o microfone liga **só pela prop** (D1), nunca pelo canal.
  - `conversation-contracts/src/participant.ts:63-69`: `ParticipantAttachment = { id, kind, filename, mimeType,
sizeBytes }`. `ports.ts:184-196` tem um `TranscriberPort` opcional de backend (ADR-0074) que esta spec não usa.
  - `audio-transcription-provider@0.1.0` publicado no npm (`npm view` = 0.1.0): `createWhisperLocalTranscriber({
modelPath, binaryPath?, ffmpegPath?, threads?, languageHint?, timeoutMs? })` em processo filho (`execFile`),
    ffmpeg → WAV 16 kHz mono em `mkdtemp`, `--max-context 0`, `collapseRepetitions`; `isRetriableTranscriptionFailure`;
    binário ausente = definitivo, timeout/OOM = retriável.
  - `meta-whatsapp-module` tem `TranscribeAudioUseCase` e política por empresa **para as tabelas do módulo**
    (`meta_whatsapp`). A conversa por assunto mora nas tabelas do produto (ADR-0072): **não** se reaproveita o caso de
    uso do módulo, só a forma da porta (`AudioTranscriber`, estrutural).
- **Produto:**
  - `occurrence_conversation_attachments` tem `duration_ms` (nulo; nenhum caminho o preenche hoje), `sha256`,
    `content_type`, `stored_object_id` (`apps/api-transportada/src/database/occurrence-conversation.schema.ts:369-422`).
  - Não existe tabela de configuração da conversa por empresa (o `occurrence_conversation_settings` da 183 não foi
    criado): a configuração desta spec é tabela nova.
  - Anexo: upload em duas etapas (`conversation-attachment.service.ts`: pedido → PUT → ligação que confere assinatura e
    calcula `sha256`); leitura em lote por `readConversationAttachments(companyId, messageIds[])`
    (`drizzle-conversation-attachment.repository.ts:136-170`) e `ConversationAttachmentView = { contentType, fileName,
id, sizeBytes, url }` (`conversation-attachment.port.ts:134`) — é aí que `durationMs`/`transcription` entram, só nos
    casos de uso por assunto (`list-my-subject-messages`, `reply-my-subject-conversation`, `list-office-subject-messages`,
    `send-office-subject-message`). Tela antiga (`read-occurrence-conversations`) e portal (`toPortalAttachment`) ficam.
  - **Áudio do WhatsApp não vira anexo da conversa** (`whatsapp-conversation-inbound.service.ts:37-55`, 183 T702f): fora
    desta spec.
  - Não existe outbox de conversa; as rotinas do job-run estão no catálogo `src/shared/job-catalog.constant.ts`
    (`trip.canhoto.read` em `:257`). Configuração por empresa segue o molde `company_*_settings` +
    `/company-settings/<x>` (`location-retention-settings.routes.ts`).
  - `make migration-test` **não descobre** migration sozinho: cada uma tem `*.static.contract.ts` importado em
    `test/database-migration.contract.test.ts` e uma assertion chamada em
    `test/database-migration/database-migration.integration.ts`.
  - `frontend-driver/server.ts:37`: `microphone=()`; e a CSP do app (`contentSecurityPolicy.service.ts:78-92`) **não tem
    `media-src`**. O painel tem `microphone=(self)` e `media-src 'self' blob: <bucket>` desde a 183 T705. Testes do app:
    contrato novo precisa de import em `test/conversation.contract.test.ts`.
  - O painel mantém `ConversationAudioRecorder`/`ConversationAudioPlayer` na tela **antiga** da ocorrência; o diálogo
    por assunto (`SubjectConversationPanel.component.tsx`, `ConversationThread` perspectiva `operator`) não grava.
  - Worker: Bun 1.3.14 Alpine (`apps/worker-transportada/Dockerfile`), sem ffmpeg; rotinas agendadas por registro
    (`startJobRunConsumer`); molde de rotina CPU com fila em tabela: `canhoto-read/`. Railway: serviço `worker`, uma
    réplica, health `/health/live` (`.railway/railway.ts:143-149`). Há precedente de binário nativo construído à parte
    (`deploy/opencv-build/`).
  - Migrations: últimas `20261010101500_conversation_subject`, `…102500_conversation_protocol`,
    `…103500_quick_reply_driver_audience`, cada uma com `rollback.sql`.

## (a) Contratos — `conversation-contracts` (aditivo, minor)

```ts
// participant.ts — campos novos OPCIONAIS; nenhum campo existente muda
export const PARTICIPANT_TRANSCRIPTION_STATUS = ['pending', 'ready', 'failed', 'disabled'] as const
participantAttachmentTranscriptionSchema = z.object({
  status: z.enum(PARTICIPANT_TRANSCRIPTION_STATUS),
  text: z.string().max(20_000).optional(), // só em `ready`
  language: z.string().min(2).max(8).optional(), // ISO 639-1, dica
  engine: z.string().max(64).optional(), // ex.: 'whisper-local'
  generatedAt: z.string().datetime().optional(),
}).strict()
participantAttachmentSchema += { durationMs?: number (int > 0), transcription?: ... }
```

Regras: `text` só com `ready` (refine); vocabulário próprio do participante, o `TranscriptionStatus` do operador
**não muda**. Testes: estados, `text` fora de `ready` recusado, ausência aceita, mensagem antiga (sem os campos) segue
válida. O desenho final dos nomes é da **T0.1 🧠** (contrato que SDK, API e dois apps herdam).

## (b) SDK — `conversations-ui/participant` (minor; worktree e PR próprios no repo de pacotes)

Peças novas, todas `.cv-p-*`, sem Tailwind, sem dependência nova:

- `ParticipantAudioRecorder.tsx` + `useParticipantAudioRecorder.ts` (máquina de estados pura e testável:
  `idle → requesting → recording → review → idle`, `denied`, `unsupported`, `empty`); reaproveita
  `resolveRecordingFormat`/`RECORDING_FORMATS`/`DEFAULT_MAX_RECORDING_MILLISECONDS` (puros). Entrega `File` ao mesmo
  caminho dos anexos (`draft.files` → `sendMessage({ files })`), então a fila, a idempotência e o upload são os do host.
  Para no `visibilitychange` oculto e no unmount, sempre com `track.stop()`. Ganchos opcionais para o host:
  `onCaptureChange?(open)` (o app liga no `captureRegistry`).
- `ParticipantAudioPlayer.tsx`: `<audio preload="metadata">` controlado, tocar/pausar, `role="slider"` com
  `aria-valuetext`, posição/duração, velocidade 1×/1,5×/2× (`defaultPlaybackRate` + `playbackRate`), um áudio por
  vez por conversa (contexto da thread), URL resolvida **uma vez** por anexo.
- `ParticipantAudioTranscription.tsx`: estados D4 (e o aviso de `too_long`, RF15), aviso "gerada por máquina" sempre junto do texto, recolhe em 6
  linhas, anúncio `aria-live="polite"` só na troca `pending → ready`.
- **Capacidade por ausência:** prop nova em `ConversationThread` e `ParticipantConversations` (molde:
  `audioRecording?: { maxDurationMs?: number; maxSizeBytes?: number }`; nome final na T0.1). Ausente ⇒ compositor
  idêntico. O player e o bloco de transcrição **não** dependem de prop: o player troca o `<audio>` nativo (única
  mudança de markup padrão, declarada no changeset), e o bloco só aparece com `attachment.transcription`.
- Rótulos novos opcionais em `ParticipantConversationsLabels` (mesmo padrão de `messageOptions?`, para não quebrar host
  que monta o objeto inteiro), defaults em inglês: `recordAudio`, `stopRecording`, `recordingElapsed`, `reviewAudio`,
  `sendAudio`, `discardAudio`, `microphoneDenied`, `audioEmpty`, `audioTooLarge`, `play`, `pause`, `playbackRate`,
  `audioPosition`, `transcribing`, `machineTranscription`, `emptyTranscription`, `showFullTranscription`.
- **Ouro:** os 9 cenários atuais **regravados uma única vez** pela troca do `<audio>` nativo **só** se algum tiver
  anexo de áudio (hoje nenhum tem — confirmar na T1.1; se nenhum mudar, o diff de ouro tem de ser **vazio**); cenários
  novos: `thread-audio-player`, `thread-audio-transcription-{pending,ready,empty}`, `composer-audio-{idle,recording,
review,denied}`. Ouro do operador (`MessageBubble`, `ConversationPane`) intocado: diff vazio é aceite.
- Bundle: `/participant` medido antes/depois (mesma medida da 263 T0.2), sem `lucide`/Tailwind novos.
- Changeset minor nos dois pacotes, em inglês como os da visão do participante, com a seção "Default markup and style
  change" (o `<audio>` nativo vira `.cv-p-audio`). **Passe `opus` obrigatório** antes do merge em `main` (que publica).

## (c) API — `apps/api-transportada`

**Migration aditiva** `YYYYMMDDHHMMSS_conversation_audio_transcription` (+ `rollback.sql`):

```sql
create table occurrence_conversation_audio_transcriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  attachment_id uuid not null,              -- FK composta (company_id, attachment_id) → occurrence_conversation_attachments
  status varchar(16) not null,              -- CHECK in ('pending','ready','failed','purged')  (sem ENUM)
  text text,                                -- só em 'ready'; anulado em 'purged'
  language varchar(8),
  audio_duration_ms integer check (audio_duration_ms is null or audio_duration_ms > 0),
  engine varchar(64), model varchar(64),
  processing_ms integer,
  attempts smallint not null default 0,     -- sobe NA REIVINDICAÇÃO
  lease_token uuid,                         -- só quem tem a posse grava (where lease_token = $x)
  max_duration_ms integer,                  -- teto aplicado, só em too_long (contract.md §5.5)
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  failure_code varchar(32),                 -- CHECK lista fechada (RF14)
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  generated_at timestamptz,
  unique (company_id, attachment_id),
  check ((status = 'ready') = (generated_at is not null)),
  check (status <> 'failed' or failure_code is not null)
);
create index … on (next_attempt_at) where status = 'pending';
create table company_audio_transcription_settings (
  company_id uuid primary key references companies(id), enabled boolean not null default true,
  enabled_since timestamptz not null default now(), routine_started_at timestamptz,
  updated_by_user_id uuid, updated_at timestamptz not null default now()
);
```

`disabled` **não** é gravado: é derivado na leitura da configuração (D9). `rollback.sql` derruba as duas tabelas (perda
declarada das transcrições: dado derivado, regenerável). Marco de "sem backfill" (D9), decidido na T0.1:
`enabled_since` + `routine_started_at` por empresa e janela de 72 h (`contract.md` §5.5–5.6). `failure_code` inclui
`company_disabled` (§5.7). `make migration-test`.

**Porta e adaptador** (o motor roda no worker; a API só lê e configura):

- A porta `speech-to-text.port.ts` mora **no worker** (`src/conversation-audio-transcription/application/`), estrutural
  igual a `AudioTranscriber` do pacote; adaptador `whisper-local-speech-to-text.gateway.ts` sobre
  `createWhisperLocalTranscriber`. Teste com transcritor falso.
- A API não depende do pacote de transcrição.

**Leitura (sem N+1):** `findTranscriptionsByAttachmentIds(companyId, attachmentIds)` em lote na mesma montagem da
página de mensagens das rotas por assunto (motorista e escritório) + uma leitura da configuração da empresa; mapper
puro `toParticipantTranscription(row, enabled)` (testado por tabela: ausente, `pending`, `ready`, `failed`, `purged` →
ausente, desligada → `disabled`). Rotas antigas e `/client/**`: **ouro da resposta** prova que não mudam.

**Configuração:** `GET/PUT /v1/company-settings/audio-transcription` (`settings.manage`, `{ data: { enabled } }`,
`.strict()`, auditoria). Documentar em `docs/ai-context/api-transportada.md` e `api-contract.md` desta spec.

**Segurança:** `companyId` do contexto; BOLA herdada (a transcrição só sai junto do anexo que o leitor já pode ver);
contrato de texto de fonte: nenhum `logger.*` com `text`/`transcription`; contrato "nunca decide": nenhum arquivo de
tratativa/taxa/acerto/aviso/e-mail/WhatsApp importa ou cita a tabela nova (molde `conversation-never-decides`).

## (d) Infra do worker — whisper.cpp + ffmpeg + modelo

**Imagem:** estágio de build Alpine compila `whisper-cli` de uma **tag fixada** do `ggml-org/whisper.cpp` (cmake
Release, sem GPU), baixa o modelo escolhido e confere o `sha256` (falha o build se divergir); o estágio final ganha
`apk add ffmpeg`, o binário e o modelo em `/models`, dono `transportada`. Alternativa medida no spike: modelo em
**volume** do Railway baixado no primeiro boot (imagem menor, deploy mais rápido; risco: boot sem modelo).

**Configuração (schema de env do worker, nunca `process.env` solto):** `AUDIO_TRANSCRIPTION_MODEL_PATH` (sem ela a
rotina não é registrada), `AUDIO_TRANSCRIPTION_THREADS` (padrão: vCPU − 1, mínimo 1),
`AUDIO_TRANSCRIPTION_MAX_DURATION_MS` (padrão 600000), `AUDIO_TRANSCRIPTION_BATCH_SIZE` (padrão 2),
`AUDIO_TRANSCRIPTION_TIMEOUT_MS` (padrão derivado da medida). Entram em `.railway/railway.ts` como `preserve()`.

**Rotina** `conversation.audio.transcribe` (cadência alvo 1 min; se o agendador só der 5 min, a T0.2 registra e a spec
aceita) — **forma exata em `contract.md` §5.6**: (0) materializa o marco (`routine_started_at`); (1) cria `pending` com
`on conflict do nothing` para anexos `audio/*` sem linha, depois de `greatest(enabled_since, routine_started_at)` e
dentro da janela de 72 h, de empresa ligada; (2) reivindica até `BATCH_SIZE` com `FOR UPDATE SKIP LOCKED`, novo
`lease_token`, lease de `timeout + 60 s` e `attempts + 1`; (3) por linha (escrita só `where lease_token = $x`):
empresa desligada ⇒ `failed`/`company_disabled`; objeto `deleted` ⇒ `purged`; baixa pela linha, confere `sha256`,
**mede com `ffprobe`** (sem cabeçalho de duração: decodifica com `ffmpeg -t teto+1s`), `too_long` **sem chamar o
transcritor**; o motor devolve só `{ text, engine, language }`, e `language` é a dica `pt`, não detecção; (4) expurgo: `ready` com objeto
`deleted` ⇒ `text = null`, `purged`. Um áudio por vez (CPU); o processo filho mantém o event loop livre para o health
e as outras rotinas. Métricas: contagem por estado e por `failure_code`, `processing_ms`, fator de tempo real; alerta
quando `failed` > 0 na hora ou `pending` mais velho que 15 min.

**Spike T0.2 (🧠, decide e escreve a ADR-0103 aceita):** no runner do Railway (serviço de staging temporário com o
mesmo plano do worker), medir para `base` (piso), `small`, `small-q5_1`, `large-v3-turbo`, `large-v3-turbo-q5_0`:
tamanho da imagem, tempo de build e de deploy, RAM de pico, tempo para áudios reais de 10 s / 1 min / 2 min / 5 min
(gravados no app com ruído de cabine, pt-BR, com consentimento de quem fala, **nunca** de cliente real), fator de tempo
real, repetição em loop, e taxa de erro de palavras numa amostra conferida à mão. **Critério:** o menor modelo com
(i) nenhum loop, (ii) erro de palavras aceitável na amostra (registrar o número), (iii) fator de tempo real ≤ 1 em 2 min
de áudio, (iv) RAM de pico + base do worker ≤ 70 % do teto do serviço. Também medir o impacto numa rotina vizinha
(canhoto) durante uma transcrição. **Saída de emergência:** se nenhum modelo cumprir (iii)/(iv) no worker, a T0.2
**para e pergunta ao dono** entre subir o plano do worker, um serviço interno dedicado (molde `tesseract-server`, sem
domínio público) ou afrouxar o critério — não decide sozinha, porque muda custo de infra.

**Custo:** zero por uso. Registrar na ADR o custo de infra medido (RAM/CPU adicionais no plano do Railway, MB de imagem,
segundos de deploy).

## (e) Apps

**`frontend-driver`:** `server.ts` `microphone=(self)` + contrato `security-headers`; CSP ganha `media-src 'self' blob:
<storage>` (hoje ausente) + contrato; `DriverConversations.page.tsx` passa a opção de gravação; o adapter
(`driverConversationsApi.service.ts`) mapeia `durationMs`/`transcription` **se vierem** (sem campo, nada); o outbox de
conversa aceita o `File` de áudio como os outros anexos (teto de bytes, dono, "Sair"); gravação aberta conta no
`captureRegistry`; locales `conversation.locale.json` + `.en`; demo API (`scripts/driver-preview-conversations*.ts`)
devolve áudio e transcrição nos quatro estados + rota `__debug` para avançar `pending → ready`. Smoke Playwright com
`--use-fake-device-for-media-stream` e `--use-fake-ui-for-media-stream`: gravar, ouvir, enviar, offline, ver
transcrição.

**`frontend-transportada`:** `SubjectConversationPanel` passa a opção de gravação; adapter `subjectThreadApi.service.ts`
mapeia os campos; configurações ganham "Transcrever áudios das conversas" (`settings.manage`); locales; smoke do painel
(gravar e enviar na conversa por assunto, ver transcrição). A tela antiga da ocorrência **não muda**.

**`frontend-client`:** não usa a visão do participante (componente próprio com `<audio>` nativo); só sobe a versão
do pacote junto (as três apps na mesma versão, regra da 263); portal sem
microfone e sem transcrição (o serializador não manda o campo) — smoke do portal confirma que nada mudou.

## (f) Ordem de publicação (ADR-0081 §9)

1. **Pacotes:** `conversation-contracts` + `conversations-ui` publicados (passe `opus` antes).
2. **Apps tolerantes:** as três apps sobem para a versão nova **sem** ligar a gravação nem mapear campos (só o player
   novo); staging.
3. **Banco + API:** migration aditiva, campos novos nas rotas por assunto e `transcriptionUpdatedAt` no resumo do
   motorista (`contract.md` §5.3). Os apps validam a transcrição por anexo e ignoram o que não conhecem (sem regra
   extra de ordem por campo novo) (a API sem worker devolve só `disabled` ou
   ausente — nunca `pending` eterno, porque sem rotina não há linha).
4. **Worker:** imagem com whisper e rotina; staging; medida T6.3.
5. **Telas:** gravação ligada no app e no painel, configuração no painel.
6. **Produção:** PRs separados por etapa, cada um com aprovação humana.

## Testes (resumo)

Contrato antes da implementação em toda task. Pacotes: máquina de estados do gravador, player, transcrição, ouro.
API: mapper por tabela, contrato das rotas novas e ouro das antigas, integração (`bun --env-file=../../.env.test run
test:integration`) da lista em lote e da configuração, `make migration-test`. Worker: rotina com transcritor falso,
lease concorrente, expurgo, "nunca decide/nunca em log" por mutação, `make worker-integration`. Apps: contratos de
cabeçalho/CSP, adapter, outbox com áudio, smokes. Todo teste novo entra na lista explícita do `package.json` da app.

## Riscos

- **CPU do worker** disputada com planta do baú, canhoto e prévia: um áudio por vez, processo filho, e medida do impacto
  no spike; saída de emergência pede decisão do dono.
- **Imagem de 0,5–1,7 GB** a mais: deploy mais lento; alternativa de volume medida.
- **Qualidade em pt-BR com ruído de cabine**: o aviso "gerada por máquina" e o áudio como registro mitigam; o spike mede.
- **Ouro do SDK**: qualquer diff nos cenários sem capacidade reprova; o passe `opus` confere o changeset.
- **iOS Safari** grava `audio/mp4` e só libera o microfone com gesto do usuário: coberto pelo RF4 (permissão só no
  toque) e conferido no aparelho real na T7.
- **Dado pessoal novo** (texto da fala): retenção amarrada ao áudio, fora de log; registro em `docs/SECURITY.md`.
