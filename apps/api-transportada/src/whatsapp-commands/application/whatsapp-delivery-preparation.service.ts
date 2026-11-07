/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15 (desenho 3.4): **a entrega em preparo.** O motorista diz "entreguei" pelo grupo ou pela
 * conversa individual; em vez de dar a baixa na hora, o bot abre a preparação da nota, pede o que a
 * configuração do comprovante exige e só então chama a baixa (a mesma função do app, pela camada T11)
 * e anexa as provas (o mesmo `attachDeliveryProof` do app).
 *
 * - A lista do que falta sai de `resolveDeliveryProofChecklist`, sobre a configuração resolvida da nota
 *   (`resolveProofFieldSettings`, a do app). O bot não inventa exigência.
 * - Faltou prova obrigatória, a nota não fecha: a preparação fica aberta e o bot diz o que falta.
 * - A preparação é da nota, não do canal: a foto pode chegar no grupo e a confirmação no individual.
 * - As fotos sobem ao bucket privado assim que chegam (nunca ficam na memória do processo) e viram
 *   comprovante depois da baixa.
 *
 * Este serviço não sabe de grupo, de Meta nem de Evolution: o canal entrega foto (bytes já baixados),
 * localização ou texto, e devolve ao motorista as frases que vêm daqui.
 *
 * ⚠️ Nada de nome de quem recebeu, coordenada ou texto em log: só empresa, preparação e motivo.
 */
import type {
  WhatsAppDeliveryPreparationChannel,
  WhatsAppDeliveryPreparationPhoto,
} from '../../database/whatsapp-delivery-preparation.schema.js'
import { RECEIVED_BY_OPTIONS, type ReceivedBy } from '../../database/trip.schema.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { DeliveryProofFieldSettings } from '../../trips/domain/delivery-proof-settings.policy.js'
import { TRIP_DELIVERY_PROOF_CARGO_LIMIT } from '../../trips/domain/delivery-event.constant.js'
import {
  DELIVERY_PROOF_ITEM,
  resolveDeliveryProofChecklist,
  type DeliveryProofChecklist,
  type DeliveryProofQuestion,
} from '../domain/whatsapp-delivery-proof-checklist.policy.js'
import {
  describeDeliveryConfirmCollected,
  describeDeliveryConfirmDocument,
  type DeliveryConfirmDocument,
} from '../domain/whatsapp-delivery-confirm-summary.policy.js'
import { DELIVERY_PROOF_SPEECH } from '../domain/whatsapp-delivery-proof-speech.constant.js'
import type { DeliveryProofQuestionView } from '../domain/whatsapp-delivery-proof-question.policy.js'
import { CANHOTO_TEXT } from '../domain/whatsapp-driver-canhoto.policy.js'
import { TripCanhotoAlreadyAttachedError } from '../../trips/domain/stop-order.error.js'
import {
  describeOutOfOrderViolation,
  OUT_OF_ORDER_TEXT,
  toOrderStopLabel,
} from '../domain/whatsapp-driver-order.policy.js'
import {
  DRIVER_CHOICE,
  interpretDriverChoice,
  isDriverCancelText,
} from '../domain/whatsapp-driver-choice.policy.js'
import type { WhatsAppStopCandidate } from '../../trips/domain/driver-stop-resolution.policy.js'
import type { RouteOfferStop } from '../domain/whatsapp-driver-route-offer.policy.js'
import type {
  WhatsAppDocumentEventInput,
  WhatsAppDriverActor,
  WhatsAppDriverEventRefusal,
  WhatsAppDriverEventResult,
} from './whatsapp-driver-events.service.js'

export const DELIVERY_PREPARATION_AWAITING_CONFIRM = 'confirm'
/** Spec 294 RF25: a API recusou a baixa por fora de ordem; espera o "1 - Entreguei mesmo / 2 - Foi engano". */
export const DELIVERY_PREPARATION_AWAITING_OUT_OF_ORDER = 'out_of_order'
/** Spec 294 RF26: a nota já tem outro canhoto; espera o "1 - Trocar / 2 - Descartar". */
export const DELIVERY_PREPARATION_AWAITING_REPLACE_CANHOTO = 'replace_canhoto'

export type WhatsAppDeliveryPreparation = {
  readonly awaiting: null | string
  readonly companyId: string
  readonly documentId: string
  readonly documentNumber: string
  readonly driverId: string
  readonly id: string
  readonly location: null | ReportedLocation
  readonly originChannel: WhatsAppDeliveryPreparationChannel
  readonly photos: readonly WhatsAppDeliveryPreparationPhoto[]
  readonly receivedBy: null | ReceivedBy
  readonly receiverName: null | string
  readonly skipped: readonly string[]
  /** A hora da última mudança (a última pergunta do bot); `undefined` onde a fonte não a traz. */
  readonly updatedAt?: Date | undefined
  readonly version: bigint
}

export type WhatsAppDeliveryPreparationChanges = Pick<
  WhatsAppDeliveryPreparation,
  'awaiting' | 'location' | 'photos' | 'receivedBy' | 'receiverName' | 'skipped'
>

