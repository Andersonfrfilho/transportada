/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3 (L2): os tipos que o escritório oferece ao registrar ocorrência em nome do
 * motorista — só os ativos de rua, e só `id` e `name`. O assunto e o corpo do e-mail são
 * configuração (`settings.manage`) e não saem por aqui.
 */
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'

export type FieldOccurrenceType = {
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
    .map((type) => ({ id: type.id, name: type.name }))
}
