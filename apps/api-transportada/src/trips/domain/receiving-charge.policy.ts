/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E3, E4, E8, E11): a cobrança no recebimento vira linhas de Ressarcimentos. Política pura: o caso de uso
 * lê as notas da parada (com cliente e contratante resolvidos no servidor) e esta função decide as linhas, o total
 * e quem pagou — sem banco.
 *
 * - **Por nota** (`one_per_document`): uma linha por nota, cada uma com o valor dela.
 * - **Agrupada** (`grouped`): uma linha para várias notas, com um valor só; as notas vão para
 *   `delivery_charge_documents`. Um cliente e uma contratante por linha.
 * - Parada com **uma** nota assume essa nota sem perguntar; com várias, a nota é obrigatória (E8).
 * - Dinheiro é texto e `bigint`, nunca `number` (spec 247): o total é a soma exata das linhas.
 * - O valor nunca vem de preço de item; vem do que o motorista digitou.
 */
import type { StopOccurrencePaidBy } from '../../database/trip.schema.js'
import type { PixKeyType } from '../../shared/pix-key-type.constant.js'
import { formatScaledDecimal, parseScaledDecimal } from './occurrence-amount.policy.js'
import {
  StopOccurrenceChargeGroupMixedPartiesError,
  StopOccurrenceDocumentNotInStopError,
  StopOccurrenceDocumentRequiredError,
  StopOccurrenceDriverPixRequiredError,
  StopOccurrencePaidByRequiredError,
} from './receiving-charge.error.js'
import {
  OccurrenceChargePartiesUnresolvedError,
  TripOccurrenceDeclaredAmountRequiredError,
} from './trip.error.js'

export const RECEIVING_CHARGE_MODES = ['one_per_document', 'grouped'] as const
export type ReceivingChargeMode = (typeof RECEIVING_CHARGE_MODES)[number]

/** O tipo de parada que vira cobrança no recebimento (E9: o `stopKind` histórico fica). */
export const RECEIVING_CHARGE_STOP_KIND = 'unexpected_charge'

/** O corpo da cobrança, como o app manda. Tudo opcional: quem decide o que falta é esta política. */
export type ReceivingChargeInput = {
  /** O valor da linha agrupada, ou o da única nota no modo por nota. */
  readonly amount?: string | undefined
  readonly documents?:
    | readonly { readonly amount?: string | undefined; readonly documentId: string }[]
    | undefined
  readonly driverPix?: { readonly key: string; readonly type: PixKeyType } | undefined
  readonly mode?: ReceivingChargeMode | undefined
  readonly paidBy?: StopOccurrencePaidBy | undefined
}

/** Uma nota ainda na parada, com as partes lidas da própria nota no servidor (nunca do corpo). */
export type ReceivingChargeStopDocument = {
  readonly contractorId: null | string
  /** `null` quando o destinatário não tem cadastro de cliente — a linha não nasce sem ele. */
  readonly deliveryClientId: null | string
  readonly documentId: string
  readonly tripId: string
}

export type ReceivingChargeLine = {
  /** Texto do `numeric(14,4)`. */
  readonly amount: string
  readonly contractorId: null | string
  readonly deliveryClientId: string
  /** Todas as notas da linha; a linha por nota tem uma só. */
  readonly documentIds: readonly string[]
  readonly grouped: boolean
  readonly tripId: string
  /** A nota da linha por nota; `null` na agrupada (o CHECK do banco amarra os dois). */
  readonly tripDocumentId: null | string
}

export type ResolvedReceivingCharge = {
  /** E4: o total da ocorrência, a soma exata das linhas. */
  readonly declaredAmount: string
  readonly driverPixKey: null | string
  readonly driverPixKeyType: null | PixKeyType
  readonly lines: readonly ReceivingChargeLine[]
  readonly paidBy: StopOccurrencePaidBy
}

export type ResolveReceivingChargeParams = {
  /** O `documentId` de topo da ocorrência: vale como a nota quando o corpo da cobrança não lista nenhuma. */
  readonly fallbackDocumentId: null | string
  readonly input: ReceivingChargeInput | undefined
  readonly stopDocuments: readonly ReceivingChargeStopDocument[]
}

const AMOUNT_FIELD = 'receivingCharge.amount'
const DOCUMENTS_FIELD = 'receivingCharge.documents'

type RequestedDocument = { readonly amount?: string | undefined; readonly documentId: string }

function requestedDocuments(params: ResolveReceivingChargeParams): readonly RequestedDocument[] {
  const listed = params.input?.documents ?? []
  if (listed.length > 0) return listed
  if (params.fallbackDocumentId !== null) return [{ documentId: params.fallbackDocumentId }]
  const [only, ...others] = params.stopDocuments
  if (only !== undefined && others.length === 0) return [{ documentId: only.documentId }]
  throw new StopOccurrenceDocumentRequiredError()
}

