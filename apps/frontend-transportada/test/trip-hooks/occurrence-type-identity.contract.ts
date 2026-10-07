/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T6.1 (CA08): o tipo aberto segue a ordem do preview — Identificação, momentos, o que exige,
 * notificação — e o nome do tipo se edita ali. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeRow } from '@/modules/trip/components/OccurrenceTypeRow.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

const TYPE: OccurrenceType = {
  active: true,
  allowsMultipleItems: true,
  ...OCCURRENCE_REQUIREMENT_DEFAULTS,
  attachmentMode: 'optional',
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: null,
  flow: 'document',
  id: 'type-1',
  itemsMode: 'optional',
  leavesDocumentBehind: false,
  moments: ['document'],
  name: 'Recusa total',
  notifies: false,
  redeliveryPolicy: 'blocked',
  stage: 'delivery',
}

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      mounted.push(
        await renderWithQueryClient(
          createElement(OccurrenceTypeRow, {
            canManage: true,
            exceptions: EMPTY_EXCEPTIONS_STATE,
            isSaving: false,
            onSave: (input) => saved.push(input),
            templates: { options: [], status: 'ready' },
            type: TYPE,
          }),
        ),
      )
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      saved.length = 0
    }
  }
}

function nameInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    'section[aria-label="Identificação"] input[type="text"]',
  )
  if (input === null) throw new Error('NAME_INPUT_NOT_FOUND')
  return input
}

async function typeName(value: string): Promise<void> {
  const input = nameInput()
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur'))
    await Promise.resolve()
  })
}

describe('o tipo aberto segue o preview (T6.1, CA08)', () => {
  test(
    'os blocos vêm na ordem Identificação, momentos, o que exige, aviso interno',
    scenario(async () => {
      await Promise.resolve()
      const titles = [...document.querySelectorAll('section[aria-label]')].map((section) =>
        section.getAttribute('aria-label'),
      )

      expect(titles).toEqual([
        'Identificação',
        'Em que momento pode acontecer',
        'O que exige',
        'Exceções por cliente',
      ])
      const order = (document.body.textContent ?? '').match(
        /Identificação|Em que momento pode acontecer|O que exige|Aviso interno/gu,
      )
      expect(order?.slice(0, 4)).toEqual([
        'Identificação',
        'Em que momento pode acontecer',
        'O que exige',
        'Aviso interno',
      ])
    }),
  )

  test(
    'renomear o tipo manda só o nome novo e mantém o resto como estava',
    scenario(async () => {
      await typeName('Recusa por avaria')

      expect(saved).toHaveLength(1)
      expect(saved[0]?.name).toBe('Recusa por avaria')
      expect(saved[0]?.occurrenceTypeId).toBe('type-1')
      expect(saved[0]?.attachmentMode).toBe('optional')
    }),
  )

  test(
    'nome vazio ou igual ao atual não grava nada e devolve o nome ao campo',
    scenario(async () => {
      await typeName('   ')
      expect(saved).toHaveLength(0)
      expect(nameInput().value).toBe('Recusa total')

      await typeName('Recusa total')
      expect(saved).toHaveLength(0)
    }),
  )
})
