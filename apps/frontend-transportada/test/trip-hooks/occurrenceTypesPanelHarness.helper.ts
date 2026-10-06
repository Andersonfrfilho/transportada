/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3: o painel de tipos montado de verdade, com a API dublada — exceções em lote, contratantes
 * e clientes cadastrados — e os gestos que os contratos dividem (abrir o tipo, escolher numa lista).
 * Dados sintéticos.
 */
import { mock } from 'bun:test'

import type { DeliveryClient } from '@/modules/delivery-clients/shared/deliveryClients.types'
import type {
  OccurrenceAttachmentOverrides,
  OccurrenceAttachmentOverridesByType,
} from '@/modules/trip/shared/occurrence.constant'
import type { ContractorSummary } from '@/modules/trip/shared/contractorSummary.service'

import { createUnexpectedTripClient } from '../fixtures/tripAssemblyHooks.fixture'
import { click } from './occurrenceCorrectionHarness.helper'
import { waitFor } from './renderHook.helper'
import { tripHookFakes } from './tripClientMocks.helper'

type ReplaceCall = Readonly<OccurrenceAttachmentOverrides & { occurrenceTypeId: string }>

export const exceptionDouble: {
  batchCalls: number
  clientListCalls: number
  clients: readonly DeliveryClient[] | 'failure'
  replaceCalls: ReplaceCall[]
} = { batchCalls: 0, clientListCalls: 0, clients: [], replaceCalls: [] }

export function buildDeliveryClient(
  overrides: Partial<DeliveryClient> & Pick<DeliveryClient, 'displayName' | 'taxId'>,
): DeliveryClient {
  return {
    defaultServiceTimeMinutes: null,
    deliveryFeeAmount: null,
    id: overrides.taxId,
    notes: '',
    requiresScheduling: false,
    status: 'active',
    ...overrides,
  }
}

export function installExceptionsDouble(
  input: Readonly<{
    byType?: OccurrenceAttachmentOverridesByType
    clients?: readonly DeliveryClient[] | 'failure'
    contractors?: readonly ContractorSummary[]
    failBatch?: boolean
  }> = {},
): void {
  exceptionDouble.batchCalls = 0
  exceptionDouble.clientListCalls = 0
  exceptionDouble.clients = input.clients ?? []
  exceptionDouble.replaceCalls = []
  tripHookFakes.tripClient = {
    ...createUnexpectedTripClient(),
    listContractors: () => Promise.resolve(input.contractors ?? []),
    listOccurrenceAttachmentOverridesBatch: () => {
      exceptionDouble.batchCalls += 1
      if (input.failBatch === true) return Promise.reject(new Error('REQUEST_FAILED'))
      return Promise.resolve(input.byType ?? [])
    },
    replaceOccurrenceAttachmentOverrides: (call) => {
      exceptionDouble.replaceCalls.push(structuredClone(call))
      return Promise.resolve({
        contractorOverrides: call.contractorOverrides,
        recipientOverrides: call.recipientOverrides,
      })
    },
  }
}

export function resetExceptionsDouble(): void {
  exceptionDouble.clients = []
}

/** O tipo nasce recolhido (RF11): os contratos que olham dentro dele abrem todos primeiro. */
export async function expandAllTypes(): Promise<void> {
  for (const summary of document.querySelectorAll<HTMLElement>('button[aria-expanded="false"]')) {
    if (summary.getAttribute('aria-controls') !== null) await click(summary)
  }
}

export function control(label: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)
}

export function controls(label: string): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`button[aria-label="${label}"]`)]
}

/** Os controles de dentro da lista de exceções: o tipo tem controles de mesmo nome na seção "O que exige". */
export function exceptionControls(label: string): readonly HTMLElement[] {
  const section = document.querySelector('section[aria-label^="Exceções por cliente"]')
  return [...(section?.querySelectorAll<HTMLElement>(`button[aria-label="${label}"]`) ?? [])]
}

export async function chooseFrom(trigger: HTMLElement, optionText: string): Promise<void> {
  await click(trigger)
  await chooseOpenOption(optionText)
}

export async function chooseOpenOption(optionText: string): Promise<void> {
  let option: HTMLElement | undefined
  await waitFor(() => {
    option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((candidate) =>
      (candidate.textContent ?? '').trim().startsWith(optionText),
    )
    if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  })
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  await click(option)
}

/** Antes de qualquer hook ser importado: ele tem de nascer já apontando para o falso. Fora do cenário, a lista é vazia. */
void mock.module('@/modules/delivery-clients/shared/deliveryClientsClient.service', () => ({
  getDeliveryClientsClient: () => ({
    listClients: () => {
      exceptionDouble.clientListCalls += 1
      if (exceptionDouble.clients === 'failure') return Promise.reject(new Error('REQUEST_FAILED'))
      return Promise.resolve({ items: exceptionDouble.clients, nextCursor: null })
    },
  }),
}))
