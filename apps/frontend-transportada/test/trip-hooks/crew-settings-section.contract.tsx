/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A montagem da diária geral do ajudante na aba de motoristas (spec 239 T3 + revisão): a consulta só
 * liga com `fleet.read` e na aba de motoristas, o "salvo" não fica preso depois de nova edição e a
 * falha de leitura se refaz sem recarregar a página. Roda com DOM (`test:hooks`).
 */
import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { DriverCrewSettingsSection } from '../../src/modules/fleet/components/DriverCrewSettingsSection.component'
import ptLocale from '../../src/modules/fleet/locales/fleet.locale.json'
import type { CrewSettingsClient } from '../../src/modules/fleet/shared/crewSettingsClient.service'

import { renderWithQueryClient, settle, type RenderedComponent } from './renderHook.helper'

// eslint-disable-next-line @typescript-eslint/unbound-method
const NATIVE_INPUT_VALUE_SETTER = Object.getOwnPropertyDescriptor(
  globalThis.HTMLInputElement.prototype,
  'value',
)?.set

type FakeClient = CrewSettingsClient & { readonly calls: { gets: number; saves: number } }

function createFakeClient(options: { readonly failFirstGet?: boolean } = {}): FakeClient {
  const calls = { gets: 0, saves: 0 }
  return {
    calls,
    get: () => {
      calls.gets += 1
      if (options.failFirstGet === true && calls.gets === 1) {
        return Promise.reject(new Error('CREW_SETTINGS_REQUEST_FAILED'))
      }
      return Promise.resolve({ helperDailyRate: '120.0000' })
    },
    save: (helperDailyRate) => {
      calls.saves += 1
      return Promise.resolve({ helperDailyRate })
    },
  }
}

let rendered: RenderedComponent | undefined

afterEach(() => {
  rendered?.unmount()
  rendered = undefined
})

async function mount(input: {
  readonly canRead: boolean
  readonly client: CrewSettingsClient
  readonly isActive: boolean
}): Promise<void> {
  rendered = await renderWithQueryClient(
    createElement(DriverCrewSettingsSection, {
      canManage: true,
      canRead: input.canRead,
      client: input.client,
      companyId: 'company-1',
      isActive: input.isActive,
    }),
  )
  await settle()
}

function rateInput(): HTMLInputElement {
  const input = document.body.querySelector('input')
  if (input === null) throw new Error('RATE_INPUT_NOT_FOUND')
  return input
}

async function typeRate(value: string): Promise<void> {
  await act(async () => {
    if (NATIVE_INPUT_VALUE_SETTER !== undefined) {
      Reflect.apply(NATIVE_INPUT_VALUE_SETTER, rateInput(), [value])
    }
    rateInput().dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
  await settle()
}

function findButton(label: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.includes(label) === true,
  )
  if (button === undefined) throw new Error(`BUTTON_NOT_FOUND_${label}`)
  return button
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
  await settle()
}

describe('a diária geral na aba de motoristas (spec 239)', () => {
  it('com fleet.read e a aba de motoristas ativa, consulta e mostra o painel', async () => {
    const client = createFakeClient()
    await mount({ canRead: true, client, isActive: true })

    expect(client.calls.gets).toBe(1)
    expect(document.body.textContent).toContain(ptLocale.crewSettings.title)
    expect(rateInput().value).toBe('120,00')
  })

  it('sem fleet.read não consulta e não mostra o painel', async () => {
    const client = createFakeClient()
    await mount({ canRead: false, client, isActive: true })

    expect(client.calls.gets).toBe(0)
    expect(document.body.textContent).not.toContain(ptLocale.crewSettings.title)
  })

  it('fora da aba de motoristas não consulta', async () => {
    const client = createFakeClient()
    await mount({ canRead: true, client, isActive: false })

    expect(client.calls.gets).toBe(0)
  })

  it('o aviso de salvo some quando o campo é editado de novo', async () => {
    const client = createFakeClient()
    await mount({ canRead: true, client, isActive: true })

    await typeRate('135,50')
    await click(findButton(ptLocale.crewSettings.save))
    expect(client.calls.saves).toBe(1)
    expect(document.body.textContent).toContain(ptLocale.crewSettings.saved)

    await typeRate('140,00')
    expect(document.body.textContent).not.toContain(ptLocale.crewSettings.saved)
  })

  it('a falha de leitura oferece "Tentar de novo", que consulta outra vez e mostra o campo', async () => {
    const client = createFakeClient({ failFirstGet: true })
    await mount({ canRead: true, client, isActive: true })

    expect(document.body.textContent).toContain(ptLocale.crewSettings.loadError)
    expect(document.body.querySelector('input')).toBeNull()

    await click(findButton(ptLocale.crewSettings.retry))

    expect(client.calls.gets).toBe(2)
    expect(rateInput().value).toBe('120,00')
    expect(document.body.textContent).not.toContain(ptLocale.crewSettings.loadError)
  })
})
