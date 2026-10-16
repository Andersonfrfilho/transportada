/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T4.1 (RF1): o bloco "E-mail à contratante" do tipo escolhe um modelo `occurrence` do cadastro de
 * modelos — lista só os ativos, mostra a prévia do servidor, grava o modelo na hora e avisa quando o tipo
 * manda e-mail sem modelo. Procura o que cada controle mostra. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeRow } from '@/modules/trip/components/OccurrenceTypeRow.component'
import type { ContractorMailTemplate } from '@/modules/delivery-clients/shared/contractorMailTemplates.types'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { installContractorMailDouble } from './contractorMailHarness.helper'
import type { MailDoubleCalls } from './contractorMailHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

function buildTemplate(overrides: Partial<ContractorMailTemplate>): ContractorMailTemplate {
  return {
    closing: 'c',
    id: 'template-1',
    intro: 'i',
    isDefault: false,
    itemText: 't',
    mailType: 'occurrence',
    name: 'Devolução parcial',
    status: 'active',
    subject: 's',
    updatedAt: '2026-10-01T00:00:00.000Z',
    version: '1',
    ...overrides,
  }
}

const TEMPLATES: readonly ContractorMailTemplate[] = [
  buildTemplate({ id: 'template-1', name: 'Devolução parcial' }),
  buildTemplate({ id: 'template-2', name: 'Recusa total' }),
  buildTemplate({ id: 'template-3', name: 'Modelo velho', status: 'archived' }),
  buildTemplate({ id: 'template-4', mailType: 'address_correction', name: 'Endereço' }),
]

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'required',
    contractorMailTemplateId: null,
    emailTemplateKey: null,
    emailsContractor: true,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'required',
    leavesDocumentBehind: false,
    moments: ['document'],
    name: 'Devolução parcial',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

function scenario(body: (calls: MailDoubleCalls) => Promise<void>) {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    const calls = installContractorMailDouble({ templates: [...TEMPLATES] })
    try {
      await body(calls)
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
        templates: { options: [], status: 'ready' },
        type,
      }),
    ),
  )
}

function templateTrigger(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('button[aria-label="Modelo do e-mail"]')
  if (found === null) throw new Error('MAIL_TEMPLATE_SELECT_NOT_FOUND')
  return found
}

function optionTexts(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.textContent?.trim() ?? '',
  )
}

async function openOptions(): Promise<void> {
  await waitFor(() => expect(templateTrigger().disabled).toBe(false))
  await click(templateTrigger())
  await waitFor(() => expect(optionTexts().length).toBeGreaterThan(1))
}

async function choose(optionText: string): Promise<void> {
  await openOptions()
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((candidate) =>
    (candidate.textContent ?? '').includes(optionText),
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  await click(option)
}

function blockText(): string {
  return document.body.textContent ?? ''
}

describe('o seletor do modelo do e-mail à contratante (spec 269 RF1)', () => {
  test(
    'lista "Nenhum" e só os modelos occurrence ativos',
    scenario(async () => {
      await mount(buildType())
      await openOptions()
      expect(optionTexts()).toEqual(['Nenhum', 'Devolução parcial', 'Recusa total'])
    }),
  )

  test(
    'mostra o modelo escolhido e a prévia que vem do servidor',
    scenario(async (calls) => {
      await mount(buildType({ contractorMailTemplateId: 'template-2' }))
      await waitFor(() => expect(blockText()).toContain('CORPO template-2'))
      expect(blockText()).toContain('ASSUNTO template-2')
      expect(calls.previewTemplateIds).toEqual(['template-2'])
      expect(templateTrigger().textContent).toContain('Recusa total')
    }),
  )

  test(
    'escolher grava o modelo na hora, sem tocar nos outros campos; "Nenhum" limpa com null',
    scenario(async () => {
      await mount(buildType())
      await choose('Recusa total')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.contractorMailTemplateId).toBe('template-2')
      expect(saved[0]).not.toHaveProperty('emailsContractor')
      saved.length = 0
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ contractorMailTemplateId: 'template-2' }))
      await choose('Nenhum')
      expect(saved[0]?.contractorMailTemplateId).toBeNull()
    }),
  )

  test(
    'o interruptor ligado sem modelo avisa que o e-mail não sai; com modelo ou desligado, não',
    scenario(async () => {
      await mount(buildType())
      expect(blockText()).toContain('Tipo sem modelo de notificação')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ contractorMailTemplateId: 'template-1' }))
      expect(blockText()).not.toContain('Tipo sem modelo de notificação')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ emailsContractor: false }))
      expect(blockText()).not.toContain('Tipo sem modelo de notificação')
    }),
  )

  test(
    'modelo arquivado que o tipo ainda aponta continua visível, marcado como arquivado',
    scenario(async () => {
      await mount(buildType({ contractorMailTemplateId: 'template-3' }))
      await waitFor(() =>
        expect(templateTrigger().textContent).toContain('Modelo velho (arquivado)'),
      )
    }),
  )
})
