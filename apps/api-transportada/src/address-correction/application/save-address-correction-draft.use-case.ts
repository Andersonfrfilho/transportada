/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AddressReportRepository,
  AddressReportRow,
} from '../../addresses/application/address-report.port.js'
import {
  AddressCorrectionAddressNotFoundError,
  AddressCorrectionContractorNotFoundError,
} from '../domain/address-correction.error.js'
import type {
  AddressCorrectionRepositoryPort,
  AddressCorrectionRequest,
  AddressFields,
} from './address-correction.port.js'

export type SaveAddressCorrectionDraftInput = {
  readonly actorUserId: string
  readonly addressKey: string
  readonly companyId: string
  readonly proposed: AddressFields
}

export type SaveAddressCorrectionDraftUseCase = Readonly<{
  save: (input: SaveAddressCorrectionDraftInput) => Promise<AddressCorrectionRequest>
}>

/**
 * RF2/RF4: "como veio" e o motivo são lidos aqui, do relatório (spec 084, G8) — nunca do corpo do
 * cliente — e a contratante é resolvida pelo CNPJ do emitente daquela chave, dentro da empresa do
 * token. `recipientName` (RF11) vem do mesmo relatório, nunca do body: o cliente nunca escolhe o
 * nome que aparece no e-mail.
 */
export function createSaveAddressCorrectionDraftUseCase(dependencies: {
  readonly addressCorrectionRepository: AddressCorrectionRepositoryPort
  readonly addressReportRepository: AddressReportRepository
}): SaveAddressCorrectionDraftUseCase {
  return {
    async save(input) {
      const found = await findReportRowByAddressKey({
        addressKey: input.addressKey,
        companyId: input.companyId,
        repository: dependencies.addressReportRepository,
      })
      if (found === undefined) throw new AddressCorrectionAddressNotFoundError()

      const contractor = await dependencies.addressCorrectionRepository.findContractorByTaxId({
        companyId: input.companyId,
        taxId: found.contractorTaxId,
      })
      if (contractor === undefined) throw new AddressCorrectionContractorNotFoundError()

      return dependencies.addressCorrectionRepository.upsertDraft({
        actorUserId: input.actorUserId,
        addressKey: input.addressKey,
        companyId: input.companyId,
        contractorId: contractor.id,
        proposed: input.proposed,
        reasonDistanceMetres: found.distanceMetres === null ? null : String(found.distanceMetres),
        reasonMatchLevel: found.matchLevel,
        recipientName: found.recipientName,
        reported: buildReportedFields({ addressKey: input.addressKey, found }),
      })
    },
  }
}

async function findReportRowByAddressKey(input: {
  readonly addressKey: string
  readonly companyId: string
  readonly repository: AddressReportRepository
}): Promise<AddressReportRow | undefined> {
  const source = await input.repository.read({ companyId: input.companyId })
  return (
    source.measurements.find((row) => row.addressKey === input.addressKey) ??
    source.unresolved.find((row) => row.addressKey === input.addressKey)
  )
}

/** `addressKey` é `cityCode|postalCode|number` (`trips/domain/stop-address-key.ts`). */
function buildReportedFields(input: {
  readonly addressKey: string
  readonly found: AddressReportRow
}): AddressFields {
  const { found } = input
  return {
    city: found.city,
    cityCode: input.addressKey.split('|')[0] ?? '',
    /** O relatório ainda não expõe complemento (`AddressReportRow` não o traz). */
    complement: null,
    district: found.noteDistrict.length > 0 ? found.noteDistrict : null,
    number: found.noteNumber,
    postalCode: found.notePostalCode,
    state: found.state,
    street: found.noteStreet,
  }
}
