/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T3.2 (RF3): o chip "Só: …" na linha fechada do catálogo — até dois nomes, depois "e mais N", com a
 * lista completa no título. Tipo geral não ganha chip. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeSummary } from '@/modules/trip/components/OccurrenceTypeSummary.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { renderWithQueryClient } from './renderHook.helper'

const mounted: { unmount: () => void }[] = []

function contractor(name: string) {
  return {
    displayName: name,
    id: `c-${name}`,
    status: 'active',
    taxId: '12345678000195',
  }
}

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    active: true,
    allowsMultipleItems: true,
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    attachmentMode: 'optional',
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

async function mountSummary(type: OccurrenceType): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeSummary, {
        controlsId: 'panel-1',
        exceptions: EMPTY_EXCEPTIONS_STATE,
        isExpanded: false,
        onToggle: () => undefined,
        type,
      }),
    ),
  )
}

function chip(): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('span')].find((node) =>
      node.textContent?.startsWith('Só: '),
    ) ?? null
  )
}

async function scenario(type: OccurrenceType, body: () => void): Promise<void> {
  try {
    await mountSummary(type)
    body()
  } finally {
    for (const rendered of mounted.splice(0)) rendered.unmount()
  }
}

describe('o chip "Só: …" do catálogo (spec 270 T3.2)', () => {
  test('com uma contratante mostra o nome', async () => {
    await scenario(
      buildType({ contractorScope: 'listed', contractors: [contractor('ZARAGOZA')] }),
      () => {
        expect(chip()?.textContent).toBe('Só: ZARAGOZA')
      },
    )
  })

  test('com duas mostra as duas', async () => {
    await scenario(
      buildType({
        contractorScope: 'listed',
        contractors: [contractor('ZARAGOZA'), contractor('RIBER PET')],
      }),
      () => {
        expect(chip()?.textContent).toBe('Só: ZARAGOZA, RIBER PET')
      },
    )
  })

  test('com quatro mostra duas e "e mais 2", com a lista completa no título', async () => {
    await scenario(
      buildType({
        contractorScope: 'listed',
        contractors: ['ZARAGOZA', 'RIBER PET', 'ALFA', 'BETA'].map(contractor),
      }),
      () => {
        expect(chip()?.textContent).toBe('Só: ZARAGOZA, RIBER PET e mais 2')
        expect(chip()?.getAttribute('title')).toBe('Só para: ZARAGOZA, RIBER PET, ALFA, BETA')
      },
    )
  })

  test('o tipo geral e a API anterior ao campo não ganham chip', async () => {
    await scenario(buildType({ contractorScope: 'all', contractors: [] }), () => {
      expect(chip()).toBeNull()
    })
    await scenario(buildType(), () => {
      expect(chip()).toBeNull()
    })
  })
})
