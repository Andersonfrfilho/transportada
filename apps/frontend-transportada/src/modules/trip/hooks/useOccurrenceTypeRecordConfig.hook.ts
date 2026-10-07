/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { OCCURRENCE_TYPES_QUERY_KEY } from '../shared/occurrence.constant'
import {
  GENERIC_RECORD_CONFIG,
  type OccurrenceTypeRecordConfig,
} from '../shared/occurrenceRecordConfig.service'
import { getTripClient } from './useTripWorkspace.hook'

/**
 * Spec 247 T7.2 (A2): o **fallback** dos rótulos e do nível do valor pago do tipo, quando o detalhe da ocorrência
 * não publica `requirements` (API anterior). O catálogo é de quem gerencia as configurações (`settings.manage`):
 * sem a permissão a consulta nem sai, e tipo não encontrado cai nos rótulos genéricos — nunca bloqueia a correção.
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
  if (type === undefined) return GENERIC_RECORD_CONFIG
  return {
    amountLabel: type.declaredAmountLabel,
    amountMode: type.declaredAmountMode,
    referenceLabel: type.referenceNumberLabel,
    referenceMode: type.referenceNumberMode,
    scope: type.declaredAmountScope,
  }
}
