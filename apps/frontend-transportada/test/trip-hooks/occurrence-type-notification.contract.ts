/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3d (RF1e): o aviso ao contratante no tipo aberto — o interruptor, o modelo de e-mail com o
 * texto à vista e a política de reentrega. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeRow } from '@/modules/trip/components/OccurrenceTypeRow.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceEmailTemplatesState } from '@/modules/trip/shared/occurrenceTemplate.service'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

const TEMPLATES: OccurrenceEmailTemplatesState = {
  options: [
    {
      body: 'Olá, {{contratante}}. A carga da NF-e {{numeroNota}} foi recusada.',
      key: 'occurrence.refusal',
      label: 'Carga recusada',
      subject: 'Carga recusada',
    },
    {
      body: 'A NF-e {{numeroNota}} chegou avariada.',
      key: 'occurrence.damage',
      label: 'Avaria na entrega',
      subject: 'Avaria na entrega',
    },
  ],
  status: 'ready',
}

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    active: true,
    allowsMultipleItems: true,
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    attachmentMode: 'off',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: 'occurrence.refusal',
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    name: 'Recusa total',
    notifies: true,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
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
      saved.length = 0
    }
  }
}

async function mount(
  type: OccurrenceType,
  templates: OccurrenceEmailTemplatesState = TEMPLATES,
): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeRow, {
        canManage: true,
        exceptions: EMPTY_EXCEPTIONS_STATE,
        isSaving: false,
        onSave: (input) => saved.push(input),
        templates,
        type,
      }),
    ),
  )
}

function templateSelect(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('button[aria-label="Modelo da notificação"]')
}

async function chooseTemplate(optionText: string): Promise<void> {
  const trigger = templateSelect()
  if (trigger === null) throw new Error('TEMPLATE_SELECT_NOT_FOUND')
  await click(trigger)
  let option: HTMLElement | undefined
  await waitFor(() => {
    option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((candidate) =>
      (candidate.textContent ?? '').includes(optionText),
    )
    expect(option === undefined).toBe(false)
  })
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  await click(option)
}

describe('aviso ao contratante no tipo (RF1e)', () => {
  test(
    'tipo que avisa mostra o assunto e o texto do modelo escolhido, não só o nome',
    scenario(async () => {
      await mount(buildType())
      const text = document.body.textContent ?? ''
      expect(text.includes('Assunto:')).toBe(true)
      expect(text.includes('foi recusada.')).toBe(true)
      expect(templateSelect()?.disabled).toBe(false)
    }),
  )

  test(
    'a lista de modelos já mostra o texto de cada um antes de escolher',
    scenario(async () => {
      await mount(buildType())
      const trigger = templateSelect()
      if (trigger === null) throw new Error('TEMPLATE_SELECT_NOT_FOUND')
      await click(trigger)
      await waitFor(() => {
        const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
        expect(
          options.some((option) => option.textContent?.includes('chegou avariada') === true),
        ).toBe(true)
      })
    }),
  )

  test(
    'escolher outro modelo grava só a chave dele, e Sem e-mail grava nulo',
    scenario(async () => {
      await mount(buildType())
      await chooseTemplate('Avaria na entrega')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.emailTemplateKey).toBe('occurrence.damage')
      expect(saved[0]?.notifies).toBe(true)
      expect(saved[0]?.redeliveryPolicy).toBe('blocked')

      await chooseTemplate('Sem e-mail')
      expect(saved[1]?.emailTemplateKey).toBeNull()
    }),
  )

  test(
    'tipo que não avisa: o modelo fica desligado com o motivo ligado por aria-describedby, e sem texto',
    scenario(async () => {
      await mount(buildType({ notifies: false }))
      const trigger = templateSelect()
      expect(trigger?.disabled).toBe(true)
      const describedBy = trigger?.closest('[aria-describedby]')?.getAttribute('aria-describedby')
      const reason = describedBy === undefined ? null : document.getElementById(describedBy ?? '')
      expect(reason?.textContent?.includes('só vale quando o tipo avisa') ?? false).toBe(true)
      expect((document.body.textContent ?? '').includes('Assunto:')).toBe(false)
    }),
  )

  test(
    'modelo próprio antigo aparece marcado como legado, com o texto',
    scenario(async () => {
      await mount(
        buildType({
          emailBody: 'Texto antigo do tipo',
          emailSubject: 'Assunto antigo',
          emailTemplateKey: null,
        }),
      )
      const text = document.body.textContent ?? ''
      expect(text.includes('Assunto antigo — modelo próprio (legado)')).toBe(true)
      expect(text.includes('Texto antigo do tipo')).toBe(true)
    }),
  )

  test(
    'modelo que saiu da lista continua nomeado e a tela diz que ele não está mais ativo',
    scenario(async () => {
      await mount(buildType({ emailTemplateKey: 'occurrence.gone' }))
      expect(templateSelect()?.textContent?.includes('occurrence.gone')).toBe(true)
      expect((document.body.textContent ?? '').includes('não está mais ativo')).toBe(true)
    }),
  )

  test(
    'lista de modelos que falhou: o motivo está na tela e a chave atual segue',
    scenario(async () => {
      await mount(buildType(), { options: [], status: 'error' })
      expect(
        (document.body.textContent ?? '').includes('Não foi possível carregar os modelos'),
      ).toBe(true)
      expect(templateSelect()?.textContent?.includes('occurrence.refusal')).toBe(true)
    }),
  )
})

describe('política de reentrega (RF1e, spec 241/164)', () => {
  test(
    'Produtos desligado esconde a política e o interruptor de vários itens',
    scenario(async () => {
      await mount(buildType({ itemsMode: 'off', redeliveryPolicy: 'unset' }))
      expect(document.querySelector('button[aria-label="Admite reentrega"]')).toBeNull()
    }),
  )

  test(
    'Produtos ligado mostra a política, e trocá-la grava só ela',
    scenario(async () => {
      await mount(buildType())
      const trigger = document.querySelector<HTMLElement>('button[aria-label="Admite reentrega"]')
      if (trigger === null) throw new Error('REDELIVERY_NOT_FOUND')
      await click(trigger)
      let option: HTMLElement | undefined
      await waitFor(() => {
        option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
          (candidate) => candidate.textContent?.includes('Admite reentrega') === true,
        )
        expect(option === undefined).toBe(false)
      })
      if (option === undefined) throw new Error('OPTION_NOT_FOUND')
      await click(option)
      expect(saved).toHaveLength(1)
      expect(saved[0]?.redeliveryPolicy).toBe('allowed')
      expect(saved[0]?.emailTemplateKey).toBe('occurrence.refusal')
    }),
  )
})
