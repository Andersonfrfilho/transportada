/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useDeliveryClientDirectoryQuery } from '@/modules/delivery-clients/queries/useDeliveryClientDirectory.query'

import { useContractorsQuery } from '../queries/useContractors.query'
import type {
  OccurrenceExceptionLoadStatus,
  OccurrenceExceptionPeople,
} from '../shared/occurrenceExceptionPeople.service'

function toLoadStatus(query: Readonly<{ isError: boolean; isSuccess: boolean }>) {
  if (query.isError) return 'error' satisfies OccurrenceExceptionLoadStatus
  return query.isSuccess ? 'ready' : 'loading'
}

/** Uma consulta de cada por tela: o seletor de contratante e o de destinatário dividem o resultado. */
export function useOccurrenceExceptionPeople(
  input: Readonly<{ enabled: boolean }>,
): OccurrenceExceptionPeople {
  const contractorsQuery = useContractorsQuery(input)
  const clientsQuery = useDeliveryClientDirectoryQuery(input)
  return {
    contractors: contractorsQuery.data ?? [],
    contractorsStatus: toLoadStatus(contractorsQuery),
    recipients: (clientsQuery.data ?? []).map((client) => ({
      displayName: client.displayName,
      taxId: client.taxId,
    })),
    recipientsStatus: toLoadStatus(clientsQuery),
  }
}
