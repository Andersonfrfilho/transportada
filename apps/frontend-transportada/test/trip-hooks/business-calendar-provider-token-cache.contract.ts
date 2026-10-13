/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T6.1b (revisão final): a chave em claro NÃO pode ficar no estado do React Query. O cache de mutações guarda
 * `mutation.state.variables` por 5 minutos (`gcTime`), e o que entrou como variável da mutação fica lá depois de a tela
 * ter largado o formulário. A chave abaixo é uma sentinela falsa: o contrato a procura em todo o estado serializável
 * dos dois caches, depois do `PUT`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { act } from 'react'

import type { QueryClient } from '@tanstack/react-query'

import { useHolidayProviderActions } from '@/modules/company-settings/hooks/useHolidayProviderActions.hook'

import {
  buildEmptyProviderSettings,
  buildProviderSettings,
  FAKE_PROVIDER_TOKEN,
  SETTINGS_VERSION,
} from '../fixtures/holidayProviderSettings.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import { callsOf, endScenario, startScenario } from './businessCalendarHarness.helper'
import { providerSettingsDouble } from './holidayProviderSettingsDouble.helper'
import { renderHook, settle, type RenderedHook } from './renderHook.helper'

const PUT_SETTINGS = 'PUT /holiday-imports/provider-settings'

type Actions = ReturnType<typeof useHolidayProviderActions>

function mountActions(): Promise<RenderedHook<Actions>> {
  return renderHook(() => useHolidayProviderActions({ companyId: 'company-1' }))
}

async function saveIn(
  mounted: RenderedHook<Actions>,
  body: Parameters<Actions['save']>[0],
): Promise<void> {
  await act(async () => {
    await mounted.result().save(body)
  })
  await settle()
}

function mutationStates(queryClient: QueryClient): string {
  return JSON.stringify(
    queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.state),
  )
}

function queryStates(queryClient: QueryClient): string {
  return JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.state),
  )
}

describe('a chave em claro fora do estado do React Query (spec 262 T6.1b)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('o PUT leva a chave ao cliente, e nem o cache de mutações nem o de consultas a guardam', async () => {
    providerSettingsDouble.settings = buildProviderSettings()
    const mounted = await mountActions()

    await saveIn(mounted, { expectedVersion: SETTINGS_VERSION, token: FAKE_PROVIDER_TOKEN })

    expect(callsOf(PUT_SETTINGS, businessCalendarDouble.calls)).toEqual([
      `${PUT_SETTINGS} {"expectedVersion":"${SETTINGS_VERSION}","token":"${FAKE_PROVIDER_TOKEN}"}`,
    ])
    expect(mounted.queryClient.getMutationCache().getAll().length).toBeGreaterThan(0)
    expect(mutationStates(mounted.queryClient)).not.toContain(FAKE_PROVIDER_TOKEN)
    expect(queryStates(mounted.queryClient)).not.toContain(FAKE_PROVIDER_TOKEN)
    mounted.unmount()
  })

  it('a mutação enviada guarda as variáveis sem o campo `token`', async () => {
    providerSettingsDouble.settings = buildEmptyProviderSettings()
    const mounted = await mountActions()

    await saveIn(mounted, { monthlyRequestBudget: 2500, token: FAKE_PROVIDER_TOKEN })

    const [mutation] = mounted.queryClient.getMutationCache().getAll()
    expect(mutation?.state.variables).toEqual({ monthlyRequestBudget: 2500 })
    expect(mounted.result().isSaved).toBe(true)
    mounted.unmount()
  })

  it('se o servidor recusa, a chave também não fica na mutação que falhou', async () => {
    providerSettingsDouble.settings = buildProviderSettings()
    const mounted = await mountActions()

    await saveIn(mounted, { expectedVersion: 'velha', token: FAKE_PROVIDER_TOKEN })

    expect(mounted.queryClient.getMutationCache().getAll().length).toBeGreaterThan(0)
    expect(mutationStates(mounted.queryClient)).toContain('"status":"error"')
    expect(mutationStates(mounted.queryClient)).not.toContain(FAKE_PROVIDER_TOKEN)
    mounted.unmount()
  })

  it('uma gravação só do orçamento depois de outra com chave não reaproveita a chave anterior', async () => {
    providerSettingsDouble.settings = buildProviderSettings()
    const mounted = await mountActions()

    await saveIn(mounted, { expectedVersion: SETTINGS_VERSION, token: FAKE_PROVIDER_TOKEN })
    await saveIn(mounted, { expectedVersion: '4', monthlyRequestBudget: 2500 })

    expect(callsOf(PUT_SETTINGS, businessCalendarDouble.calls)[1]).toBe(
      `${PUT_SETTINGS} {"expectedVersion":"4","monthlyRequestBudget":2500}`,
    )
    mounted.unmount()
  })
})
