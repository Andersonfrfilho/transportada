# Contrato da 264 — áudio e transcrição na conversa por assunto (T0.1 🧠)

> Desenho do `architect` (opus), conferido em 2026-10-11 contra `adatechnology-packages@origin/main a7c5c85`
> (`conversation-contracts@0.5.0`, `conversations-ui@0.9.0`) e contra `apps/*` da branch `work/spec-264`.
> **Revisão 2** (mesmo dia): passe de correção depois da reprovação do revisor adversarial — achados H1–H4, M1–M8 e
> LOWs, mapeados no §9. **Revisão 3**: alinhamento entre documentos e três furos de desenho, mapeados no §10. **É o contrato que as Fases 1–5 herdam.** Mudar aqui exige novo passe de arquitetura.
> Identificadores em inglês; defaults de rótulo do SDK em inglês (a tradução é do host).

## 0. O que a leitura do código mudou no plano

1. **`audioRecorderFormat.ts` não existe no `origin/main`.** `resolveRecordingFormat`, `RECORDING_FORMATS` (nem
   exportado) e `DEFAULT_MAX_RECORDING_MILLISECONDS` moram em `src/AudioRecorderButton.tsx:72-93`, o gravador Tailwind
   do operador, que importa `AudioPlayer` (`:13`); só `audioRecorderFormat.test.ts` existe e importa de
   `./AudioRecorderButton` (`:3`). **Decisão:** a T1.3 cria `src/audioRecorderFormat.ts` com as três peças (exportando
   `RECORDING_FORMATS`) e `AudioRecorderButton.tsx` passa a **reexportá-las**. Mudança de fonte sem mudança de markup nem
   de comportamento; o barril (`src/index.ts:22`) e o teste existente importam os mesmos nomes; ouro do operador prova.
2. **O URL do anexo é resolvido por identidade de objeto** (`ParticipantAttachmentItem.tsx:27-40`). Toda revalidação
   cria objetos novos ⇒ novo URL ⇒ o áudio recomeçaria (RF8). O player resolve **por `attachment.id`** (§3.2).
3. **O teto de áudio é o da política da API, não o do canal do pacote.** O canal `app` do pacote aceita 25 MB
   (`channelCapabilities.ts:63`), mas a API recusa áudio acima de **16 MB no app e no portal e 10 MB no e-mail**
   (`apps/api-transportada/src/occurrence-conversation/domain/conversation-attachment.policy.ts:43-46`). O teto da
   gravação é 16 MiB e só pode **baixar** (§2).
4. **Nenhum dos 9 `*.golden.html`** (`src/participant/test-fixtures/`) contém `audio` (contagem 0 em cada um no
   `a7c5c85`), e **todos usam rascunho `'abc'`** (`participantGoldenScenarios.test-helper.tsx:27`): o compositor
   **vazio** — justamente onde o microfone entraria — não tem ouro. A T1.2 congela um antes de qualquer código (§2.4).
5. **O envio já tem o caminho certo**: `useParticipantSend.send(content: { text?, files? })`
   (`useParticipantSend.ts:60-71`, `participantDrafts.ts:30-33`). O áudio entra por ele, **sem método novo na porta**.
   Mas cada chamada gera um `crypto.randomUUID()` novo (`:62`): dois toques síncronos seriam duas mensagens — a
   idempotência do servidor não protege. Daí a trava do §2.1.
6. **O motor não mede nem detecta idioma.** O `whisper-local` devolve `{ text, engine, language }`, e `language` é a
   **dica** pedida (`languageHint`, `'pt'`), não detecção. A duração vem de `ffprobe` no worker, antes do motor (§5.6).

## 1. Contratos — `@adatechnology/conversation-contracts` (minor 0.5.0 → 0.6.0)

Acréscimo em `src/participant.ts` (exportado no `src/index.ts`). Nenhum campo existente muda. **Sem `.strict()`**: as
respostas da visão do participante são _strip_ de propósito ("acrescentar campo é minor", `participant.ts:8`).

```ts
export const PARTICIPANT_TRANSCRIPTION_STATUS = Object.freeze(['pending', 'ready', 'failed', 'disabled'] as const)
export type ParticipantTranscriptionStatus = (typeof PARTICIPANT_TRANSCRIPTION_STATUS)[number]

/** Só o motivo que muda o que o leitor vê. Os demais códigos de falha (RF14) ficam no servidor. */
export const PARTICIPANT_TRANSCRIPTION_FAILURE_REASONS = Object.freeze(['too_long'] as const)

/** Em unidades UTF-16 (o que `.max` do zod conta). O servidor guarda até 20 000 code points (§5.5): ≤ 40 000 UTF-16. */
export const PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16 = 40_000
export const PARTICIPANT_AUDIO_DURATION_MAX_MS = 86_400_000

export const participantTranscriptionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({
    status: z.literal('ready'),
    text: z.string().max(PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16), // '' = nada foi dito (resultado, não falha)
    language: z.string().regex(/^[a-z]{2,3}$/).optional(), // idioma PEDIDO ao motor (dica), não detectado
    engine: z.string().min(1).max(64).optional(), // 'whisper-local'
    generatedAt: z.string().datetime(),
  }),
  z.object({
    status: z.literal('failed'),
    reason: z.enum(PARTICIPANT_TRANSCRIPTION_FAILURE_REASONS).optional(),
    maxDurationMs: z.number().int().positive().optional(), // o teto aplicado; a UI só o usa com reason 'too_long'
  }),
  z.object({ status: z.literal('disabled') }),
])
export type ParticipantTranscription = z.infer<typeof participantTranscriptionSchema>

// participantAttachmentSchema ganha (o resto igual):
durationMs: z.number().int().positive().max(PARTICIPANT_AUDIO_DURATION_MAX_MS).optional(),
transcription: participantTranscriptionSchema.optional(),
```

Regras que os testes da T1.1 prendem:

- **`text` só tem efeito em `ready`**: `{ status: 'pending', text: 'x' }` é aceito e o `text` **é descartado** (não
  aparece no resultado do parse). Idem campo desconhecido em qualquer ramo. `text: ''` em `ready` é válido.
- `failed` com `maxDurationMs` sem `reason`, ou `too_long` sem `maxDurationMs`, é **válido**; a UI só mostra o aviso
  do RF15 com os dois presentes, senão trata como `failed` comum (só o player). Sem `refine`: tolerância, não recusa.
- `status` desconhecido (ex.: um estado futuro) **falha** o `discriminatedUnion` — por isso a validação é **por anexo**
  nos adapters (abaixo), nunca derrubando a página.
- `disabled` é derivado na leitura, nunca gravado (§5.2). Mensagem/anexo sem os campos novos segue válido (ouro de
  parse com o fixture atual).
- O `TranscriptionStatus` do operador (`pending|done|failed|unsupported`) e `ports.ts` **não mudam**.

**Validação nos adapters (obrigatória, T4.2/T5.1):** os dois apps validam a transcrição **por anexo** com
`participantTranscriptionSchema.safeParse(raw.transcription)`; se falhar, o campo **some** daquele anexo e o resto da
página segue (molde `readChannels`, `apps/frontend-driver/src/modules/conversation/shared/driverConversationsMapper.service.ts:81-87`:
"um valor novo da API não pode derrubar a lista inteira"). O mesmo para `durationMs` (inteiro positivo ≤ teto, senão
some).

