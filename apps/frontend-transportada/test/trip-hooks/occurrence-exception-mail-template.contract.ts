/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T4.1b (RF1): a exceção por contratante escolhe o modelo do e-mail, com "Herdar do tipo" no lugar de
 * "Nenhum"; a exceção por destinatário não tem o seletor (o e-mail é da contratante). Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceExceptionItem } from '@/modules/trip/components/OccurrenceExceptionItem.component'
import type { ContractorMailTemplate } from '@/modules/delivery-clients/shared/contractorMailTemplates.types'
import type { OccurrenceExceptionEdit } from '@/modules/trip/shared/occurrenceException.service'
import { readOccurrenceRequirementScope } from '@/modules/trip/shared/occurrenceRequirementScope.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { installContractorMailDouble } from './contractorMailHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const mounted: { unmount: () => void }[] = []
const edits: OccurrenceExceptionEdit[] = []

const TEMPLATE: ContractorMailTemplate = {
  closing: 'c',
  id: 'template-1',
  intro: 'i',
  isDefault: false,
  itemText: 't',
  mailType: 'occurrence',
  name: 'Recusa total',
  status: 'active',
  subject: 's',
  updatedAt: '2026-10-01T00:00:00.000Z',
  version: '1',
}

const SCOPE = readOccurrenceRequirementScope({
  ...OCCURRENCE_REQUIREMENT_DEFAULTS,
  active: true,
  allowsMultipleItems: true,
  attachmentMode: 'optional',
  emailTemplateKey: null,
  flow: 'document',
  id: 'type-1',
  itemsMode: 'optional',
  leavesDocumentBehind: false,
  moments: ['document'],
  name: 'Recusa total',
  notifies: true,
  redeliveryPolicy: 'blocked',
  stage: 'delivery',
})

function scenario(body: () => Promise<void>) {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    installContractorMailDouble({ templates: [TEMPLATE] })
    try {
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      edits.length = 0
    }
  }
}

async function mount(entry: Parameters<typeof OccurrenceExceptionItem>[0]['entry']): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceExceptionItem, {
        disabled: false,
        entry,
        onEdit: (_key, edit) => edits.push(edit),
        onRemove: () => undefined,
        recordLabels: undefined,
        scope: SCOPE,
        subject: { name: 'Distribuidora Aurora', taxId: '11222333000144' },
      }),
    ),
  )
}

function templateTrigger(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('button[aria-label="Modelo do e-mail"]')
}

describe('o modelo do e-mail na exceção (spec 269 RF1)', () => {
  test(
    'a exceção da contratante mostra "Herdar do tipo" e grava o modelo escolhido',
    scenario(async () => {
      await mount({ attachmentMode: 'optional', contractorId: 'contractor-1' })
      expect(templateTrigger()?.textContent).toContain('Herdar do tipo')
      await waitFor(() => expect(templateTrigger()?.disabled).toBe(false))
      await click(templateTrigger() as HTMLElement)
      await waitFor(() => expect(document.querySelectorAll('[role="option"]').length).toBe(2))
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (candidate) => (candidate.textContent ?? '').includes('Recusa total'),
      )
      await click(option as HTMLElement)

      expect(edits).toEqual([{ contractorMailTemplateId: 'template-1' }])
    }),
  )

  test(
    'a exceção da contratante com modelo mostra o escolhido',
    scenario(async () => {
      await mount({
        attachmentMode: 'optional',
        contractorId: 'contractor-1',
        contractorMailTemplateId: 'template-1',
      })
      await waitFor(() => expect(templateTrigger()?.textContent).toContain('Recusa total'))
    }),
  )

  test(
    'a exceção por destinatário não tem o seletor',
    scenario(async () => {
      await mount({ attachmentMode: 'optional', taxId: '12345678000190' })
      expect(templateTrigger()).toBeNull()
    }),
  )
})
