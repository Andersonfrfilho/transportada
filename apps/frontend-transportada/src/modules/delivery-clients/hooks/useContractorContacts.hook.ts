/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getContractorContactsClient } from '../shared/contractorContactsClient.service'
import type {
  ContractorContactCreateBody,
  ContractorContactUpdateBody,
} from '../shared/contractorContactsClient.service'

const CONTRACTORS_QUERY_KEY = 'contractor-contacts-contractors'
const CONTACTS_QUERY_KEY = 'contractor-contacts'

export function useContractorContacts(
  input: Readonly<{ contractorId: string | undefined; enabled: boolean }>,
) {
  const queryClient = useQueryClient()
  const client = getContractorContactsClient()
  const contactsKey = [CONTACTS_QUERY_KEY, input.contractorId] as const

  const contractorsQuery = useQuery({
    enabled: input.enabled,
    queryFn: () => client.listContractors(),
    queryKey: [CONTRACTORS_QUERY_KEY],
  })

  const contactsQuery = useQuery({
    enabled: input.enabled && input.contractorId !== undefined,
    queryFn: () => client.listContacts(input.contractorId ?? ''),
    queryKey: contactsKey,
  })

  function invalidateContacts(): void {
    void queryClient.invalidateQueries({ queryKey: contactsKey })
  }

  const createMutation = useMutation({
    mutationFn: (body: ContractorContactCreateBody) =>
      client.createContact({ body, contractorId: input.contractorId ?? '' }),
    onSuccess: invalidateContacts,
  })

  const updateMutation = useMutation({
    mutationFn: (variables: Readonly<{ body: ContractorContactUpdateBody; contactId: string }>) =>
      client.updateContact({
        body: variables.body,
        contactId: variables.contactId,
        contractorId: input.contractorId ?? '',
      }),
    onSuccess: invalidateContacts,
  })

  return { contactsQuery, contractorsQuery, createMutation, updateMutation }
}
