/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15 (desenho 3.4): **a ocorrência em coleta.** O motorista escolheu a nota, o tipo e
 * escreveu a observação, pelo grupo ou pela conversa individual. Se a exigência efetiva do tipo para a
 * nota pede foto, número do documento do cliente ou valor pago, o bot não recusa mais com "registre pelo
 * aplicativo": abre a coleta, pede o que falta e só então registra pela mesma `registerDriverOccurrence`
 * do app (camada T11), que confere tudo de novo no servidor.
 *
 * - A lista sai de `resolveOccurrenceDraftChecklist` sobre a exigência do app
 *   (`resolveDocumentOccurrenceRequirements`). O bot não inventa exigência.
 * - Assinatura, produtos e valor por item continuam só no app: obrigatórios, não há coleta, e a recusa
 *   de sempre diz isso (`begin` devolve `null` e o canal segue o caminho antigo).
 * - Uma coleta aberta por motorista: a foto que chega no grupo ou no individual sabe para onde ir.
 * - A foto vira upload confirmado de ocorrência assim que chega (mesma conferência do app).
 *
 * ⚠️ Nada de observação, número, valor ou texto em log: só empresa, coleta e motivo.
 */
import type { WhatsAppDeliveryPreparationChannel } from '../../database/whatsapp-delivery-preparation.schema.js'
import type { WhatsAppOccurrenceDraftPhoto } from '../../database/whatsapp-occurrence-draft.schema.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { WhatsAppCanhotoRecognition } from './whatsapp-canhoto-recognition.service.js'
import type { OccurrenceRequirements } from '../../trips/domain/occurrence-requirements.policy.js'
import {
  OCCURRENCE_DRAFT_ITEM,
  OCCURRENCE_DRAFT_PHOTO_LIMIT,
  resolveOccurrenceDraftChecklist,
  type OccurrenceDraftChecklist,
} from '../domain/whatsapp-occurrence-draft-checklist.policy.js'
import {
  OCCURRENCE_DRAFT_SPEECH,
  parseOccurrenceDeclaredAmount,
  parseOccurrenceReferenceNumber,
  type OccurrenceDraftLabels,
} from '../domain/whatsapp-occurrence-draft-speech.constant.js'
import {
  normalizePreparationText,
  type WhatsAppDeliveryPreparationReply,
  type WhatsAppDeliveryPreparations,
} from './whatsapp-delivery-preparation.service.js'
import type {
  WhatsAppDriverActor,
  WhatsAppDriverEventResult,
  WhatsAppOccurrenceEventInput,
} from './whatsapp-driver-events.service.js'

/** A tentativa de registro falhou por erro que não é de negócio: qualquer texto tenta de novo. */
export const OCCURRENCE_DRAFT_AWAITING_RETRY = 'retry'

export type WhatsAppOccurrenceDraft = {
  readonly awaiting: null | string
  readonly companyId: string
  readonly declaredAmount: null | string
  readonly documentId: string
  readonly documentNumber: string
  readonly driverId: string
  readonly id: string
  readonly location: null | ReportedLocation
  readonly note: string
  readonly occurrenceTypeId: string
  readonly originChannel: WhatsAppDeliveryPreparationChannel
  readonly photos: readonly WhatsAppOccurrenceDraftPhoto[]
  readonly referenceNumber: null | string
  readonly skipped: readonly string[]
  readonly version: bigint
}

export type WhatsAppOccurrenceDraftChanges = Pick<
  WhatsAppOccurrenceDraft,
  'awaiting' | 'declaredAmount' | 'location' | 'photos' | 'referenceNumber' | 'skipped'
>

