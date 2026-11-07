/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T9: **o motorista fala com o bot por áudio.** O áudio que o bot aceita (no grupo ou na
 * conversa individual) é baixado do provedor, transcrito pelo worker e mostrado de volta como texto.
 * Nada anda com o texto do áudio sem a confirmação da pessoa: "1 - Sim" segue o fluxo **como se ela
 * tivesse digitado aquele texto**; "2 - Não" descarta. Qualquer outra mensagem dela também descarta o
 * áudio pendente e segue normalmente (ela preferiu escrever).
 *
 * O áudio pendente vive na memória do processo, por conversa, por 10 minutos: a API roda uma réplica
 * (`.railway/railway.ts`), e perder um pendente num deploy só faz a pessoa mandar de novo.
 *
 * O webhook nunca espera a transcrição: `receive` responde "recebi" e devolve; baixar, transcrever e
 * perguntar acontecem fora dele.
 *
 * ⚠️ Nada de texto transcrito, número ou id de grupo em log: só empresa, motivo e tamanho.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import { runOutsideWhatsAppTurn } from '../../whatsapp-commands/application/whatsapp-turn-replies.service.js'

export type BotAudioTranscriberPort = {
  /** O texto do áudio (pode vir vazio). Falha lança. */
  transcribe(input: { readonly audio: Uint8Array; readonly mimeType: string }): Promise<string>
}

/** Duração máxima aceita (o WhatsApp informa os segundos do áudio de voz). */
export const BOT_AUDIO_MAX_SECONDS = 120
const PENDING_TTL_MS = 10 * 60_000
const MAX_CONFIRMATION_PREVIEW = 1_000

export const BOT_AUDIO_SPEECH = {
  discarded: '🗑️ Certo, descartei o áudio. Pode mandar de novo, em áudio ou por texto.',
  downloadFailed:
    '⚠️ Não consegui baixar o seu áudio. Pode mandar de novo ou escrever a mensagem, por favor?',
  empty:
    '🤔 Não consegui entender o áudio. Pode repetir falando mais perto do celular, ou escrever a mensagem?',
  failed:
    '⚠️ Não consegui transcrever o áudio agora. Pode mandar de novo daqui a pouco ou escrever a mensagem?',
  received:
    '🎙️ Estou escutando o seu áudio, só um momento. Já te mostro o que entendi para você confirmar.',
  tooLong: `⏱️ O áudio passou de ${BOT_AUDIO_MAX_SECONDS / 60} minutos. Mande um áudio mais curto ou escreva a mensagem, por favor.`,
  unavailable: '✍️ Por aqui eu ainda não consigo ouvir áudio. Escreva a mensagem, por favor.',
} as const

/**
 * O whisper escreve número falado com separador de milhar ("899.877", "899 877"): o número da nota
 * só casa sem eles. Junta grupos de 3 dígitos depois de um grupo de 1 a 3.
 */
export function joinSpokenNumbers(text: string): string {
  return text.replace(/\b\d{1,3}(?:[. ]\d{3})+\b/gu, (number) => number.replace(/[. ]/gu, ''))
}

/**
 * A nota dita em pares ("89, 98, 04"): grupos curtos que juntos dão 5 dígitos ou mais viram um
 * número só. Vale para o texto que segue ao fluxo; a confirmação mostra a fala como veio e a nota
 * juntada no fim.
 */
export function joinSpokenNotePairs(text: string): string {
  return text.replace(/\b\d{1,3}(?:(?:,\s*|\s+|-)\d{1,3})+\b/gu, (run) => {
    const digits = run.replace(/\D/gu, '')
    return digits.length >= 5 ? digits : run
  })
}

/** As notas que só existem depois de juntar os pares ("89, 98, 04" → 899804). */
function joinedNotes(heard: string, text: string): readonly string[] {
  const before = new Set(heard.match(/\d+/gu) ?? [])
  return [...new Set((text.match(/\d{5,}/gu) ?? []).filter((number) => !before.has(number)))]
}

/**
 * O "Entendi assim": a fala como veio (`heard`), as opções e, no fim, o que o bot juntou e achou da
 * nota (`details`). `text` é o que segue ao fluxo, com a nota em pares já juntada.
 */
