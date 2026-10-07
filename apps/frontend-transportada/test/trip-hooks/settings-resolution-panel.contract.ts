/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão do painel A3, RF12/P5): a tela de verificação mostra, por tipo, os seis campos
 * resolvidos e a camada que decidiu cada um. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import companySettingsEn from '@/modules/company-settings/locales/companySettings.en.locale.json'
import companySettingsPt from '@/modules/company-settings/locales/companySettings.locale.json'
import { SettingsResolutionPanel } from '@/modules/company-settings/components/SettingsResolutionPanel.component'
import type { SettingsResolutionView } from '@/modules/trip/shared/settingsResolution.service'

import { createUnexpectedTripClient } from '../fixtures/tripAssemblyHooks.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { chooseFrom } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'
import { tripHookFakes } from './tripClientMocks.helper'

const mounted: { unmount: () => void }[] = []
const CONTRACTOR = {
  displayName: 'Distribuidora Aurora',
  id: 'contractor-1',
  taxId: '11222333000144',
}
const FIELDS = {
  attachmentMode: 'required',
  flow: 'document',
  id: 'type-1',
  itemsMinimumCount: null,
  itemsMode: 'required',
  name: 'Recusa total',
  noteMode: 'required',
  photoMinimumCount: 3,
  photoMode: 'required',
  signatureMode: 'optional',
  stage: 'delivery',
} as const

const VIEW: SettingsResolutionView = {
  deliveryProof: {
    cargo: 'off',
    cargoMinimumCount: 1,
    photo: 'off',
    receivedBy: 'off',
    receiverDocument: 'off',
    receiverName: 'off',
    signature: 'off',
  },
  occurrenceTypes: [
    {
      ...FIELDS,
      sources: {
        itemsMinimumCount: 'type',
        itemsMode: 'type',
        noteMode: 'recipient',
        photoMinimumCount: 'contractor',
        photoMode: 'contractor',
        signatureMode: 'default',
      },
    },
  ],
}

function scenario(
  resolution: () => Promise<SettingsResolutionView>,
  body: () => Promise<void>,
): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    tripHookFakes.tripClient = {
      ...createUnexpectedTripClient(),
      listContractors: () => Promise.resolve([CONTRACTOR]),
      listOccurrenceTypes: () =>
        Promise.resolve([
          {
            ...OCCURRENCE_REQUIREMENT_DEFAULTS,
            active: true,
            allowsMultipleItems: true,
            attachmentMode: 'optional',
            emailBody: '',
            emailSubject: '',
            emailTemplateKey: null,
            flow: 'document',
            id: 'type-1',
            itemsMode: 'optional',
            leavesDocumentBehind: false,
            name: 'Recusa total',
            notifies: false,
            redeliveryPolicy: 'unset',
            stage: 'delivery',
          },
        ]),
      readDeliveryProofSettings: () => Promise.resolve({ ...VIEW.deliveryProof, id: 'settings' }),
      readSettingsResolution: resolution,
    } as typeof tripHookFakes.tripClient
    try {
      mounted.push(
        await renderWithQueryClient(createElement(SettingsResolutionPanel, { canManage: true })),
      )
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
    }
  }
}

function text(): string {
  return document.body.textContent ?? ''
}

async function selectContractor(): Promise<void> {
  await waitFor(() =>
    expect(
      document.querySelector('button[aria-label="Contratante"]')?.hasAttribute('disabled'),
    ).toBe(false),
  )
  const trigger = document.querySelector<HTMLElement>('button[aria-label="Contratante"]')
  if (trigger === null) throw new Error('TRIGGER_NOT_FOUND')
  await chooseFrom(trigger, 'Distribuidora Aurora')
}

describe('verificação da configuração efetiva: os seis campos e a camada de cada um (A3)', () => {
  test(
    'com contratante escolhido, cada tipo mostra foto, observação, assinatura, produtos e os dois mínimos, com a camada',
    scenario(
      () => Promise.resolve(VIEW),
      async () => {
        await selectContractor()
        await waitFor(() => expect(text().includes('Recusa total')).toBe(true))
        const row = document.querySelector('[data-testid="resolution-type"]')?.textContent ?? ''
        expect(row.includes('Foto')).toBe(true)
        expect(row.includes('Observação')).toBe(true)
        expect(row.includes('Assinatura')).toBe(true)
        expect(row.includes('Produtos')).toBe(true)
        expect(row.includes('Mínimo de fotos')).toBe(true)
        expect(row.includes('Mínimo de produtos')).toBe(true)
        expect(row.includes('Obrigatório')).toBe(true)
        expect(row.includes('Opcional')).toBe(true)
        expect(row.includes('Todos os itens da nota')).toBe(true)
        for (const layer of ['Contratante', 'Destinatário', 'Tipo', 'Padrão']) {
          expect(row.includes(layer)).toBe(true)
        }
      },
    ),
  )

  test(
    'a falha da consulta mostra o aviso, sem linha de tipo',
    scenario(
      () => Promise.reject(new Error('REQUEST_FAILED')),
      async () => {
        await selectContractor()
        await waitFor(() =>
          expect(text().includes('Não foi possível carregar a configuração efetiva')).toBe(true),
        )
        expect(document.querySelector('[data-testid="resolution-type"]') === null).toBe(true)
      },
    ),
  )

  test(
    'sem escolha, mostra a configuração geral com a camada "Tipo"',
    scenario(
      () => Promise.resolve(VIEW),
      async () => {
        await waitFor(() =>
          expect(document.querySelector('[data-testid="resolution-type"]') !== null).toBe(true),
        )
        const row = document.querySelector('[data-testid="resolution-type"]')?.textContent ?? ''
        expect(row.includes('Tipo')).toBe(true)
        await click(document.body)
      },
    ),
  )
})

describe('o texto de apoio diz os seis campos que a tela mostra (spec 246, terceira revisão B-2)', () => {
  test('pt-BR cita foto, observação, assinatura, produtos e os mínimos, não só a foto', () => {
    const hint = companySettingsPt.settingsResolution.hint.toLowerCase()
    for (const word of ['foto', 'observação', 'assinatura', 'produtos', 'mínimo']) {
      expect(hint).toContain(word)
    }
  })

  test('en cita photo, note, signature, products e os minimums', () => {
    const hint = companySettingsEn.settingsResolution.hint.toLowerCase()
    for (const word of ['photo', 'note', 'signature', 'products', 'minimum']) {
      expect(hint).toContain(word)
    }
  })
})
