/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M4 e L4): saber quem tem o recebimento ligado custava UMA requisição por
 * contratante (150 contratantes, 150 idas à API). Agora é uma consulta paginada, e o número de requisições
 * não cresce com o número de contratantes. Salvar o perfil invalida a lista dos dois módulos. Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { ContractorDirectoryPanel } from '@/modules/delivery-clients/components/ContractorDirectoryPanel.component'
import { useSaveReceivingProfileMutation } from '@/modules/delivery-clients/mutations/useSaveReceivingProfile.mutation'
import { useReceivingProfileSummaries } from '@/modules/delivery-clients/queries/useReceivingProfile.query'
import type { Contractor } from '@/modules/delivery-clients/shared/contractorDirectory.types'
import type { ReceivingProfile } from '@/modules/delivery-clients/shared/receivingProfile.types'
import { usePreviewContractors } from '@/modules/cargo-receiving/queries/useCargoPreviewContractors.query'
import { useEnabledContractors } from '@/modules/cargo-receiving/queries/useCargoContractors.query'
import type {
  CargoContractor,
  CargoReceivingProfile,
} from '@/modules/cargo-receiving/shared/cargoArrival.types'

import {
  installCargoReceivingDouble,
  type CargoReceivingDouble,
} from './cargoReceivingHarness.helper'
import {
  ALFA_PROFILE,
  CONTRACTOR_IDS,
  installContractorDirectoryDouble,
  resetLocation,
  rowNames,
} from './contractorDirectoryHarness.helper'
import { renderHook, renderWithQueryClient, settle, waitFor } from './renderHook.helper'

const TOTAL = 150
const ENABLED_TOTAL = 120
const PAGE_SIZE = 100
const MAX_PAGES = Math.ceil(TOTAL / PAGE_SIZE)