export function botAudioConfirmationText(
  text: string,
  details: readonly string[] = [],
  heard: string = text,
): string {
  const preview =
    heard.length > MAX_CONFIRMATION_PREVIEW ? `${heard.slice(0, MAX_CONFIRMATION_PREVIEW)}…` : heard
  const joined = details.length > 0 ? [] : joinedNotes(heard, text)
  const tail = [...joined.map((number) => `🔢 Nota: *${number}*`), ...details]
  return [
    '🎙️ *Entendi assim:*',
    '',
    `💬 _“${preview}”_`,
    '',
    '👉 *Está certo?* Responda com o número ou por áudio (_sim_ ou _não_):',
    '✅ *1 - Sim*, pode seguir',
    '❌ *2 - Não*, descartar',
    ...tail.flatMap((line) => ['', line]),
  ].join('\n')
}

const YES = new Set(['1', 'sim', 's', 'confirmo', 'confirma', 'isso', 'certo', 'ok', 'pode'])
const NO = new Set(['2', 'nao', 'n', 'descartar', 'cancelar'])

function normalizeAnswer(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^(1|2) (sim|nao)$/u, '$1')
}

/**
 * O "sim"/"não" falado só vale quando a fala inteira é uma resposta curta ("Sim, pode seguir.", "Um.",
 * "Não descarta."). Fala longa, com palavra fora do vocabulário ou com sim e não juntos não responde:
 * é um áudio novo ("não entendeu a palavra sim" não é um "sim").
 */
const SPOKEN_YES_WORDS = new Set([
  '1',
  'um',
  'sim',
  's',
  'ok',
  'isso',
  'mesmo',
  'certo',
  'correto',
  'exato',
  'claro',
  'confirmo',
  'confirma',
  'pode',
  'seguir',
  'segue',
])
const SPOKEN_NO_WORDS = new Set([
  '2',
  'dois',
  'nao',
  'n',
  'errado',
  'descarta',
  'descartar',
  'cancelar',
])
const SPOKEN_NEUTRAL_WORDS = new Set(['esta', 'e', 'o', 'a', 'por', 'favor'])
const SPOKEN_STRONG_YES_WORDS = new Set([
  '1',
  'um',
  'sim',
  's',
  'ok',
  'isso',
  'claro',
  'exato',
  'confirmo',
])
const SPOKEN_ANSWER_MAX_WORDS = 4

function spokenAnswer(text: string): 'no' | 'unknown' | 'yes' {
  const words = normalizeAnswer(text)
    .split(' ')
    .filter((word) => word !== '')
  if (words.length === 0 || words.length > SPOKEN_ANSWER_MAX_WORDS) return 'unknown'
  const known = (word: string) =>
    SPOKEN_YES_WORDS.has(word) || SPOKEN_NO_WORDS.has(word) || SPOKEN_NEUTRAL_WORDS.has(word)
  if (!words.every(known)) return 'unknown'
  const hasNo = words.some((word) => SPOKEN_NO_WORDS.has(word))
  const hasYes = words.some((word) => SPOKEN_YES_WORDS.has(word))
  if (hasNo && !hasYes) return 'no'
  if (hasYes && !hasNo) return 'yes'
  if (!hasNo && !hasYes) return 'unknown'
  // "Não está certo", "não pode seguir": a negação na frente vence as palavras de acerto fracas.
  const negated =
    words[0] === 'nao' &&
    words.filter((word) => SPOKEN_NO_WORDS.has(word)).length === 1 &&
    !words.some((word) => SPOKEN_STRONG_YES_WORDS.has(word))
  return negated ? 'no' : 'unknown'
}

/**
 * Spec 292 T9: a fala curta, sem número, que responde um passo do pedido ("pular", "continuar", "sim",
 * "cancelar") segue sem confirmação. Número fica na confirmação: é onde a transcrição erra.
 */
export const BOT_AUDIO_QUICK_ANSWER_MAX_WORDS = 3

