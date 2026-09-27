/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3 (L2): os tipos que o escritório oferece ao registrar ocorrência em nome do
 * motorista — só os ativos de rua, com `id`, `name` e `attachmentMode`. O assunto e o corpo do
 * e-mail são configuração (`settings.manage`) e não saem por aqui.
 */
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'

export type FieldOccurrenceType = {
  /**
   * Spec 179 T304: se o registro do motorista exige comprovante. `type.attachmentMode` é
   * ausente só para dado legado sem a coluna preenchida — aqui vira `'off'`, nunca fica
   * indefinido, porque a app do motorista já decide se antecipa a observação obrigatória a
   * partir deste campo.
   */
  readonly attachmentMode: DeliveryProofFieldMode
  readonly id: string
  readonly name: string
}

export type FieldOccurrenceTypesPort = {
  listOccurrenceTypes(input: {
    readonly companyId: string
  }): Promise<readonly OccurrenceTypeRecord[]>
}

export type ListFieldOccurrenceTypesParams = {
  readonly companyId: string
  readonly repository: FieldOccurrenceTypesPort
}

export async function listFieldOccurrenceTypes(
  params: ListFieldOccurrenceTypesParams,
): Promise<readonly FieldOccurrenceType[]> {
  const types = await params.repository.listOccurrenceTypes({ companyId: params.companyId })

  return types
    .filter((type) => type.active && type.stage === TRIP_OCCURRENCE_STAGE.delivery)
    .map((type) => ({
      attachmentMode: type.attachmentMode ?? 'off',
      id: type.id,
      name: type.name,
    }))
}
