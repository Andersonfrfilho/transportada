/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useEmailTemplatesQuery } from '@/modules/notification/queries/useEmailTemplates.query'
import { useOccurrenceAttachmentOverridesBatchQuery } from '@/modules/trip/queries/useOccurrenceAttachmentOverridesBatch.query'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import {
  buildOccurrenceEmailTemplateOptions,
  type OccurrenceEmailTemplatesState,
} from '@/modules/trip/shared/occurrenceTemplate.service'

import { useOccurrenceExceptionPeople } from './useOccurrenceExceptionPeople.hook'

function toLoadStatus(query: Readonly<{ isError: boolean; isSuccess: boolean }>) {
  if (query.isError) return 'error' as const
  return query.isSuccess ? ('ready' as const) : ('loading' as const)
}

/**
 * Spec 246 RF11c: uma consulta de exceções por tela, e uma de contratantes e de clientes — nunca por
 * tipo. As duas listas grandes só vêm quando alguém abre um tipo ou busca por quem tem exceção.
 */
export function useOccurrenceTypeCatalogData(
  input: Readonly<{ canManage: boolean; isPeopleNeeded: boolean }>,
) {
  const overridesQuery = useOccurrenceAttachmentOverridesBatchQuery({ enabled: input.canManage })
  const people = useOccurrenceExceptionPeople({ enabled: input.canManage && input.isPeopleNeeded })

  function exceptionsOf(type: OccurrenceType): OccurrenceTypeExceptionsState {
    if (overridesQuery.isError) return { overrides: undefined, people, status: 'error' }
    if (!overridesQuery.isSuccess) return { overrides: undefined, people, status: 'loading' }
    const found = overridesQuery.data.find((entry) => entry.occurrenceTypeId === type.id)
    return {
      overrides: found ?? { contractorOverrides: [], recipientOverrides: [] },
      people,
      status: 'ready',
    }
  }

  const emailTemplates = useEmailTemplatesQuery({ enabled: input.canManage })
  const templates: OccurrenceEmailTemplatesState = {
    options: buildOccurrenceEmailTemplateOptions(emailTemplates.data ?? []),
    status: toLoadStatus(emailTemplates),
  }

  return { exceptionsOf, overridesQuery, people, templates }
}
