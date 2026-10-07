/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DELIVERY_CLIENT_DIRECTORY_LIMIT,
  useDeliveryClientDirectoryQuery,
} from '@/modules/delivery-clients/queries/useDeliveryClientDirectory.query'

import { CONTRACTOR_DIRECTORY_LIMIT } from '../shared/occurrence.constant'
import { useContractorsQuery } from '../queries/useContractors.query'
import type {
  OccurrenceExceptionLoadStatus,
  OccurrenceExceptionPeople,
} from '../shared/occurrenceExceptionPeople.service'

function toLoadStatus(query: Readonly<{ isError: boolean; isSuccess: boolean }>) {
  if (query.isError) return 'error' satisfies OccurrenceExceptionLoadStatus
  return query.isSuccess ? 'ready' : 'loading'
}

/** Uma consulta de cada por tela, e só quando um tipo é aberto: o seletor de contratante e o de destinatário dividem o resultado. */
export function useOccurrenceExceptionPeople(
  input: Readonly<{ enabled: boolean }>,
): OccurrenceExceptionPeople {
  const contractorsQuery = useContractorsQuery(input)
  const clientsQuery = useDeliveryClientDirectoryQuery(input)
  return {
    contractors: contractorsQuery.data ?? [],
    contractorsStatus: toLoadStatus(contractorsQuery),
    contractorsTruncated: (contractorsQuery.data?.length ?? 0) >= CONTRACTOR_DIRECTORY_LIMIT,
    recipients: (clientsQuery.data ?? []).map((client) => ({
      displayName: client.displayName,
      taxId: client.taxId,
    })),
    recipientsStatus: toLoadStatus(clientsQuery),
    recipientsTruncated: (clientsQuery.data?.length ?? 0) >= DELIVERY_CLIENT_DIRECTORY_LIMIT,
  }
}
