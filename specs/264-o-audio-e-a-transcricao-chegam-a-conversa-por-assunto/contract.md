# Contrato da 264 — áudio e transcrição na conversa por assunto (T0.1 🧠)

> Desenho do `architect` (opus), conferido em 2026-10-11 contra `adatechnology-packages@origin/main a7c5c85`
> (`conversation-contracts@0.5.0`, `conversations-ui@0.9.0`) e contra `apps/api-transportada` da branch `work/spec-264`.
> **É o contrato que as Fases 1–5 herdam.** Mudar aqui exige novo passe de arquitetura. Identificadores em inglês;
> defaults de rótulo do SDK em inglês (a tradução é do host).

## 0. O que a leitura do código mudou no plano

1. **`audioRecorderFormat.ts` não existe no `origin/main`.** `resolveRecordingFormat`, `RECORDING_FORMATS` (nem
   exportado) e `DEFAULT_MAX_RECORDING_MILLISECONDS` moram em `src/AudioRecorderButton.tsx:72-93`, o arquivo do gravador
   Tailwind do operador, que importa `AudioPlayer` (`:13`). Só `audioRecorderFormat.test.ts` existe, e ele importa de
   `./AudioRecorderButton` (`:3`). Importar dali dentro de `src/participant/**` arrastaria o gravador do operador para o
   bundle da visão do participante. **Decisão:** a T1.3 cria `src/audioRecorderFormat.ts` com as três peças (e exporta
   `RECORDING_FORMATS`), e `AudioRecorderButton.tsx` passa a **reexportá-las** do arquivo novo. É mudança de fonte sem
   mudança de markup nem de comportamento: o barril (`src/index.ts:22`) e o teste existente continuam importando os
   mesmos nomes; o ouro do operador prova (diff vazio) e a T1.8 confere.
2. **O URL do anexo é resolvido por identidade de objeto** (`ParticipantAttachmentItem.tsx:27-40`, dependência
   `[attachment, …]`). Toda revalidação da conversa cria objetos novos ⇒ novo URL ⇒ o `<audio>` recomeça (a lição da
   183 T705 que o RF8 proíbe). O player novo resolve **por `attachment.id`**, não pelo objeto (§3.3).
3. **O canal `app` aceita 25 MB** (`channelCapabilities.ts:63`), não os 16 MB de áudio da 183. O teto de bytes da
   gravação é próprio (§3.2), e o efetivo é o menor dos dois.
4. **Nenhum dos 9 `*.golden.html`** da visão do participante (`src/participant/test-fixtures/`) contém `audio` (contagem
   0 em cada um no `a7c5c85`). Os cenários de ouro (`participantGoldenScenarios.test-helper.tsx:16-21`) só têm mensagens
   sem anexo. **Logo, a troca do `<audio controls>` nativo pelo player não muda nenhum ouro existente: o diff dos 9 tem
   de ser vazio.** A troca segue declarada no changeset (é mudança de markup padrão para quem tem áudio na tela).
5. **O envio já tem o caminho certo**: `useParticipantSend.send(content: { text?, files? })`
   (`useParticipantSend.ts:60-71`, `participantDrafts.ts:30-33`) cria a entrada, a bolha local, o `clientMessageId` e
   chama `api.sendMessage({ files })`. O áudio entra por ele, **sem método novo na porta** (§3.1).

## 1. Contratos — `@adatechnology/conversation-contracts` (minor 0.5.0 → 0.6.0)

Acréscimo em `src/participant.ts` (exportado também no `src/index.ts`). Nenhum campo existente muda.

