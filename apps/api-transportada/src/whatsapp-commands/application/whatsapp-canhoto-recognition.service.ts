/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8 (RF23, ADR 0113 §5): **a foto que o motorista (ou o atendente) manda sem uma entrega em preparo.** O worker
 * lê a foto com OCR local (nada de serviço pago ou externo) contra as notas abertas de quem mandou; aqui se decide o que o
 * bot faz: exato e único liga ao canhoto da nota e segue o comprovante (localização opcional, baixa); aproximado, ambíguo ou
 * sem número pergunta, e a foto espera no bucket privado. Nunca baixa por palpite. A fala mora em
 * `whatsapp-canhoto-recognition-speech.constant.ts`; a decisão, em `whatsapp-canhoto-recognition.policy.ts`.
 *
 * Um pedido por vez (RNF1): com pergunta aberta, a foto nova não abre outra. Ausente o leitor, o serviço não existe e a
 * foto sem preparação segue calada, como antes.
 *
 * ⚠️ Nada de texto lido, foto ou número de nota em log: só empresa e o desfecho.
 */
import { createHash, randomUUID } from 'node:crypto'

import type {
  WhatsAppCanhotoQuestionCandidate,
  WhatsAppCanhotoQuestionKind,
} from '../../database/whatsapp-canhoto-question.schema.js'
import type { WhatsAppDeliveryPreparationChannel } from '../../database/whatsapp-delivery-preparation.schema.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { WhatsAppStopCandidate } from '../../trips/domain/driver-stop-resolution.policy.js'
import { detectDeliveryProofMimeType } from '../../trips/domain/delivery-proof.policy.js'
import { CANHOTO_RECOGNITION_SPEECH } from '../domain/whatsapp-canhoto-recognition-speech.constant.js'
import {
  decideCanhotoRecognition,
  interpretChooseAnswer,
  interpretConfirmAnswer,
  interpretPhotoKindAnswer,
  type CanhotoAnswer,
  type CanhotoReadVerdict,
  type OpenNote,
} from '../domain/whatsapp-canhoto-recognition.policy.js'
import { CANHOTO_TEXT } from '../domain/whatsapp-driver-canhoto.policy.js'
import type {
  WhatsAppDeliveryPreparationMediaPort,
  WhatsAppDeliveryPreparationReply,
  WhatsAppDeliveryPreparations,
} from './whatsapp-delivery-preparation.service.js'
import type { WhatsAppDriverActor } from './whatsapp-driver-events.service.js'

/** Pergunta que ninguém respondeu vence: a foto é apagada e o motorista manda de novo. */
export const CANHOTO_QUESTION_TTL_MILLISECONDS = 30 * 60 * 1000
const MAX_LISTED_NOTES = 9
const CLOSED_SEPARATION_STATUSES = new Set(['delivered', 'returned'])

export type WhatsAppCanhotoQuestion = {
  readonly candidates: readonly WhatsAppCanhotoQuestionCandidate[]
  readonly companyId: string
  readonly driverId: string
  readonly id: string
  readonly kind: WhatsAppCanhotoQuestionKind
  readonly mimeType: string
  readonly objectKey: string
  readonly openedAt: Date
  readonly originChannel: WhatsAppDeliveryPreparationChannel
  readonly providerMessageId: string
}

