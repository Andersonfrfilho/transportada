/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverOccurrencePhoto,
  DriverOccurrenceType,
  DriverPhotoSlot,
  DriverPixKeyType,
  ReceivingChargeBody,
  ReceivingChargeMode,
  ReceivingChargePaidBy,
} from './driverTrip.types'
import { unmaskMoneyText } from './occurrenceMoneyMask.service'
import { resolveOccurrenceFlow } from './occurrenceRegistration.service'

/**
 * Spec 317 (E1, E3, E4, E11, RF8, RF9): a cobrança no recebimento no app. Tudo aqui é puro: o servidor manda as vagas de
 * foto do tipo (`photoSlots`) e o app só lê; quem cobra de verdade é a API (`resolveStopOccurrencePhotos`,
 * `resolveReceivingCharge`) — nenhuma precedência é reimplementada aqui.
 */

/** O `stopKind` histórico do tipo (E9): a chave que o servidor já manda, não o nome. */
const RECEIVING_CHARGE_STOP_KIND = 'unexpected_charge'

/** Tipo de parada, `unexpected_charge`, com vagas de foto: o formulário da cobrança. Sem vagas (API antiga), o formulário de sempre. */
export function isReceivingChargeType(type: DriverOccurrenceType | undefined): boolean {
  return (
    type !== undefined &&
    resolveOccurrenceFlow(type) === 'stop' &&
    type.stopKind === RECEIVING_CHARGE_STOP_KIND &&
    (type.photoSlots?.length ?? 0) > 0
  )
}

/** As vagas na ordem do servidor (`position`, depois `slotKey`). */
export function listOrderedSlots(type: DriverOccurrenceType): readonly DriverPhotoSlot[] {
  return [...(type.photoSlots ?? [])].sort(
    (left, right) =>
      left.position - right.position || left.slotKey.localeCompare(right.slotKey, 'en'),
  )
}

export type ReceivingChargeDraft = Readonly<{
  /** Valor da cobrança (a nota única, ou o da linha agrupada), no texto mascarado do campo. */
  amountText: string
  /** Valor de cada nota no modo "por nota" com mais de uma, no texto mascarado. */
  documentAmountTexts: Readonly<Record<string, string>>
  mode: ReceivingChargeMode
  paidBy: ReceivingChargePaidBy | undefined
  pixKey: string
  pixKeyType: DriverPixKeyType | undefined
  /** As notas marcadas quando a parada tem mais de uma. */
  selectedDocumentIds: readonly string[]
  slotPhotos: Readonly<Record<string, DriverOccurrencePhoto>>
}>

export const EMPTY_RECEIVING_CHARGE_DRAFT: ReceivingChargeDraft = {
  amountText: '',
  documentAmountTexts: {},
  mode: 'one_per_document',
  paidBy: undefined,
  pixKey: '',
  pixKeyType: undefined,
  selectedDocumentIds: [],
  slotPhotos: {},
}

export type ReceivingChargeMissing =
  | Readonly<{ kind: 'amount' }>
  | Readonly<{ documentId: string; kind: 'documentAmount' }>
  | Readonly<{ kind: 'documents' }>
  | Readonly<{ kind: 'paidBy' }>
  | Readonly<{ kind: 'pix' }>
  | Readonly<{ kind: 'photo'; label: string; slotKey: string }>

type ChargeContext = Readonly<{
  /** Os ids das notas da parada, na ordem em que o cartão as mostra. */
  documentIds: readonly string[]
  slots: readonly DriverPhotoSlot[]
}>

/** Mais de uma nota na parada: o motorista escolhe quais e o modo. Uma só é assumida (E4). */
export function hasDocumentChoice(context: Pick<ChargeContext, 'documentIds'>): boolean {
  return context.documentIds.length > 1
}

/** Nota sem valor digitado é "não informada"; `0,00` é valor (247). */
function hasAmount(text: string): boolean {
  return unmaskMoneyText(text) !== undefined
}