- **Motorista:** `driverConversationsMapper.service.ts`, no mapeamento de cada anexo.
- **Painel:** a leitura da conversa por assunto passa por `toMessage`
  (`apps/frontend-transportada/src/modules/occurrence-conversation/shared/subjectConversationClient.service.ts:94-108`),
  que chama a guarda **compartilhada** `toConversationAttachments`
  (`conversationAttachment.service.ts:159-181`, lista branca de cinco campos, usada também pela tela antiga). **Essa
  guarda não muda** (a tela antiga continua byte a byte). O `toMessage` da conversa por assunto lê `transcription` e
  `durationMs` **crus** de cada item de `value.attachments`, pelo `id`, e os valida com o schema do contracts (dependência
  direta, `apps/frontend-transportada/package.json:26`), juntando-os ao anexo já guardado; o tipo do anexo da conversa
  por assunto ganha os dois campos opcionais, o da tela antiga não.
- Contrato de cada adapter com a tabela: válido passa; `status` desconhecido, `text` acima do teto, `generatedAt` sem
  fuso, `durationMs` negativo ⇒ campo ausente, página intacta.

**Ordem de publicação:** a da ADR-0081 §9, sem regra extra por motivo novo — com _strip_ e validação por anexo, app
velho com API nova ignora o que não conhece. **`conversation-contracts` e `conversations-ui` sobem juntos nas três
apps (T4.1)**: se só o UI subir, o app fica com duas cópias do contracts e a versão velha descarta os campos em
silêncio. **A API entra na mesma regra** (`devDependency` de teste, §5.2): toda subida do contracts sobe também a da
API, senão a paridade testa o schema velho. O contracts traz `zod ^3` (`conversation-contracts/package.json`), e a API e
o worker usam `zod 4.4.3`: a segunda cópia fica só em `test/**` da API e é inofensiva (o schema é usado só pelo
próprio pacote).

## 2. Capacidade de gravação — `conversations-ui/participant` (minor 0.9.0 → 0.10.0)

```ts
// src/participant/participantAudio.types.ts (exportado por src/participant/index.ts)
export type ParticipantAudioRecordingOptions = {
  /** Só BAIXA o padrão: valor maior é cortado em DEFAULT_MAX_RECORDING_MILLISECONDS (5 min). */
  readonly maxDurationMs?: number
  /** Só BAIXA o padrão: valor maior é cortado em DEFAULT_MAX_RECORDING_BYTES (16 MiB, a política de áudio do app). */
  readonly maxSizeBytes?: number
  /** true de `requesting` até sair de `review`; o app liga no captureRegistry. Nunca recebe o áudio. */
  readonly onCaptureChange?: (isCapturing: boolean) => void
}
export const DEFAULT_MAX_RECORDING_BYTES = 16 * 1024 * 1024
```

- Prop **`audioRecording?: ParticipantAudioRecordingOptions`** em `ConversationThreadProps`,
  `ParticipantConversationsProps` e, por dentro, `ParticipantThreadProps` → `Footer` → `ParticipantComposerProps`.
  **Objeto presente = capacidade**; `{}` liga com os padrões. Nada de `hasX`. Teto efetivo de bytes =
  `min(maxSizeBytes ?? 16 MiB, 16 MiB, maxBytes do canal)`.
- **O microfone aparece só quando TODAS valem:** prop presente **e** `channelCapabilityFor(channel).audio.records`
  **e** `attachments.accepted` **e** o navegador grava (`resolveRecordingFormat() !== undefined` e
  `navigator.mediaDevices?.getUserMedia`) **e** o `type` gravado passa no `acceptedTypes` do host (se houver). O canal
  só **desliga** (portal = `records: false`, ADR-0073); **nunca liga**.
- **Detecção no cliente:** os três apps são SPA sem hidratação; a detecção roda no render do cliente (com guarda
  `typeof window`), e no servidor dá "não grava". A vista continua pura (§2.3) para o ouro.
- **Caminho do arquivo:** interno, `onSendAudio: (file: File) => void` do controlador da thread → o mesmo
  `send({ files: [file] })` dos anexos. Mensagem **própria** de áudio, sem texto; o rascunho de texto **não é tocado**.
  Fila offline, `clientMessageId`/`Idempotency-Key`, bolha local e upload em duas etapas são os de qualquer anexo. **A
  porta `ParticipantConversationsApi` não muda.**
- **Arquivo:** `new File([blob], 'audio-YYYYMMDD-HHmmss.<ext>', { type: format.uploadMimeType })` (UTC;
  `ogg`/`audio/ogg`, `m4a`/`audio/mp4`, `webm`/`audio/webm`). Conferido **antes** de enviar: vazio (`size === 0` ou
  < 500 ms) ⇒ `empty`; acima do teto ⇒ `tooLarge`. Nada sobe.

### 2.1 Máquina de estados — `useParticipantAudioRecorder`

