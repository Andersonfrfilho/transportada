/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão do painel A2, M2, M3, M5): o painel decide o que mostrar pelo conjunto de momentos,
 * esconde o que a API não mandou e avisa o que o app do motorista ainda não cumpre. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type {
  OccurrenceAttachmentOverridesByType,
  OccurrenceMoment,
  OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import {
  OCCURRENCE_REQUIREMENT_DEFAULTS,
  withoutFields,
} from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import {
  chooseFrom,
  exceptionDouble,
  expandAllTypes,
  installExceptionsDouble,
  resetExceptionsDouble,
} from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

const ONE_EXCEPTION: OccurrenceAttachmentOverridesByType = [
  {
    contractorOverrides: [],
    occurrenceTypeId: 'type-1',
    recipientOverrides: [
      {
        attachmentMode: 'required',
        itemsMinimumCount: null,
        itemsMode: null,
        noteMode: null,
        photoMinimumCount: null,
        signatureMode: null,
        taxId: '12345678000190',
      },
    ],
  },
]

function buildType(
  moments: readonly OccurrenceMoment[],
  overrides: Partial<OccurrenceType> = {},
): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'required',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'required',
    leavesDocumentBehind: false,
    moments,
    name: 'Recusa total',
    notifies: false,
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
      resetExceptionsDouble()
    }
  }
}

async function mount(type: OccurrenceType): Promise<void> {
  installExceptionsDouble({ byType: ONE_EXCEPTION })
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        onSave: (input) => saved.push(input),
        saveFeedbackKey: null,
        types: [type],
      }),
    ),
  )
  await waitFor(() => expect(exceptionDouble.batchCalls).toBeGreaterThan(0))
  await expandAllTypes()
}

/** Só a seção "O que exige" do tipo aberto: a lista de exceções e o cadastro novo têm controles de mesmo nome. */
function control(label: string): HTMLElement | null {
  return (
    document
      .querySelector('section[aria-label="O que exige"]')
      ?.querySelector<HTMLElement>(`button[aria-label="${label}"]`) ?? null
  )
}

function pageText(): string {
  return document.body.textContent ?? ''
}

function hasExceptionList(): boolean {
  return document.querySelector('section[aria-label^="Exceções por cliente"]') !== null
}

describe('tipo de galpão e rua: as exigências da rua continuam à vista (A2)', () => {
  test(
    '{separation, document} mostra Foto, Observação, Assinatura e Produtos, a nota dos momentos de rua e a lista de exceções',
    scenario(async () => {
      await mount(buildType(['separation', 'document'], { stage: 'separation' }))
      for (const label of ['Foto', 'Observação', 'Assinatura', 'Produtos']) {
        expect(control(label) !== null).toBe(true)
      }
      expect(pageText().includes('As exigências abaixo valem só nos momentos de rua')).toBe(true)
      expect(hasExceptionList()).toBe(true)
      expect(pageText().includes('1 exceção')).toBe(true)
    }),
  )

  test(
    'tipo só de galpão continua só com Produtos e sem lista de exceções',
    scenario(async () => {
      await mount(buildType(['separation'], { stage: 'separation' }))
      expect(control('Foto') === null).toBe(true)
      expect(control('Produtos') !== null).toBe(true)
      expect(hasExceptionList()).toBe(false)
      expect(pageText().includes('As exigências abaixo valem só nos momentos de rua')).toBe(false)
    }),
  )
})

describe('tipo só de parada: só a Foto vale (M2)', () => {
  test(
    '{stop} mostra só a Foto, sem mínimo de fotos, e a nota diz por quê; a exceção também declara só a foto',
    scenario(async () => {
      await mount(buildType(['stop'], { flow: 'stop' }))
      expect(control('Foto') !== null).toBe(true)
      for (const label of ['Observação', 'Assinatura', 'Produtos', 'Quantidade mínima de fotos']) {
        expect(control(label) === null).toBe(true)
      }
      expect(pageText().includes('Na chegada à parada só a foto é cobrada')).toBe(true)
      const section = document.querySelector('section[aria-label^="Exceções por cliente"]')
      const labels = [...(section?.querySelectorAll('button[aria-label]') ?? [])].map((button) =>
        button.getAttribute('aria-label'),
      )
      expect(labels.includes('Foto')).toBe(true)
      for (const label of ['Observação', 'Assinatura', 'Produtos']) {
        expect(labels.includes(label)).toBe(false)
      }
    }),
  )
})

describe('Produtos: o texto não contradiz o padrão e o app é avisado (M3)', () => {
  test(
    'a legenda não diz "ao menos um item" e o aviso do app do motorista está à vista',
    scenario(async () => {
      await mount(buildType(['document']))
      expect(pageText().includes('ao menos um item da nota marcado')).toBe(false)
      expect(pageText().includes('app do motorista só marca “A nota inteira”')).toBe(true)
    }),
  )
})

describe('API anterior aos campos: o painel não oferece o que ela recusaria (M5)', () => {
  test(
    'sem noteMode, signatureMode e photoMinimumCount, esses controles não aparecem e o PUT não os leva',
    scenario(async () => {
      const old = withoutFields(buildType(['document', 'office']), [
        'itemsMinimumCount',
        'noteMode',
        'photoMinimumCount',
        'signatureMode',
      ])
      await mount(old)
      expect(control('Foto') !== null).toBe(true)
      expect(control('Produtos') !== null).toBe(true)
      for (const label of ['Observação', 'Assinatura', 'Quantidade mínima de fotos']) {
        expect(control(label) === null).toBe(true)
      }
      expect(control('Produtos exigidos') === null).toBe(true)

      await chooseFrom(control('Foto') as HTMLElement, 'Opcional')
      await click(document.body)
      expect(saved).toHaveLength(1)
      for (const key of ['itemsMinimumCount', 'noteMode', 'photoMinimumCount', 'signatureMode']) {
        expect(saved[0]).not.toHaveProperty(key)
      }
    }),
  )
})