export type WhatsAppDeliveryPreparationRepositoryPort = {
  close(input: {
    readonly companyId: string
    readonly id: string
    readonly status: 'cancelled' | 'completed' | 'superseded'
    readonly version: bigint
  }): Promise<boolean>
  findOpenByDocument(input: {
    readonly companyId: string
    readonly documentId: string
  }): Promise<null | WhatsAppDeliveryPreparation>
  /** As abertas do motorista, a mais recente primeiro. */
  listOpenForDriver(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly WhatsAppDeliveryPreparation[]>
  /** `null` quando outra abriu antes para a mesma nota (índice único parcial): quem chama relê. */
  open(input: {
    readonly companyId: string
    readonly documentId: string
    readonly documentNumber: string
    readonly driverId: string
    readonly originChannel: WhatsAppDeliveryPreparationChannel
  }): Promise<null | WhatsAppDeliveryPreparation>
  /** Grava se a versão ainda é a lida; `false` quando outra mensagem andou no meio. */
  save(input: {
    readonly changes: WhatsAppDeliveryPreparationChanges
    readonly companyId: string
    readonly id: string
    readonly version: bigint
  }): Promise<boolean>
}

/** A foto à espera da baixa, no bucket privado. */
export type WhatsAppDeliveryPreparationMediaPort = {
  read(input: { readonly companyId: string; readonly objectKey: string }): Promise<Uint8Array>
  remove(input: { readonly companyId: string; readonly objectKey: string }): Promise<void>
  store(input: {
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly mimeType: string
    readonly preparationId: string
  }): Promise<{ readonly objectKey: string; readonly sha256: string; readonly sizeBytes: number }>
}

export type WhatsAppDeliveryPreparationPorts = {
  /** O `attachDeliveryProof` do app, com o canal `whatsapp`. */
  readonly attachProof: (input: {
    readonly actorUserId: string
    readonly attendant?: true
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly upload: {
      readonly attachmentKey: string
      readonly bytes: Uint8Array
      readonly kind: 'cargo' | 'photo'
      readonly mimeType: string
      readonly receivedBy: null | ReceivedBy
      /** Spec 294 RF26: o motorista confirmou trocar o canhoto que a nota já tem (vai para conferência). */
      readonly replaceCanhoto?: boolean
      readonly receiverName: string
    }
  }) => Promise<unknown>
  readonly clock?: () => Date
  /** A baixa pela camada T11 (`deliverWhatsAppDriverDocument`). */
  readonly deliver: (input: WhatsAppDocumentEventInput) => Promise<WhatsAppDriverEventResult>
  /** A frase do resultado da baixa, na plateia do canal (com as falas editáveis). */
  readonly describeResult: (input: {
    readonly channel: WhatsAppDeliveryPreparationChannel
    readonly companyId: string
    readonly documentNumber: string
    readonly result: WhatsAppDriverEventResult
    /** A parada da nota, lida antes da baixa (depois dela a viagem pode já ter fechado); `undefined` sem a lista. */
    readonly stopSequence?: number | undefined
  }) => Promise<string>
  /**
   * Spec 294 RF26: o canhoto da empresa com a mesma imagem (hash do conteúdo). Ausente, a foto repetida só é
   * barrada pela API na hora de anexar.
   */
  readonly findCanhotoByHash?: (input: {
    readonly companyId: string
    readonly sha256: string
  }) => Promise<null | { readonly attachedAt: Date; readonly documentId: string }>
  /**
   * Spec 294 RF25: as paradas da viagem do motorista, para a pergunta de fora de ordem citar nota e cliente.
   * Ausente, a pergunta cita só a sequência.
   */
  readonly listStops?: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly WhatsAppStopCandidate[]>
  /** Contratante, cliente, endereço e valor da nota para o "Confirma a entrega?"; ausente, o resumo fica sem eles. */
  readonly describeDocument?: (input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
  }) => Promise<DeliveryConfirmDocument | null>
  readonly logger?: Pick<ApiLogger, 'info' | 'warn'>
  readonly media: WhatsAppDeliveryPreparationMediaPort
  readonly repository: WhatsAppDeliveryPreparationRepositoryPort
  readonly resolveSettings: (input: {
    readonly companyId: string
    readonly documentId: string
  }) => Promise<DeliveryProofFieldSettings>
}

type MutationOutcome =
  | {
      readonly ack: readonly string[]
      readonly changes: Partial<WhatsAppDeliveryPreparationChanges>
    }
  | { readonly reply: readonly string[] }

/** O que o canal manda de volta ao motorista. */
export type WhatsAppDeliveryPreparationReply = {
  /** A preparação espera uma resposta em texto (quem recebeu, nome, "pular" ou 1/2). */
  readonly awaitingText: boolean
  readonly documentNumber: string
  /** A nota fechou (ou a preparação terminou): o canal não precisa segurar o pedido. */
  readonly finished: boolean
  /** Spec 294 RF8–RF10: a baixa fechou a parada; o canal oferece a próxima rota ou diz que acabou. */
  readonly routeContinuation?: WhatsAppRouteContinuation
  readonly texts: readonly string[]
}

export type WhatsAppRouteContinuation = {
  readonly nextStop: RouteOfferStop | null
  readonly tripCompleted: boolean
}

