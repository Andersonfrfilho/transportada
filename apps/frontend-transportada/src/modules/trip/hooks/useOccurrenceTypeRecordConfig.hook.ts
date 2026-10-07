/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { OCCURRENCE_TYPES_QUERY_KEY, type DeclaredAmountScope } from '../shared/occurrence.constant'
import { getTripClient } from './useTripWorkspace.hook'

export type OccurrenceTypeRecordConfig = Readonly<{
  amountLabel: string | undefined
  referenceLabel: string | undefined
  scope: DeclaredAmountScope | undefined
}>

const GENERIC_CONFIG: OccurrenceTypeRecordConfig = {
  amountLabel: undefined,
  referenceLabel: undefined,
  scope: undefined,
}

/**
 * Spec 247 T7.2 (A2): os rótulos e o nível do valor pago do **tipo** da ocorrência. O catálogo é de quem gerencia
 * as configurações (`settings.manage`): sem a permissão a consulta nem sai, e tipo não encontrado cai nos
 * rótulos genéricos — nunca bloqueia a correção.
 */
export function useOccurrenceTypeRecordConfig(
  input: Readonly<{ canReadCatalog: boolean; occurrenceTypeId: null | string }>,
): OccurrenceTypeRecordConfig {
  const query = useQuery({
    enabled: input.canReadCatalog && input.occurrenceTypeId !== null,
    queryFn: () => getTripClient().listOccurrenceTypes(),
    queryKey: OCCURRENCE_TYPES_QUERY_KEY,
    retry: false,
  })
  const type = query.data?.find((candidate) => candidate.id === input.occurrenceTypeId)
  if (type === undefined) return GENERIC_CONFIG
  return {
    amountLabel: type.declaredAmountLabel,
    referenceLabel: type.referenceNumberLabel,
    scope: type.declaredAmountScope,
  }
}
