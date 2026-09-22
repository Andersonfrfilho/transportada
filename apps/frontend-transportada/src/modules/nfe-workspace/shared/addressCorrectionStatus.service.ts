/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O estado do pedido de correção por endereço (spec 150, T202): view-model puro que cruza as
 * linhas do relatório com `listAddressCorrectionRequests` por `addressKey`.
 *
 * ⚠️ **Rascunho e envio podem conviver na mesma chave.** `upsertDraft` (servidor) só colide com um
 * pedido `draft` — o índice único é parcial (`status = 'draft'`) — então salvar de novo depois de um
 * envio cria uma segunda linha em vez de reabrir a enviada. A lista pode trazer duas linhas para o
 * mesmo `addressKey`, e o estado exibido é sempre `draft`, com o último envio ao lado
 * (`lastSentAt`).
 */
import { cityCodeFromAddressKey } from './addressCorrection.validation'
import type {
  AddressCorrectionFields,
  AddressCorrectionRequestRecord,
} from './addressCorrection.validation'
import { formatPostalCode } from './addressCorrectionMask.service'
import type { AddressFinding } from './addressReport.validation'

export type AddressCorrectionState = 'draft' | 'none' | 'sent'

export type AddressCorrectionStatus = Readonly<{
  lastSentAt: null | string
  proposedSummary: null | string
  /** H3 ("para quem", revisão final): só preenchido quando `state` é `sent`. */
  recipientCount: null | number
  sentAt: null | string
  state: AddressCorrectionState
}>

const NONE_STATUS: AddressCorrectionStatus = {
  lastSentAt: null,
  proposedSummary: null,
  recipientCount: null,
  sentAt: null,
  state: 'none',
}

function latestSent(
  requests: readonly AddressCorrectionRequestRecord[],
): AddressCorrectionRequestRecord | undefined {
  return requests
    .filter((request) => request.status === 'sent')
    .reduce<AddressCorrectionRequestRecord | undefined>((latest, request) => {
      if (latest === undefined) return request
      return (request.sentAt ?? '') > (latest.sentAt ?? '') ? request : latest
    }, undefined)
}

function summarizeProposed(fields: AddressCorrectionFields): string {
  const base = `${fields.street}, ${fields.number} — ${fields.city}/${fields.state}`
  return fields.postalCode.length === 0 ? base : `${base} · ${formatPostalCode(fields.postalCode)}`
}

/**
 * O status de um `addressKey`, a partir de todas as linhas que a lista trouxe para ele. Chave sem
 * nenhuma linha (endereço nunca corrigido, ou pedido cuja chave não está no relatório) devolve
 * `none` — não há linha, não há o que cruzar.
 */
export function resolveAddressCorrectionStatus(
  requests: readonly AddressCorrectionRequestRecord[],
): AddressCorrectionStatus {
  const draft = requests.find((request) => request.status === 'draft')
  const sent = latestSent(requests)

  if (draft !== undefined) {
    return {
      lastSentAt: sent?.sentAt ?? null,
      proposedSummary: summarizeProposed(draft.proposed),
      recipientCount: null,
      sentAt: null,
      state: 'draft',
    }
  }

  if (sent !== undefined) {
    return {
      lastSentAt: null,
      proposedSummary: null,
      recipientCount: sent.recipientCount,
      sentAt: sent.sentAt,
      state: 'sent',
    }
  }

  return NONE_STATUS
}

/** O rascunho salvo desta chave, se houver — é o que pré-preenche o formulário ao reabrir. */
export function findDraftRequest(
  addressKey: string,
  requests: readonly AddressCorrectionRequestRecord[],
): AddressCorrectionRequestRecord | undefined {
  return requests.find((request) => request.addressKey === addressKey && request.status === 'draft')
}

/**
 * O valor inicial do formulário: o proposto do rascunho salvo, se houver, ou "como veio" na nota —
 * nunca os dois juntos, e nunca o proposto de um pedido já `sent` sem rascunho (RF1: reabrir um
 * envio não é editar; o próximo salvamento nasce do que a nota diz).
 */
export function initialAddressCorrectionFields(
  input: Readonly<{
    draft: AddressCorrectionRequestRecord | undefined
    finding: AddressFinding
  }>,
): AddressCorrectionFields {
  if (input.draft !== undefined) return input.draft.proposed

  return {
    city: input.finding.city,
    cityCode: cityCodeFromAddressKey(input.finding.addressKey),
    complement: '',
    district: input.finding.noteDistrict,
    number: input.finding.noteNumber,
    postalCode: input.finding.notePostalCode,
    state: input.finding.state,
    street: input.finding.noteStreet,
  }
}
