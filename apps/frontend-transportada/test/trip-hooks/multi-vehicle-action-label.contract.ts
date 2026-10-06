/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.2, não-regressão: `MultiVehicleSuggestionAction` ganhou um `label` OPCIONAL e mais nada. Sem ele o botão
 * é o de sempre ("Sugerir viagens", na barra de seleção de NF-e); com ele só o texto muda — o diálogo, a escolha
 * de veículo e o que vai ao roteirizador são os mesmos. Sem `trip.manage` a ação continua não existindo.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { MultiVehicleSuggestionAction } from '@/modules/routing/components/MultiVehicleSuggestionAction.component'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'

import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import { buttonByText, click, maybeButtonByText } from './cargoReceivingHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'
import { resetTripHookFakes, tripHookFakes } from './tripClientMocks.helper'

const COMPANY_ID = '00000000-0000-4000-8000-000000237c02'
const DOCUMENT_IDS = [documentIdOf(1), documentIdOf(2)]
const VEHICLE = {
  id: '00000000-0000-4000-8000-000000237d02',
  plate: 'XYZ9K88',
  role: 'traction',
  status: 'active',
} as unknown as FleetVehicleDetail

async function mountAction(
  props: Partial<Parameters<typeof MultiVehicleSuggestionAction>[0]> = {},
) {
  resetTripHookFakes([])
  tripHookFakes.fleetVehicles = [VEHICLE]
  return renderWithQueryClient(
    createElement(MultiVehicleSuggestionAction, {
      companyId: COMPANY_ID,
      documentIds: DOCUMENT_IDS,
      onAccepted: () => undefined,
      onOpenTrip: () => undefined,
      permissions: ['fleet.read', 'trip.manage'],
      ...props,
    }),
  )
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('MultiVehicleSuggestionAction — o uso de sempre não muda', () => {
  test('sem `label` o botão é "Sugerir viagens", com a dica de sempre', async () => {
    const rendered = await mountAction()

    const button = buttonByText('Sugerir viagens')

    expect(button.getAttribute('title')).toBe('Distribuir notas entre veículos')
    expect(button.disabled).toBe(false)
    expect(maybeButtonByText('Gerar proposta')).toBeUndefined()
    rendered.unmount()
  })

  test('com `label` só o texto do botão muda', async () => {
    const rendered = await mountAction({ label: 'Gerar proposta' })

    const button = buttonByText('Gerar proposta')

    expect(button.getAttribute('title')).toBe('Distribuir notas entre veículos')
    expect(maybeButtonByText('Sugerir viagens')).toBeUndefined()
    rendered.unmount()
  })

  test('com ou sem `label` o diálogo e o pedido ao roteirizador são os mesmos', async () => {
    for (const label of [undefined, 'Gerar proposta']) {
      const rendered = await mountAction(label === undefined ? {} : { label })
      await click(buttonByText(label ?? 'Sugerir viagens'))
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
        '2 notas selecionadas',
      )
      await click(
        document.querySelector('button[aria-label="Veículos disponíveis"]') as HTMLButtonElement,
      )
      await waitFor(() => expect(document.querySelectorAll('[role="option"]').length).toBe(1))
      await click(document.querySelector('[role="option"]') as HTMLElement)
      await click(buttonByText('Distribuir'))

      expect(tripHookFakes.multiVehicleRequests.at(-1)).toEqual({
        nfeDocumentIds: DOCUMENT_IDS,
        vehicles: [{ vehicleId: VEHICLE.id }],
      })
      rendered.unmount()
      document.body.innerHTML = ''
    }
  })

  test('sem nota o botão fica desabilitado, e sem `trip.manage` a ação não existe', async () => {
    const empty = await mountAction({ documentIds: [] })
    expect(buttonByText('Sugerir viagens').disabled).toBe(true)
    empty.unmount()

    const reader = await mountAction({ permissions: ['fleet.read'] })
    expect(document.querySelectorAll('button').length).toBe(0)
    reader.unmount()
  })
})
