/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T3.3 (RF9): a exceção de uma contratante que está fora da lista do tipo restrito fica guardada e
 * sem efeito — o editor avisa, sem bloquear nem apagar. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeRow } from '@/modules/trip/components/OccurrenceTypeRow.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'

import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { installExceptionsDouble } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const WARNING =
  'Esta exceção não tem efeito enquanto o tipo não valer para esta contratante. Ela continua guardada.'
const mounted: { unmount: () => void }[] = []

const ZARAGOZA = { displayName: 'ZARAGOZA', id: 'c-z', taxId: '12345678000195' }
const RIBER = { displayName: 'RIBER PET', id: 'c-r', taxId: '11222333000181' }

const EXCEPTIONS: OccurrenceTypeExceptionsState = {
  overrides: {
    contractorOverrides: [
      { attachmentMode: 'required', contractorId: 'c-z' },
      { attachmentMode: 'required', contractorId: 'c-r' },
    ],
    recipientOverrides: [{ attachmentMode: 'off', taxId: '99888777000166' }],
  },
  people: { ...EMPTY_EXCEPTIONS_STATE.people, contractors: [ZARAGOZA, RIBER] },
  status: 'ready',
}

function buildType(overrides: Partial<OccurrenceType>): OccurrenceType {
  return {
    active: true,
    allowsMultipleItems: true,
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    attachmentMode: 'optional',
    contractorScope: 'all',
    contractors: [],
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    moments: ['document'],
    name: 'Procedimento',
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
    ...overrides,
  }
}

async function scenario(type: OccurrenceType, body: () => void): Promise<void> {
  const restoreLayout = stubVisibleLayout()
  installExceptionsDouble()
  try {
    mounted.push(
      await renderWithQueryClient(
        createElement(OccurrenceTypeRow, {
          canManage: true,
          exceptions: EXCEPTIONS,
          isSaving: false,
          onSave: () => undefined,
          templates: { options: [], status: 'ready' },
          type,
        }),
      ),
    )
    body()
  } finally {
    restoreLayout()
    for (const rendered of mounted.splice(0)) rendered.unmount()
  }
}

function entries(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('li')].filter((item) =>
    ['ZARAGOZA', 'RIBER PET', '99.888.777'].some((name) => item.textContent?.includes(name)),
  )
}

describe('a exceção fora da lista do tipo restrito (spec 270 T3.3)', () => {
  test('avisa só na exceção da contratante que o tipo não atende', async () => {
    await scenario(
      buildType({
        contractorScope: 'listed',
        contractors: [
          { displayName: 'ZARAGOZA', id: 'c-z', status: 'active', taxId: '12345678000195' },
        ],
      }),
      () => {
        const [zaragoza, riber, recipient] = entries()
        expect(zaragoza?.textContent).not.toContain(WARNING)
        expect(riber?.textContent).toContain(WARNING)
        expect(recipient?.textContent).not.toContain(WARNING)
      },
    )
  })

  test('o aviso é um status à vista, sem apagar a exceção', async () => {
    await scenario(buildType({ contractorScope: 'listed', contractors: [] }), () => {
      const warnings = [...document.querySelectorAll('[role="status"]')].filter(
        (node) => node.textContent === WARNING,
      )
      expect(warnings).toHaveLength(2)
      expect(entries()).toHaveLength(3)
    })
  })

  test('tipo geral não avisa em exceção nenhuma', async () => {
    await scenario(buildType({ contractorScope: 'all' }), () => {
      expect(document.body.textContent).not.toContain(WARNING)
    })
  })

  test('API anterior ao campo não avisa', async () => {
    const { contractors, contractorScope, ...legacy } = buildType({})
    void [contractors, contractorScope]
    await scenario(legacy, () => {
      expect(document.body.textContent).not.toContain(WARNING)
    })
  })
})