| Estado                                          | Entra por                                         | Sai para                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`                                          | início; enviar; descartar                         | `requesting` (toque no microfone — permissão **só** no toque, RF4)                                                                                          |
| `requesting`                                    | toque                                             | `recording` · `denied` (`NotAllowedError`/`SecurityError`) · `unsupported` (`NotFoundError`/`NotReadableError`/`OverconstrainedError`) · `idle` (cancelado) |
| `recording`                                     | `getUserMedia` resolveu e `MediaRecorder.start()` | `review` (Parar; teto de duração; **interrupção**) · `empty` · `tooLarge` · `idle` (unmount)                                                                |
| `review`                                        | `stop` com blob válido                            | `idle` (Enviar → `onSendAudio`; Descartar; unmount). Interrupção **pausa a reprodução e mantém** a gravação                                                 |
| `denied` · `unsupported` · `empty` · `tooLarge` | falha correspondente                              | `requesting` no próximo toque (a frase fica até lá)                                                                                                         |

- **Interrupção** = `visibilitychange` oculto, `pagehide`, `track.onended`, ou `track.onmute` que **persiste por mais
  de 3 s** (o Android emite `mute` transitório; `unmute` dentro de 3 s cancela). Em `recording`: **para e vai a
  `review`** com o que foi gravado (nunca envia sozinho). Em `review`: **pausa** o player e **mantém** a gravação
  (decisão do dono, 2026-10-11). Isso emenda o RF5.
- **Unmount** (sair da conversa, trocar de assunto — `ConversationThread` remonta por `key`,
  `ConversationThread.tsx:116`): **descarta** em qualquer estado.
- **Token de cancelamento do `getUserMedia`:** cada pedido leva um token; se o `getUserMedia` resolver depois de
  unmount, `pagehide`, oculto ou troca de assunto (token vencido), as trilhas recebidas levam `stop()` **na hora** e o
  estado volta a `idle` — o microfone nunca fica aceso sem gravação visível.
- Em toda saída de `recording`/`review`: `track.stop()` em todas as trilhas e `URL.revokeObjectURL`.
- **Envio (T1.4):** "Enviar áudio" chama `onSendAudio(file)` → `send({ files: [file] })` (§2); o **rascunho de texto e
  `draft.files` ficam intocados**. **Trava** `isSendingRef` (ref, não estado): o segundo toque **síncrono** é ignorado;
  solta quando volta a `idle`. Teste: dois `click()` seguidos no mesmo tick ⇒ **um** `onSendAudio` e **uma** chamada a
  `api.sendMessage` (`useParticipantSend.ts:62` gera `randomUUID` por chamada; a idempotência do servidor não pega).

### 2.2 Desenho do compositor (`.cv-p-*`, sem Tailwind, ícones do `lucide-react` que o pacote já usa)

- **`idle`, campo vazio e sem arquivos:** o microfone **ocupa o lugar do enviar**:
  `button[type=button].cv-p-button.cv-p-button--primary.cv-p-composer__record` (ícone `Mic`, nome `recordAudio`, alvo
  ≥ 44 px por `--cv-p-i-touch`). `type="button"` porque está dentro do `<form>` (um `submit` enviaria o vazio).
  **Desabilitado** quando o compositor está (`disabled`). Com texto ou arquivo: o enviar de hoje, sem mudança.
- **`requesting`:** o mesmo botão com `aria-busy="true"` e `disabled`.
- **`recording`:** a linha (`.cv-p-composer__row`) é trocada por `div.cv-p-recorder` (`role="group"`, `aria-label` =
  `recordingInProgress`): `button.cv-p-recorder__discard` (`Trash2`, `discardAudio`) · `span.cv-p-recorder__dot`
  (`aria-hidden`) · `span.cv-p-recorder__elapsed` (`role="timer"`, `recordingElapsed` = "0:12 of 5:00") ·
  `button.cv-p-button--primary.cv-p-recorder__stop` (`Square`, `stopRecording`). Foco vai ao Parar. O campo não é
  renderizado (o rascunho fica no estado).
- **`review`:** `div.cv-p-recorder.cv-p-recorder--review`: `p.cv-p-recorder__hint` (`reviewAudio`) · Descartar · o
  **mesmo player do §3** sobre o `objectURL` (duração = tempo gravado) · `button.cv-p-button--primary.cv-p-recorder__send`
  (`Send`, `sendAudio`). Foco vai ao Enviar áudio; depois de enviar/descartar, volta ao microfone.
- **Erros:** linha de `idle` + `p.cv-p-composer__error[role=alert]` (classe que já existe) com `microphoneDenied` /
  `recordingUnsupported` / `audioEmpty` / `audioTooLarge`.
- **Bolha pendente** de áudio (fila offline): a mesma de hoje para anexo pendente — nome do arquivo + relógio
  (`ParticipantMessageBubble.tsx:65`). Sem player local de `blob:` na fila (revisável na T7.1).

### 2.3 Vista pura e ouro

A vista é `ParticipantAudioRecorderView({ state, elapsedMs, … })`, separada do hook; os cenários
`composer-audio-{idle,recording,review,denied}` renderizam a vista com estado explícito.

### 2.4 Ouro do compositor vazio (T1.2, **antes de qualquer código**)

1. Congelar contra `origin/main a7c5c85` o cenário **`thread-empty-draft`**: o `thread-default` com
   `draft.value = ''` e `files: []`, sem a prop.
2. Esse arquivo tem de continuar **byte a byte igual** em três renderizações: (a) sem a prop; (b) com
   `audioRecording={{}}` no SSR (`renderToStaticMarkup`, sem `MediaRecorder`); (c) com `audioRecording={{}}`,
   `MediaRecorder`/`getUserMedia` falsos no `globalThis` e `channel = 'portal'`.
3. Teste de DOM (happy-dom) com `MediaRecorder` presente e **sem** a prop: nenhum `.cv-p-composer__record`, nenhum
   botão com nome `recordAudio`.
4. Os 9 ouros existentes: diff vazio.

## 3. Player e transcrição na bolha (sem prop — valem para todo host da visão do participante)

### 3.1 Markup

`ParticipantAttachmentItem` troca **só o ramo `kind === 'audio'`** (`ParticipantAttachmentItem.tsx:57-64`) por:

```html
<div class="cv-p-attachment cv-p-attachment--audio">
  <div class="cv-p-audio" role="group" aria-label="{audioPlayer}: {filename}">
    <button type="button" class="cv-p-audio__toggle" aria-label="{playAudio|pauseAudio}">
      Play/Pause
    </button>
    <input
      type="range"
      class="cv-p-audio__seek"
      aria-label="{audioPosition}"
      min="0"
      max="{s}"
      step="1"
      value="{s}"
      aria-valuetext="{audioPositionValue}"
    />
    <span class="cv-p-audio__time">0:12 / 1:05</span>
    <button type="button" class="cv-p-audio__rate" aria-label="{playbackRate}">1×</button>
    <audio class="cv-p-audio__media" preload="none" src="{url resolvida no mount}"></audio>
  </div>
  <span class="cv-p-attachment__name">{filename}</span>
  <!-- bloco de transcrição (§3.3), só com attachment.transcription válida -->