export type WhatsAppCanhotoQuestionRepositoryPort = {
  close(input: {
    readonly companyId: string
    readonly id: string
    readonly status: 'cancelled' | 'completed'
  }): Promise<void>
  findOpen(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<null | WhatsAppCanhotoQuestion>
  /** `null` quando outra pergunta abriu antes para o motorista (índice único parcial). */
  open(
    input: Omit<WhatsAppCanhotoQuestion, 'id' | 'openedAt'> & {
      readonly sha256: string
      readonly sizeBytes: number
    },
  ): Promise<null | WhatsAppCanhotoQuestion>
  /** O "não, é de outra" e o "é o canhoto" trocam a pergunta sobre a mesma foto. */
  reframe(input: {
    readonly candidates: readonly WhatsAppCanhotoQuestionCandidate[]
    readonly companyId: string
    readonly id: string
    readonly kind: WhatsAppCanhotoQuestionKind
  }): Promise<void>
}

/**
 * O leitor do worker. Rejeita com `{ reason }`: `unreachable` (rota ausente, OCR desligado no worker) deixa a foto
 * calada, como antes da 294; `busy` (fila cheia, motor carregando) pergunta de qual nota; qualquer outra falha (prazo,
 * rede, motor) cai na pergunta "mercadoria / é o canhoto / descartar". Spec 294 C1: nunca calado por falha.
 */
export type WhatsAppCanhotoReaderPort = {
  read(input: {
    readonly bytes: Uint8Array
    readonly candidates: readonly { readonly documentId: string; readonly number: string }[]
    /** Spec 294 S7: a empresa; o worker atende uma foto por vez por chave. */
    readonly queueKey: string
  }): Promise<CanhotoReadVerdict>
}

export type WhatsAppCanhotoRecognitionPorts = {
  readonly clock?: () => Date
  /** Spec 294 RF26: a mesma imagem já era canhoto de alguma nota da empresa. */
  readonly findCanhotoByHash?: (input: {
    readonly companyId: string
    readonly sha256: string
  }) => Promise<null | { readonly attachedAt: Date; readonly documentId: string }>
  readonly listStops: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly WhatsAppStopCandidate[]>
  readonly logger?: Pick<ApiLogger, 'info' | 'warn'>
  readonly media: WhatsAppDeliveryPreparationMediaPort
  readonly preparations: Required<Pick<WhatsAppDeliveryPreparations, 'receiveCanhotoPhoto'>>
  readonly questions: WhatsAppCanhotoQuestionRepositoryPort
  readonly reader: WhatsAppCanhotoReaderPort
}

export type WhatsAppCanhotoRecognition = {
  /** O motorista tem notas abertas e nenhuma pergunta aberta bloqueia a foto? O canal só baixa a foto quando sim. */
  canReceivePhoto(scope: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<boolean>
  hasOpenQuestion(scope: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<boolean>
  /** `null`: nada a fazer (sem nota aberta), a foto segue calada. */
  receivePhoto(input: {
    readonly actor: WhatsAppDriverActor
    readonly bytes: Uint8Array
    readonly channel: WhatsAppDeliveryPreparationChannel
    readonly mimeType: string
    readonly providerMessageId: string
  }): Promise<null | WhatsAppDeliveryPreparationReply>
  /** `null` quando não há pergunta aberta (ou, com `strict`, quando o texto não responde a ela). */
  answer(input: {
    readonly actor: WhatsAppDriverActor
    readonly strict?: boolean
    readonly text: string
  }): Promise<null | WhatsAppDeliveryPreparationReply>
}

const LOG = {
  asked: 'whatsapp_canhoto_recognition.asked',
  attached: 'whatsapp_canhoto_recognition.attached',
  readFailed: 'whatsapp_canhoto_recognition.read_failed',
} as const

const stripZeros = (value: string): string => value.replace(/^0+(?=\d)/u, '')

export function createWhatsAppCanhotoRecognition(
  ports: WhatsAppCanhotoRecognitionPorts,
): WhatsAppCanhotoRecognition {
  const { media, questions } = ports
  const clock = ports.clock ?? (() => new Date())

  const reply = (
    texts: readonly string[],
    options: { readonly awaitingText?: boolean; readonly documentNumber?: string } = {},
  ): WhatsAppDeliveryPreparationReply => ({
    awaitingText: options.awaitingText ?? false,
    documentNumber: options.documentNumber ?? '',
    finished: options.awaitingText !== true,
    texts,
  })

  async function listOpenNotes(scope: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly OpenNote[]> {
    const stops = await ports.listStops(scope)
    return stops
      .toSorted((left, right) => left.sequence - right.sequence)
      .flatMap((stop) =>
        stop.documents.flatMap((document) =>
          document.id === undefined || CLOSED_SEPARATION_STATUSES.has(document.separationStatus)
            ? []
            : [
                {
                  documentId: document.id,
                  documentNumber: stripZeros(document.number),
                  label: document.recipientName?.trim()
                    ? `NF ${stripZeros(document.number)} · ${document.recipientName.trim()}`
                    : `NF ${stripZeros(document.number)}`,
                },
              ],
        ),
      )
  }

  /** A mesma imagem já é canhoto de alguma nota: nada é gravado (RF26). */
  async function duplicateReply(input: {
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly notes: readonly OpenNote[]
  }): Promise<null | WhatsAppDeliveryPreparationReply> {
    if (ports.findCanhotoByHash === undefined) return null
    const found = await ports.findCanhotoByHash({
      companyId: input.companyId,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
    })
    if (found === null) return null
    const note = input.notes.find((item) => item.documentId === found.documentId)
    return reply([
      CANHOTO_TEXT.duplicate({
        attachedAt: found.attachedAt,
        documentNumber: note?.documentNumber,
      }),
    ])
  }

  /** `disabled`: o worker não tem a rota; `busy`: fila cheia; `undefined`: falhou (prazo, rede, motor, não é imagem). */
  async function readVerdict(input: {
    readonly actor: WhatsAppDriverActor
    readonly bytes: Uint8Array
    readonly notes: readonly OpenNote[]
  }): Promise<'busy' | 'disabled' | CanhotoReadVerdict | undefined> {
    // Spec 294 S6: só imagem pelos bytes vai ao decodificador do worker.
    if (detectDeliveryProofMimeType(input.bytes) === null) return undefined
    try {
      return await ports.reader.read({
        bytes: input.bytes,
        candidates: input.notes.map((note) => ({
          documentId: note.documentId,
          number: note.documentNumber,
        })),
        queueKey: input.actor.companyId,
      })
    } catch (error) {
      const reason = (error as { readonly reason?: unknown }).reason
      if (reason === 'unreachable') return 'disabled'
      ports.logger?.warn(LOG.readFailed, {
        companyId: input.actor.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
        reason: typeof reason === 'string' ? reason : 'unknown',
      })
      return reason === 'busy' ? 'busy' : undefined
    }
  }

  async function attach(input: {
    readonly actor: WhatsAppDriverActor
    readonly bytes: Uint8Array
    readonly channel: WhatsAppDeliveryPreparationChannel
    readonly mimeType: string
    readonly note: OpenNote
    readonly providerMessageId: string
  }): Promise<WhatsAppDeliveryPreparationReply> {
    const { actor, note } = input
    ports.logger?.info(LOG.attached, { companyId: actor.companyId })
    return ports.preparations.receiveCanhotoPhoto({
      actor,
      bytes: input.bytes,
      channel: input.channel,
      document: { id: note.documentId, number: note.documentNumber },
      mimeType: input.mimeType,
      providerMessageId: input.providerMessageId,
    })
  }

  /** A foto espera a resposta no bucket privado; a pergunta é uma por motorista. */
  async function ask(input: {
    readonly actor: WhatsAppDriverActor
    readonly bytes: Uint8Array
    readonly candidates: readonly OpenNote[]
    readonly channel: WhatsAppDeliveryPreparationChannel
    readonly kind: WhatsAppCanhotoQuestionKind
    readonly mimeType: string
    readonly providerMessageId: string
    readonly text: string
  }): Promise<WhatsAppDeliveryPreparationReply> {
    const { actor } = input
    const stored = await media.store({
      bytes: input.bytes,
      companyId: actor.companyId,
      mimeType: input.mimeType,
      preparationId: randomUUID(),
    })
    const opened = await questions.open({
      candidates: input.candidates.map(toCandidate),
      companyId: actor.companyId,
      driverId: actor.driverId,
      kind: input.kind,
      mimeType: input.mimeType,
      objectKey: stored.objectKey,
      originChannel: input.channel,
      providerMessageId: input.providerMessageId,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
    })
    if (opened === null) {
      await removeObject(actor.companyId, stored.objectKey)
      return reply([CANHOTO_RECOGNITION_SPEECH.busy])
    }
    ports.logger?.info(LOG.asked, { companyId: actor.companyId, kind: input.kind })
    return reply([input.text], { awaitingText: true })
  }

  const removeObject = (companyId: string, objectKey: string) =>
    media.remove({ companyId, objectKey }).catch(() => undefined)

  /** A pergunta que passou do prazo some com a foto; quem pergunta de novo é o motorista. */
  async function findLiveQuestion(scope: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<null | WhatsAppCanhotoQuestion> {
    const question = await questions.findOpen(scope)
    if (question === null) return null
    if (clock().getTime() - question.openedAt.getTime() <= CANHOTO_QUESTION_TTL_MILLISECONDS)
      return question
    await questions.close({ companyId: question.companyId, id: question.id, status: 'cancelled' })
    await removeObject(question.companyId, question.objectKey)
    return null
  }

  async function resolveQuestion(input: {
    readonly actor: WhatsAppDriverActor
    readonly answer: CanhotoAnswer
    readonly question: WhatsAppCanhotoQuestion
  }): Promise<null | WhatsAppDeliveryPreparationReply> {
    const { actor, answer, question } = input
    const close = async (status: 'cancelled' | 'completed') => {
      await questions.close({ companyId: question.companyId, id: question.id, status })
      await removeObject(question.companyId, question.objectKey)
    }
    if (answer.kind === 'not_understood') return null
    if (answer.kind === 'discard') {
      await close('cancelled')
      return reply([CANHOTO_RECOGNITION_SPEECH.discarded])
    }
    if (answer.kind === 'cargo') {
      await close('cancelled')
      return reply([CANHOTO_RECOGNITION_SPEECH.cargoNoted])
    }
    if (answer.kind === 'no' || answer.kind === 'canhoto') {
      const notes = (await listOpenNotes(actor)).slice(0, MAX_LISTED_NOTES)
      await questions.reframe({
        candidates: notes.map(toCandidate),
        companyId: question.companyId,
        id: question.id,
        kind: 'choose_note',
      })
      return reply([CANHOTO_RECOGNITION_SPEECH.chooseNote(notes)], { awaitingText: true })
    }
    const note = answer.kind === 'note' ? answer.note : fromCandidate(question.candidates[0])
    if (note === undefined) return null
    const bytes = await media.read({ companyId: question.companyId, objectKey: question.objectKey })
    await close('completed')
    return (
      (await duplicateReply({ bytes, companyId: actor.companyId, notes: [note] })) ??
      attach({
        actor,
        bytes,
        channel: question.originChannel,
        mimeType: question.mimeType,
        note,
        providerMessageId: question.providerMessageId,
      })
    )
  }

  return {
    async answer({ actor, strict = false, text }) {
      const question = await findLiveQuestion(actor)
      if (question === null) return null
      const notes = question.candidates.flatMap((candidate) => fromCandidate(candidate) ?? [])
      const answer =
        question.kind === 'confirm_note'
          ? interpretConfirmAnswer(text)
          : question.kind === 'photo_kind'
            ? interpretPhotoKindAnswer(text)
            : interpretChooseAnswer(text, notes)
      const resolved = await resolveQuestion({ actor, answer, question })
      if (resolved !== null) return resolved
      return strict
        ? null
        : reply([CANHOTO_RECOGNITION_SPEECH.notUnderstood], { awaitingText: true })
    },

    async canReceivePhoto(scope) {
      return (await listOpenNotes(scope)).length > 0
    },

    async hasOpenQuestion(scope) {
      return (await findLiveQuestion(scope)) !== null
    },

    async receivePhoto({ actor, bytes, channel, mimeType, providerMessageId }) {
      if ((await findLiveQuestion(actor)) !== null) {
        return reply([CANHOTO_RECOGNITION_SPEECH.busy], { awaitingText: true })
      }
      const notes = await listOpenNotes(actor)
      if (notes.length === 0) return null
      const duplicate = await duplicateReply({ bytes, companyId: actor.companyId, notes })
      if (duplicate !== null) return duplicate

      const read = await readVerdict({ actor, bytes, notes })
      if (read === 'disabled') return null
      const common = { actor, bytes, channel, mimeType, providerMessageId }
      if (read === 'busy') {
        const listed = notes.slice(0, MAX_LISTED_NOTES)
        return ask({
          ...common,
          candidates: listed,
          kind: 'choose_note',
          text: CANHOTO_RECOGNITION_SPEECH.chooseNote(listed),
        })
      }
      const verdict = read
      const decision = decideCanhotoRecognition({ notes, verdict })
      if (decision.kind === 'attach') return attach({ ...common, note: decision.note })
      if (decision.kind === 'confirm_note') {
        return ask({
          ...common,
          candidates: decision.notes,
          kind: 'confirm_note',
          text: CANHOTO_RECOGNITION_SPEECH.confirmNote(decision.notes[0]),
        })
      }
      if (decision.kind === 'choose_note') {
        const listed = decision.notes.slice(0, MAX_LISTED_NOTES)
        return ask({
          ...common,
          candidates: listed,
          kind: 'choose_note',
          text: CANHOTO_RECOGNITION_SPEECH.chooseNote(listed),
        })
      }
      return ask({
        ...common,
        candidates: [],
        kind: 'photo_kind',
        text: CANHOTO_RECOGNITION_SPEECH.photoKind(
          verdict === undefined ? CANHOTO_RECOGNITION_SPEECH.readerUnavailable : undefined,
        ),
      })
    },
  }
}

const toCandidate = (note: OpenNote): WhatsAppCanhotoQuestionCandidate => ({
  documentId: note.documentId,
  documentNumber: note.documentNumber,
  label: note.label,
})

const fromCandidate = (
  candidate: undefined | WhatsAppCanhotoQuestionCandidate,
): OpenNote | undefined => candidate