export type WhatsAppOccurrenceDraftRepositoryPort = {
  close(input: {
    readonly companyId: string
    readonly id: string
    readonly status: 'cancelled' | 'completed' | 'superseded'
    readonly version: bigint
  }): Promise<boolean>
  findOpenForDriver(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<null | WhatsAppOccurrenceDraft>
  /** `null` quando o motorista já tem outra aberta (índice único parcial): quem chama relê. */
  open(input: {
    readonly companyId: string
    readonly documentId: string
    readonly documentNumber: string
    readonly driverId: string
    readonly location: null | ReportedLocation
    readonly note: string
    readonly occurrenceTypeId: string
    readonly originChannel: WhatsAppDeliveryPreparationChannel
  }): Promise<null | WhatsAppOccurrenceDraft>
  /** Grava se a versão ainda é a lida; `false` quando outra mensagem andou no meio. */
  save(input: {
    readonly changes: WhatsAppOccurrenceDraftChanges
    readonly companyId: string
    readonly id: string
    readonly version: bigint
  }): Promise<boolean>
}

/** A foto recusada pela conferência de upload de ocorrência (tipo, tamanho). */
export class WhatsAppOccurrencePhotoRejectedError extends Error {
  constructor() {
    super('WHATSAPP_OCCURRENCE_PHOTO_REJECTED')
    this.name = 'WhatsAppOccurrencePhotoRejectedError'
  }
}

export type WhatsAppOccurrenceDraftPorts = {
  /** A frase do resultado do registro, na plateia do canal (com as falas editáveis). */
  readonly describeResult: (input: {
    readonly channel: WhatsAppDeliveryPreparationChannel
    readonly companyId: string
    readonly documentNumber: string
    readonly result: WhatsAppDriverEventResult
  }) => Promise<string>
  readonly logger?: Pick<ApiLogger, 'info' | 'warn'>
  /** O registro pela camada T11 (`registerWhatsAppDriverOccurrence`). */
  readonly register: (input: WhatsAppOccurrenceEventInput) => Promise<WhatsAppDriverEventResult>
  readonly repository: WhatsAppOccurrenceDraftRepositoryPort
  /** A exigência efetiva do tipo para a nota; `null` quando o tipo ou a nota saíram do alcance. */
  readonly resolveRequirements: (input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly occurrenceTypeId: string
  }) => Promise<null | (OccurrenceDraftLabels & { readonly requirements: OccurrenceRequirements })>
  /**
   * A foto vira upload confirmado de ocorrência da viagem da nota. Lança
   * `WhatsAppOccurrencePhotoRejectedError` quando a conferência recusa.
   */
  readonly storePhoto: (input: {
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly mimeType: string
  }) => Promise<{ readonly uploadId: string }>
}

export type WhatsAppOccurrenceDrafts = {
  /**
   * Abre a coleta e diz o primeiro pedido. `null` quando não há o que colher (o canal registra como
   * sempre) ou quando o tipo exige o que só o app colhe (o canal recebe a recusa de sempre).
   */
  begin(input: {
    readonly actor: WhatsAppDriverActor
    readonly channel: WhatsAppDeliveryPreparationChannel
    readonly documentId: string
    readonly documentNumber: string
    readonly location: null | ReportedLocation
    readonly note: string
    readonly occurrenceTypeId: string
  }): Promise<null | WhatsAppDeliveryPreparationReply>
  /** A resposta em texto; `null` quando o texto não é para a coleta. */
  answer(input: {
    readonly actor: WhatsAppDriverActor
    readonly strict?: boolean
    readonly text: string
  }): Promise<null | WhatsAppDeliveryPreparationReply>
  awaitingText(input: { readonly companyId: string; readonly driverId: string }): Promise<boolean>
  /** A coleta aberta pede foto? (só então a foto é dela, e não da entrega em preparo.) */
  wantsPhoto(input: { readonly companyId: string; readonly driverId: string }): Promise<boolean>
  hasOpen(input: { readonly companyId: string; readonly driverId: string }): Promise<boolean>
  /** Guarda a localização na coleta aberta, em silêncio (a resposta é da entrega, se houver). */
  receiveLocation(input: {
    readonly actor: WhatsAppDriverActor
    readonly location: ReportedLocation
  }): Promise<void>
  receivePhoto(input: {
    readonly actor: WhatsAppDriverActor
    readonly bytes: Uint8Array
    readonly mimeType: string
    readonly providerMessageId: string
  }): Promise<null | WhatsAppDeliveryPreparationReply>
}

const LOG = {
  completed: 'whatsapp_occurrence_draft.completed',
  opened: 'whatsapp_occurrence_draft.opened',
  photoRejected: 'whatsapp_occurrence_draft.photo_rejected',
  raced: 'whatsapp_occurrence_draft.raced',
  registerFailed: 'whatsapp_occurrence_draft.register_failed',
  superseded: 'whatsapp_occurrence_draft.superseded',
} as const

