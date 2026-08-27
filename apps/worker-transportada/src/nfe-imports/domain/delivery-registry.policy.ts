/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CNPJ_PATTERN, normalizeTaxId } from '../../shared/tax-id.service.js'

const CPF_PATTERN = /^[0-9]{11}$/u

export type NfeRegistryParty = {
  readonly name: string | null | undefined
  readonly role: string
  readonly taxId: string | null | undefined
}

export type DeliveryRegistryCandidate = {
  readonly displayName: string
  readonly taxId: string
}

export type DeliveryRegistryCandidates = {
  /** O contratante do frete: o **emitente** da nota, quem descarregou a carga no barracão. */
  readonly contractor: DeliveryRegistryCandidate | null
  /** O cliente de entrega: o **destinatário**. É ele que tem hora e tem preço. */
  readonly deliveryClient: DeliveryRegistryCandidate | null
}

/**
 * ADR-0048 §1: o cadastro nasce da nota. Esta política decide **quem** vira cadastro, e é pura de
 * propósito — a escrita tem de poder falhar sem derrubar a importação, e para isso ela precisa ser
 * a única parte que toca o banco.
 *
 * Documento fora de forma é **ausência**, nunca erro: a NF-e é dado de terceiro, e uma nota com CNPJ
 * torto no destinatário continua sendo uma nota que precisa entrar. O que ela não gera é cadastro.
 */
export function resolveDeliveryRegistryCandidates(
  parties: readonly NfeRegistryParty[],
): DeliveryRegistryCandidates {
  return {
    contractor: toCandidate(parties.find((party) => party.role === 'emitter')),
    deliveryClient: toCandidate(parties.find((party) => party.role === 'recipient')),
  }
}

function toCandidate(party: NfeRegistryParty | undefined): DeliveryRegistryCandidate | null {
  if (party === undefined) return null

  const taxId = normalizeTaxId(party.taxId ?? '')
  if (!CNPJ_PATTERN.test(taxId) && !CPF_PATTERN.test(taxId)) return null

  return { displayName: (party.name ?? '').trim(), taxId }
}
