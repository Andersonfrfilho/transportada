/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O relatório de endereços a corrigir (spec 084, G10).
 *
 * ⚠️ **Os tipos de pedido são cópia por valor da API**, como `FUEL_TYPES` e `VEHICLE_TYPES`: o
 * bundle não carrega código do servidor. A ordem faz parte do contrato — ela é a gravidade, e é por
 * ela que a tela ordena. Mudou de um lado, mude do outro
 * (`api-transportada/src/addresses/domain/address-finding.policy.ts`).
 */
export const ADDRESS_FINDING_KINDS = [
  'street_unknown',
  'city_mismatch',
  'street_different',
  'postal_code_stale',
  'street_incomplete',
] as const

export type AddressFindingKind = (typeof ADDRESS_FINDING_KINDS)[number]

export type AddressFinding = Readonly<{
  addressKey: string
  city: string
  distanceMetres: null | number
  kind: AddressFindingKind
  noteDistrict: string
  noteNumber: string
  notePostalCode: string
  noteStreet: string
  providerPostalCode: string
  providerStreet: string
  state: string
}>

export type AddressFindingGroup = Readonly<{
  contractorName: string
  contractorTaxId: string
  findings: readonly AddressFinding[]
}>

export type AddressReport = Readonly<{
  groups: readonly AddressFindingGroup[]
  totals: Readonly<{ measured: number; needingAttention: number }>
}>

const EMPTY_REPORT: AddressReport = {
  groups: [],
  totals: { measured: 0, needingAttention: 0 },
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function isFindingKind(value: unknown): value is AddressFindingKind {
  return ADDRESS_FINDING_KINDS.some((kind) => kind === value)
}

/**
 * ⚠️ **Tipo de pedido desconhecido derruba a linha, não o relatório.** A API pode ganhar um tipo
 * novo antes de esta app subir, e uma tela em branco esconderia os vinte e três pedidos que a versão
 * antiga entende perfeitamente — enquanto a linha ausente só esconde o pedido que ela não sabe
 * rotular, e que apareceria como chave crua se passasse.
 */
export function mapAddressReport(value: unknown): AddressReport {
  const data = record(record(value).data)
  const groups = Array.isArray(data.groups) ? data.groups : []
  const totals = record(data.totals)

  return {
    groups: groups.map(mapGroup).filter((group) => group.findings.length > 0),
    totals: {
      measured: count(totals.measured),
      needingAttention: count(totals.needingAttention),
    },
  }
}

function mapGroup(value: unknown): AddressFindingGroup {
  const group = record(value)
  const findings = Array.isArray(group.findings) ? group.findings : []

  return {
    contractorName: text(group.contractorName),
    contractorTaxId: text(group.contractorTaxId),
    findings: findings
      .map(mapFinding)
      .filter((finding): finding is AddressFinding => finding !== null),
  }
}

function mapFinding(value: unknown): AddressFinding | null {
  const finding = record(value)
  if (!isFindingKind(finding.kind)) return null

  const distance = finding.distanceMetres

  return {
    addressKey: text(finding.addressKey),
    city: text(finding.city),
    distanceMetres: typeof distance === 'number' && Number.isFinite(distance) ? distance : null,
    kind: finding.kind,
    noteDistrict: text(finding.noteDistrict),
    noteNumber: text(finding.noteNumber),
    notePostalCode: text(finding.notePostalCode),
    noteStreet: text(finding.noteStreet),
    providerPostalCode: text(finding.providerPostalCode),
    providerStreet: text(finding.providerStreet),
    state: text(finding.state),
  }
}

export { EMPTY_REPORT as EMPTY_ADDRESS_REPORT }