const MAX_RETRIES = 3
const SKIP_WORDS = new Set(['pular', 'pula', 'pulei', 'nao tenho', 'sem'])
const CANCEL_WORDS = new Set(['cancelar', 'cancela', 'desistir'])

export const OCCURRENCE_DRAFT_TEXT = {
  cancelled: (documentNumber: string) =>
    `Ocorrência da NF ${documentNumber} cancelada. Nada foi registrado.`,
  registerFailed:
    'Não consegui registrar a ocorrência agora. Responda qualquer coisa para tentar de novo, ou "cancelar".',
} as const

export function createWhatsAppOccurrenceDrafts(
  ports: WhatsAppOccurrenceDraftPorts,
): WhatsAppOccurrenceDrafts {
  const { repository } = ports

  async function contextOf(
    draft: Pick<
      WhatsAppOccurrenceDraft,
      'companyId' | 'documentId' | 'driverId' | 'occurrenceTypeId'
    >,
  ) {
    return ports.resolveRequirements({
      companyId: draft.companyId,
      documentId: draft.documentId,
      driverId: draft.driverId,
      occurrenceTypeId: draft.occurrenceTypeId,
    })
  }

  function nextStep(
    draft: WhatsAppOccurrenceDraft,
    checklist: OccurrenceDraftChecklist,
    labels: OccurrenceDraftLabels,
  ): { readonly awaiting: null | string; readonly texts: readonly string[] } {
    const number = draft.documentNumber
    if (checklist.next === null) return { awaiting: null, texts: [] }
    const announceMissing =
      checklist.missing.length > 1 ||
      (checklist.missing.length === 1 && checklist.missing[0]?.item !== checklist.next.item)
    return {
      awaiting: checklist.next.item,
      texts: [
        ...(announceMissing
          ? [OCCURRENCE_DRAFT_SPEECH.missing(number, checklist.missing, labels)]
          : []),
        OCCURRENCE_DRAFT_SPEECH.question(number, checklist.next, labels),
      ],
    }
  }

  /** Aplica a mudança com a versão lida; pronta, registra. */
  async function mutate(
    actor: WhatsAppDriverActor,
    initial: WhatsAppOccurrenceDraft,
    change: (
      draft: WhatsAppOccurrenceDraft,
      checklist: OccurrenceDraftChecklist,
      labels: OccurrenceDraftLabels,
    ) =>
      | {
          readonly ack: readonly string[]
          readonly changes: Partial<WhatsAppOccurrenceDraftChanges>
        }
      | { readonly reply: readonly string[] },
  ): Promise<WhatsAppDeliveryPreparationReply> {
    let draft: null | WhatsAppOccurrenceDraft = initial
    for (let attempt = 0; attempt < MAX_RETRIES && draft !== null; attempt += 1) {
      const context = await contextOf(draft)
      if (context === null) return supersede(draft, 'out_of_reach', [])
      const before = checklistFor(draft, context.requirements)
      const outcome = change(draft, before, context)
      if ('reply' in outcome) return pending(draft, outcome.reply)
      const merged: WhatsAppOccurrenceDraft = { ...draft, ...outcome.changes }
      const after = checklistFor(merged, context.requirements)
      const step = nextStep(merged, after, context)
      const saved = await repository.save({
        changes: { ...changesOf(merged), awaiting: step.awaiting },
        companyId: merged.companyId,
        id: merged.id,
        version: merged.version,
      })
      if (saved) {
        const current = { ...merged, awaiting: step.awaiting, version: merged.version + 1n }
        if (after.ready) return complete(actor, current, outcome.ack)
        return pending(current, [...outcome.ack, ...step.texts])
      }
      ports.logger?.info(LOG.raced, { companyId: merged.companyId, draftId: merged.id })
      draft = await repository.findOpenForDriver({
        companyId: merged.companyId,
        driverId: merged.driverId,
      })
    }
    return {
      awaitingText: false,
      documentNumber: initial.documentNumber,
      finished: draft === null,
      texts: [],
    }
  }

  async function complete(
    actor: WhatsAppDriverActor,
    draft: WhatsAppOccurrenceDraft,
    ack: readonly string[],
  ): Promise<WhatsAppDeliveryPreparationReply> {
    let result: WhatsAppDriverEventResult
    try {
      result = await ports.register({
        ...actor,
        ...(draft.photos.length === 0
          ? {}
          : { attachmentObjectIds: draft.photos.map((photo) => photo.uploadId) }),
        ...(draft.declaredAmount === null ? {} : { declaredAmount: draft.declaredAmount }),
        documentId: draft.documentId,
        idempotencyKey: `whatsapp-occurrence-draft:${draft.id}`,
        location: draft.location,
        note: draft.note,
        occurrenceTypeId: draft.occurrenceTypeId,
        ...(draft.referenceNumber === null ? {} : { referenceNumber: draft.referenceNumber }),
      })
    } catch (error) {
      ports.logger?.warn(LOG.registerFailed, {
        companyId: draft.companyId,
        draftId: draft.id,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      await repository.save({
        changes: { ...changesOf(draft), awaiting: OCCURRENCE_DRAFT_AWAITING_RETRY },
        companyId: draft.companyId,
        id: draft.id,
        version: draft.version,
      })
      return {
        awaitingText: true,
        documentNumber: draft.documentNumber,
        finished: false,
        texts: [...ack, OCCURRENCE_DRAFT_TEXT.registerFailed],
      }
    }
    const text = await ports.describeResult({
      channel: draft.originChannel,
      companyId: draft.companyId,
      documentNumber: draft.documentNumber,
      result,
    })
    if (result.kind === 'refused') return supersede(draft, result.refusal.code, [...ack, text])
    await repository.close({ ...scopeOf(draft), status: 'completed' })
    ports.logger?.info(LOG.completed, {
      companyId: draft.companyId,
      draftId: draft.id,
      photos: draft.photos.length,
    })
    return finished(draft, [...ack, text])
  }

  async function supersede(
    draft: WhatsAppOccurrenceDraft,
    reason: string,
    texts: readonly string[],
  ): Promise<WhatsAppDeliveryPreparationReply> {
    await repository.close({ ...scopeOf(draft), status: 'superseded' })
    ports.logger?.info(LOG.superseded, { companyId: draft.companyId, draftId: draft.id, reason })
    return finished(draft, texts)
  }

  async function openFor(actor: Pick<WhatsAppDriverActor, 'companyId' | 'driverId'>) {
    return repository.findOpenForDriver({ companyId: actor.companyId, driverId: actor.driverId })
  }

  function skip(actor: WhatsAppDriverActor, draft: WhatsAppOccurrenceDraft) {
    return mutate(actor, draft, (current, checklist, labels) => {
      const question = checklist.next
      if (question === null || current.awaiting !== question.item) {
        return { reply: nextStep(current, checklist, labels).texts }
      }
      if (!question.optional) {
        return {
          reply: [
            OCCURRENCE_DRAFT_SPEECH.stillRequired,
            OCCURRENCE_DRAFT_SPEECH.question(current.documentNumber, question, labels),
          ],
        }
      }
      return {
        ack: [OCCURRENCE_DRAFT_SPEECH.received.skipped],
        changes: { skipped: [...new Set([...current.skipped, question.item])] },
      }
    })
  }

  return {
    async answer({ actor, strict = false, text }) {
      const draft = await openFor(actor)
      if (draft === null || draft.awaiting === null) return null
      const normalized = normalizePreparationText(text)
      if (CANCEL_WORDS.has(normalized)) {
        await repository.close({ ...scopeOf(draft), status: 'cancelled' })
        return finished(draft, [OCCURRENCE_DRAFT_TEXT.cancelled(draft.documentNumber)])
      }
      if (draft.awaiting === OCCURRENCE_DRAFT_AWAITING_RETRY) {
        return mutate(actor, draft, () => ({ ack: [], changes: {} }))
      }
      if (SKIP_WORDS.has(normalized)) return skip(actor, draft)
      const refuse = (message: string) => (strict ? null : pending(draft, [message]))

      if (draft.awaiting === OCCURRENCE_DRAFT_ITEM.referenceNumber) {
        const value = parseOccurrenceReferenceNumber(text)
        if (value === null) return refuse(OCCURRENCE_DRAFT_SPEECH.referenceNotUnderstood)
        return mutate(actor, draft, () => ({
          ack: [OCCURRENCE_DRAFT_SPEECH.received.referenceNumber],
          changes: { referenceNumber: value },
        }))
      }
      if (draft.awaiting === OCCURRENCE_DRAFT_ITEM.declaredAmount) {
        const value = parseOccurrenceDeclaredAmount(text)
        if (value === null) return refuse(OCCURRENCE_DRAFT_SPEECH.amountNotUnderstood)
        return mutate(actor, draft, () => ({
          ack: [OCCURRENCE_DRAFT_SPEECH.received.declaredAmount],
          changes: { declaredAmount: value },
        }))
      }
      // Foto em aberto: texto que não é "pular" nem "cancelar" não é para a coleta.
      return null
    },

    async awaitingText({ companyId, driverId }) {
      const draft = await openFor({ companyId, driverId })
      return draft !== null && isTextQuestion(draft.awaiting)
    },

    async begin({ actor, channel, documentId, documentNumber, location, note, occurrenceTypeId }) {
      const context = await contextOf({
        companyId: actor.companyId,
        documentId,
        driverId: actor.driverId,
        occurrenceTypeId,
      })
      if (context === null) return null
      const checklist = resolveOccurrenceDraftChecklist({
        collected: {
          hasDeclaredAmount: false,
          hasReferenceNumber: false,
          photoCount: 0,
          skipped: new Set(),
        },
        requirements: context.requirements,
      })
      if (checklist.appOnly.length > 0 || checklist.next === null) return null

      // Uma por motorista: a nova escolha substitui a coleta que ficou para trás.
      const previous = await openFor(actor)
      if (previous !== null) await supersede(previous, 'replaced', [])
      const draft =
        (await repository.open({
          companyId: actor.companyId,
          documentId,
          documentNumber,
          driverId: actor.driverId,
          location,
          note,
          occurrenceTypeId,
          originChannel: channel,
        })) ?? (await openFor(actor))
      if (draft === null) return { awaitingText: false, documentNumber, finished: true, texts: [] }
      ports.logger?.info(LOG.opened, { channel, companyId: actor.companyId, draftId: draft.id })
      return mutate(actor, draft, () => ({ ack: [], changes: {} }))
    },

    async hasOpen({ companyId, driverId }) {
      return (await openFor({ companyId, driverId })) !== null
    },

    async receiveLocation({ actor, location }) {
      const draft = await openFor(actor)
      if (draft === null || draft.location !== null) return
      await repository.save({
        changes: { ...changesOf(draft), location },
        companyId: draft.companyId,
        id: draft.id,
        version: draft.version,
      })
    },

    async receivePhoto({ actor, bytes, mimeType, providerMessageId }) {
      const draft = await openFor(actor)
      if (draft === null || draft.awaiting !== OCCURRENCE_DRAFT_ITEM.photo) return null
      if (draft.photos.some((photo) => photo.providerMessageId === providerMessageId)) {
        return pending(draft, [OCCURRENCE_DRAFT_SPEECH.duplicatePhoto])
      }
      if (draft.photos.length >= OCCURRENCE_DRAFT_PHOTO_LIMIT) {
        return pending(draft, [OCCURRENCE_DRAFT_SPEECH.photoLimit(draft.documentNumber)])
      }
      let uploadId: string
      try {
        ;({ uploadId } = await ports.storePhoto({
          bytes,
          companyId: draft.companyId,
          documentId: draft.documentId,
          driverId: draft.driverId,
          mimeType,
        }))
      } catch (error) {
        if (!(error instanceof WhatsAppOccurrencePhotoRejectedError)) throw error
        ports.logger?.info(LOG.photoRejected, { companyId: draft.companyId, draftId: draft.id })
        return pending(draft, [OCCURRENCE_DRAFT_SPEECH.photoRejected])
      }
      return mutate(actor, draft, (current) => ({
        ack: [OCCURRENCE_DRAFT_SPEECH.received.photo],
        changes: { photos: [...current.photos, { providerMessageId, uploadId }] },
      }))
    },

    async wantsPhoto({ companyId, driverId }) {
      const draft = await openFor({ companyId, driverId })
      return draft?.awaiting === OCCURRENCE_DRAFT_ITEM.photo
    },
  }
}

function checklistFor(draft: WhatsAppOccurrenceDraft, requirements: OccurrenceRequirements) {
  return resolveOccurrenceDraftChecklist({
    collected: {
      hasDeclaredAmount: draft.declaredAmount !== null,
      hasReferenceNumber: draft.referenceNumber !== null,
      photoCount: draft.photos.length,
      skipped: new Set(draft.skipped),
    },
    requirements,
  })
}

function changesOf(draft: WhatsAppOccurrenceDraft): WhatsAppOccurrenceDraftChanges {
  return {
    awaiting: draft.awaiting,
    declaredAmount: draft.declaredAmount,
    location: draft.location,
    photos: draft.photos,
    referenceNumber: draft.referenceNumber,
    skipped: draft.skipped,
  }
}

/** A foto chega como mídia; o resto (e o "pular" da foto opcional) em texto. */
function isTextQuestion(awaiting: null | string): boolean {
  return awaiting !== null
}

function scopeOf(draft: WhatsAppOccurrenceDraft) {
  return { companyId: draft.companyId, id: draft.id, version: draft.version }
}

function pending(
  draft: WhatsAppOccurrenceDraft,
  texts: readonly string[],
): WhatsAppDeliveryPreparationReply {
  return {
    awaitingText: isTextQuestion(draft.awaiting),
    documentNumber: draft.documentNumber,
    finished: false,
    texts,
  }
}

function finished(
  draft: WhatsAppOccurrenceDraft,
  texts: readonly string[],
): WhatsAppDeliveryPreparationReply {
  return { awaitingText: false, documentNumber: draft.documentNumber, finished: true, texts }
}

/**
 * Spec 293 T15: o que o motorista manda sem dizer para quê (foto, localização, "pular", um número) vai
 * para a coleta certa: a ocorrência em coleta quando ela pede aquilo, senão a entrega em preparo. Os
 * canais (grupo e individual) só conhecem esta fachada, com a forma da entrega em preparo.
 */
export function combineWhatsAppDriverCollections(input: {
  /** Spec 294 T4.8: o reconhecimento do canhoto da foto sem preparação (ausente = foto calada, como antes). */
  readonly canhoto?: WhatsAppCanhotoRecognition | undefined
  readonly deliveries: WhatsAppDeliveryPreparations
  readonly occurrences: WhatsAppOccurrenceDrafts
}): WhatsAppDeliveryPreparations {
  const { canhoto, deliveries, occurrences } = input
  return {
    async answer(request) {
      if (canhoto !== undefined && (await canhoto.hasOpenQuestion(request.actor))) {
        const answered = await canhoto.answer(request)
        if (answered !== null) return answered
      }
      if (await occurrences.hasOpen(request.actor)) {
        const answered = await occurrences.answer(request)
        if (answered !== null) return answered
      }
      return deliveries.answer(request)
    },
    async awaitingText(scope) {
      return (
        (await occurrences.awaitingText(scope)) ||
        (await deliveries.awaitingText(scope)) ||
        (canhoto?.hasOpenQuestion(scope) ?? false)
      )
    },
    async acceptsUnsolicitedPhoto(scope) {
      return canhoto?.canReceivePhoto(scope) ?? false
    },
    repeatMediaRequest: async (request) => (await deliveries.repeatMediaRequest?.(request)) ?? null,
    begin: (request) => deliveries.begin(request),
    resume: async (request) => (await deliveries.resume?.(request)) ?? null,
    async hasOpen(scope) {
      return (
        (await occurrences.hasOpen(scope)) ||
        (await deliveries.hasOpen(scope)) ||
        (canhoto?.hasOpenQuestion(scope) ?? false)
      )
    },
    async receiveLocation(request) {
      await occurrences.receiveLocation(request)
      return deliveries.receiveLocation(request)
    },
    async receivePhoto(request) {
      if (await occurrences.wantsPhoto(request.actor)) {
        const received = await occurrences.receivePhoto(request)
        if (received !== null) return received
      }
      const received = await deliveries.receivePhoto(request)
      if (received !== null || canhoto === undefined) return received
      return canhoto.receivePhoto({
        actor: request.actor,
        bytes: request.bytes,
        channel: request.channel ?? 'group',
        mimeType: request.mimeType,
        providerMessageId: request.providerMessageId,
      })
    },
  }
}