```ts
export const PARTICIPANT_TRANSCRIPTION_STATUS = Object.freeze([
  'pending',
  'ready',
  'failed',
  'disabled',
] as const)
export type ParticipantTranscriptionStatus = (typeof PARTICIPANT_TRANSCRIPTION_STATUS)[number]

/** Só o motivo que muda o que o leitor vê. Os demais códigos de falha (RF14) ficam no servidor. */
export const PARTICIPANT_TRANSCRIPTION_FAILURE_REASONS = Object.freeze(['too_long'] as const)
export type ParticipantTranscriptionFailureReason =
  (typeof PARTICIPANT_TRANSCRIPTION_FAILURE_REASONS)[number]

export const PARTICIPANT_TRANSCRIPTION_TEXT_MAX_LENGTH = 20_000
export const PARTICIPANT_AUDIO_DURATION_MAX_MS = 86_400_000

const TRANSCRIPTION_LANGUAGE_PATTERN = /^[a-z]{2,3}$/ // ISO 639-1/639-2, minúsculo ("pt")

const pendingTranscriptionSchema = z.object({ status: z.literal('pending') }).strict()
const readyTranscriptionSchema = z
  .object({
    status: z.literal('ready'),
    text: z.string().max(PARTICIPANT_TRANSCRIPTION_TEXT_MAX_LENGTH), // '' = nada foi dito (resultado, não falha)
    language: z.string().regex(TRANSCRIPTION_LANGUAGE_PATTERN).optional(),
    engine: z.string().min(1).max(64).optional(), // 'whisper-local'
    generatedAt: z.string().datetime(),
  })
  .strict()
const failedTranscriptionSchema = z
  .object({
    status: z.literal('failed'),
    reason: z.enum(PARTICIPANT_TRANSCRIPTION_FAILURE_REASONS).optional(),
    maxDurationMs: z.number().int().positive().optional(), // o teto aplicado; só com reason 'too_long'
  })
  .strict()
const disabledTranscriptionSchema = z.object({ status: z.literal('disabled') }).strict()

export const participantTranscriptionSchema = z
  .discriminatedUnion('status', [
    pendingTranscriptionSchema,
    readyTranscriptionSchema,
    failedTranscriptionSchema,
    disabledTranscriptionSchema,
  ])
  .superRefine((value, context) => {
    if (value.status !== 'failed') return
    if ((value.reason === 'too_long') === (value.maxDurationMs !== undefined)) return
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxDurationMs'],
      message: 'maxDurationMs goes with too_long',
    })
  })
export type ParticipantTranscription = z.infer<typeof participantTranscriptionSchema>

export const participantAttachmentSchema = z.object({
  id: z.string().min(1),
  kind: attachmentKindSchema,
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().min(0),
  durationMs: z.number().int().positive().max(PARTICIPANT_AUDIO_DURATION_MAX_MS).optional(), // novo
  transcription: participantTranscriptionSchema.optional(), // novo
})
```

Regras que os testes da T1.1 prendem:

- **`text` só existe em `ready`** — garantido pelo `.strict()` de cada ramo (um `text` em `pending`/`failed`/`disabled`
  é campo desconhecido ⇒ recusado). `text: ''` em `ready` é válido.
- **`disabled` é derivado na leitura, nunca gravado** (§4.3). O schema o aceita porque é o que a API devolve.
- **Compatibilidade:** mensagem/anexo sem `durationMs` e sem `transcription` continua válido (ouro de parse com o
  fixture atual). `participantAttachmentSchema` segue **não** estrito (faz _strip_, como hoje): API nova com app velho
  descarta os campos sem erro.
- **O `.strict()` da transcrição tem custo** (Trade-offs): qualquer campo ou motivo novo nela quebra o parse da página
  inteira num app com o contracts antigo. Por isso: (a) a API só emite o que esta versão conhece — código de falha
  diferente de `too_long` sai como `{ status: 'failed' }`; (b) campo/motivo novo = minor do contracts **e** as três
  apps sobem **antes** da API (ADR-0081 §9).
- O `TranscriptionStatus` do operador (`pending|done|failed|unsupported`) e `ports.ts` **não mudam**.

## 2. Capacidade de gravação — `conversations-ui/participant` (minor 0.9.0 → 0.10.0)

```ts
// src/participant/participantAudio.types.ts (exportado por src/participant/index.ts)
export type ParticipantAudioRecordingOptions = {
  /** Teto da gravação; só pode BAIXAR o padrão (valor maior é cortado em DEFAULT_MAX_RECORDING_MILLISECONDS). */
  readonly maxDurationMs?: number
  /** Teto do arquivo; padrão DEFAULT_MAX_RECORDING_BYTES (16 MiB). Efetivo = min(este, maxBytes do canal). */
  readonly maxSizeBytes?: number
  /** true de `requesting` até sair de `review`; o app liga no captureRegistry. Nunca recebe o áudio. */
  readonly onCaptureChange?: (isCapturing: boolean) => void
}
export const DEFAULT_MAX_RECORDING_BYTES = 16 * 1024 * 1024
```

- Prop **`audioRecording?: ParticipantAudioRecordingOptions`** em `ConversationThreadProps`,
  `ParticipantConversationsProps` e, por dentro, `ParticipantThreadProps` → `Footer` → `ParticipantComposerProps`.
  **Objeto presente = capacidade**; `{}` liga com os padrões. Nada de `hasX`.
