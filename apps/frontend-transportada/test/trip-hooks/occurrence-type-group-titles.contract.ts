/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.6 (D6): os grupos "No galpão" e "Na rua" da lista de tipos ganham título de verdade —
 * heading, ícone decorativo e contagem com plural. Grupo sem tipo não aparece. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { installExceptionsDouble } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const mounted: { unmount: () => void }[] = []

function buildType(id: string, stage: 'delivery' | 'separation'): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: false,
    attachmentMode: 'off',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id,
    itemsMode: 'off',
    leavesDocumentBehind: false,
    moments: stage === 'delivery' ? ['document'] : ['separation'],
    name: `Tipo ${id}`,
    notifies: false,
    redeliveryPolicy: 'unset',
    stage,
  }
}

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
    }
  }
}

async function mount(types: readonly OccurrenceType[]): Promise<void> {
  installExceptionsDouble()
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        loadStatus: 'ready',
        onRetry: () => undefined,
        onSave: () => undefined,
        saveFeedbackKey: null,
        types,
      }),
    ),
  )
}

function groupHeadings(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('fieldset h3')]
}

describe('títulos dos grupos da lista de tipos (D6)', () => {
  test(
    'cada grupo tem heading h3 com ícone aria-hidden e a contagem com plural certo',
    scenario(async () => {
      await mount([
        buildType('a', 'separation'),
        buildType('b', 'delivery'),
        buildType('c', 'delivery'),
      ])
      const [warehouse, street] = groupHeadings()
      expect(warehouse?.textContent).toContain('No galpão')
      expect(warehouse?.textContent).toContain('1 tipo')
      expect(warehouse?.textContent).not.toContain('1 tipos')
      expect(street?.textContent).toContain('Na rua')
      expect(street?.textContent).toContain('2 tipos')
      for (const heading of [warehouse, street]) {
        const icon = heading?.querySelector('svg')
        expect(icon?.getAttribute('aria-hidden')).toBe('true')
      }
    }),
  )

  test(
    'grupo sem tipo não mostra título',
    scenario(async () => {
      await mount([buildType('b', 'delivery')])
      const headings = groupHeadings()
      expect(headings).toHaveLength(1)
      expect(headings[0]?.textContent).toContain('Na rua')
      expect(document.body.textContent).not.toContain('No galpão')
    }),
  )
})
