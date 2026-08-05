/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  MdfeCargoType,
  MdfeCargoUnit,
  MdfeEmitterType,
  MdfeManifestCreateBody,
  MdfeTransporterType,
} from './mdfeManifest.types'

export type MdfeManifestFormDraft = Readonly<{
  additionalInformation: string
  cargoProduct: string
  cargoProductNcm: string
  cargoType: '' | MdfeCargoType
  cargoUnit: MdfeCargoUnit
  contractorName: string
  contractorTaxId: string
  destinationState: string
  dischargePostalCode: string
  driverIds: readonly string[]
  emitterType: MdfeEmitterType
  freightValue: string
  insuranceEndorsement: string
  loadingPostalCode: string
  transporterType: '' | MdfeTransporterType
  tripStartedAt: string
  vehicleId: string
}>

export type MdfeManifestFormIssue =
  | 'cargoProductRequired'
  | 'destinationRequired'
  | 'documentsRequired'
  | 'driverRequired'
  | 'vehicleRequired'

type FormInput = Readonly<{
  documentIds: readonly string[]
  draft: MdfeManifestFormDraft
  /** Nasceu de uma viagem: veículo e motoristas vêm dela, então a tela não os pede. */
  tripId?: null | string
}>

export const EMPTY_MDFE_MANIFEST_FORM: MdfeManifestFormDraft = {
  additionalInformation: '',
  cargoProduct: '',
  cargoProductNcm: '',
  cargoType: '',
  cargoUnit: '01',
  contractorName: '',
  contractorTaxId: '',
  destinationState: '',
  dischargePostalCode: '',
  driverIds: [],
  emitterType: '1',
  freightValue: '',
  insuranceEndorsement: '',
  loadingPostalCode: '',
  transporterType: '',
  tripStartedAt: '',
  vehicleId: '',
}

const AMOUNT = /^(\d{1,13})(?:\.(\d{0,2}))?$/
const ZERO_AMOUNT = '0.00'
const AMOUNT_FRACTION_DIGITS = 2

/** A SEFAZ só aceita vAmount com duas casas — normalizar aqui evita 400 do Zod da API. */
function toAmount(value: string): string {
  const parts = AMOUNT.exec(value.trim().replace(',', '.'))
  if (parts === null) return ZERO_AMOUNT
  return `${parts[1] ?? '0'}.${(parts[2] ?? '').padEnd(AMOUNT_FRACTION_DIGITS, '0')}`
}

export function isManifestFromTrip(input: FormInput): boolean {
  return (input.tripId ?? '') !== ''
}

export function validateManifestForm(input: FormInput): readonly MdfeManifestFormIssue[] {
  const issues: MdfeManifestFormIssue[] = []
  const fromTrip = isManifestFromTrip(input)
  if (input.documentIds.length === 0) issues.push('documentsRequired')
  if (!fromTrip && input.draft.vehicleId.trim().length === 0) issues.push('vehicleRequired')
  if (!fromTrip && input.draft.driverIds.length === 0) issues.push('driverRequired')
  if (input.draft.destinationState.trim().length === 0) issues.push('destinationRequired')
  if (input.draft.cargoProduct.trim().length === 0) issues.push('cargoProductRequired')
  return issues
}

export function buildManifestCreateBody(input: FormInput): MdfeManifestCreateBody {
  const tripStartedAt = input.draft.tripStartedAt.trim()
  return {
    additionalInformation: input.draft.additionalInformation,
    cargoProduct: input.draft.cargoProduct,
    cargoProductNcm: input.draft.cargoProductNcm,
    cargoType: input.draft.cargoType,
    cargoUnit: input.draft.cargoUnit,
    contractorName: input.draft.contractorName,
    contractorTaxId: input.draft.contractorTaxId,
    destinationState: input.draft.destinationState,
    dischargePostalCode: input.draft.dischargePostalCode,
    documentIds: input.documentIds,
    driverIds: input.draft.driverIds,
    emitterType: input.draft.emitterType,
    freightValue: toAmount(input.draft.freightValue),
    insuranceEndorsement: input.draft.insuranceEndorsement,
    loadingPostalCode: input.draft.loadingPostalCode,
    transporterType: input.draft.transporterType,
    tripStartedAt: tripStartedAt.length === 0 ? null : tripStartedAt,
    vehicleId: input.draft.vehicleId,
  }
}

export function toggleDriver(driverIds: readonly string[], driverId: string): readonly string[] {
  return driverIds.includes(driverId)
    ? driverIds.filter((selected) => selected !== driverId)
    : [...driverIds, driverId]
}
