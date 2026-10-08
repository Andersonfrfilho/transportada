/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.6 (D4): o formulário "Novo tipo" é mínimo de propósito; o resto se configura no tipo
 * aberto. Depois de cadastrar, a linha do tipo novo abre sozinha, recebe o foco e a tela confirma.
 * Dados sintéticos.
 */
import { act, createElement, useState } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { buttonByText, click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { installExceptionsDouble } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const NOTICE = 'Tipo criado. Configure o que ele exige e o e-mail abaixo.'
const mounted: { unmount: () => void }[] = []

function buildType(id: string, name: string): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id,
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    moments: ['separation'],
    name,
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'separation',
  }
}

/** Faz o papel do servidor: o cadastro "grava" e a lista volta com o tipo novo. */
function ServerDouble() {
  const [types, setTypes] = useState<readonly OccurrenceType[]>([buildType('old', 'Antigo')])
  return createElement(OccurrenceTypeCatalogPanel, {
    canManage: true,
    isSaving: false,
    loadStatus: 'ready',
    onRetry: () => undefined,
    onSave: (input) => {
      if (input.occurrenceTypeId !== null) return
      setTypes((current) => [...current, buildType('created', input.name)])
    },
    saveFeedbackKey: null,
    types,
  })
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

async function typeNewName(name: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(
    'section[aria-label="Novo tipo"] input[type="text"]',
  )
  if (input === null) throw new Error('NAME_NOT_FOUND')
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(input, name)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

function summaryOf(name: string): HTMLElement {
  const summary = [...document.querySelectorAll<HTMLElement>('button[aria-controls]')].find(
    (button) => button.textContent?.includes(name),
  )
  if (summary === undefined) throw new Error(`SUMMARY_NOT_FOUND:${name}`)
  return summary
}

describe('depois de cadastrar: o tipo novo abre, recebe o foco e a tela confirma (D4)', () => {
  test(
    'abre a linha do tipo criado, foca o resumo dela e mostra a confirmação com role=status',
    scenario(async () => {
      installExceptionsDouble()
      mounted.push(await renderWithQueryClient(createElement(ServerDouble)))
      expect(document.body.textContent).not.toContain(NOTICE)
      await typeNewName('Prorrogação')
      await click(buttonByText('Cadastrar tipo'))

      const summary = summaryOf('Prorrogação')
      expect(summary.getAttribute('aria-expanded')).toBe('true')
      expect(summaryOf('Antigo').getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(summary)
      const notice = document.querySelector('[role="status"]')
      expect(notice?.textContent).toBe(NOTICE)
    }),
  )

  test(
    'recolher o tipo criado tira a confirmação',
    scenario(async () => {
      installExceptionsDouble()
      mounted.push(await renderWithQueryClient(createElement(ServerDouble)))
      await typeNewName('Prorrogação')
      await click(buttonByText('Cadastrar tipo'))
      await click(summaryOf('Prorrogação'))
      expect(document.body.textContent).not.toContain(NOTICE)
    }),
  )
})
