/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.3 (RF12, D8): o cartão "Importação de feriados" com as manchetes que dependem da chave e do orçamento. O
 * `status` não traz nenhum dos dois: "sem chave" e "orçamento atingido" vêm do `GET` da configuração da instalação, que o
 * bloco da chave também lê (uma ida só à rede). Se esse `GET` falhar, o cartão é o de antes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import { buildImportStatus } from '../fixtures/holidayImport.fixture'
import {
  buildEmptyProviderSettings,
  buildProviderSettings,
} from '../fixtures/holidayProviderSettings.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  callsOf,
  click,
  endScenario,
  mountPanel,
  sectionOf,
  startScenario,
  typeInto,
  waitForText,
} from './businessCalendarHarness.helper'
import { providerSettingsDouble } from './holidayProviderSettingsDouble.helper'

const HEADING = 'Importação de feriados'
const GET_SETTINGS = 'GET /holiday-imports/provider-settings'

function card(): string {
  return sectionOf(HEADING).textContent ?? ''
}

function headlineAttribute(): string | null {
  return sectionOf(HEADING).querySelector('[data-headline]')?.getAttribute('data-headline') ?? null
}

describe('manchetes do cartão que dependem da chave (spec 262 T5.3)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('sem chave: diz que a importação não busca nada e aponta o bloco da chave', async () => {
    providerSettingsDouble.settings = buildEmptyProviderSettings()
    await mountPanel()

    await waitForText('Sem chave da FeriadosAPI')
    expect(headlineAttribute()).toBe('noToken')
    expect(card()).toContain('não busca nada enquanto não houver chave')
    expect(card()).toContain('bloco "Chave da FeriadosAPI"')
    expect(card()).not.toContain('Em dia')
    expect(card()).not.toContain('Aguardando a primeira execução')
  })

  it('sem chave vence a recusa do fornecedor guardada no último ciclo', async () => {
    providerSettingsDouble.settings = buildEmptyProviderSettings()
    businessCalendarDouble.importStatus = buildImportStatus({
      lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'provider_unauthorized' },
    })
    await mountPanel()

    await waitForText('Sem chave da FeriadosAPI')
    expect(card()).not.toContain('Fornecedor recusou o acesso')
  })

  it('chave ilegível: o ciclo não conseguiu abrir a chave guardada, e a tela manda colar de novo', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'credential_unreadable' },
    })
    await mountPanel()

    await waitForText('A chave guardada não abre')
    expect(headlineAttribute()).toBe('tokenUnreadable')
    expect(card()).toContain('Cole a chave de novo')
    expect(card()).toContain('Último ciclo da rotina: 09/10/2026')
  })

  it('orçamento do mês atingido: o uso chega ao orçamento da configuração e a tela diz como seguir', async () => {
    providerSettingsDouble.settings = buildProviderSettings({
      budgetOrigin: 'installation',
      monthlyRequestBudget: 42,
    })
    await mountPanel()

    await waitForText('Orçamento do mês atingido')
    expect(headlineAttribute()).toBe('budgetReached')
    expect(card()).toContain('aumente o orçamento')
    expect(card()).toContain('Requisições do mês (toda a instalação): 42')
  })

  it('um a menos que o orçamento ainda não é "atingido"', async () => {
    providerSettingsDouble.settings = buildProviderSettings({
      budgetOrigin: 'installation',
      monthlyRequestBudget: 43,
    })
    await mountPanel()

    await waitForText('Em dia')
    expect(headlineAttribute()).toBe('healthy')
  })

  it('aguardando com chave configurada manda despausar a rotina em Operações', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      lastFetchedAt: null,
      lastRun: null,
    })
    await mountPanel()

    await waitForText('Aguardando a primeira execução')
    expect(card()).toContain('Em Operações, despause a rotina holiday.provider.pull')
    expect(card()).not.toContain('sem token')
  })

  it('a importação desligada na empresa vence a falta de chave', async () => {
    providerSettingsDouble.settings = buildEmptyProviderSettings()
    businessCalendarDouble.importStatus = buildImportStatus({ isEnabled: false })
    await mountPanel()

    await waitForText('Desligada para esta empresa')
    expect(headlineAttribute()).toBe('disabled')
  })

  it('se a leitura da configuração falhar, o cartão é o de antes: nem "sem chave" nem "orçamento atingido"', async () => {
    providerSettingsDouble.settings = buildEmptyProviderSettings()
    businessCalendarDouble.failNext.set(
      GET_SETTINGS,
      new BusinessCalendarRequestError({ code: 'DATABASE_UNAVAILABLE', status: 503 }),
    )
    await mountPanel()

    await waitForText('Em dia')
    expect(headlineAttribute()).toBe('healthy')
    expect(card()).not.toContain('Sem chave da FeriadosAPI')
  })

  it('o cartão e o bloco da chave leem a configuração uma vez só', async () => {
    await mountPanel()

    await waitForText('Em dia')
    expect(callsOf(GET_SETTINGS, businessCalendarDouble.calls)).toHaveLength(1)
  })

  it('salvar a chave tira o aviso de "sem chave" do cartão, sem recarregar a página', async () => {
    providerSettingsDouble.settings = buildEmptyProviderSettings()
    await mountPanel()
    await waitForText('Sem chave da FeriadosAPI')

    const field =
      sectionOf('Chave da FeriadosAPI').querySelector<HTMLInputElement>('input[type="password"]')
    if (field === null) throw new Error('TOKEN_FIELD_NOT_FOUND')
    await typeInto(field, 'FAKE-feriados-sentinel-Q7zK-0000')
    await click(buttonIn(sectionOf('Chave da FeriadosAPI'), 'Salvar'))

    await waitForText('Em dia')
    expect(card()).not.toContain('Sem chave da FeriadosAPI')
  })
})