- **O microfone aparece só quando TODAS valem:** prop presente **e** `channelCapabilityFor(channel).audio.records`
  **e** `attachments.accepted` **e** o navegador grava (`resolveRecordingFormat() !== undefined` e
  `navigator.mediaDevices?.getUserMedia`) **e** o `type` gravado passa no `acceptedTypes` do host (se houver). O canal
  só **desliga** (portal = `records: false`, ADR-0073); **nunca liga** — os 9 ouros usam `channel = 'app'`, que grava.
- **Sem a prop (ou com a prop num ambiente que não grava), o compositor é byte a byte o de hoje** — teste de ouro
  `composer-audio-unsupported` igual ao compositor padrão.
- **Caminho do arquivo (o "callback"):** interno, `onSendAudio: (file: File) => void` do controlador da thread, que
  chama o mesmo `send({ files: [file] })` dos anexos (`useParticipantSend.ts:60`). Mensagem **própria** de áudio, sem
  texto; o rascunho de texto **não é tocado**. Fila offline, `clientMessageId`/`Idempotency-Key`, bolha local
  (relógio/✓, "falhou — tocar para reenviar") e upload em duas etapas são os de qualquer anexo. **A porta
  `ParticipantConversationsApi` não muda**; o host não ganha método.
- **Arquivo:** `new File([blob], 'audio-YYYYMMDD-HHmmss.<ext>', { type: format.uploadMimeType })` (UTC; `ext`/`type` de
  `RECORDING_FORMATS`: `ogg`/`audio/ogg`, `m4a`/`audio/mp4`, `webm`/`audio/webm`). Conferido **antes** de enviar:
  vazio (`size === 0` ou duração < 500 ms) ⇒ `empty`; acima do teto ⇒ `tooLarge`. Nada sobe.

### 2.1 Máquina de estados — `useParticipantAudioRecorder` (pura, testável com falsos)