</div>
```

### 3.2 Player `.cv-p-audio*`

- Tocar/pausar: nome muda com o estado. **Um áudio por vez por conversa** (contexto interno da timeline).
- Barra: **`<input type="range">` nativo estilizado** (teclado, toque e leitor de tela de graça).
- **URL e `src`:** a URL é resolvida **no mount, por `attachment.id`** (efeito com dependência no id; revalidação não a
  troca, RF8), e o `src` é atribuído assim que resolve, com **`preload="none"` sempre** — o navegador não baixa nada
  até tocar, então nenhum GET de mídia por bolha e nenhum dado do motorista gasto sem toque. O toque chama
  **`audio.play()` de forma síncrona** no handler do clique (o Safari do iPhone exige o gesto; nada de `await` antes do
  `play()`). URL ainda não resolvida no toque (caso raro, a resolução é local ao host): o botão fica `aria-busy` e **o
  toque é repetido pelo usuário** — um `play()` disparado depois, de forma assíncrona, perde o gesto no iOS e é recusado.
  O mesmo vale depois de re-resolver uma URL vencida: a retomada pede novo toque se o navegador recusar o `play()`
  (conferido no iPhone na T7.1).
- **Erro de mídia** (`error` do `<audio>`, URL assinada vencida depois de 5 min): re-resolve **uma** vez, troca o
  `src` e retoma da posição.
- Tempo: `durationMs` do servidor quando vier (mostrado sem rede); senão `--:--` até o primeiro toque, e depois
  `loadedmetadata`. Antes da T4 o app não tem `media-src`: com `preload="none"` a bolha não dispara erro de CSP só por
  aparecer.
- **Duração infinita/`NaN`** (WebM do Chromium sem cabeçalho): `aria-valuetext` só com a posição ("0:12"), `max`
  provisório = maior posição já vista (cresce enquanto toca); quando o `durationMs` do servidor chegar, ele vale.
- Velocidade: 1× → 1,5× → 2× → 1×, aplicando `defaultPlaybackRate` **e** `playbackRate`.
- Piso de largura que mantém o tocar visível a 375 px; só tokens existentes (`--cv-p-i-accent`,
  `--cv-p-i-text-muted`, `--cv-p-i-border`, `--cv-p-i-touch`, `--cv-p-i-radius`); `ConversationsTheme` não muda.

### 3.3 Bloco `.cv-p-transcription*`

| `attachment.transcription`                                                  | Markup                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ausente / inválida / `disabled` / `failed` sem os dois campos de `too_long` | **nada** (só o player)                                                                                                                                                                                                             |
| `pending`                                                                   | `p.cv-p-transcription.cv-p-transcription--pending` com `transcribing` ("Transcribing…")                                                                                                                                            |
| `ready`, `text !== ''`                                                      | `div.cv-p-transcription` · `p.cv-p-transcription__text` (selecionável, `lang` = `language`) · `p.cv-p-transcription__notice` (`machineTranscription`) · `button.cv-p-transcription__toggle` (`aria-expanded`) só quando transborda |
| `ready`, `text === ''`                                                      | `p.cv-p-transcription__empty` (`emptyTranscription`) + o aviso de máquina                                                                                                                                                          |
| `failed` + `reason: 'too_long'` + `maxDurationMs`                           | `p.cv-p-transcription.cv-p-transcription--too-long` com `transcriptionTooLong`, `{minutes}` = `floor(maxDurationMs / 60000)`                                                                                                       |

- **Recolher em 6 linhas** (`-webkit-line-clamp: 6`); botão só depois de medir (`scrollHeight > clientHeight`); no
  SSR não há botão. Texto inteiro no DOM.
- Aviso de máquina **junto** do texto (`aria-describedby` do texto para o aviso).
- **Anúncio pela região viva que a thread já tem**, sem nó `aria-live` novo (um nó novo mudaria os 9 ouros): o bloco
  chama `useAnnounceCopy()` e a única região da conversa, `ParticipantThreadLive` (`ParticipantCopyAnnouncer.tsx`,
  `div.cv-p-thread__live[role=status][aria-live=polite]`), fala `transcriptionReady` ("Transcription ready") na troca
  **observada neste mount** de `pending → ready` de um anexo (memória por `attachment.id` num `ref`). Histórico que já
  chega `ready` não anuncia. O texto inteiro não é anunciado.
- Contraste ≥ 4,5:1 do texto e do aviso sobre as duas bolhas e nos dois temas (`participantContrast`).

### 3.4 Mudanças de padrão declaradas no changeset (`conversations-ui`, "Default markup and style change")

1. O `<audio controls>` nativo vira o player `.cv-p-audio` (tocar/pausar, posição, velocidade).
2. `preload="none"` continua, agora sem controles nativos: a URL é resolvida no mount e o `src` atribuído com
   `preload="none"`; nada é baixado antes do toque, e a duração só aparece depois do primeiro toque quando o servidor
   não manda `durationMs`.
3. O nome do arquivo passa a vir **depois** do player.
4. A classe `cv-p-attachment__audio` deixa de ser renderizada (a regra CSS, `styles.css:1327`, fica até a próxima major).
5. Tocar um áudio pausa o outro da mesma conversa.
6. Rótulos novos, opcionais, com default em inglês (§4): host que não traduz mostra inglês.

E no changeset do `conversation-contracts`: `durationMs` e `transcription` opcionais, _strip_, validação por anexo
recomendada.

## 4. Rótulos novos em `ParticipantConversationsLabels`

Todos **opcionais** no tipo (molde `messageOptions?`, `participantLabels.ts:43`): host que tipa o mapa inteiro ou faz
`satisfies (keyof ParticipantConversationsLabels)[]` (`subjectThreadLabels.service.ts:47` do painel) não quebra.
Defaults em `DEFAULT_PARTICIPANT_CONVERSATIONS_LABELS` **e** em `DEFAULT_PARTICIPANT_AUDIO_LABELS` exportado; leitura
interna por `resolveParticipantAudioLabels(labels)` (`labels.x ?? DEFAULT.x`). Placeholders por função interna.

| Chave                      | Default (en)                                                 | Onde aparece                                    |
| -------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `recordAudio`              | Record audio                                                 | microfone                                       |
| `recordingInProgress`      | Recording                                                    | grupo em `recording`                            |
| `stopRecording`            | Stop recording                                               | Parar                                           |
| `recordingElapsed`         | {elapsed} of {limit}                                         | relógio                                         |
| `reviewAudio`              | Listen before sending                                        | dica/grupo em `review`                          |
| `sendAudio`                | Send audio                                                   | Enviar áudio                                    |
| `discardAudio`             | Discard audio                                                | Descartar                                       |
| `microphoneDenied`         | No permission to use the microphone.                         | `denied`                                        |
| `recordingUnsupported`     | This device cannot record audio.                             | `unsupported`                                   |
| `audioEmpty`               | Nothing was captured by the microphone.                      | `empty`                                         |
| `audioTooLarge`            | Audio too large to send.                                     | `tooLarge`                                      |
| `audioPlayer`              | Audio                                                        | grupo do player                                 |
| `playAudio` / `pauseAudio` | Play audio / Pause audio                                     | tocar/pausar                                    |
| `audioPosition`            | Audio position                                               | nome do range                                   |
| `audioPositionValue`       | {position} of {duration}                                     | `aria-valuetext` (sem duração: só `{position}`) |
| `playbackRate`             | Playback speed {rate}                                        | velocidade                                      |
| `transcribing`             | Transcribing…                                                | `pending`                                       |
| `transcriptionReady`       | Transcription ready                                          | região viva                                     |
| `machineTranscription`     | Transcription generated by machine                           | aviso                                           |
| `emptyTranscription`       | Nothing was said in the audio                                | `ready` vazio                                   |
| `transcriptionTooLong`     | Transcription only for audios shorter than {minutes} minutes | `too_long`                                      |
| `showFullTranscription`    | Show all                                                     | expandir                                        |
| `collapseTranscription`    | Show less                                                    | recolher                                        |

**A T4.1 já leva todas as chaves do player e da transcrição para os `.locale.json` das três apps** (pt-BR e en; o
player aparece para todo host na subida de versão, antes de qualquer gravação ligada): nada de "Play audio" em inglês
em produção. As do gravador entram na T4.3/T5.1, inclusive na lista `satisfies` do painel.

## 5. API e worker

### 5.1 Configuração por empresa

`GET` e `PUT /company-settings/audio-transcription` (`API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH` em
`shared/api.constant.ts`), política `{ permission: 'settings.manage', scope: 'company' }` nas duas (molde
`companies/presentation/location-retention-settings.routes.ts:30,55-80`), `no-store`.

- `PUT` corpo `{ enabled: boolean }` `.strict()` (requisição é fronteira; `companyId` nunca do corpo). Resposta das
  duas: `{ data: { enabled: boolean, maxDurationMs: number, updatedAt: string | null } }`, lista branca. `updatedAt`
  `null` enquanto nenhuma pessoa mudou. `maxDurationMs` de `AUDIO_TRANSCRIPTION_MAX_DURATION_MS` no schema de env da
  API (padrão 600 000; mesmo valor do worker por uma variável em `.railway/railway.ts`).
- **Sem linha = ligada.** Erros: `400` corpo inválido; `401`/`403` como toda rota com política.
- **Escrita (molde `drizzle-location-retention-settings.repository.ts:70-82,165-182`):** numa transação, lê a linha
  atual `FOR UPDATE` (valor anterior para a auditoria), faz _upsert_ (`insert … onConflictDoUpdate`) e, **só se o valor
  mudou**, grava `audit_logs` com ator, empresa, `beforeSnapshot`/`afterSnapshot` `{ enabled }`, **`correlationId` e
  `metadata.ipAddress`**. `updated_at` e `enabled_since` usam o **`now()` do banco** (nunca o relógio da API), e a
  rotina compara com o `now()` do banco também. `PUT` igual ao atual: nada muda, nada audita.

### 5.2 Campos nos anexos das rotas por assunto

Só nos quatro casos de uso por assunto: `list-my-subject-messages.use-case.ts:47-64`,
`reply-my-subject-conversation.use-case.ts:144`, `list-office-subject-messages.use-case.ts:39-50` e
`send-office-subject-message.use-case.ts:135`. Anexo de **áudio** (`contentType` `audio/*`) ganha `durationMs?` e
`transcription?` (forma do §1). Enriquecimento **separado, depois** de `signConversationAttachments` — nunca dentro dele
nem de `readConversationAttachments` (§6).

- **Consultas (constantes por página, sem N+1):** página sem anexo de áudio ⇒ nenhuma. Com áudio ⇒ (1) `enabled` da
  empresa (`select enabled from company_audio_transcription_settings where company_id = $1`; sem linha = `true`) —
  consulta **própria**, para que empresa desligada **sem nenhuma linha de transcrição** ainda dê `disabled`; (2) só se
  `enabled`, as linhas por `attachmentIds` (`inArray`). Provado na integração por contagem.
- **Mapper puro `toParticipantTranscription(row | undefined, enabled)`:**

| Situação                             | Saída                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| anexo não é áudio                    | campo ausente                                                                                                               |
| empresa desligada (com ou sem linha) | `{ status: 'disabled' }`                                                                                                    |
| sem linha                            | ausente                                                                                                                     |
| `pending`                            | `{ status: 'pending' }`                                                                                                     |
| `ready`                              | `{ status: 'ready', text, generatedAt: toISOString() }` + `language` só se casar `/^[a-z]{2,3}$/` + `engine` só se não nulo |
| `failed` + `too_long`                | `{ status: 'failed', reason: 'too_long', maxDurationMs }`                                                                   |
| `failed` com qualquer outro código   | `{ status: 'failed' }`                                                                                                      |
| `purged`                             | ausente                                                                                                                     |

Nulos **nunca** viram `null` no JSON: chave omitida. `durationMs` = `attachments.duration_ms ??
transcriptions.audio_duration_ms`, só se inteiro positivo. Objeto `deleted` nem chega aqui
(`drizzle-conversation-attachment.repository.ts:157`).

- **A API não depende de `conversation-contracts` em produção.** Decisão: **tabela espelhada** em
  `occurrence-conversation/domain/participant-transcription.constant.ts` (estados, motivo `too_long`, teto de 40 000
  UTF-16, regex do idioma, `generatedAt` sempre por `toISOString()`) + **contrato de paridade** que importa
  `participantTranscriptionSchema` e faz `parse` de cada saída do mapper e de cada linha da tabela de casos. Para isso o
  pacote entra só como **`devDependency` em versão exata** da API, importado **apenas** por `test/**` (um contrato de
  texto de fonte proíbe import em `src/**`). Justificativa do code-standart §13: pacote nosso, publicado, ativo,
  tipagem nativa, zod, compatível com Bun, sem I/O; é a fonte da verdade da forma, então ler dele é o único jeito de a
  paridade não envelhecer. Alternativa descartada: dependência de produção (acopla o deploy da API à versão do pacote
  só para validar a própria saída).
- Áudio recém-enviado (sem linha até o próximo ciclo) sai **ausente**, não `pending`: a API não sabe se a rotina está
  instalada (RF16).

### 5.3 Como o app do motorista fica sabendo que a transcrição mudou — **`transcriptionUpdatedAt` no resumo**

O refresh de 15 s do app só revalida a conversa cujo resumo mudou em `lastMessageAt`, `unreadCount` ou `officeReadAt`
(`apps/frontend-driver/src/modules/conversation/shared/conversationSnapshot.service.ts:22-42`); `pending → ready` não
mexe em nenhum. **Decisão:** o resumo de `GET /me/trips/current/conversations` (e de `POST …/open`) ganha
`transcriptionUpdatedAt?` (ISO) = `max(updated_at)` das transcrições da conversa, aditivo como o `officeReadAt` da
T5.5 (só da API e do app; o schema do contracts não o conhece). O `diffConversationSnapshots` passa a comparar também
esse campo (T4.2). Ausente quando não há transcrição.

- **`conversation_id` desnormalizado** na tabela de transcrições (copiado da mensagem do anexo ao criar a linha; FK
  composta com `company_id`), com índice `(company_id, conversation_id, updated_at)`: a consulta, que roda a cada 15 s
  por motorista, é **uma** agregação `group by conversation_id` com `inArray` das conversas da página, sem junção com
  mensagens e anexos.
- **Toda escrita que muda o que a API expõe** (`status`, `text`, `audio_duration_ms`, `max_duration_ms`, expurgo) faz
  **`updated_at = now()`**; sem isso o `max(updated_at)` não muda. A reivindicação (lease/tentativas) não precisa.
- **Limitações aceitas:** (a) desligar/religar a empresa não mexe nas linhas, então o app só vê `disabled` (ou a volta
  do texto) na próxima mudança real da conversa ou ao reabri-la; (b) como o `officeReadAt`, só a **primeira página** do
  resumo entra no snapshot. O painel relê a conversa aberta a cada 15 s (`SUBJECT_CONVERSATION_REFETCH_MS`) e não
  precisa do campo.

### 5.4 Fila offline do app com áudio (D13)

Hoje o outbox de conversa (`conversationOutbox*.service.ts`) não tem teto. O contrato fixa
`CONVERSATION_OUTBOX_LIMIT = { maxCount: 100, maxFileBytes: 48 MiB }`, conferido **antes** de gravar (molde
`driver-trip/shared/offlineQueue.service.ts:78-83`, `EVENT_QUEUE_LIMIT`):

- **`maxFileBytes` vale só para mensagem com arquivo** (soma dos arquivos já na fila + os novos). **Texto entra sempre**
  até `maxCount`: o motorista sem sinal deixa um "cheguei" mesmo com a cota de áudio cheia.
- Acima do teto, ou `QuotaExceededError` do IndexedDB capturado na escrita: a mensagem **não** entra na fila, a bolha
  local fica `failed` ("falhou — tocar para reenviar") e o app mostra "Fila cheia: conecte-se para enviar o que já está
  esperando." (`conversation.locale.json`, chave `outboxFull`). Nunca um erro cru.
- **A mensagem recusada fica só em memória**: tocar para reenviar funciona enquanto a página está aberta; **recarregar
  a perde**. Limitação declarada aqui e no `CLAUDE.md` do app (T4.4).

### 5.5 Tabelas (insumo da T2.1; o plano § c vale, com estes ajustes)

- `occurrence_conversation_audio_transcriptions`, além do plano: **`conversation_id uuid not null`** (§5.3) com índice
  `(company_id, conversation_id, updated_at)`; **`lease_token uuid`** (nulo fora de posse); **`max_duration_ms
integer`** (teto aplicado, só em `too_long`: `check ((coalesce(failure_code, '') = 'too_long') = (max_duration_ms is
not null))`); `check (text is null or char_length(text) <= 20000)` — **20 000 code points** (`char_length` conta
  caracteres), e o worker corta por code point (`Array.from(text).slice(0, 20000)`, em fronteira de palavra); no JSON
  isso cabe nos 40 000 UTF-16 do contrato (teste com emoji/astral). `failure_code` (CHECK de lista fechada) = RF14
  **+ `company_disabled`**.
- `company_audio_transcription_settings`: `company_id` PK/FK, `enabled boolean not null default true`,
  `enabled_since timestamptz not null default now()`, **`routine_started_at timestamptz`** (nulo até a rotina ver a
  empresa), `updated_by_user_id uuid` (nulo = criada pela rotina), `updated_at`.
- **Índice parcial novo em `occurrence_conversation_attachments`**: `(created_at) where content_type like 'audio/%'`
  — a descoberta varre os anexos de áudio recentes a cada ciclo.

### 5.6 Rotina `conversation.audio.transcribe` (insumo da T3.3/T3.4)

1. **Marco (D9):** no início do ciclo, `insert … select id, true, now(), now() from companies on conflict do nothing`
   (empresas sem linha) e `update … set routine_started_at = now() where routine_started_at is null` (linha criada por
   `PUT` antes de a rotina existir).
2. **Varredura de esgotados:** `update … set status = 'failed', failure_code = 'attempts_exhausted', lease_token =
null, updated_at = now() where status = 'pending' and attempts >= 3 and (lease_expires_at is null or
lease_expires_at < now())` — o áudio que derruba o processo a cada tentativa não gira para sempre.
3. **Descoberta:** cria `pending` com `insert … on conflict (company_id, attachment_id) do nothing` para anexo
   `audio/*` sem linha, de empresa `enabled`, com `attachment.created_at >= greatest(enabled_since,
routine_started_at)` **e** `attachment.created_at >= now() - AUDIO_TRANSCRIPTION_RECOVERY_WINDOW` (**janela de
   recuperação**, env do worker, padrão **72 h**; regra de produto nova, ver D9 e §8).
4. **Reivindicação por linha:** dentro do lote, **uma linha de cada vez** (reivindica, processa, reivindica a
   seguinte), cada uma com o próprio lease: `update … set lease_token = gen_random_uuid(), lease_expires_at = now() +
LEASE, attempts = attempts + 1 where id = (select id … where status = 'pending' and attempts < 3 and
next_attempt_at <= now() and (lease_expires_at is null or lease_expires_at < now()) order by next_attempt_at limit
1 for update skip locked) returning …`. **`attempts` sobe na reivindicação** (processo morto também conta).
   **`LEASE` cobre todas as etapas da linha**: `AUDIO_TRANSCRIPTION_TIMEOUT_MS` + 15 s (`ffprobe`) + 60 s
   (decodificação) + 60 s (download) + 60 s de margem. Sem isso, na 3ª tentativa o lease venceria durante uma medida
   longa, a varredura do passo 2 marcaria `attempts_exhausted` e o resultado bom seria descartado (a escrita final
   exige o `lease_token`).
5. **Por linha** (toda escrita `where id = $id and lease_token = $token`; 0 linhas = perdeu a posse, descarta o
   resultado): empresa desligada ⇒ `failed`/`company_disabled` sem motor; objeto `deleted` ⇒ `purged`; baixa pela linha,
   confere `sha256`; **mede com `ffprobe`** (vem no `apk add ffmpeg`), **com timeout próprio** (padrão 15 s) sobre
   arquivo que pode ser hostil; sem duração no cabeçalho (WebM do Chromium) ⇒ decodifica com `ffmpeg -t <teto + 1 s>
-f null -`, **também com timeout** (padrão 60 s), e mede o que decodificou; estouro de timeout na medida é
   retriável (`engine_timeout`, conta tentativa); `duração >= teto` ⇒ `failed`/`too_long` com `max_duration_ms`, **sem
   chamar o transcritor**; grava `audio_duration_ms` em todo caso medido; só então o motor com `languageHint: 'pt'`;
   `ready` grava `text` **sem U+0000** (o `text` do Postgres recusa NUL) e cortado (§5.5), `language` = a dica,
   `engine`, `model`, `processing_ms`, `generated_at = now()`.
6. **Erro:** retriável ⇒ `pending`, `next_attempt_at` = 1 / 5 / 30 min conforme `attempts`; com `attempts >= 3` ⇒
   `failed`/`attempts_exhausted`. Definitivo ⇒ `failed` com o código. Alerta conta `failed` **exceto**
   `company_disabled`.
7. **Expurgo:** `ready` com objeto `deleted` ⇒ `text = null`, `purged`.
8. Toda mudança de `status`/`text`/duração/teto: `updated_at = now()` (§5.3).

### 5.7 Emenda de `company_disabled`

D4 proíbe gravar `disabled` (é derivado). A pendente encerrada porque a empresa desligou vira **`failed` com código
`company_disabled`** — gravada como falha, mostrada como `disabled` enquanto desligada e como `failed` comum (só o
player) depois de religar, o que é exatamente "sem backfill". Emendados RF14 e os Casos extremos da spec.

### 5.8 A transcrição não segura as outras rotinas — **executor dedicado em processo**

O consumidor de job-run é serial: espera o ciclo da rotina terminar antes do `ack`
(`apps/worker-transportada/src/runtime/job-run-consumer.service.ts:57`), com `WORKER_PREFETCH` padrão 1
(`environment.schema.ts:153`). Uma transcrição de minutos dentro do ciclo seguraria canhoto, planta e prévia pelo tempo
dela. **Decisão:** o ciclo da rotina `conversation.audio.transcribe` faz só os passos 1–3 (rápidos, SQL) e **entrega**
ao `AudioTranscriptionRunner`, um executor em processo com **trava de uma execução** (_single-flight_). O executor
processa os passos 4–8 **uma linha por vez** até esvaziar o lote ou atingir `AUDIO_TRANSCRIPTION_BATCH_SIZE`. O motor
roda em processo filho; o executor não promete CPU livre para as outras rotinas — só tira a transcrição do ciclo
serial. O impacto em CPU é medida da T0.2.

**Catálogo (as três cópias + o painel).** O job entra, com contrato de paridade entre elas, em
`apps/api-transportada/src/shared/job-catalog.constant.ts` (sem ele a tela de job-run não o conhece),
`apps/cron-transportada/src/shared/job-catalog.constant.ts` (sem ele **nunca é agendado**) e
`apps/worker-transportada/src/shared/job-catalog.constant.ts`, e o rótulo em
`apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts` (ao lado de `trip.canhoto.read`, `:248`).
**Desfechos na lista fechada** do job (`isJobOutcome`, `apps/worker-transportada/src/job-run/application/run-job-cycle.ts:176`;
fora dela vira `job_run_outcome_unknown` → `unexpected_error` a cada ciclo ocupado): `completed` (entregou, ou não havia
nada), `already_running` (executor ocupado; não é falha) e `runner_lock_expired` (trava velha, abaixo). Cada desfecho
tem rótulo pt-BR/en no painel.

**Erros e contadores.**

- O executor captura e registra **todo** erro (log estruturado só com ids, estado e código); nunca deixa rejeição
  solta. Erro fora de uma linha (banco caiu no meio) encerra a execução com `runnerError = 1`.
- Ele guarda em memória o resumo da execução que terminou (`processed`, `ready`, `failed`, `runnerError`); **o ciclo
  seguinte** grava esse resumo nos contadores do job-run dele e o zera. O job-run da entrega registra `claimable`
  (quantas linhas havia para reivindicar).
- **Idade máxima da trava** = `AUDIO_TRANSCRIPTION_BATCH_SIZE × LEASE` (§5.6). O ciclo que encontra a trava mais velha
  que isso registra `audio_transcription_runner_lock_expired` em nível de erro, solta a trava e devolve
  `runner_lock_expired` (a próxima execução começa no ciclo seguinte). Duas execuções simultâneas não corrompem nada:
  toda escrita exige o `lease_token` da linha.

**Parada pedida pelo operador** (`heartbeat.isStopRequested()`, `run-job-cycle.ts:192`): vale **só para o ciclo**
(passos 1–3), como em toda rotina. **Não** é ligada ao executor: quando ela chega, o job-run da entrega já fechou, e a
transcrição em curso tem prazo próprio (timeout do motor) e não vale matar no meio. Quem quer parar de transcrever
desliga a empresa (§5.1) ou tira `AUDIO_TRANSCRIPTION_MODEL_PATH` (a rotina deixa de ser registrada).

**Desligamento do worker.** O executor entra nos `closeables` do `WorkerShutdown`
(`apps/worker-transportada/src/runtime/worker-shutdown.service.ts:40-46`), que fecham **antes** do provedor e do banco.
`close()`: para de reivindicar, aborta o processo filho (`AbortSignal`) e solta a linha em curso com `update … set
status = 'pending', lease_token = null, lease_expires_at = null, attempts = attempts - 1 where id = $id and lease_token
= $token` — **a soltura graciosa devolve a tentativa**, senão três deploys seguidos esgotariam um áudio. Morte sem
`SIGTERM` (OOM, `kill -9`) não devolve: a tentativa conta, como deve.

- **Por que não as outras saídas:** fila/consumidor RabbitMQ dedicado exige topologia nova e outro trilho de retry para
  o que a tabela já resolve; orçamento de tempo por ciclo não ajuda (uma transcrição de 5 min não se divide); prefetch
  maior com trava por rotina muda o comportamento de **todas** as rotinas do worker.
- **Testes (T3.3):** transcritor falso que só termina quando o teste solta: com ele preso, um job-run de
  `trip.canhoto.read` publicado depois é confirmado **antes** de a transcrição terminar; um segundo ciclo devolve
  `already_running` (desfecho conhecido, não `unexpected_error`); o ciclo seguinte ao fim grava os contadores da
  execução anterior; trava velha ⇒ `runner_lock_expired` + log de erro; erro lançado pelo transcritor falso não vira
  rejeição solta; `close()` com uma linha em posse ⇒ `pending` com `attempts` devolvido; lease cobre uma medida longa
  na 3ª tentativa sem a varredura descartar o resultado; contrato de paridade das três cópias do catálogo e do rótulo
  do painel.

## 6. D12 — a tela antiga da ocorrência **não** usa o mesmo serializador

- Tela antiga: `createListOccurrenceConversationsUseCase` (`read-occurrence-conversations.use-case.ts:30-59`) lê por
  `reader.findAttachments` (ligado em `main.ts:3319`) e assina com `signConversationAttachments` (`:39-47`). Rotas por
  assunto: casos de uso próprios (`list-my-subject-messages.use-case.ts:47-64`, `list-office-subject-messages.use-case.ts:39-50`).
- Compartilhado é só a base: `signConversationAttachments` (`conversation-attachment.service.ts:239-266`) e
  `readConversationAttachments` (`drizzle-conversation-attachment.repository.ts:136-170`), usados também pelas rotas
  antigas do motorista (`driver-conversation.use-case.ts:204`) e pelo portal (`contractor-portal-conversation.use-case.ts:212`,
  lista branca em `toPortalAttachment`, `:95-102`).
- **Conclusão:** a tela antiga fica **sem** transcrição, e a transcrição **não** entra na base compartilhada. O ouro
  das rotas `/me/.../occurrences/**` e `/client/**` prova (T2.2).

## 7. Decisão → razão → alternativa descartada

| Decisão                                                                                    | Razão                                                                                       | Alternativa descartada                                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Transcrição em `discriminatedUnion` **sem `.strict()`** + validação por anexo nos adapters | Resposta é _strip_ por desenho (`participant.ts:8`); campo/estado novo não derruba a página | `.strict()` (rev. 1): qualquer campo novo quebrava o parse da página inteira e prendia a ordem de publicação |
| Expor só `reason: 'too_long'` (+ `maxDurationMs`)                                          | É o único motivo que muda a tela (RF15)                                                     | Expor os códigos do worker: acopla o app ao worker                                                           |
| `maxDurationMs` gravado na linha                                                           | O número da frase é o teto aplicado àquele áudio                                            | Número fixo no locale                                                                                        |
| `disabled` derivado; desligamento grava `company_disabled`                                 | Religar mostra de novo sem reescrever histórico; sem backfill                               | Gravar `disabled` (D4 proíbe)                                                                                |
| Duração por `ffprobe` antes do motor                                                       | `too_long` sem gastar CPU; o motor não mede                                                 | Usar duração devolvida pelo motor (não existe)                                                               |
| Prop `audioRecording?` que só o canal desliga                                              | Ausência = capacidade; portal nunca grava                                                   | Ligar pela capacidade do canal (mudaria o compositor dos ouros)                                              |
| Áudio pelo `send({ files })` interno + trava por ref                                       | Fila, idempotência e upload já existem; o `randomUUID` por chamada exige a trava            | Callback para o host                                                                                         |
| `review` pausa ao trocar de aba; `recording` interrompido vai a `review`                   | Decisão do dono: o recado gravado não se perde por uma chamada ou troca de app              | Descartar (rev. 1)                                                                                           |
| Microfone no lugar do enviar, `type=button`                                                | Padrão conhecido; dentro do form um `submit` enviaria vazio                                 | Botão fixo a mais na linha de 375 px                                                                         |
| `<input type="range">` no player                                                           | Acessibilidade nativa                                                                       | `div role=slider` com teclado próprio                                                                        |
| `transcriptionUpdatedAt` no resumo do motorista                                            | Reaproveita o diff de snapshot que já existe (T5.5); uma consulta por página                | Reler a thread aberta enquanto houver `pending`: só cobre a thread aberta e é mais um laço de polling        |
| `enabled_since` + `routine_started_at` por empresa, janela de 72 h                         | Cobre religar, `PUT` antes da rotina e rotina que volta depois de dias                      | Constante da migration                                                                                       |
| Duas consultas constantes (configuração, depois linhas)                                    | Empresa desligada sem linha de transcrição dá `disabled`                                    | Junção a partir das linhas (perde o `enabled` quando não há linha)                                           |
| `lease_token` + `attempts` na reivindicação                                                | Só quem tem a posse grava; processo morto conta tentativa                                   | Só `lease_expires_at`                                                                                        |
| Teto do outbox 100 itens / 48 MiB, recusa antes de gravar                                  | Áudio enche o IndexedDB do iPhone; nunca `QuotaExceededError` cru                           | Fila sem teto                                                                                                |
| contracts e UI sobem juntos                                                                | Duas cópias do contracts descartam os campos em silêncio                                    | Subir só o UI                                                                                                |
| Leitura do painel no `toMessage` da conversa por assunto, guarda compartilhada intocada    | A tela antiga continua byte a byte                                                          | Ampliar `toConversationAttachments` (mudaria a tela antiga)                                                  |
| Tabela espelhada na API + paridade contra o contracts como `devDependency` só de teste     | A paridade lê a fonte da verdade e não envelhece; produção não acopla à versão do pacote    | Dependência de produção; tabela espelhada sem paridade                                                       |
| `conversation_id` desnormalizado + `updated_at` em toda mudança exposta                    | `transcriptionUpdatedAt` a cada 15 s por motorista sem junção                               | Juntar mensagens → anexos → transcrições a cada refresh                                                      |
| Executor em processo com trava de uma execução                                             | Canhoto, planta e prévia não esperam uma transcrição de minutos                             | Fila RabbitMQ dedicada; orçamento por ciclo; prefetch maior                                                  |
| Varredura de `attempts >= 3` + reivindicação filtrando `attempts < 3`, lease por linha     | Áudio que mata o processo não gira para sempre; o lease cobre só a linha em curso           | Lease único para o lote                                                                                      |
| Teto de bytes do outbox só para mensagem com arquivo                                       | O "cheguei" de texto sempre entra                                                           | Teto de bytes para tudo                                                                                      |
| Região viva existente (`useAnnounceCopy`)                                                  | Nó `aria-live` novo mudaria os 9 ouros                                                      | Região própria do bloco de transcrição (rev. 2)                                                              |
| URL no mount + `preload="none"` + `play()` síncrono                                        | Zero download sem toque; Safari exige o gesto                                               | Resolver a URL no toque (o `await` perde o gesto no iOS)                                                     |

## 8. O que a T0.1 não fecha

Nenhuma pergunta é só do dono (as dele estão na spec e na decisão de 2026-10-11 sobre `review`). Ficam para medida ou
para a task dona:

1. **Cadência real do agendador** e o atraso até o "Transcrevendo…" (≤ 1 ciclo) — T0.2.
2. **Teto de duração:** se a T0.2 baixar, só em **minutos inteiros** (a frase usa `floor(ms / 60000)`).
3. **Janela de recuperação de 72 h** (`AUDIO_TRANSCRIPTION_RECOVERY_WINDOW`): é **regra de produto nova** — estreita o
   D6 ("todo áudio") para "todo áudio de até 72 h quando a rotina o encontra". Registrada no D9; **confirmar com o dono
   antes da publicação em produção** (não bloqueia a Fase 1). O **teto do outbox (100 itens / 48 MiB de arquivo)** é
   valor inicial, conferido na T6.3 e na T7.1 (iPhone).
4. **Formato e duração no Safari do iPhone**; `track.onmute` numa chamada real — T7.1.
5. **Bolha pendente sem player local** — revisão de design (T7.1).
6. **Modelo, RAM, tempo** — T0.2 (ADR-0103).

## 9. Achado da revisão → onde ficou resolvido

| Achado                                                                                                                              | Onde                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| H1 `.strict()` na transcrição; validação por anexo; mapper da API                                                                   | §1 (schema, regras, adapters, ordem), §5.2 (mapper, nulos, `language`, contrato espelhado), §5.5 (UTF-16 × `char_length`) |
| H2 o app do motorista não percebe `pending → ready`                                                                                 | §5.3 (`transcriptionUpdatedAt`), tasks T2.3/T4.2                                                                          |
| H3 duração por `ffprobe`; `language` é dica                                                                                         | §0.6, §5.6 passo 4, plan § d, tasks T3.3                                                                                  |
| H4 ouro do compositor vazio                                                                                                         | §0.4, §2.4, tasks T1.2                                                                                                    |
| M1 mudanças de padrão no changeset; locales na T4.1                                                                                 | §3.4, §4 (fim), tasks T4.1                                                                                                |
| M2 região viva persistente, `input range`, duração infinita, `type=button`/desabilitado                                             | §3.2, §3.3, §2.2                                                                                                          |
| M3 token de cancelamento, `onended`/`onmute`, `review` pausa, `recording` → `review`                                                | §2.1, spec RF5                                                                                                            |
| M4 trava de envio por ref                                                                                                           | §2.1, §0.5                                                                                                                |
| M5 teto do outbox e `QuotaExceededError`                                                                                            | §5.4, tasks T4.2                                                                                                          |
| M6 `maxSizeBytes` só baixa; política real da API                                                                                    | §0.3, §2                                                                                                                  |
| M7 upsert com `FOR UPDATE`, auditoria com IP/correlationId, `now()` do banco, `PUT` antes da rotina, janela, consulta do `disabled` | §5.1, §5.2, §5.5, §5.6                                                                                                    |
| M8 `lease_token`, `attempts` na reivindicação, `on conflict do nothing`                                                             | §5.5, §5.6, plan § c/§ d, tasks T3.3                                                                                      |
| LOW `company_disabled` × D4                                                                                                         | §5.7, spec RF14 e Casos extremos                                                                                          |
| LOW SPA na detecção, vista pura                                                                                                     | §2 (detecção), §2.3                                                                                                       |
| LOW contracts e UI juntos                                                                                                           | §1 (ordem), tasks T4.1                                                                                                    |
| LOW `media-src` antes da T4                                                                                                         | §3.2 (`preload="none"`)                                                                                                   |

## 10. Revisão 3 — item → onde ficou resolvido

| Item                                                                                                                                                   | Onde                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| A. `tasks.md` alinhado ao contrato (T1.1, T1.3–T1.7 citam a seção)                                                                                     | tasks T1.1 (§1), T1.3 (§2.1), T1.4 (§2, §2.1), T1.5 (§3.2), T1.6 (§3.3, §4), T1.7 (§3.4) |
| A. `plan.md` § a/§ b corrigidos (sem `.strict()`/`refine`, sem `draft.files`, interrupções, `preload="none"`, `input range`, `playAudio`/`pauseAudio`) | plan § a, § b                                                                            |
| A. spec: `.strict()` só em requisição; D9 com o marco decidido                                                                                         | spec RNF Segurança, D9                                                                   |
| B. Região viva existente, sem nó novo                                                                                                                  | §3.3 (`useAnnounceCopy` → `ParticipantThreadLive`)                                       |
| B. URL no mount, `preload="none"`, `play()` síncrono, re-resolver em erro                                                                              | §3.1, §3.2, §3.4 item 2                                                                  |
| B. Painel lê no `toMessage`, guarda compartilhada intocada                                                                                             | §1 (Validação nos adapters)                                                              |
| B. API sem dependência de produção do contracts                                                                                                        | §5.2 (tabela espelhada + paridade como `devDependency` de teste)                         |
| B. `updated_at` em toda mudança exposta; limitações; `conversation_id` desnormalizado                                                                  | §5.3, §5.5, §5.6 passo 8                                                                 |
| C1. `attempts < 3` + varredura; lease por linha; sem U+0000; timeout no `ffprobe`/`ffmpeg`                                                             | §5.6 passos 2, 4, 5                                                                      |
| C2. Consumidor serial                                                                                                                                  | §5.8 (executor em processo, trava de uma execução, teste com o canhoto)                  |
| C3. Outbox: bytes só para arquivo; recusada só em memória                                                                                              | §5.4                                                                                     |
| Índice parcial de áudio em `attachments`                                                                                                               | §5.5, tasks T2.1                                                                         |
| Janela de 72 h configurável, regra nova, confirmar com o dono                                                                                          | §5.6 passo 3, §8 item 3, spec D9                                                         |
| `onmute` só conta se persistir > 3 s                                                                                                                   | §2.1                                                                                     |

## 11. Revisão 4 (ressalvas da aprovação) — item → onde ficou resolvido

| Item                                                                                                  | Onde                                                                  |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Job nas três cópias do catálogo + rótulo do painel, com paridade                                      | §5.8 (Catálogo), tasks T3.4                                           |
| `already_running` e `runner_lock_expired` na lista fechada de desfechos                               | §5.8, tasks T3.3/T3.4                                                 |
| Executor registra todo erro; contadores da execução anterior no ciclo seguinte; idade máxima da trava | §5.8 (Erros e contadores)                                             |
| Parada do operador                                                                                    | §5.8: só o ciclo; não interrompe a transcrição em curso (justificado) |
| `closeables` do `WorkerShutdown`; soltura graciosa devolve a tentativa                                | §5.8 (Desligamento do worker)                                         |
| Lease cobre as medidas                                                                                | §5.6 passo 4 (`LEASE`)                                                |
| plan § d alinhado (uma linha por vez, sem premissa de CPU livre, alerta exceto `company_disabled`)    | plan § d                                                              |
| `play()` após URL não resolvida/vencida pede novo toque; conferir no iPhone                           | §3.2, tasks T7.1                                                      |
| A API entra na regra "contracts sobe junto"; zod ^3 × 4.4.3                                           | §1 (Ordem de publicação), tasks T4.1                                  |
