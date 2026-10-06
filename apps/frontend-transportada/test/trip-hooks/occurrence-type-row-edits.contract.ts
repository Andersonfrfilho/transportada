/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 (revisão): a linha do tipo montada de verdade. Cada controle grava a sua edição — e só ela —,
 * e a política de reentrega vai em todo `onSave`. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeRow } from '@/modules/trip/components/OccurrenceTypeRow.component'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'
import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    active: true,
    allowsMultipleItems: true,
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    attachmentMode: 'off',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    name: 'Avaria',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

function expectedBase(overrides: Partial<OccurrenceTypeSaveInput> = {}): OccurrenceTypeSaveInput {
  return {
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    emailTemplateKey: null,
    leavesDocumentBehind: false,
    name: 'Avaria',
    notifies: false,
    occurrenceTypeId: 'type-1',
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

/** Sem `beforeEach`/`afterEach`: no lote DOM viram globais e atingem os outros contratos. */
function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      saved.length = 0
    }
  }
}

async function mount(type: OccurrenceType): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeRow, {
        canManage: true,
        exceptions: EMPTY_EXCEPTIONS_STATE,
        isSaving: false,
        onSave: (input) => saved.push(input),
        templateLabel: 'Sem e-mail',
        type,
      }),
    ),
  )
}

async function toggle(label: string): Promise<void> {
  const node = [...document.querySelectorAll<HTMLElement>('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (node === undefined) throw new Error(`CHECKBOX_NOT_FOUND:${label}`)
  await click(node)
}

async function choose(controlLabel: string, optionText: string): Promise<void> {
  const trigger = document.querySelector<HTMLElement>(`button[aria-label="${controlLabel}"]`)
  if (trigger === null) throw new Error(`CONTROL_NOT_FOUND:${controlLabel}`)
  await click(trigger)
  let option: HTMLElement | undefined
  await waitFor(() => {
    option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent?.includes(optionText) === true,
    )
    expect(option === undefined).toBe(false)
  })
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  await click(option)
}

describe('linha do tipo de ocorrência: cada controle grava a sua edição', () => {
  test(
    'Avisar quando acontecer',
    scenario(async () => {
      await mount(buildType())
      await toggle('Avisar quando acontecer')
      expect(saved).toEqual([expectedBase({ notifies: true })])
    }),
  )

  test(
    'Em uso',
    scenario(async () => {
      await mount(buildType())
      await toggle('Em uso')
      expect(saved).toEqual([expectedBase({ active: false })])
    }),
  )

  test(
    'Aceita vários itens',
    scenario(async () => {
      await mount(buildType())
      await toggle('Aceita vários itens')
      expect(saved).toEqual([expectedBase({ allowsMultipleItems: false })])
    }),
  )

  test(
    'Produtos: Desligado leva a política para unset',
    scenario(async () => {
      await mount(buildType())
      await choose('Produtos', 'Desligado')
      expect(saved).toEqual([expectedBase({ itemsMode: 'off', redeliveryPolicy: 'unset' })])
    }),
  )

  test(
    'Admite reentrega',
    scenario(async () => {
      await mount(buildType())
      await choose('Admite reentrega', 'Admite reentrega')
      expect(saved).toEqual([expectedBase({ redeliveryPolicy: 'allowed' })])
    }),
  )

  test(
    'Foto',
    scenario(async () => {
      await mount(buildType())
      await choose('Foto', 'Obrigatório')
      expect(saved).toEqual([expectedBase({ attachmentMode: 'required' })])
    }),
  )

  test(
    'Fluxo de registro',
    scenario(async () => {
      await mount(buildType())
      await choose('Fluxo de registro', 'De parada')
      expect(saved).toEqual([expectedBase({ flow: 'stop' })])
    }),
  )

  test(
    'A viagem segue sem a nota (tipo de separação)',
    scenario(async () => {
      await mount(buildType({ stage: 'separation' }))
      await toggle('A viagem segue sem a nota')
      expect(saved).toEqual([expectedBase({ leavesDocumentBehind: true, stage: 'separation' })])
    }),
  )
})