| Estado        | Entra por                                            | Sai para                                                                                                                                       |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`        | início; enviar; descartar; fim de mensagem de erro   | `requesting` (toque no microfone — permissão **só** no toque, RF4)                                                                             |
| `requesting`  | toque                                                | `recording` · `denied` (`NotAllowedError`/`SecurityError`) · `unsupported` (`NotFoundError`/`NotReadableError`/`OverconstrainedError`/sem API) |
| `recording`   | `getUserMedia` resolveu e `MediaRecorder.start()`    | `review` (Parar, ou teto de duração atingido) · `empty` · `tooLarge` · `idle` (interrupção)                                                    |
| `review`      | `stop` com blob válido                               | `idle` (Enviar → `onSendAudio`; Descartar; interrupção)                                                                                        |
| `denied`      | permissão negada                                     | `idle` no próximo toque (mostra a frase até lá)                                                                                                |
| `unsupported` | dispositivo sem microfone/erro de captura em runtime | `idle` no próximo toque                                                                                                                        |
| `empty`       | blob vazio / < 500 ms                                | `idle` no próximo toque                                                                                                                        |

`tooLarge` é o mesmo trilho de `empty` (frase própria). **Interrupção** = `visibilitychange` oculto, `pagehide`,
unmount (inclusive troca de assunto: `ConversationThread` remonta por `key`, `ConversationThread.tsx:116`) ou erro do
`MediaRecorder`: para, **descarta**, nunca envia sozinho. Em toda saída de `recording`/`review`: `track.stop()` em
todas as trilhas e `URL.revokeObjectURL` do áudio de revisão. Teto atingido ⇒ `review` (nunca envio automático).

### 2.2 Desenho do compositor (`.cv-p-*`, sem Tailwind, ícones do `lucide-react` que o pacote já usa)

- **`idle`, campo vazio e sem arquivos:** o botão de microfone **ocupa o lugar do enviar**
  (`button.cv-p-button.cv-p-button--primary.cv-p-composer__record`, ícone `Mic`, nome `recordAudio`, alvo ≥ 44 px via
  `--cv-p-i-touch`). Com texto ou arquivo: o enviar de hoje, sem mudança. Padrão WhatsApp; o enviar desabilitado com
  campo vazio é um botão morto que o microfone aproveita.
- **`requesting`:** o mesmo botão com `aria-busy="true"` e `disabled`.
- **`recording`:** a linha do compositor (`.cv-p-composer__row`) é trocada por `div.cv-p-recorder` (`role="group"`,
  `aria-label` = `recordingInProgress`): `button.cv-p-recorder__discard` (ícone `Trash2`, `discardAudio`) ·
  `span.cv-p-recorder__dot` (indicador, `aria-hidden`) · `span.cv-p-recorder__elapsed` (`role="timer"`, texto
  `recordingElapsed` = "0:12 of 5:00") · `button.cv-p-button--primary.cv-p-recorder__stop` (ícone `Square`,
  `stopRecording`). Foco vai ao Parar. O campo de texto não é renderizado (o rascunho fica guardado no estado).
- **`review`:** `div.cv-p-recorder.cv-p-recorder--review` com `p.cv-p-recorder__hint` (`reviewAudio`, "Listen before
  sending") · Descartar · **o mesmo player do §3** sobre o `objectURL` (duração = tempo gravado, nunca do
  `loadedmetadata`) · `button.cv-p-button--primary.cv-p-recorder__send` (ícone `Send`, `sendAudio`). Foco vai ao Enviar
  áudio; depois de enviar/descartar, volta ao microfone.
- **`denied`/`unsupported`/`empty`/`tooLarge`:** linha de `idle` + `p.cv-p-composer__error[role=alert]` (classe que já
  existe para recusa de anexo) com `microphoneDenied`/`recordingUnsupported`/`audioEmpty`/`audioTooLarge`.
- **Ouro da gravação:** a vista é um componente puro, `ParticipantAudioRecorderView({ state, elapsedMs, … })`, separado
  do hook; os cenários `composer-audio-{idle,recording,review,denied}` renderizam a vista com estado explícito
  (`renderToStaticMarkup` não tem `MediaRecorder` — no servidor a detecção dá "não grava", de propósito).
- Bolha **pendente** de áudio (fila offline): a mesma de hoje para anexo pendente — nome do arquivo + relógio
  (`ParticipantMessageBubble.tsx:65`, `pendingFilenames`). Sem player local de `blob:` na fila (revisável na T7.1).

## 3. Player e transcrição na bolha (sem prop — valem para todo host da visão do participante)

### 3.1 Onde

`ParticipantAttachmentItem` troca **só o ramo `kind === 'audio'`** (`ParticipantAttachmentItem.tsx:57-64`) por:

```html
<div class="cv-p-attachment cv-p-attachment--audio">
  <div class="cv-p-audio" role="group" aria-label="{audioPlayer}: {filename}">
    <button type="button" class="cv-p-audio__toggle" aria-label="{playAudio|pauseAudio}">
      ícone Play/Pause
    </button>
    <div
      class="cv-p-audio__track"
      role="slider"
      tabindex="0"
      aria-label="{audioPosition}"
      aria-valuemin="0"
      aria-valuemax="{s}"
      aria-valuenow="{s}"
      aria-valuetext="{audioPositionValue}"
    >
      <div class="cv-p-audio__progress"></div>
    </div>
    <span class="cv-p-audio__time">0:12 / 1:05</span>
    <button type="button" class="cv-p-audio__rate" aria-label="{playbackRate}">1×</button>
    <audio class="cv-p-audio__media" preload="none|metadata" src="…"></audio>
  </div>
  <span class="cv-p-attachment__name">{filename}</span>
  <!-- bloco de transcrição (§3.4), só com attachment.transcription -->