function findStopDocument(
  params: ResolveReceivingChargeParams,
  documentId: string,
  index: number,
): ReceivingChargeStopDocument & { readonly deliveryClientId: string } {
  const found = params.stopDocuments.find((document) => document.documentId === documentId)
  if (found === undefined) {
    throw new StopOccurrenceDocumentNotInStopError(`${DOCUMENTS_FIELD}.${String(index)}`)
  }
  if (found.deliveryClientId === null) throw new OccurrenceChargePartiesUnresolvedError()
  return { ...found, deliveryClientId: found.deliveryClientId }
}

function assertDistinct(documents: readonly RequestedDocument[]): void {
  const seen = new Set<string>()
  documents.forEach((document, index) => {
    if (seen.has(document.documentId)) {
      throw new StopOccurrenceDocumentNotInStopError(`${DOCUMENTS_FIELD}.${String(index)}`)
    }
    seen.add(document.documentId)
  })
}

function toScaledAmount(value: string): string {
  return formatScaledDecimal(parseScaledDecimal(value))
}

function resolvePerDocumentLines(
  params: ResolveReceivingChargeParams,
  documents: readonly RequestedDocument[],
): readonly ReceivingChargeLine[] {
  return documents.map((requested, index) => {
    const document = findStopDocument(params, requested.documentId, index)
    const amount =
      requested.amount ?? (documents.length === 1 ? params.input?.amount : undefined) ?? null
    if (amount === null) {
      throw new TripOccurrenceDeclaredAmountRequiredError(
        documents.length === 1 ? AMOUNT_FIELD : `${DOCUMENTS_FIELD}.${String(index)}.amount`,
      )
    }
    return {
      amount: toScaledAmount(amount),
      contractorId: document.contractorId,
      deliveryClientId: document.deliveryClientId,
      documentIds: [document.documentId],
      grouped: false,
      tripDocumentId: document.documentId,
      tripId: document.tripId,
    }
  })
}

function resolveGroupedLine(
  params: ResolveReceivingChargeParams,
  documents: readonly RequestedDocument[],
): ReceivingChargeLine {
  const resolved = documents.map((requested, index) =>
    findStopDocument(params, requested.documentId, index),
  )
  const [first] = resolved
  if (first === undefined) throw new StopOccurrenceDocumentRequiredError()
  const mixed = resolved.some(
    (document) =>
      document.deliveryClientId !== first.deliveryClientId ||
      document.contractorId !== first.contractorId,
  )
  if (mixed) throw new StopOccurrenceChargeGroupMixedPartiesError()

  const amount = params.input?.amount
  if (amount === undefined) throw new TripOccurrenceDeclaredAmountRequiredError(AMOUNT_FIELD)
  return {
    amount: toScaledAmount(amount),
    contractorId: first.contractorId,
    deliveryClientId: first.deliveryClientId,
    documentIds: resolved.map((document) => document.documentId),
    grouped: true,
    tripDocumentId: null,
    tripId: first.tripId,
  }
}

function resolvePayer(
  input: ReceivingChargeInput | undefined,
): Pick<ResolvedReceivingCharge, 'driverPixKey' | 'driverPixKeyType' | 'paidBy'> {
  const paidBy = input?.paidBy
  if (paidBy === undefined) throw new StopOccurrencePaidByRequiredError()
  if (paidBy === 'company') return { driverPixKey: null, driverPixKeyType: null, paidBy }

  const key = input?.driverPix?.key.trim() ?? ''
  const type = input?.driverPix?.type
  if (key === '' || type === undefined) throw new StopOccurrenceDriverPixRequiredError()
  return { driverPixKey: key, driverPixKeyType: type, paidBy }
}

/**
 * Decide as linhas, nesta ordem: nota (E8), valor (E3), partes (E5), quem pagou e o PIX (E11). Tudo antes de
 * qualquer escrita: a transação do registro não abre linha nenhuma se algo faltar.
 */
export function resolveReceivingCharge(
  params: ResolveReceivingChargeParams,
): ResolvedReceivingCharge {
  const documents = requestedDocuments(params)
  assertDistinct(documents)
  const lines =
    params.input?.mode === 'grouped'
      ? [resolveGroupedLine(params, documents)]
      : resolvePerDocumentLines(params, documents)
  const total = lines.reduce((sum, line) => sum + parseScaledDecimal(line.amount), 0n)

  return {
    declaredAmount: formatScaledDecimal(total),
    lines,
    ...resolvePayer(params.input),
  }
}