export type WhatsAppDeliveryPreparations = {
  /** Abre (ou retoma) a preparação da nota e diz o próximo passo. */
  begin(input: {
    readonly actor: WhatsAppDriverActor
    readonly channel: WhatsAppDeliveryPreparationChannel
    readonly documentId: string
    readonly documentNumber: string
    readonly location: null | ReportedLocation
  }): Promise<WhatsAppDeliveryPreparationReply>
  /** A resposta em texto à pergunta aberta; `null` quando o texto não é para a preparação. */
  answer(input: {
    readonly actor: WhatsAppDriverActor
    /**
     * `true` (conversa individual): texto que não responde à pergunta devolve `null` e segue para o
     * menu, em vez de "não entendi" — a conversa individual também é o menu do motorista.
     */
    readonly strict?: boolean
    readonly text: string
  }): Promise<null | WhatsAppDeliveryPreparationReply>
  /**
   * Spec 294 RF22: o bot pediu foto ou localização e chegou áudio (ou texto): repete o pedido dizendo que esse item vai
   * por foto/localização. `null` quando nenhuma preparação espera mídia.
   */
  repeatMediaRequest?(input: {
    readonly actor: WhatsAppDriverActor
  }): Promise<null | WhatsAppDeliveryPreparationReply>
  /**
   * "entreguei" sem número: retoma a entrega aberta mais recente do motorista — diz a nota e repete a pergunta pendente.
   * `null` sem nenhuma aberta (ausente, o canal segue a parada em andamento).
   */
  resume?(input: {
    readonly actor: WhatsAppDriverActor
  }): Promise<null | WhatsAppDeliveryPreparationReply>
  /** Há preparação aberta esperando texto? O canal usa para decidir se o texto é para cá. */
  awaitingText(input: { readonly companyId: string; readonly driverId: string }): Promise<boolean>
  /**
   * Desde quando a entrega espera resposta em texto (a pergunta mais recente entre as abertas); `null` sem pergunta
   * em texto ou sem hora conhecida. Serve para saber se uma pergunta mais nova (a oferta da rota) é a dona do "1".
   */
  awaitingTextSince?(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<Date | null>
  /** Há entrega em preparo aberta deste motorista? (o canal só baixa a foto quando há.) */
  hasOpen(input: { readonly companyId: string; readonly driverId: string }): Promise<boolean>
  /**
   * Spec 294 T4.8 (RF23): sem preparação aberta, a foto ainda vale ser baixada e lida (o bot reconhece o canhoto)?
   * Ausente ou `false`, a foto sem preparação segue calada, como antes.
   */
  acceptsUnsolicitedPhoto?(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<boolean>
  /** A localização compartilhada vale para as preparações abertas que ainda não têm. */
  receiveLocation(input: {
    readonly actor: WhatsAppDriverActor
    readonly location: ReportedLocation
  }): Promise<null | WhatsAppDeliveryPreparationReply>
  /** A foto já baixada; `null` sem preparação aberta. */
  receivePhoto(input: {
    readonly actor: WhatsAppDriverActor
    /** `false`: a foto que nenhuma coleta pediu não vai à leitura automática do canhoto (grupo sem o bot marcado). */
    readonly allowsCanhotoReading?: boolean
    readonly bytes: Uint8Array
    /** O texto da legenda: se citar o número de uma das notas em preparo, a foto vai para ela. */
    readonly caption: null | string
    /** Spec 294 T4.8: o canal de onde a foto veio (a leitura do canhoto abre a preparação com ele). */
    readonly channel?: WhatsAppDeliveryPreparationChannel
    readonly mimeType: string
    readonly providerMessageId: string
  }): Promise<null | WhatsAppDeliveryPreparationReply>
  /**
   * Spec 294 T4.8 (RF23): a foto que o bot leu e ligou à nota é o canhoto dela. Abre (ou retoma) a preparação da nota, grava
   * a foto como canhoto (a mesma imagem repetida não grava, RF26) e diz o próximo passo (a localização opcional, depois a baixa).
   */
  receiveCanhotoPhoto?(input: {
    readonly actor: WhatsAppDriverActor
    readonly bytes: Uint8Array
    readonly channel: WhatsAppDeliveryPreparationChannel
    readonly document: { readonly id: string; readonly number: string }
    readonly mimeType: string
    readonly providerMessageId: string
  }): Promise<WhatsAppDeliveryPreparationReply>
}

const LOG = {
  attachFailed: 'whatsapp_delivery_preparation.attach_failed',
  completed: 'whatsapp_delivery_preparation.completed',
  opened: 'whatsapp_delivery_preparation.opened',
  raced: 'whatsapp_delivery_preparation.raced',
  superseded: 'whatsapp_delivery_preparation.superseded',
} as const

const MAX_RETRIES = 3
const SKIP_WORDS = new Set(['pular', 'pula', 'pulei', 'nao tenho', 'sem', 'nao'])
const YES_WORDS = new Set(['1', 'sim', 's', 'confirmo', 'confirmar'])
const NO_WORDS = new Set(['2', 'nao', 'n', 'cancelar', 'cancela'])
/** Palavras que nunca são o nome de quem recebeu: o motorista quer outra coisa do bot. */
const RESERVED_WORDS = new Set(['menu', 'oi', 'ola', 'inicio', 'voltar', 'ajuda', 'cancelar'])
const RECEIVER_NAME_MAX_LENGTH = 120
/** As perguntas 1/2 que já têm o seu "não" (cancelar a entrega, descartar, manter o canhoto). */
const ANSWERS_CANCEL_ITSELF = new Set<null | string>([
  DELIVERY_PREPARATION_AWAITING_CONFIRM,
  DELIVERY_PREPARATION_AWAITING_OUT_OF_ORDER,
  DELIVERY_PREPARATION_AWAITING_REPLACE_CANHOTO,
])

export function normalizePreparationText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.!?,;:]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

const stripZeros = (value: string) => value.replace(/^0+(?=\d)/u, '')

export function createWhatsAppDeliveryPreparations(
  ports: WhatsAppDeliveryPreparationPorts,
): WhatsAppDeliveryPreparations &
  Required<Pick<WhatsAppDeliveryPreparations, 'receiveCanhotoPhoto'>> {
  const { media, repository } = ports

  async function checklistOf(preparation: WhatsAppDeliveryPreparation, actor: WhatsAppDriverActor) {
    const resolved = await ports.resolveSettings({
      companyId: preparation.companyId,
      documentId: preparation.documentId,
    })
    const settings = actor.attendant === true ? relaxSettingsForAttendant(resolved) : resolved
    return {
      checklist: resolveDeliveryProofChecklist({ collected: collectedOf(preparation), settings }),
      settings,
    }
  }

  async function stopSequenceOf(
    preparation: WhatsAppDeliveryPreparation,
  ): Promise<number | undefined> {
    const stops = await ports
      .listStops?.({ companyId: preparation.companyId, driverId: preparation.driverId })
      .catch(() => undefined)
    return stops?.find((candidate) =>
      candidate.documents.some((document) => document.id === preparation.documentId),
    )?.sequence
  }

  /** O cliente e a cidade da parada da nota, para a pergunta de quem recebeu; melhor esforço. */
  async function clientOf(
    preparation: WhatsAppDeliveryPreparation,
  ): Promise<DeliveryProofQuestionView['client']> {
    const stops = await ports
      .listStops?.({ companyId: preparation.companyId, driverId: preparation.driverId })
      .catch(() => undefined)
    const stop = stops?.find((candidate) =>
      candidate.documents.some((document) => document.id === preparation.documentId),
    )
    const document = stop?.documents.find((candidate) => candidate.id === preparation.documentId)
    const name = document?.recipientName?.trim()
    return name === undefined || name === '' ? undefined : { city: stop?.city, name }
  }

  async function describeQuestionOf(
    preparation: WhatsAppDeliveryPreparation,
    checklist: DeliveryProofChecklist,
    question: DeliveryProofQuestion,
  ): Promise<string> {
    const isPersonQuestion =
      question.item === DELIVERY_PROOF_ITEM.receivedBy ||
      question.item === DELIVERY_PROOF_ITEM.receiverName
    return DELIVERY_PROOF_SPEECH.question(preparation.documentNumber, question, {
      client: isPersonQuestion ? await clientOf(preparation) : undefined,
      pendingItems: checklist.pendingItems,
    })
  }

  /** O próximo passo dito ao motorista, e a pergunta que fica em aberto. */
  async function nextStep(
    preparation: WhatsAppDeliveryPreparation,
    checklist: DeliveryProofChecklist,
  ): Promise<{ readonly awaiting: null | string; readonly texts: readonly string[] }> {
    const number = preparation.documentNumber
    if (checklist.next !== null) {
      return {
        awaiting: checklist.next.item,
        texts: [await describeQuestionOf(preparation, checklist, checklist.next)],
      }
    }
    if (checklist.appOnly.length > 0) {
      return { awaiting: null, texts: [DELIVERY_PROOF_SPEECH.appOnlySignature(number)] }
    }
    return {
      awaiting: DELIVERY_PREPARATION_AWAITING_CONFIRM,
      texts: [
        DELIVERY_PROOF_SPEECH.confirm(number, {
          collected: summarizeCollected(preparation),
          document: await describeDocumentLines(preparation),
        }),
      ],
    }
  }

  /** Os dados da nota no resumo; a consulta que falha não derruba a confirmação, só a deixa mais curta. */
  async function describeDocumentLines(
    preparation: WhatsAppDeliveryPreparation,
  ): Promise<readonly string[]> {
    if (ports.describeDocument === undefined) return []
    const document = await ports
      .describeDocument({
        companyId: preparation.companyId,
        documentId: preparation.documentId,
        driverId: preparation.driverId,
      })
      .catch((error: unknown) => {
        ports.logger?.warn('whatsapp delivery confirm: document details unavailable', {
          documentId: preparation.documentId,
          error: error instanceof Error ? error.message : 'unknown',
        })
        return null
      })
    return document === null ? [] : describeDeliveryConfirmDocument(document)
  }

  /** Aplica uma mudança com a versão lida, relendo quando outra mensagem andou no meio. */
  async function mutate(
    initial: WhatsAppDeliveryPreparation,
    actor: WhatsAppDriverActor,
    change: (
      preparation: WhatsAppDeliveryPreparation,
      checklist: DeliveryProofChecklist,
    ) => MutationOutcome | Promise<MutationOutcome>,
  ): Promise<WhatsAppDeliveryPreparationReply> {
    let preparation: null | WhatsAppDeliveryPreparation = initial
    for (let attempt = 0; attempt < MAX_RETRIES && preparation !== null; attempt += 1) {
      const before = await checklistOf(preparation, actor)
      const outcome = await change(preparation, before.checklist)
      if ('reply' in outcome) {
        return {
          awaitingText: isTextQuestion(preparation.awaiting),
          documentNumber: preparation.documentNumber,
          finished: false,
          texts: outcome.reply,
        }
      }
      const merged: WhatsAppDeliveryPreparation = { ...preparation, ...outcome.changes }
      const after = resolveDeliveryProofChecklist({
        collected: collectedOf(merged),
        settings: before.settings,
      })
      const step = await nextStep(merged, after)
      const saved = await repository.save({
        changes: {
          awaiting: step.awaiting,
          location: merged.location,
          photos: merged.photos,
          receivedBy: merged.receivedBy,
          receiverName: merged.receiverName,
          skipped: merged.skipped,
        },
        companyId: merged.companyId,
        id: merged.id,
        version: merged.version,
      })
      if (saved) {
        return {
          awaitingText: isTextQuestion(step.awaiting),
          documentNumber: merged.documentNumber,
          finished: false,
          texts: [
            ...(step.awaiting === DELIVERY_PREPARATION_AWAITING_CONFIRM ? [] : outcome.ack),
            ...step.texts,
          ],
        }
      }
      ports.logger?.info(LOG.raced, { companyId: merged.companyId, preparationId: merged.id })
      preparation = await repository.findOpenByDocument({
        companyId: merged.companyId,
        documentId: merged.documentId,
      })
    }
    return {
      awaitingText: false,
      documentNumber: initial.documentNumber,
      finished: preparation === null,
      texts: [],
    }
  }

  /** A pergunta do fora de ordem, com nota e cliente das paradas quando a viagem é conhecida. */
  async function describeOutOfOrder(
    preparation: WhatsAppDeliveryPreparation,
    refusal: Extract<WhatsAppDriverEventRefusal, { code: 'stop_out_of_order' }>,
  ): Promise<string> {
    const stops =
      (await ports.listStops?.({
        companyId: preparation.companyId,
        driverId: preparation.driverId,
      })) ?? []
    return describeOutOfOrderViolation({
      documentNumber: preparation.documentNumber,
      event: 'deliver',
      labels: new Map(stops.map((stop) => [stop.id, toOrderStopLabel(stop)] as const)),
      violation: refusal,
    })
  }

  async function complete(
    actor: WhatsAppDriverActor,
    preparation: WhatsAppDeliveryPreparation,
    confirmations: { readonly outOfOrder?: boolean; readonly replaceCanhoto?: boolean } = {},
  ): Promise<WhatsAppDeliveryPreparationReply> {
    const confirmOutOfOrder = confirmations.outOfOrder === true
    const { checklist } = await checklistOf(preparation, actor)
    if (!checklist.ready) {
      const step = await nextStep(preparation, checklist)
      return {
        awaitingText: isTextQuestion(step.awaiting),
        documentNumber: preparation.documentNumber,
        finished: false,
        texts: step.texts,
      }
    }
    const stopSequence = await stopSequenceOf(preparation)
    const result = await ports.deliver({
      ...actor,
      ...(confirmOutOfOrder ? { confirmOutOfOrder: true } : {}),
      documentId: preparation.documentId,
      idempotencyKey: `whatsapp-delivery-preparation:${preparation.id}`,
      location: preparation.location,
    })
    const describe = () =>
      ports.describeResult({
        channel: preparation.originChannel,
        companyId: preparation.companyId,
        documentNumber: preparation.documentNumber,
        result,
        stopSequence,
      })
    if (
      result.kind === 'refused' &&
      result.refusal.code === 'stop_out_of_order' &&
      !confirmOutOfOrder
    ) {
      // Spec 294 RF25: a preparação segue aberta, com as provas, esperando o 1/2.
      await repository.save({
        changes: {
          ...changesOf(preparation),
          awaiting: DELIVERY_PREPARATION_AWAITING_OUT_OF_ORDER,
        },
        companyId: preparation.companyId,
        id: preparation.id,
        version: preparation.version,
      })
      return {
        awaitingText: true,
        documentNumber: preparation.documentNumber,
        finished: false,
        texts: [await describeOutOfOrder(preparation, result.refusal)],
      }
    }
    if (result.kind === 'refused') {
      // A nota saiu do alcance (devolvida, entregue pelo app, viagem trocada): a preparação perde o objeto.
      await repository.close({ ...scopeOf(preparation), status: 'superseded' })
      await removePhotos(preparation)
      ports.logger?.info(LOG.superseded, {
        companyId: preparation.companyId,
        preparationId: preparation.id,
        reason: result.refusal.code,
      })
      return finished(preparation, [await describe()])
    }

    let attachFailed = false
    let needsReplace = false
    for (const [index, photo] of preparation.photos.entries()) {
      try {
        const bytes = await media.read({
          companyId: preparation.companyId,
          objectKey: photo.objectKey,
        })
        await ports.attachProof({
          actorUserId: actor.actorUserId,
          ...(actor.attendant === true ? { attendant: true as const } : {}),
          companyId: preparation.companyId,
          documentId: preparation.documentId,
          driverId: preparation.driverId,
          upload: {
            attachmentKey: `whatsapp-preparation:${preparation.id}:${index}`,
            bytes,
            kind: photo.kind,
            mimeType: photo.mimeType,
            receivedBy: photo.kind === 'photo' ? preparation.receivedBy : null,
            ...(photo.kind === 'photo' && confirmations.replaceCanhoto === true
              ? { replaceCanhoto: true }
              : {}),
            receiverName: photo.kind === 'photo' ? (preparation.receiverName ?? '') : '',
          },
        })
      } catch (error) {
        // Spec 294 RF26: a nota já tem outro canhoto — a troca só vale com a confirmação.
        if (error instanceof TripCanhotoAlreadyAttachedError) {
          needsReplace = true
          continue
        }
        attachFailed = true
        ports.logger?.warn(LOG.attachFailed, {
          companyId: preparation.companyId,
          errorName: error instanceof Error ? error.name : typeof error,
          kind: photo.kind,
          preparationId: preparation.id,
        })
      }
    }
    if (needsReplace) {
      await repository.save({
        changes: {
          ...changesOf(preparation),
          awaiting: DELIVERY_PREPARATION_AWAITING_REPLACE_CANHOTO,
        },
        companyId: preparation.companyId,
        id: preparation.id,
        version: preparation.version,
      })
      return {
        awaitingText: true,
        documentNumber: preparation.documentNumber,
        finished: false,
        texts: [CANHOTO_TEXT.replaceQuestion(preparation.documentNumber)],
      }
    }
    await repository.close({ ...scopeOf(preparation), status: 'completed' })
    if (!attachFailed) await removePhotos(preparation)
    ports.logger?.info(LOG.completed, {
      companyId: preparation.companyId,
      photos: preparation.photos.length,
      preparationId: preparation.id,
    })
    return {
      ...finished(preparation, [
        await describe(),
        ...(confirmations.replaceCanhoto === true && !attachFailed
          ? [CANHOTO_TEXT.replaced(preparation.documentNumber)]
          : []),
        ...(attachFailed ? [DELIVERY_PROOF_SPEECH.attachFailed] : []),
      ]),
      ...routeContinuationOf(result),
    }
  }

  async function removePhotos(preparation: WhatsAppDeliveryPreparation): Promise<void> {
    for (const photo of preparation.photos) {
      await media
        .remove({ companyId: preparation.companyId, objectKey: photo.objectKey })
        .catch(() => undefined)
    }
  }

  async function cancel(preparation: WhatsAppDeliveryPreparation, text: string) {
    await repository.close({ ...scopeOf(preparation), status: 'cancelled' })
    await removePhotos(preparation)
    return finished(preparation, [text])
  }

  async function openFor(actor: WhatsAppDriverActor) {
    return repository.listOpenForDriver({ companyId: actor.companyId, driverId: actor.driverId })
  }

  return {
    async answer({ actor, strict = false, text }) {
      const refuse = (preparation: WhatsAppDeliveryPreparation, message: string) =>
        strict ? null : notUnderstood(preparation, message)
      const preparations = await openFor(actor)
      const preparation = preparations.find((item) => isTextQuestion(item.awaiting))
      // "Cancelar" encerra a entrega aberta seja qual for a pergunta (foto, localização, nome): nada é registrado.
      if (isDriverCancelText(text) && !ANSWERS_CANCEL_ITSELF.has(preparation?.awaiting ?? null)) {
        const target = preparation ?? preparations.find((item) => item.awaiting !== null)
        if (target === undefined) return null
        return cancel(target, DELIVERY_PROOF_SPEECH.cancelled(target.documentNumber))
      }
      if (preparation === undefined) {
        // A foto/localização em aberto aceita "pular" em texto quando o item é opcional.
        const skippable = preparations.find((item) => item.awaiting !== null)
        if (skippable === undefined || !SKIP_WORDS.has(normalizePreparationText(text))) return null
        return skip(skippable, actor)
      }
      const normalized = normalizePreparationText(text)

      if (preparation.awaiting === DELIVERY_PREPARATION_AWAITING_OUT_OF_ORDER) {
        const choice = interpretDriverChoice(text)
        if (choice === DRIVER_CHOICE.first)
          return complete(actor, preparation, { outOfOrder: true })
        if (choice === DRIVER_CHOICE.second || choice === DRIVER_CHOICE.skip) {
          await repository.close({ ...scopeOf(preparation), status: 'cancelled' })
          await removePhotos(preparation)
          return finished(preparation, [OUT_OF_ORDER_TEXT.discarded])
        }
        return refuse(preparation, OUT_OF_ORDER_TEXT.notUnderstood)
      }
      if (preparation.awaiting === DELIVERY_PREPARATION_AWAITING_REPLACE_CANHOTO) {
        const choice = interpretDriverChoice(text)
        if (choice === DRIVER_CHOICE.first) {
          return complete(actor, preparation, { replaceCanhoto: true })
        }
        if (choice === DRIVER_CHOICE.second || choice === DRIVER_CHOICE.skip) {
          await repository.close({ ...scopeOf(preparation), status: 'cancelled' })
          await removePhotos(preparation)
          return finished(preparation, [CANHOTO_TEXT.kept(preparation.documentNumber)])
        }
        return refuse(preparation, CANHOTO_TEXT.notUnderstood)
      }
      if (preparation.awaiting === DELIVERY_PREPARATION_AWAITING_CONFIRM) {
        const choice = interpretDriverChoice(text)
        if (YES_WORDS.has(normalized) || choice === DRIVER_CHOICE.first) {
          return complete(actor, preparation)
        }
        if (NO_WORDS.has(normalized) || choice === DRIVER_CHOICE.second) {
          await repository.close({ ...scopeOf(preparation), status: 'cancelled' })
          await removePhotos(preparation)
          return finished(preparation, [
            DELIVERY_PROOF_SPEECH.cancelled(preparation.documentNumber),
          ])
        }
        return refuse(preparation, DELIVERY_PROOF_SPEECH.confirmNotUnderstood)
      }
      if (SKIP_WORDS.has(normalized)) return skip(preparation, actor)

      if (preparation.awaiting === DELIVERY_PROOF_ITEM.receivedBy) {
        const option = /^\d{1,2}$/u.test(normalized)
          ? RECEIVED_BY_OPTIONS[Number(normalized) - 1]
          : undefined
        if (option === undefined) {
          return refuse(preparation, DELIVERY_PROOF_SPEECH.receivedByNotUnderstood)
        }
        return mutate(preparation, actor, () => ({
          ack: [DELIVERY_PROOF_SPEECH.received.receivedBy(option)],
          changes: { receivedBy: option },
        }))
      }

      // `receiver_name`
      const name = text.replace(/\s+/gu, ' ').trim().slice(0, RECEIVER_NAME_MAX_LENGTH)
      if (!/\p{L}/u.test(name) || RESERVED_WORDS.has(normalized)) {
        return refuse(preparation, DELIVERY_PROOF_SPEECH.nameNotUnderstood)
      }
      return mutate(preparation, actor, () => ({
        ack: [DELIVERY_PROOF_SPEECH.received.receiverName],
        changes: { receiverName: name },
      }))
    },

    async resume({ actor }) {
      const [latest] = await openFor(actor)
      if (latest === undefined) return null
      const resumed = await mutate(latest, actor, () => ({
        ack: [DELIVERY_PROOF_SPEECH.resumed(latest.documentNumber)],
        changes: {},
      }))
      // Uma mensagem só: no grupo o envio é espaçado e a pergunta separada chegava depois da resposta seguinte.
      return { ...resumed, texts: joinedTexts(resumed.texts) }
    },

    async repeatMediaRequest({ actor }) {
      const preparations = await openFor(actor)
      const waiting = preparations.find((item) => isMediaQuestion(item.awaiting))
      if (waiting === undefined) return null
      const { checklist } = await checklistOf(waiting, actor)
      return {
        awaitingText: false,
        documentNumber: waiting.documentNumber,
        finished: false,
        texts: [
          waiting.awaiting === DELIVERY_PROOF_ITEM.location
            ? MEDIA_REQUEST_TEXT.location
            : MEDIA_REQUEST_TEXT.photo,
          ...(await nextStep(waiting, checklist)).texts,
        ],
      }
    },

    async awaitingText({ companyId, driverId }) {
      const preparations = await repository.listOpenForDriver({ companyId, driverId })
      return preparations.some((item) => isTextQuestion(item.awaiting))
    },

    async awaitingTextSince({ companyId, driverId }) {
      const preparations = await repository.listOpenForDriver({ companyId, driverId })
      const times = preparations
        .filter((item) => isTextQuestion(item.awaiting))
        .flatMap((item) => (item.updatedAt === undefined ? [] : [item.updatedAt.getTime()]))
      return times.length === 0 ? null : new Date(Math.max(...times))
    },

    async hasOpen({ companyId, driverId }) {
      const preparations = await repository.listOpenForDriver({ companyId, driverId })
      return preparations.length > 0
    },

    async begin({ actor, channel, documentId, documentNumber, location }) {
      const preparation = await openPreparation({
        actor,
        channel,
        document: { id: documentId, number: documentNumber },
      })
      if (preparation === null) {
        return { awaitingText: false, documentNumber, finished: true, texts: [] }
      }
      return mutate(preparation, actor, (current) => ({
        ack: [],
        changes: location !== null && current.location === null ? { location } : {},
      }))
    },

    async receiveCanhotoPhoto({ actor, bytes, channel, document, mimeType, providerMessageId }) {
      const opened = await openPreparation({ actor, channel, document })
      if (opened === null) {
        return { awaitingText: false, documentNumber: document.number, finished: true, texts: [] }
      }
      if (opened.photos.some((photo) => photo.providerMessageId === providerMessageId)) {
        return notUnderstood(opened, DELIVERY_PROOF_SPEECH.duplicatePhoto)
      }
      return storePhoto({
        ack: CANHOTO_TEXT.read(opened.documentNumber),
        actor,
        bytes,
        kind: 'photo',
        mimeType,
        preparation: opened,
        providerMessageId,
      })
    },

    async receiveLocation({ actor, location }) {
      const preparations = (await openFor(actor)).filter((item) => item.location === null)
      const [first, ...rest] = preparations
      if (first === undefined) return null
      for (const other of rest) {
        await repository.save({
          changes: { ...changesOf(other), location },
          companyId: other.companyId,
          id: other.id,
          version: other.version,
        })
      }
      return mutate(first, actor, () => ({
        ack: [DELIVERY_PROOF_SPEECH.received.location],
        changes: { location },
      }))
    },

    async receivePhoto({ actor, bytes, caption, mimeType, providerMessageId }) {
      const preparations = await openFor(actor)
      if (preparations.length === 0) return null
      const mentioned = caption === null ? [] : (caption.match(/\d{3,}/gu) ?? []).map(stripZeros)
      const preparation =
        preparations.find((item) => mentioned.includes(stripZeros(item.documentNumber))) ??
        preparations.find(
          (item) =>
            item.awaiting === DELIVERY_PROOF_ITEM.photo ||
            item.awaiting === DELIVERY_PROOF_ITEM.cargo,
        ) ??
        preparations[0]
      if (preparation === undefined) return null
      if (preparation.photos.some((photo) => photo.providerMessageId === providerMessageId)) {
        return notUnderstood(preparation, DELIVERY_PROOF_SPEECH.duplicatePhoto)
      }

      const { settings } = await checklistOf(preparation, actor)
      const kind = classifyPhoto(preparation, settings)
      if (kind === null) {
        return notUnderstood(
          preparation,
          DELIVERY_PROOF_SPEECH.noPhotoWanted(preparation.documentNumber),
        )
      }
      const cargoCount = preparation.photos.filter((photo) => photo.kind === 'cargo').length
      if (kind === 'cargo' && cargoCount >= TRIP_DELIVERY_PROOF_CARGO_LIMIT) {
        return notUnderstood(
          preparation,
          DELIVERY_PROOF_SPEECH.photoLimit(preparation.documentNumber),
        )
      }

      return storePhoto({ actor, bytes, kind, mimeType, preparation, providerMessageId })
    },
  }

  /** A preparação aberta da nota, ou a que acabou de abrir; `null` quando a corrida não deixa achar nenhuma. */
  async function openPreparation(input: {
    readonly actor: WhatsAppDriverActor
    readonly channel: WhatsAppDeliveryPreparationChannel
    readonly document: { readonly id: string; readonly number: string }
  }): Promise<null | WhatsAppDeliveryPreparation> {
    const { actor, channel, document } = input
    const scope = { companyId: actor.companyId, documentId: document.id }
    const existing = await repository.findOpenByDocument(scope)
    if (existing !== null) return existing
    const preparation =
      (await repository.open({
        ...scope,
        documentNumber: document.number,
        driverId: actor.driverId,
        originChannel: channel,
      })) ?? (await repository.findOpenByDocument(scope))
    if (preparation === null) return null
    ports.logger?.info(LOG.opened, {
      channel,
      companyId: actor.companyId,
      preparationId: preparation.id,
    })
    return preparation
  }

  /** Guarda a foto no bucket, barra o canhoto repetido (RF26) e soma a foto à preparação. */
  async function storePhoto(input: {
    readonly ack?: string
    readonly actor: WhatsAppDriverActor
    readonly bytes: Uint8Array
    readonly kind: 'cargo' | 'photo'
    readonly location?: null | ReportedLocation
    readonly mimeType: string
    readonly preparation: WhatsAppDeliveryPreparation
    readonly providerMessageId: string
  }): Promise<WhatsAppDeliveryPreparationReply> {
    const { actor, bytes, kind, mimeType, preparation, providerMessageId } = input
    const stored = await media.store({
      bytes,
      companyId: preparation.companyId,
      mimeType,
      preparationId: preparation.id,
    })
    // Spec 294 RF26: a mesma imagem já era canhoto — nada é guardado, e o bot diz de qual nota.
    const duplicate =
      kind === 'photo'
        ? await ports.findCanhotoByHash?.({
            companyId: preparation.companyId,
            sha256: stored.sha256,
          })
        : null
    if (duplicate !== null && duplicate !== undefined) {
      await media
        .remove({ companyId: preparation.companyId, objectKey: stored.objectKey })
        .catch(() => undefined)
      return notUnderstood(
        preparation,
        CANHOTO_TEXT.duplicate({
          attachedAt: duplicate.attachedAt,
          documentNumber: await duplicateNumber(preparation, duplicate.documentId),
        }),
      )
    }
    const photo: WhatsAppDeliveryPreparationPhoto = {
      kind,
      mimeType,
      objectKey: stored.objectKey,
      providerMessageId,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
    }
    return mutate(preparation, actor, (current) => ({
      ack: [input.ack ?? DELIVERY_PROOF_SPEECH.received[kind]],
      // O canhoto é um só (o app troca pelo mais novo); a mercadoria soma até o teto.
      changes: {
        ...(input.location !== undefined && input.location !== null && current.location === null
          ? { location: input.location }
          : {}),
        photos:
          kind === 'photo'
            ? [...current.photos.filter((item) => item.kind !== 'photo'), photo]
            : [...current.photos, photo],
      },
    }))
  }

  /** O número da nota a que o canhoto repetido já pertence: a própria, ou a que a viagem do motorista conhece. */
  async function duplicateNumber(
    preparation: WhatsAppDeliveryPreparation,
    documentId: string,
  ): Promise<string | undefined> {
    if (documentId === preparation.documentId) return preparation.documentNumber
    const stops =
      (await ports.listStops?.({
        companyId: preparation.companyId,
        driverId: preparation.driverId,
      })) ?? []
    const number = stops
      .flatMap((stop) => stop.documents)
      .find((document) => document.id === documentId)?.number
    return number === undefined ? undefined : stripZeros(number)
  }

  function skip(preparation: WhatsAppDeliveryPreparation, actor: WhatsAppDriverActor) {
    return mutate(preparation, actor, async (current, checklist) => {
      const question = checklist.next
      if (question === null || current.awaiting !== question.item) {
        return { reply: (await nextStep(current, checklist)).texts }
      }
      if (!question.optional) {
        return {
          reply: [
            DELIVERY_PROOF_SPEECH.stillMissingName,
            await describeQuestionOf(current, checklist, question),
          ],
        }
      }
      return {
        ack: [DELIVERY_PROOF_SPEECH.received.skipped(question.item)],
        changes: { skipped: [...new Set([...current.skipped, question.item])] },
      }
    })
  }
}

/**
 * Spec 294 RF19: o atendente dá a baixa pelo escritório, onde o comprovante é opcional — o bot oferece
 * cada item e aceita "pular" seja qual for a configuração; a assinatura não existe no WhatsApp.
 */
function relaxSettingsForAttendant(
  settings: DeliveryProofFieldSettings,
): DeliveryProofFieldSettings {
  const soften = (mode: DeliveryProofFieldSettings['photo']) =>
    mode === 'required' ? 'optional' : mode
  return {
    ...settings,
    cargo: soften(settings.cargo),
    photo: soften(settings.photo),
    receivedBy: soften(settings.receivedBy),
    receiverName: soften(settings.receiverName),
    signature: 'off',
  }
}

function classifyPhoto(
  preparation: WhatsAppDeliveryPreparation,
  settings: DeliveryProofFieldSettings,
): 'cargo' | 'photo' | null {
  if (preparation.awaiting === DELIVERY_PROOF_ITEM.cargo && settings.cargo !== 'off') return 'cargo'
  if (preparation.awaiting === DELIVERY_PROOF_ITEM.photo && settings.photo !== 'off') return 'photo'
  const hasPhoto = preparation.photos.some((photo) => photo.kind === 'photo')
  if (settings.photo !== 'off' && !hasPhoto) return 'photo'
  if (settings.cargo !== 'off') return 'cargo'
  return settings.photo !== 'off' ? 'photo' : null
}

function collectedOf(preparation: WhatsAppDeliveryPreparation) {
  return {
    cargoCount: preparation.photos.filter((photo) => photo.kind === 'cargo').length,
    hasLocation: preparation.location !== null,
    hasReceivedBy: preparation.receivedBy !== null,
    hasReceiverName: preparation.receiverName !== null && preparation.receiverName !== '',
    photoCount: preparation.photos.filter((photo) => photo.kind === 'photo').length,
    skipped: new Set(preparation.skipped),
  }
}

function changesOf(preparation: WhatsAppDeliveryPreparation): WhatsAppDeliveryPreparationChanges {
  return {
    awaiting: preparation.awaiting,
    location: preparation.location,
    photos: preparation.photos,
    receivedBy: preparation.receivedBy,
    receiverName: preparation.receiverName,
    skipped: preparation.skipped,
  }
}

function summarizeCollected(preparation: WhatsAppDeliveryPreparation): readonly string[] {
  return describeDeliveryConfirmCollected({
    canhotoPhotos: preparation.photos.filter((photo) => photo.kind === 'photo').length,
    cargoPhotos: preparation.photos.filter((photo) => photo.kind === 'cargo').length,
    location: preparation.location,
    receivedBy: preparation.receivedBy,
    receiverName: preparation.receiverName,
    skipped: preparation.skipped,
  })
}

/** Spec 294 RF22: o que o bot diz quando pediu mídia e veio áudio. */
export const MEDIA_REQUEST_TEXT = {
  location:
    'Esse item vai por localização: toque no clipe e envie a localização (ou responda "pular").',
  photo: 'Esse item vai por foto: tire a foto e envie aqui (ou responda "pular", se for opcional).',
} as const

/** Foto e localização chegam como mídia; áudio não as substitui. */
function isMediaQuestion(awaiting: null | string): boolean {
  return (
    awaiting === DELIVERY_PROOF_ITEM.photo ||
    awaiting === DELIVERY_PROOF_ITEM.cargo ||
    awaiting === DELIVERY_PROOF_ITEM.location
  )
}

/** As perguntas respondidas em texto. Foto e localização chegam como mídia. */
function isTextQuestion(awaiting: null | string): boolean {
  return (
    awaiting === DELIVERY_PREPARATION_AWAITING_CONFIRM ||
    awaiting === DELIVERY_PREPARATION_AWAITING_OUT_OF_ORDER ||
    awaiting === DELIVERY_PREPARATION_AWAITING_REPLACE_CANHOTO ||
    awaiting === DELIVERY_PROOF_ITEM.receivedBy ||
    awaiting === DELIVERY_PROOF_ITEM.receiverName
  )
}

/** As falas numa mensagem só (vazio continua vazio: nada a dizer). */
export function joinedTexts(texts: readonly string[]): readonly string[] {
  return texts.length === 0 ? [] : [texts.join('\n')]
}

function scopeOf(preparation: WhatsAppDeliveryPreparation) {
  return { companyId: preparation.companyId, id: preparation.id, version: preparation.version }
}

function finished(
  preparation: WhatsAppDeliveryPreparation,
  texts: readonly string[],
): WhatsAppDeliveryPreparationReply {
  return { awaitingText: false, documentNumber: preparation.documentNumber, finished: true, texts }
}

/** Só a baixa que fechou a parada continua a rota (a próxima parada, ou a rota concluída). */
export function routeContinuationOf(result: WhatsAppDriverEventResult): {
  readonly routeContinuation?: WhatsAppRouteContinuation
} {
  if (result.kind !== 'registered' || result.details?.stopCompleted !== true) return {}
  return {
    routeContinuation: {
      nextStop: result.details.nextStop ?? null,
      tripCompleted: result.details.tripCompleted,
    },
  }
}

function notUnderstood(
  preparation: WhatsAppDeliveryPreparation,
  text: string,
): WhatsAppDeliveryPreparationReply {
  return {
    awaitingText: isTextQuestion(preparation.awaiting),
    documentNumber: preparation.documentNumber,
    finished: false,
    texts: [text],
  }
}
