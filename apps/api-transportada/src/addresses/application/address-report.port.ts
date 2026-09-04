/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ProviderMatchLevel } from '../../database/database.schema.js'
import type { AddressFindingKind } from '../domain/address-finding.policy.js'

/**
 * Uma medição do lote, com o texto dos dois lados e quem emitiu a nota (spec 084, G8).
 * É PII: **nada disto vai para log** — o que rastreia é a `addressKey`.
 */
export type AddressReportRow = Readonly<{
  addressKey: string
  city: string
  cityMismatch: boolean
  comparedAt: Date
  /** O emitente da nota. Vazio quando a medição não alcança nota nenhuma hoje. */
  contractorName: string
  contractorTaxId: string
  distanceMetres: null | number
  matchLevel: ProviderMatchLevel
  noteDistrict: string
  noteNumber: string
  notePostalCode: string
  noteStreet: string
  providerDistrict: string
  providerNumber: string
  providerPostalCode: string
  providerStreet: string
  state: string
}>

export type AddressReportRepository = Readonly<{
  listMeasurements: (input: { readonly companyId: string }) => Promise<readonly AddressReportRow[]>
}>

/** Uma linha do relatório: a medição mais o pedido que ela gera. */
export type AddressFinding = AddressReportRow & Readonly<{ kind: AddressFindingKind }>

/**
 * ⚠️ **O agrupamento é por contratante porque é ele quem corrige.** A ADR-0057 já decidiu que o
 * aviso é disparado pelo operador e endereçado a quem **emitiu** a nota — não ao destinatário, que
 * é quem recebe a carga e não tem acesso ao cadastro que gerou o texto errado.
 */
export type AddressFindingGroup = Readonly<{
  contractorName: string
  contractorTaxId: string
  findings: readonly AddressFinding[]
}>

export type AddressReportTotals = Readonly<{
  /** Quantos endereços o lote mediu — o denominador, sem o qual "24 pedidos" não diz nada. */
  measured: number
  needingAttention: number
}>

export type AddressReport = Readonly<{
  groups: readonly AddressFindingGroup[]
  totals: AddressReportTotals
}>
