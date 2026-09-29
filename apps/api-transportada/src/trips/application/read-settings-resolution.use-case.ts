/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-E1: a tela de verificação (T14) pergunta "o que vale para esta combinação de
 * contratante/destinatário?" sem simular uma nota de verdade. Composição pura — sem escrita
 * nenhuma — que junta a configuração geral do comprovante com as duas listas de override já lidas
 * pelas rotas existentes (RF-C, RF-B) e aplica `resolveWithOverrides` (RF-D1) uma vez por campo/tipo.
 * Nenhuma consulta nova reimplementa a precedência: `resolveProofSettingsForRecipient` (RF-C3) e
 * `listFieldOccurrenceTypes` (RF-B2, T9 — o mesmo ponto que o app do motorista lê) são os dois
 * únicos lugares que decidem "quem vence".
 */
import {
  resolveProofSettingsForRecipient,
  type CompanyDeliveryProofSettings,
  type DeliveryProofFieldSettings,
} from '../domain/delivery-proof-settings.policy.js'
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceTypeFlow } from '../../shared/trip-occurrence.constant.js'
import type {
  DeliveryProofSettingsContractorOverride,
  DeliveryProofSettingsOverride,
} from '../infrastructure/drizzle-delivery-proof-settings.repository.js'
import {
  listFieldOccurrenceTypes,
  type FieldOccurrenceTypeOverridesPort,
  type FieldOccurrenceTypesPort,
} from './list-field-occurrence-types.use-case.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'

export type SettingsResolutionOccurrenceType = Readonly<{
  attachmentMode: DeliveryProofFieldMode
  flow: OccurrenceTypeFlow
  id: string
  name: string
  /** Todo item vem de `listFieldOccurrenceTypes`, que já filtra `stage: 'delivery'` — nunca outra. */
  stage: typeof TRIP_OCCURRENCE_STAGE.delivery
}>

export type SettingsResolutionResult = Readonly<{
  deliveryProof: DeliveryProofFieldSettings
  occurrenceTypes: readonly SettingsResolutionOccurrenceType[]
}>

export type SettingsResolutionPort = {
  readonly deliveryProof: {
    readonly listContractorOverrides: (input: {
      readonly companyId: string
    }) => Promise<readonly DeliveryProofSettingsContractorOverride[]>
    readonly listOverrides: (input: {
      readonly companyId: string
    }) => Promise<readonly DeliveryProofSettingsOverride[]>
    readonly readSettings: (input: {
      readonly companyId: string
    }) => Promise<CompanyDeliveryProofSettings>
  }
  readonly occurrenceTypeOverrides: FieldOccurrenceTypeOverridesPort
  readonly occurrenceTypes: FieldOccurrenceTypesPort
}

export type ReadSettingsResolutionParams = {
  readonly companyId: string
  /** Ao menos um dos dois vem preenchido — a fronteira (`settings-resolution.routes.ts`) já garante. */
  readonly contractorId: string | null
  readonly port: SettingsResolutionPort
  readonly recipientTaxId: string | null
}

/**
 * Os três repositórios devolvem o agregado inteiro (`taxId`/`contractorId`, e a geral também os
 * parâmetros de pontualidade e o interruptor do canhoto) — só os cinco campos entram na resolução,
 * mesmo recorte que `drizzle-current-driver-trip.repository.ts` já faz linha a linha na consulta.
 */
function toFieldSettings(input: DeliveryProofFieldSettings): DeliveryProofFieldSettings {
  return {
    photo: input.photo,
    receivedBy: input.receivedBy,
    receiverDocument: input.receiverDocument,
    receiverName: input.receiverName,
    signature: input.signature,
  }
}

export async function readSettingsResolution(
  params: ReadSettingsResolutionParams,
): Promise<SettingsResolutionResult> {
  const { companyId, contractorId, port, recipientTaxId } = params

  const [generalSettings, recipientOverrides, contractorOverrides, occurrenceTypes] =
    await Promise.all([
      port.deliveryProof.readSettings({ companyId }),
      port.deliveryProof.listOverrides({ companyId }),
      port.deliveryProof.listContractorOverrides({ companyId }),
      listFieldOccurrenceTypes({
        companyId,
        contractorId,
        overrides: port.occurrenceTypeOverrides,
        recipientTaxId,
        repository: port.occurrenceTypes,
      }),
    ])

  const deliveryProof = resolveProofSettingsForRecipient({
    contractorId,
    lookup: {
      general: toFieldSettings(generalSettings),
      overridesByContractorId: new Map(
        contractorOverrides.map((override) => [override.contractorId, toFieldSettings(override)]),
      ),
      overridesByTaxId: new Map(
        recipientOverrides.map((override) => [override.taxId, toFieldSettings(override)]),
      ),
    },
    recipientTaxId: recipientTaxId ?? '',
  })

  return {
    deliveryProof,
    occurrenceTypes: occurrenceTypes.map((type) => ({
      attachmentMode: type.attachmentMode,
      flow: type.flow,
      id: type.id,
      name: type.name,
      stage: TRIP_OCCURRENCE_STAGE.delivery,
    })),
  }
}
