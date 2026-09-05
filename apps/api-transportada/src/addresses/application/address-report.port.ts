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
  /**
   * ⚠️ Na linha `unresolved` isto é `not_found` **literalmente** — o provedor não devolveu coordenada
   * utilizável —, e os campos `provider*` vêm vazios porque não há medição guardada: a rotina paga
   * grava o carimbo, nunca o que o provedor disse. Não é uma medição fingida.
   */
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

/**
 * As duas origens do relatório, lidas numa passada só (ADR-0062).
 *
 * `measurements` é o lote da ADR-0061: o provedor respondeu e a medição ficou guardada.
 * `unresolved` é o endereço que a rotina paga tentou e **não** conseguiu apontar — ele continua no
 * centroide do município. As duas viram linha da mesma lista porque a ação é a mesma: o cadastro
 * deste cliente precisa ser atualizado.
 *
 * Uma passada só porque as duas precisam do **mesmo** mapa de `addressKey` → endereço da nota +
 * emitente, e montá-lo duas vezes seria varrer `nfe_addresses` duas vezes por abertura de tela.
 */
export type AddressReportSource = Readonly<{
  measurements: readonly AddressReportRow[]
  unresolved: readonly AddressReportRow[]
}>

export type AddressReportRepository = Readonly<{
  read: (input: { readonly companyId: string }) => Promise<AddressReportSource>
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
  /**
   * Quantos endereços foram **conferidos contra o provedor** — o denominador, sem o qual "24 pedidos"
   * não diz nada. Soma as medições do lote e os que a rotina paga tentou: os dois custaram uma
   * consulta, e é isso que o número promete.
   */
  measured: number
  needingAttention: number
}>

export type AddressReport = Readonly<{
  groups: readonly AddressFindingGroup[]
  totals: AddressReportTotals
}>