const idOf = (index: number): string =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`

function buildCargoContractors(): readonly CargoContractor[] {
  return Array.from({ length: TOTAL }, (_, index) => ({
    displayName: `Contratante Fictício ${String(index)}`,
    id: idOf(index),
    taxId: String(10_000_000_000_000 + index),
  }))
}

/** 120 ligados, 10 desligados e 20 sem perfil: só os ligados podem receber chegada. */
function buildCargoProfiles(): readonly CargoReceivingProfile[] {
  return Array.from({ length: ENABLED_TOTAL + 10 }, (_, index) => ({
    contractorId: idOf(index),
    isEnabled: index < ENABLED_TOTAL,
    previewEnabled: index % 2 === 0,
  }))
}

function buildDirectoryContractors(): readonly Contractor[] {
  return buildCargoContractors().map((contractor) => ({
    closingPeriod: 'monthly',
    displayName: contractor.displayName,
    id: contractor.id,
    notes: '',
    reportEmail: '',
    status: 'active',
    taxId: contractor.taxId,
  }))
}

function buildDirectoryProfiles(): Record<string, ReceivingProfile> {
  return Object.fromEntries(
    buildCargoProfiles().map((profile) => [
      profile.contractorId,
      { ...ALFA_PROFILE, ...profile } satisfies ReceivingProfile,
    ]),
  )
}

function installCargo(overrides: Partial<CargoReceivingDouble> = {}): CargoReceivingDouble {
  return installCargoReceivingDouble({
    contractors: buildCargoContractors(),
    profiles: buildCargoProfiles(),
    ...overrides,
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('registro de chegada: quem tem o recebimento ligado (revisão M4)', () => {
  test('150 contratantes custam no máximo as páginas de perfil e as de contratante, nunca uma por contratante', async () => {
    const double = installCargo()
    const rendered = await renderHook(useEnabledContractors)

    await waitFor(() => expect(rendered.result().isLoading).toBe(false))

    expect(double.calls.listProfiles.length).toBeLessThanOrEqual(MAX_PAGES)
    expect(double.calls.listContractors.length).toBe(MAX_PAGES)
    expect(double.calls.listProfiles.every((call) => call.enabled === true)).toBe(true)
    rendered.unmount()
  })

  test('lista só os contratantes com o recebimento ligado, cruzando por contractorId', async () => {
    installCargo()
    const rendered = await renderHook(useEnabledContractors)

    await waitFor(() => expect(rendered.result().isLoading).toBe(false))

    const names = rendered.result().contractors.map((contractor) => contractor.id)
    expect(names).toHaveLength(ENABLED_TOTAL)
    expect(names).toContain(idOf(0))
    expect(names).not.toContain(idOf(ENABLED_TOTAL))
    expect(names).not.toContain(idOf(TOTAL - 1))
    rendered.unmount()
  })

  test('sem nenhum perfil é uma consulta só, e a lista de quem recebe fica vazia', async () => {
    const double = installCargo({ profiles: [] })
    const rendered = await renderHook(useEnabledContractors)

    await waitFor(() => expect(rendered.result().isLoading).toBe(false))

    expect(rendered.result().contractors).toHaveLength(0)
    expect(double.calls.listProfiles).toHaveLength(1)
    rendered.unmount()
  })
})

describe('envio da planilha: quem tem o recebimento E a prévia ligados (revisão M4)', () => {
  test('150 contratantes custam as páginas de perfil, e só os com prévia ligada entram', async () => {
    const double = installCargo()
    const rendered = await renderHook(usePreviewContractors)

    await waitFor(() => expect(rendered.result().isLoading).toBe(false))

    expect(double.calls.listProfiles.length).toBeLessThanOrEqual(MAX_PAGES)
    const ids = rendered.result().contractors.map((contractor) => contractor.id)
    expect(ids).toHaveLength(ENABLED_TOTAL / 2)
    expect(ids).toContain(idOf(0))
    expect(ids).not.toContain(idOf(1))
    rendered.unmount()
  })
})

describe('a aba Contratantes: o selo vem de UMA consulta de perfis (revisão M4)', () => {
  async function mountDirectory() {
    resetLocation()
    const calls = installContractorDirectoryDouble(
      buildDirectoryProfiles(),
      buildDirectoryContractors(),
    )
    const rendered = await renderWithQueryClient(
      createElement(ContractorDirectoryPanel, { canManage: true }),
    )
    await waitFor(() => expect(rowNames().length).toBeGreaterThan(0))
    await waitFor(() => expect(document.body.textContent).not.toContain('Lendo o perfil'))
    return { calls, rendered }
  }

  test('150 contratantes não fazem uma leitura de perfil por linha', async () => {
    const { calls, rendered } = await mountDirectory()

    expect(calls.profileReads).toHaveLength(0)
    expect(calls.profileLists.length).toBeLessThanOrEqual(MAX_PAGES)
    rendered.unmount()
  })

  test('os selos continuam certos: ligado, desligado e sem perfil', async () => {
    const { rendered } = await mountDirectory()

    const rows = [...document.querySelectorAll('tbody tr')].map((row) => row.textContent ?? '')
    expect(rows).toHaveLength(TOTAL)
    expect(rows[0]).toContain('Recebimento ativo')
    expect(rows[ENABLED_TOTAL]).toContain('Recebimento desligado')
    expect(rows[TOTAL - 1]).toContain('Sem perfil')
    rendered.unmount()
  })
})

describe('salvar o perfil atualiza a lista dos dois módulos (revisão L4)', () => {
  function useBoth() {
    return {
      enabled: useEnabledContractors(),
      save: useSaveReceivingProfileMutation(CONTRACTOR_IDS.alfa),
      summaries: useReceivingProfileSummaries([CONTRACTOR_IDS.alfa]),
    }
  }

  test('a lista de quem recebe e o selo da aba Contratantes são relidos depois do PUT', async () => {
    const cargo = installCargoReceivingDouble()
    const directory = installContractorDirectoryDouble()
    const rendered = await renderHook(useBoth)
    await waitFor(() => expect(rendered.result().enabled.isLoading).toBe(false))
    await waitFor(() => expect(directory.profileLists.length).toBeGreaterThan(0))
    const before = {
      cargo: cargo.calls.listProfiles.length,
      directory: directory.profileLists.length,
    }

    rendered.result().save.mutate({ ...ALFA_PROFILE, isEnabled: false })
    await settle()
    await waitFor(() => expect(cargo.calls.listProfiles.length).toBeGreaterThan(before.cargo))
    await waitFor(() => expect(directory.profileLists.length).toBeGreaterThan(before.directory))

    expect(directory.profileSaves).toHaveLength(1)
    rendered.unmount()
  })
})