</div>
```

A classe `cv-p-attachment__audio` deixa de ser renderizada; a regra CSS (`styles.css:1327`) fica até a próxima major
(nomes `.cv-p-*` são API pública desde a 0.5.0). Declarado no changeset ("Default markup and style change").

### 3.2 Player `.cv-p-audio*`

- Tocar/pausar: nome muda com o estado (`playAudio`/`pauseAudio`). **Um áudio por vez por conversa:** contexto
  interno da timeline (não exportado); tocar um pausa o outro.
- Barra: `role="slider"`, ←/→ = ±5 s, Home/End, clique/arrasto; progresso por `transform: scaleX(...)` via variável CSS
  `--cv-p-audio-progress` no `style` (dado, não estilo; mesmo padrão do `buildParticipantThemeStyle`).
- Tempo: `m:ss / m:ss`. **Duração:** `durationMs` do anexo; senão `loadedmetadata`; se o navegador der `Infinity`/`NaN`
  (WebM do Chromium sem cabeçalho de duração), mostra só a posição, `aria-valuemax` ausente, até o servidor mandar
  `durationMs`.
- Velocidade: botão cíclico 1× → 1,5× → 2× → 1×, aplicando `defaultPlaybackRate` **e** `playbackRate` (183 T705).
- `preload="none"` quando há `durationMs` (poupa o plano de dados do motorista); `"metadata"` quando não há.
- **URL estável (RF8):** resolvida uma vez **por `attachment.id`** (efeito com dependência no id, não no objeto); erro de
  mídia antes de tocar ou URL vencida ⇒ re-resolve **uma** vez e retoma da posição. Piso de largura que mantém o
  tocar visível a 375 px (`min-inline-size` do grupo; o nome do arquivo quebra, o botão não some).
- Só tokens existentes (`--cv-p-i-accent`, `--cv-p-i-text-muted`, `--cv-p-i-border`, `--cv-p-i-touch`,
  `--cv-p-i-radius`); `ConversationsTheme` não muda. Alvos ≥ 44 px.

### 3.3 Bloco `.cv-p-transcription*`

| `attachment.transcription`                 | Markup                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ausente / `disabled` / `failed` sem motivo | **nada** (só o player)                                                                                                                                                                                                                                                              |
| `pending`                                  | `p.cv-p-transcription.cv-p-transcription--pending[aria-live=polite]` com `transcribing` ("Transcribing…")                                                                                                                                                                           |
| `ready`, `text !== ''`                     | `div.cv-p-transcription` · `p.cv-p-transcription__text` (selecionável, `lang` = `language`) · `p.cv-p-transcription__notice` (`machineTranscription`) · `button.cv-p-transcription__toggle` (`showFullTranscription`/`collapseTranscription`, `aria-expanded`) só quando transborda |
| `ready`, `text === ''`                     | `p.cv-p-transcription__empty` (`emptyTranscription`) + o aviso de máquina                                                                                                                                                                                                           |
| `failed` + `reason: 'too_long'`            | `p.cv-p-transcription.cv-p-transcription--too-long` com `transcriptionTooLong`, `{minutes}` = `floor(maxDurationMs / 60000)`                                                                                                                                                        |

- **Recolher em 6 linhas:** `-webkit-line-clamp: 6` na classe `cv-p-transcription__text--collapsed`; o botão só
  aparece depois de medir (`scrollHeight > clientHeight` num efeito de layout) — no ouro (SSR) não há botão. O texto
  inteiro fica no DOM: o leitor de tela lê tudo.
- **Ordem de leitura:** aviso de máquina **junto** do texto (o par é um `div` com `aria-describedby` do texto para o
  aviso), para ninguém ler a transcrição como fala literal.
- **`aria-live` só em `pending → ready`:** o nó vivo existe enquanto é `pending`; na troca **observada neste mount**
  para `ready`, ele anuncia o rótulo curto `transcriptionReady` ("Transcription ready"), não o texto inteiro (vários
  áudios longos não viram uma fala contínua). Áudio que já chega `ready` (histórico) não anuncia nada.
- Contraste ≥ 4,5:1 do texto e do aviso sobre as duas bolhas e nos dois temas, provado com `participantContrast`.

## 4. Rótulos novos em `ParticipantConversationsLabels`

Todos **opcionais** no tipo (molde de `messageOptions?`, `participantLabels.ts:43`): host que monta o mapa inteiro, ou
que faz `satisfies (keyof ParticipantConversationsLabels)[]` (`subjectThreadLabels.service.ts:47` do painel), não
quebra numa minor. Defaults dentro de `DEFAULT_PARTICIPANT_CONVERSATIONS_LABELS` **e** num
`DEFAULT_PARTICIPANT_AUDIO_LABELS` exportado; a leitura interna passa por `resolveParticipantAudioLabels(labels)`
(`labels.x ?? DEFAULT.x`, à prova de `undefined` explícito). Placeholders `{...}` preenchidos por função interna
(`formatParticipantLabel` só conhece `{count}`).

| Chave                      | Default (en)                                                 | Onde aparece                     |
| -------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `recordAudio`              | Record audio                                                 | botão do microfone               |
| `recordingInProgress`      | Recording                                                    | nome do grupo em `recording`     |
| `stopRecording`            | Stop recording                                               | Parar                            |
| `recordingElapsed`         | {elapsed} of {limit}                                         | relógio da gravação              |
| `reviewAudio`              | Listen before sending                                        | dica e nome do grupo em `review` |
| `sendAudio`                | Send audio                                                   | Enviar áudio                     |
| `discardAudio`             | Discard audio                                                | Descartar                        |
| `microphoneDenied`         | No permission to use the microphone.                         | erro `denied`                    |
| `recordingUnsupported`     | This device cannot record audio.                             | erro `unsupported` em runtime    |
| `audioEmpty`               | Nothing was captured by the microphone.                      | erro `empty`                     |
| `audioTooLarge`            | Audio too large to send.                                     | erro `tooLarge`                  |
| `audioPlayer`              | Audio                                                        | nome do grupo do player          |
| `playAudio` / `pauseAudio` | Play audio / Pause audio                                     | tocar/pausar                     |
| `audioPosition`            | Audio position                                               | nome do slider                   |
| `audioPositionValue`       | {position} of {duration}                                     | `aria-valuetext`                 |
| `playbackRate`             | Playback speed {rate}                                        | botão de velocidade              |
| `transcribing`             | Transcribing…                                                | `pending`                        |
| `transcriptionReady`       | Transcription ready                                          | anúncio `pending → ready`        |
| `machineTranscription`     | Transcription generated by machine                           | aviso junto do texto             |
| `emptyTranscription`       | Nothing was said in the audio                                | `ready` vazio                    |
| `transcriptionTooLong`     | Transcription only for audios shorter than {minutes} minutes | `failed`/`too_long`              |
| `showFullTranscription`    | Show all                                                     | recolhido → aberto               |
| `collapseTranscription`    | Show less                                                    | aberto → recolhido               |

A duração em si não tem rótulo: é `m:ss` formatado. Os apps traduzem em `pt-BR`/`en` nos `.locale.json` (T4.3/T5.1),
inclusive somando as chaves novas à lista `satisfies` do painel.

## 5. API — `apps/api-transportada`

### 5.1 Configuração por empresa

`GET` e `PUT /company-settings/audio-transcription` (constante `API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH` em
`shared/api.constant.ts`, ao lado de `:10-36`), política `{ permission: 'settings.manage', scope: 'company' }` nas duas
(molde `companies/presentation/location-retention-settings.routes.ts:30,55-80`), `no-store`.

- `PUT` corpo `{ enabled: boolean }` `.strict()` (`companyId` nunca do corpo) ⇒ `200`; `GET` ⇒ `200`. Resposta:
  `{ data: { enabled: boolean, maxDurationMs: number, updatedAt: string | null } }`, lista branca de campos.
  `updatedAt` é `null` enquanto ninguém mudou por pessoa (sem linha, ou linha materializada pela rotina, §5.3).
  `maxDurationMs` vem de `AUDIO_TRANSCRIPTION_MAX_DURATION_MS` validada no schema de env da **API** (padrão 600 000; a
  mesma variável do worker, um valor só em `.railway/railway.ts`) — é a frase do limite na tela (RF17).
- **Sem linha = ligada.** Erros: `400` corpo inválido, `401`/`403` como toda rota com política.
- **Auditoria:** `PUT` que **muda** o valor grava `audit_logs` na mesma transação (ator, empresa, `{ enabled }`,
  horário), ação constante no molde de `LOCATION_RETENTION_SAVED_ACTION`
  (`drizzle-location-retention-settings.repository.ts:96`). `PUT` igual ao atual não audita nem mexe em `enabled_since`.

### 5.2 Campos nos anexos das rotas por assunto

Só nos quatro casos de uso por assunto: `list-my-subject-messages.use-case.ts:47-64` (GET do motorista),
`reply-my-subject-conversation.use-case.ts:144` (POST do motorista), `list-office-subject-messages.use-case.ts:39-50`
(GET do escritório) e `send-office-subject-message.use-case.ts:135` (POST do escritório). O anexo de **áudio**
(`contentType` começa com `audio/`) ganha:

```ts
type SubjectConversationAttachmentView = ConversationAttachmentView & {
  readonly durationMs?: number // attachments.duration_ms ?? transcriptions.audio_duration_ms
  readonly transcription?: ParticipantTranscription // mesma forma do §1, byte a byte
}
```

- **Enriquecimento separado, depois de `signConversationAttachments`** — nunca dentro dele nem de
  `readConversationAttachments` (eles servem também à tela antiga, ao `/me/.../occurrences/**` e ao portal, §6).
- **Lote, sem N+1:** página sem anexo de áudio ⇒ zero consulta a mais; com áudio ⇒ **uma** consulta
  `findAudioTranscriptions({ companyId, attachmentIds })` que devolve as linhas **e** o `enabled` da empresa (junção
  com `company_audio_transcription_settings`). Número de consultas constante por página, provado na integração.
- **Mapper puro `toParticipantTranscription(row | undefined, enabled)`** (tabela de teste da T2.2):

| Situação                             | Saída                                                        |
| ------------------------------------ | ------------------------------------------------------------ |
| anexo não é áudio                    | campo ausente                                                |
| empresa desligada (com ou sem linha) | `{ status: 'disabled' }`                                     |
| sem linha                            | ausente                                                      |
| `pending`                            | `{ status: 'pending' }`                                      |
| `ready`                              | `{ status: 'ready', text, language?, engine?, generatedAt }` |
| `failed` + `too_long`                | `{ status: 'failed', reason: 'too_long', maxDurationMs }`    |
| `failed` com qualquer outro código   | `{ status: 'failed' }`                                       |
| `purged`                             | ausente                                                      |

Objeto do áudio `deleted` nem chega aqui: `readConversationAttachments` já descarta
(`drizzle-conversation-attachment.repository.ts:157`).

- Áudio recém-enviado (sem linha até o próximo ciclo da rotina) sai **ausente**, não `pending`: a API não sabe se a
  rotina está instalada (RF16), e `pending` sem rotina seria eterno. Custo: o "Transcrevendo…" aparece até 1 ciclo
  depois.

### 5.3 Tabelas (insumo da T2.1; o plano § c vale, com estes ajustes)

- `occurrence_conversation_audio_transcriptions`: como no plano, mais **`max_duration_ms integer`** (o teto aplicado,
  gravado pelo worker só em `too_long`; `check ((coalesce(failure_code, '') = 'too_long') = (max_duration_ms is not
null))`) e `check (text is null or char_length(text) <= 20000)` (o worker corta no limite do contrato, em fronteira de
  palavra). `failure_code` (lista fechada por CHECK) = RF14 **+ `company_disabled`** (pendente encerrada porque a
  empresa desligou; fora do alerta de falha).
- `company_audio_transcription_settings`: `company_id` PK/FK, `enabled boolean not null default true`,
  **`enabled_since timestamptz not null`**, `updated_by_user_id uuid` (nulo = materializada pela rotina),
  `updated_at`.

### 5.4 Marco do "sem backfill" (D9) — **`enabled_since` por empresa**

- A rotina só cria `pending` para anexo de áudio com `attachment.created_at >= settings.enabled_since` e
  `settings.enabled`.
- **Primeira execução da rotina** materializa a linha das empresas que não têm: `insert … select id, true, now() from
companies on conflict do nothing` no início do ciclo. É o marco "gravado na primeira execução" — e a rotina só existe
  com o modelo instalado (RF16), então o marco é a instalação real, não o deploy da migration.
- `PUT` de `false → true` grava `enabled_since = now()`: o que chegou desligado **não** é transcrito depois. `true →
false`: mantém `enabled_since`; a rotina fecha as `pending` daquela empresa como `failed`/`company_disabled` sem
  rodar o motor. Linha criada por `PUT` sem linha prévia: `enabled_since = now()`.
- Constante na migration foi descartada (tabela de razões).

## 6. D12 — a tela antiga da ocorrência **não** usa o mesmo serializador

- Tela antiga do painel: `createListOccurrenceConversationsUseCase` (`read-occurrence-conversations.use-case.ts:30-59`)
  lê por `reader.findAttachments` (ligado em `main.ts:3319`) e assina com `signConversationAttachments`
  (`:39-47`). Rotas por assunto: casos de uso próprios (`list-my-subject-messages.use-case.ts:47-64`,
  `list-office-subject-messages.use-case.ts:39-50`).
- O que é **compartilhado** é só a base: `signConversationAttachments` (`conversation-attachment.service.ts:239-266`) e
  `readConversationAttachments` (`drizzle-conversation-attachment.repository.ts:136-170`), usados também pelas rotas
  antigas do motorista (`driver-conversation.use-case.ts:204`) e pelo portal (`contractor-portal-conversation.use-case.ts:212`,
  com lista branca em `toPortalAttachment`, `:95-102`).
- **Conclusão:** a tela antiga fica **sem** transcrição (D12), e a transcrição **não** entra na base compartilhada — se
  entrasse, mudaria a resposta das rotas `/me/.../occurrences/**` (que repassam a view inteira). O ouro dessas rotas e do
  `/client/**` prova (T2.2).

## 7. Decisão → razão → alternativa descartada

| Decisão                                                                          | Razão                                                                                            | Alternativa descartada                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Transcrição como `discriminatedUnion` estrita por `status`                       | `text` só em `ready` sem `refine` frágil; o TS estreita o tipo no host                           | Objeto único com `text?` + `refine` (plano § a): tipo frouxo para o host                    |
| Expor só `reason: 'too_long'` (+ `maxDurationMs`)                                | É o único motivo que muda a tela (RF15); código interno não vaza nem quebra o contrato           | Expor os 9 `failure_code`: acopla o app ao worker e cada código novo quebra o parse estrito |
| `maxDurationMs` gravado na linha pelo worker                                     | O número da frase é o teto realmente aplicado àquele áudio, mesmo se a T0.2 baixar o teto depois | Número fixo no locale do app: mentiria quando o teto mudar                                  |
| `disabled` derivado na leitura                                                   | Religar mostra de novo sem reescrever linha (D9)                                                 | Gravar `disabled`: religar exigiria reescrever o histórico                                  |
| `durationMs` = `attachments.duration_ms ?? transcrição.audio_duration_ms` na API | Ninguém preenche `duration_ms` hoje; o worker mede ao transcrever                                | Worker escrever na tabela de anexos: dois donos para a mesma linha                          |
| Prop `audioRecording?: {…}` que só o canal pode desligar                         | Ausência = capacidade (263 D10); portal nunca grava (ADR-0073)                                   | Ligar por `channelCapabilityFor().audio.records`: mudaria os 9 ouros (`channel = 'app'`)    |
| Áudio sai pelo `send({ files })` interno, porta intacta                          | Fila, idempotência, bolha local e upload já existem; zero mudança nos adapters                   | `onRecorded(file)` para o host: duplicaria a fila e o envio em cada app                     |
| Mensagem própria de áudio, rascunho intocado                                     | Áudio é mensagem (183 D8); o texto não some num envio de voz                                     | Pôr o áudio em `draft.files` e enviar junto do texto                                        |
| Microfone no lugar do enviar com campo vazio                                     | Padrão que o motorista já conhece; o enviar vazio é botão morto                                  | Botão de microfone fixo ao lado: mais um alvo de 44 px numa linha de 375 px                 |
| Vista pura do gravador para o ouro                                               | `renderToStaticMarkup` não tem `MediaRecorder`                                                   | Injetar ambiente falso por prop pública                                                     |
| `audioRecorderFormat.ts` extraído e reexportado                                  | Não arrastar o gravador Tailwind para `/participant`                                             | Duplicar `RECORDING_FORMATS` na visão do participante                                       |
| URL do player por `attachment.id` + re-resolve em erro                           | RF8: a revalidação cria objetos novos e recomeçaria o áudio                                      | Manter a dependência no objeto (`ParticipantAttachmentItem.tsx:40`)                         |
| `aria-live` anuncia "Transcription ready", não o texto                           | Vários áudios longos não viram fala contínua; o texto está na bolha                              | Anunciar o texto inteiro                                                                    |
| Rótulos novos opcionais + resolvedor interno                                     | Host que tipa o mapa inteiro não quebra numa minor                                               | Rótulos obrigatórios (major)                                                                |
| `enabled_since` por empresa, materializado na 1ª execução                        | Cobre religar sem backfill e "rotina instalada meses depois"                                     | Constante da migration: não expressa religar e faria backfill do intervalo migration→worker |
| Enriquecimento fora da base de assinatura                                        | Rotas antigas e portal ficam byte a byte                                                         | Pôr o campo em `signConversationAttachments`                                                |

## 8. O que a T0.1 não fecha

Nenhuma pergunta é só do dono — as do dono já estão fechadas na spec (D1, D2, D4, D9, D12, RF15). Ficam para a
**medida** ou para a task dona:

1. **Cadência real do agendador** e o atraso entre envio e "Transcrevendo…" (≤ 1 ciclo, §5.2) — T0.2.
2. **Teto de duração**: se a T0.2 baixar, só em **minutos inteiros** (a frase usa `floor(ms / 60000)`).
3. **Formato que o Safari do iPhone grava e a duração que o `loadedmetadata` devolve** em cada navegador — T7.1 no
   aparelho real; o player já tolera duração infinita (§3.2).
4. **Bolha pendente sem player local** (§2.2) — conferir na revisão de design (T7.1); mudar exige passe novo, porque
   pede `blob:` na bolha.
5. **Modelo, RAM e tempo de transcrição** — T0.2 (ADR-0103).