export function botAudioQuickAnswer(text: string): null | string {
  const cleaned = text
    .replace(/[.!?,;:…]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (cleaned === '' || /\d/u.test(cleaned)) return null
  if (cleaned.split(' ').length > BOT_AUDIO_QUICK_ANSWER_MAX_WORDS) return null
  return cleaned
}

export type BotAudioAnswer<Context> =
  | { readonly kind: 'confirmed'; readonly context: Context; readonly text: string }
  | { readonly kind: 'discarded' }
  | { readonly kind: 'none' }

export type ReceiveBotAudioInput<Context> = {
  readonly companyId: string
  /** O que o fluxo precisa para seguir quando a pessoa confirmar. */
  readonly context: Context
  readonly download: () => Promise<{ readonly data: string; readonly mimeType: string }>
  /** A conversa: grupo (`group:<jid>`) ou número (`user:<dígitos>`), dentro da empresa. */
  readonly conversation: string
  readonly mimeType: string
  /** Quem mandou o áudio (dígitos): só ele confirma. */
  readonly owner: string
  readonly reply: (texts: readonly string[]) => Promise<void> | void
  /** Segundos do áudio, quando o provedor informa. */
  readonly seconds: null | number
  /**
   * Spec 292 T9: o texto transcrito pode seguir sem confirmação? `true` quando quem chamou já o usou
   * (a resposta curta a um passo do pedido); `false` pede o "1 - Sim / 2 - Não" de sempre.
   */
  readonly accept?: (text: string) => Promise<boolean>
  /** Spec 292 T9: o que a confirmação mostra além do texto (a nota falada). Falha vira nada. */
  readonly details?: (text: string) => Promise<readonly string[]>
}

export type WhatsAppBotAudio<Context> = {
  /** Para testes e desligamento: espera as transcrições em andamento. */
  idle(): Promise<void>
  /** A mensagem de texto é a resposta a um áudio pendente desta pessoa? Consome o pendente. */
  answer(input: {
    readonly companyId: string
    readonly conversation: string
    readonly owner: string
    /** Resposta falada (áudio transcrito): aceita frase curta que comece por sim/não. */
    readonly spoken?: boolean
    readonly text: string
  }): BotAudioAnswer<Context>
  /**
   * "Cancelar" de quem falou: descarta o áudio pendente dele e marca as transcrições dele em andamento
   * nesta conversa como descartadas (a que terminar depois não responde nada). `true` se havia algo.
   */
  cancel(input: {
    readonly companyId: string
    readonly conversation: string
    readonly owner: string
  }): boolean
  /** Quando (ms) o bot pediu a confirmação pendente desta pessoa; `undefined` sem pendência. */
  pendingSince(input: {
    readonly companyId: string
    readonly conversation: string
    readonly owner: string
  }): number | undefined
  /**
   * O bot fez uma pergunta nova a esta pessoa: a confirmação de áudio pendente é anterior e não responde por ela.
   * Descarta só a confirmação (transcrição em andamento segue). `true` se havia uma.
   */
  supersede(input: {
    readonly companyId: string
    readonly conversation: string
    readonly owner: string
  }): boolean
  /** Há áudio esperando a confirmação desta pessoa nesta conversa? */
  hasPending(input: {
    readonly companyId: string
    readonly conversation: string
    readonly owner: string
  }): boolean
  /** Spec 299: há áudio esperando confirmação de **qualquer** pessoa desta conversa (o "1" do ajudante também colide)? */
  hasPendingInConversation(input: {
    readonly companyId: string
    readonly conversation: string
  }): boolean
  receive(input: ReceiveBotAudioInput<Context>): Promise<void>
  /**
   * Spec 292 T9 (palavra de chamada): transcreve **calado** o áudio que ninguém endereçou ao bot e
   * entrega o texto a `onText`, que decide se o chamaram. Falha, áudio mudo ou sem transcritor: nada
   * acontece e nada é respondido. O texto não é guardado nem logado.
   */
  listen(input: {
    readonly companyId: string
    readonly conversation: string
    readonly owner: string
    readonly download: () => Promise<{ readonly data: string; readonly mimeType: string }>
    readonly mimeType: string
    readonly onText: (text: string) => Promise<void>
  }): void
  /** Pede a confirmação de um texto já transcrito (o resto da frase depois da palavra de chamada). */
  offer(input: {
    readonly companyId: string
    readonly context: Context
    readonly conversation: string
    readonly owner: string
    readonly reply: (texts: readonly string[]) => Promise<void> | void
    readonly text: string
    readonly details?: (text: string) => Promise<readonly string[]>
  }): Promise<void>
}

async function detailsOf(
  details: ((text: string) => Promise<readonly string[]>) | undefined,
  text: string,
): Promise<readonly string[]> {
  if (details === undefined) return []
  try {
    return await details(text)
  } catch {
    return []
  }
}

type Pending<Context> = {
  readonly context: Context
  readonly expiresAt: number
  readonly owner: string
  readonly text: string
}

export function createWhatsAppBotAudio<Context>(dependencies: {
  readonly clock?: () => number
  readonly logger: ApiLogger
  /** Ausente (sem worker configurado), o bot responde que ainda não ouve áudio. */
  readonly transcriber: BotAudioTranscriberPort | undefined
}): WhatsAppBotAudio<Context> {
  const clock = dependencies.clock ?? (() => Date.now())
  const { logger, transcriber } = dependencies
  const pending = new Map<string, Pending<Context>>()
  /** O áudio mais novo de cada conversa vence: o anterior que terminar depois é descartado. */
  const latest = new Map<string, number>()
  const running = new Set<Promise<void>>()
  /** Transcrições em andamento e cancelamentos, por conversa e pessoa: o cancelamento vale para as que já saíram. */
  const activeJobs = new Map<string, number>()
  const cancelEpochs = new Map<string, number>()
  let sequence = 0

  const keyOf = (companyId: string, conversation: string) => `${companyId}:${conversation}`

  /** Abre uma transcrição: `isCancelled()` vira `true` se a pessoa cancelar depois; `end()` fecha. */
  function beginJob(ownerKey: string): {
    readonly end: () => void
    readonly isCancelled: () => boolean
  } {
    const epoch = cancelEpochs.get(ownerKey) ?? 0
    activeJobs.set(ownerKey, (activeJobs.get(ownerKey) ?? 0) + 1)
    return {
      end: () => {
        const left = (activeJobs.get(ownerKey) ?? 1) - 1
        if (left <= 0) {
          activeJobs.delete(ownerKey)
          cancelEpochs.delete(ownerKey)
        } else activeJobs.set(ownerKey, left)
      },
      isCancelled: () => (cancelEpochs.get(ownerKey) ?? 0) !== epoch,
    }
  }

  function current(key: string, owner: string): Pending<Context> | undefined {
    const entry = pending.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= clock()) {
      pending.delete(key)
      return undefined
    }
    return entry.owner === owner ? entry : undefined
  }

  async function transcribeAndAsk(
    input: ReceiveBotAudioInput<Context>,
    key: string,
    ticket: number,
    isCancelled: () => boolean,
  ): Promise<void> {
    if (transcriber === undefined) return
    let audio: { readonly data: string; readonly mimeType: string }
    try {
      audio = await input.download()
    } catch (error) {
      logger.warn('whatsapp_bot_audio.download_failed', {
        companyId: input.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      if (isCancelled()) return
      await input.reply([BOT_AUDIO_SPEECH.downloadFailed])
      return
    }
    const bytes = Uint8Array.from(Buffer.from(audio.data, 'base64'))
    const mimeType = audio.mimeType.split(';')[0]?.trim() || input.mimeType.split(';')[0]?.trim()
    let text: string
    try {
      text = joinSpokenNumbers(
        (await transcriber.transcribe({ audio: bytes, mimeType: mimeType || 'audio/ogg' }))
          .replace(/\s+/gu, ' ')
          .trim(),
      )
    } catch (error) {
      logger.warn('whatsapp_bot_audio.transcription_failed', {
        bytes: bytes.length,
        companyId: input.companyId,
        reason: error instanceof Error ? error.message : typeof error,
      })
      if (isCancelled()) return
      await input.reply([BOT_AUDIO_SPEECH.failed])
      return
    }
    if (latest.get(key) !== ticket || isCancelled()) return
    if (text === '' || /^\[.*\]$/u.test(text)) {
      // O whisper marca silêncio e ruído entre colchetes ("[BLANK_AUDIO]", "[Música]").
      await input.reply([BOT_AUDIO_SPEECH.empty])
      return
    }
    if (input.accept !== undefined && (await input.accept(text))) {
      logger.info('whatsapp_bot_audio.accepted', {
        bytes: bytes.length,
        companyId: input.companyId,
        characters: text.length,
      })
      return
    }
    const heard = text
    text = joinSpokenNotePairs(heard)
    const shown = botAudioConfirmationText(text, await detailsOf(input.details, text), heard)
    if (latest.get(key) !== ticket || isCancelled()) return
    pending.set(key, {
      context: input.context,
      expiresAt: clock() + PENDING_TTL_MS,
      owner: input.owner,
      text,
    })
    logger.info('whatsapp_bot_audio.awaiting_confirmation', {
      bytes: bytes.length,
      companyId: input.companyId,
      characters: text.length,
    })
    await input.reply([shown])
  }

  function track(job: Promise<void>): void {
    const tracked = job.finally(() => running.delete(tracked))
    running.add(tracked)
  }

  return {
    listen(input) {
      if (transcriber === undefined) return
      const job = beginJob(`${keyOf(input.companyId, input.conversation)}:${input.owner}`)
      track(
        runOutsideWhatsAppTurn(async () => {
          try {
            const audio = await input.download()
            const bytes = Uint8Array.from(Buffer.from(audio.data, 'base64'))
            const mimeType =
              audio.mimeType.split(';')[0]?.trim() || input.mimeType.split(';')[0]?.trim()
            const text = joinSpokenNumbers(
              (await transcriber.transcribe({ audio: bytes, mimeType: mimeType || 'audio/ogg' }))
                .replace(/\s+/gu, ' ')
                .trim(),
            )
            if (text === '' || /^\[.*\]$/u.test(text) || job.isCancelled()) return
            await input.onText(text)
          } catch (error) {
            logger.info('whatsapp_bot_audio.listen_failed', {
              companyId: input.companyId,
              errorName: error instanceof Error ? error.name : typeof error,
            })
          } finally {
            job.end()
          }
        }),
      )
    },
    async offer({ companyId, context, conversation, details, owner, reply, text: heard }) {
      const text = joinSpokenNotePairs(heard)
      pending.set(keyOf(companyId, conversation), {
        context,
        expiresAt: clock() + PENDING_TTL_MS,
        owner,
        text,
      })
      logger.info('whatsapp_bot_audio.awaiting_confirmation', {
        companyId,
        characters: text.length,
        wake: true,
      })
      await reply([botAudioConfirmationText(text, await detailsOf(details, text), heard)])
    },
    answer({ companyId, conversation, owner, spoken = false, text }) {
      const key = keyOf(companyId, conversation)
      const entry = current(key, owner)
      if (entry === undefined) return { kind: 'none' }
      pending.delete(key)
      if (spoken) {
        const said = spokenAnswer(text)
        if (said === 'yes') return { context: entry.context, kind: 'confirmed', text: entry.text }
        if (said === 'no') return { kind: 'discarded' }
        return { kind: 'none' }
      }
      const answer = normalizeAnswer(text)
      if (YES.has(answer)) return { context: entry.context, kind: 'confirmed', text: entry.text }
      if (NO.has(answer)) return { kind: 'discarded' }
      // Escreveu outra coisa: o áudio sai de cena e a mensagem segue como qualquer outra.
      return { kind: 'none' }
    },
    cancel({ companyId, conversation, owner }) {
      const key = keyOf(companyId, conversation)
      const ownerKey = `${key}:${owner}`
      const hadPending = current(key, owner) !== undefined
      if (hadPending) pending.delete(key)
      const inFlight = (activeJobs.get(ownerKey) ?? 0) > 0
      if (inFlight) cancelEpochs.set(ownerKey, (cancelEpochs.get(ownerKey) ?? 0) + 1)
      return hadPending || inFlight
    },
    pendingSince({ companyId, conversation, owner }) {
      const entry = current(keyOf(companyId, conversation), owner)
      return entry === undefined ? undefined : entry.expiresAt - PENDING_TTL_MS
    },
    supersede({ companyId, conversation, owner }) {
      const key = keyOf(companyId, conversation)
      if (current(key, owner) === undefined) return false
      pending.delete(key)
      return true
    },
    hasPending({ companyId, conversation, owner }) {
      return current(keyOf(companyId, conversation), owner) !== undefined
    },
    hasPendingInConversation({ companyId, conversation }) {
      const key = keyOf(companyId, conversation)
      const entry = pending.get(key)
      return entry !== undefined && current(key, entry.owner) !== undefined
    },
    async idle() {
      while (running.size > 0) await Promise.all([...running])
    },
    async receive(input) {
      const key = keyOf(input.companyId, input.conversation)
      if (transcriber === undefined) {
        await input.reply([BOT_AUDIO_SPEECH.unavailable])
        return
      }
      if (input.seconds !== null && input.seconds > BOT_AUDIO_MAX_SECONDS) {
        await input.reply([BOT_AUDIO_SPEECH.tooLong])
        return
      }
      pending.delete(key)
      sequence += 1
      const ticket = sequence
      latest.set(key, ticket)
      const guard = beginJob(`${key}:${input.owner}`)
      try {
        await input.reply([BOT_AUDIO_SPEECH.received])
      } catch (error) {
        guard.end()
        throw error
      }
      // A transcrição responde depois do turno ("entendi assim" é outra mensagem, no seu tempo).
      const job = runOutsideWhatsAppTurn(() =>
        transcribeAndAsk(input, key, ticket, guard.isCancelled),
      )
        .catch((error: unknown) => {
          logger.warn('whatsapp_bot_audio.failed', {
            companyId: input.companyId,
            errorName: error instanceof Error ? error.name : typeof error,
          })
        })
        .finally(() => {
          guard.end()
          running.delete(job)
          if (latest.get(key) === ticket) latest.delete(key)
        })
      running.add(job)
    },
  }
}