/**
 * O que ainda falta para o envio: uma foto por vaga `required` (a mensagem diz **qual** — "o que falta"), o valor, as
 * notas e o modo, quem pagou e, se foi o motorista, a chave PIX.
 */
export function listMissingReceivingCharge(
  input: Readonly<{ context: ChargeContext; draft: ReceivingChargeDraft }>,
): readonly ReceivingChargeMissing[] {
  const { context, draft } = input
  const missing: ReceivingChargeMissing[] = []

  for (const slot of context.slots) {
    if (slot.required && draft.slotPhotos[slot.slotKey] === undefined) {
      missing.push({ kind: 'photo', label: slot.label, slotKey: slot.slotKey })
    }
  }

  if (!hasDocumentChoice(context)) {
    if (!hasAmount(draft.amountText)) missing.push({ kind: 'amount' })
  } else if (draft.selectedDocumentIds.length === 0) {
    missing.push({ kind: 'documents' })
  } else if (draft.mode === 'grouped') {
    if (!hasAmount(draft.amountText)) missing.push({ kind: 'amount' })
  } else {
    for (const documentId of draft.selectedDocumentIds) {
      if (!hasAmount(draft.documentAmountTexts[documentId] ?? '')) {
        missing.push({ documentId, kind: 'documentAmount' })
      }
    }
  }

  if (draft.paidBy === undefined) missing.push({ kind: 'paidBy' })
  else if (
    draft.paidBy === 'driver' &&
    (draft.pixKey.trim() === '' || draft.pixKeyType === undefined)
  ) {
    missing.push({ kind: 'pix' })
  }
  return missing
}

/**
 * O corpo `receivingCharge` do servidor. Dinheiro sai como texto (`"12.34"`), nunca `number`; a nota única não vai
 * listada (o servidor a assume), e a agrupada manda só as notas com o valor único. `undefined` é rascunho incompleto.
 */
export function buildReceivingChargeBody(
  input: Readonly<{ context: ChargeContext; draft: ReceivingChargeDraft }>,
): ReceivingChargeBody | undefined {
  const { context, draft } = input
  if (listMissingReceivingCharge(input).some((entry) => entry.kind !== 'photo')) return undefined
  if (draft.paidBy === undefined) return undefined

  const payer =
    draft.paidBy === 'driver' && draft.pixKeyType !== undefined
      ? { driverPix: { key: draft.pixKey.trim(), type: draft.pixKeyType } }
      : {}

  if (!hasDocumentChoice(context)) {
    const amount = unmaskMoneyText(draft.amountText)
    if (amount === undefined) return undefined
    return { amount, mode: 'one_per_document', paidBy: draft.paidBy, ...payer }
  }

  const selected = context.documentIds.filter((id) => draft.selectedDocumentIds.includes(id))
  if (draft.mode === 'grouped') {
    const amount = unmaskMoneyText(draft.amountText)
    if (amount === undefined) return undefined
    return {
      amount,
      documents: selected.map((documentId) => ({ documentId })),
      mode: 'grouped',
      paidBy: draft.paidBy,
      ...payer,
    }
  }
  const documents = selected.flatMap((documentId) => {
    const amount = unmaskMoneyText(draft.documentAmountTexts[documentId] ?? '')
    return amount === undefined ? [] : [{ amount, documentId }]
  })
  return { documents, mode: 'one_per_document', paidBy: draft.paidBy, ...payer }
}

/** As fotos na ordem das vagas, só as capturadas — é o que o item da fila leva. */
export function listSlotPhotos(
  input: Readonly<{ context: ChargeContext; draft: ReceivingChargeDraft }>,
): readonly Readonly<{ photo: DriverOccurrencePhoto; slotKey: string }>[] {
  return input.context.slots.flatMap((slot) => {
    const photo = input.draft.slotPhotos[slot.slotKey]
    return photo === undefined ? [] : [{ photo, slotKey: slot.slotKey }]
  })
}
