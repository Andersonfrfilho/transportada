/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.4: a aba "Contratantes" montada de verdade, com a API dublada. ⚠️ `mock.module` não se
 * desfaz e vale para o processo inteiro: o cliente é trocado **uma vez**, aqui, e cada teste só
 * reconfigura `contractorDirectoryFakes`. Dados sintéticos — nomes e CNPJs inventados.
 */
import { mock } from 'bun:test'
import { act } from 'react'

import type { ContractorDirectoryClient } from '@/modules/delivery-clients/shared/contractorDirectoryClient.service'
import type {
  Contractor,
  ContractorWrite,
} from '@/modules/delivery-clients/shared/contractorDirectory.types'
import type {
  ReceivingProfile,
  ReceivingProfileRules,
} from '@/modules/delivery-clients/shared/receivingProfile.types'

export const CONTRACTOR_IDS = {
  alfa: '00000000-0000-4000-8000-000000237a01',
  beta: '00000000-0000-4000-8000-000000237a02',
  delta: '00000000-0000-4000-8000-000000237a04',
  gama: '00000000-0000-4000-8000-000000237a03',
} as const

export const CONTRACTORS: readonly Contractor[] = [
  {
    closingPeriod: 'monthly',
    displayName: 'Alfa Indústria Fictícia',
    id: CONTRACTOR_IDS.alfa,
    notes: 'Observação sintética',
    reportEmail: 'relatorio@alfa.example.test',
    status: 'active',
    taxId: '11222333000181',
  },
  {
    closingPeriod: 'fortnightly',
    displayName: 'Beta Comércio Fictício',
    id: CONTRACTOR_IDS.beta,
    notes: '',
    reportEmail: '',
    status: 'active',
    taxId: '22333444000162',
  },
  {
    closingPeriod: 'monthly',
    displayName: 'Gama Distribuidora Fictícia',
    id: CONTRACTOR_IDS.gama,
    notes: '',
    reportEmail: '',
    status: 'active',
    taxId: '33444555000143',
  },
  {
    closingPeriod: 'monthly',
    displayName: 'Delta Atacado Fictício',
    id: CONTRACTOR_IDS.delta,
    notes: '',
    reportEmail: '',
    status: 'inactive',
    taxId: '44555666000124',
  },
]

export const ALFA_PROFILE: ReceivingProfile = {
  arrivalReferencePattern: null,
  contractorId: CONTRACTOR_IDS.alfa,
  deliveryDeadlineBusinessDays: 3,
  isEnabled: true,
  matchWindowDays: 15,
  previewColumnMap: { routeName: 'Coluna A', value: 'Coluna B', weightKg: 'Coluna C' },
  previewEnabled: true,
  previewSheetName: 'Aba Sintética',
  requiresDamageCheck: false,
  separationWindowHours: 24,
  updatedAt: '2026-10-03T12:00:00.000Z',
  weightTolerancePercent: 0,
}

export const BETA_PROFILE: ReceivingProfile = {
  ...ALFA_PROFILE,
  contractorId: CONTRACTOR_IDS.beta,
  isEnabled: false,
  previewColumnMap: null,
  previewEnabled: false,
  previewSheetName: null,
}

export type DoubleCalls = {
  readonly profileSaves: { contractorId: string; rules: ReceivingProfileRules }[]
  readonly contractorUpdates: { id: string; values: ContractorWrite }[]
}

export const contractorDirectoryFakes: {
  client: ContractorDirectoryClient
  saveFailure: Error | undefined
} = {
  client: undefined as unknown as ContractorDirectoryClient,
  saveFailure: undefined,
}

/** Instala a API dublada: perfis por contratante e o registro de tudo que a tela gravou. */
export function installContractorDirectoryDouble(
  profiles: Readonly<Record<string, ReceivingProfile | null>> = {
    [CONTRACTOR_IDS.alfa]: ALFA_PROFILE,
    [CONTRACTOR_IDS.beta]: BETA_PROFILE,
  },
): DoubleCalls {
  const calls: DoubleCalls = { contractorUpdates: [], profileSaves: [] }
  contractorDirectoryFakes.saveFailure = undefined
  contractorDirectoryFakes.client = {
    getReceivingProfile: (contractorId) => Promise.resolve(profiles[contractorId] ?? null),
    listContractors: () => Promise.resolve({ items: CONTRACTORS, nextCursor: null }),
    saveReceivingProfile: (input) => {
      calls.profileSaves.push(structuredClone(input))
      if (contractorDirectoryFakes.saveFailure !== undefined) {
        return Promise.reject(contractorDirectoryFakes.saveFailure)
      }
      return Promise.resolve({
        ...input.rules,
        contractorId: input.contractorId,
        updatedAt: '2026-10-03T13:00:00.000Z',
      })
    },
    updateContractor: (input) => {
      calls.contractorUpdates.push(structuredClone(input))
      const current = CONTRACTORS.find((contractor) => contractor.id === input.id)
      if (current === undefined) return Promise.reject(new Error('CONTRACTOR_NOT_FOUND'))
      return Promise.resolve({ ...current, ...input.values })
    },
  }
  return calls
}

/** Antes de qualquer hook ser importado: ele tem de nascer já apontando para o falso. */
void mock.module('@/modules/delivery-clients/shared/contractorDirectoryClient.service', () => ({
  getContractorDirectoryClient: () => contractorDirectoryFakes.client,
}))

export function resetLocation(search = ''): void {
  window.history.replaceState({}, '', `/clientes${search}`)
}

export function buttonByText(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${text}`)
  return found
}

export function maybeButtonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  )
}

export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
}

/** O campo é achado pelo rótulo impresso — o que a pessoa lê —, nunca pelo nome interno. */
export function fieldByLabel(labelText: string): HTMLInputElement | HTMLTextAreaElement {
  const label = [...document.querySelectorAll('label')].find((element) =>
    (element.textContent ?? '').trim().startsWith(labelText),
  )
  const field = label?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  if (field === undefined || field === null) throw new Error(`FIELD_NOT_FOUND:${labelText}`)
  return field
}

export async function typeInto(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const descriptor = Object.getOwnPropertyDescriptor(prototype.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

export function rowNames(): string[] {
  return [...document.querySelectorAll('tbody tr')].map(
    (row) => row.querySelector('td')?.textContent?.trim() ?? '',
  )
}

export function describedBy(field: HTMLElement): string {
  return (field.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}
