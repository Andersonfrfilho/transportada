/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que o painel entrega a cada tipo quando ninguém tem exceção e ninguém foi carregado: os contratos
 * de linha só precisam de um valor válido para a prop. Dados sintéticos.
 */
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'

export const EMPTY_EXCEPTIONS_STATE: OccurrenceTypeExceptionsState = {
  overrides: { contractorOverrides: [], recipientOverrides: [] },
  people: {
    contractors: [],
    contractorsStatus: 'ready',
    recipients: [],
    recipientsStatus: 'ready',
  },
  status: 'ready',
}
