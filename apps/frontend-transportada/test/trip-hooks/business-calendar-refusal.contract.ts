/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (`web.md` §11): a recusa do servidor nomeia TODOS os campos pelo rótulo impresso, cada nome é um
 * atalho que rola até o campo e põe o foco nele, o campo desconhecido sai com o nome cru e a recusa sem campo diz
 * o motivo — nenhuma é muda. Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  click,
  endScenario,
  mountPanel,
  sectionOf,
  startScenario,
  waitForText,
} from './businessCalendarHarness.helper'
import {
  createRuleInForm,
  fillMunicipalForm,
  MUNICIPAL_HEADING,
  seedMunicipalities,
  submit,
} from './businessCalendarForms.helper'
import { waitFor } from './renderHook.helper'

const FORM = {
  city: 'Campinas',
  day: '14',
  kind: 'Feriado',
  month: 'Julho',
  name: 'Feriado de teste',
  recurrence: 'Todo ano',
  state: 'SP',
} as const

function shortcutTo(section: HTMLElement, label: string): HTMLElement {
  const found = [...section.querySelectorAll<HTMLElement>('[data-refusal-summary] button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (found === undefined) throw new Error(`SHORTCUT_NOT_FOUND:${label}`)
  return found
}

async function refuseNextRulePost(error: BusinessCalendarRequestError): Promise<void> {
  businessCalendarDouble.failNext.set('POST /municipal-holiday-rules', error)
  await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })
}

describe('recusa do servidor no cadastro municipal (spec 238 T2.1, web.md §11)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('nomeia todos os campos recusados, uma vez cada, e cada nome leva ao campo', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm(FORM)

    await refuseNextRulePost(
      new BusinessCalendarRequestError({
        code: 'INVALID_REQUEST',
        details: [
          { field: 'day', message: 'The day does not exist in the month' },
          { field: 'name', message: 'Too small' },
          { field: 'day', message: 'Too big' },
        ],
        status: 400,
      }),
    )

    await waitForText('Confira: Dia, Nome.')
    const section = sectionOf(MUNICIPAL_HEADING)
    const shortcuts = [...section.querySelectorAll('[data-refusal-summary] button')]
    expect(shortcuts.map((shortcut) => shortcut.textContent)).toEqual(['Dia', 'Nome'])

    await click(shortcutTo(section, 'Dia'))

    expect(document.activeElement === section.querySelector('input[aria-label="Dia"]')).toBe(true)
  })

  it('o atalho de um campo de lista põe o foco no gatilho dela', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm(FORM)

    await refuseNextRulePost(
      new BusinessCalendarRequestError({
        code: 'INVALID_REQUEST',
        details: [{ field: 'cityIbgeCode', message: 'is invalid' }],
        status: 400,
      }),
    )
    await waitForText('Confira: Município.')
    await click(shortcutTo(sectionOf(MUNICIPAL_HEADING), 'Município'))

    const focused = document.activeElement
    expect(focused?.getAttribute('aria-label')).toBe('Município')
  })

  it('campo que a tela não conhece sai com o nome que a API usou', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm(FORM)

    await refuseNextRulePost(
      new BusinessCalendarRequestError({
        code: 'INVALID_REQUEST',
        details: [
          { field: 'day', message: 'x' },
          { field: 'extraThing', message: 'y' },
        ],
        status: 400,
      }),
    )

    await waitForText('Confira: Dia, extraThing.')
  })

  it('recusa sem campo algum não inventa lista, mas diz o motivo', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm(FORM)

    await refuseNextRulePost(
      new BusinessCalendarRequestError({ code: 'INVALID_REQUEST', status: 400 }),
    )

    await waitFor(() =>
      expect(sectionOf(MUNICIPAL_HEADING).querySelector('[role="alert"]')).not.toBeNull(),
    )
    expect(sectionOf(MUNICIPAL_HEADING).querySelector('[data-refusal-summary]')).toBeNull()
    expect(sectionOf(MUNICIPAL_HEADING).querySelector('[role="alert"]')?.textContent).toContain(
      'O servidor recusou os dados',
    )
  })

  it('o conflito de regra é dito pelo motivo, não por "erro"', async () => {
    seedMunicipalities()
    await mountPanel()
    await createRuleInForm()
    await fillMunicipalForm({ ...FORM, name: 'Outro nome para o mesmo dia' })

    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })

    await waitForText('Já existe uma regra para esta cidade e este dia, com outro nome ou tipo')
  })

  it('falha de rede e permissão negada também são ditas', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm(FORM)

    await refuseNextRulePost(new BusinessCalendarRequestError({ code: 'FORBIDDEN', status: 403 }))
    await waitForText('Seu perfil não tem permissão')

    await refuseNextRulePost(
      new BusinessCalendarRequestError({ code: 'BUSINESS_CALENDAR_NETWORK_ERROR', status: 0 }),
    )
    await waitForText('Não foi possível falar com o servidor')
  })

  it('editar o campo limpa o aviso da recusa', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm(FORM)
    await refuseNextRulePost(
      new BusinessCalendarRequestError({
        code: 'INVALID_REQUEST',
        details: [{ field: 'name', message: 'Too small' }],
        status: 400,
      }),
    )
    await waitForText('Confira: Nome.')

    await fillMunicipalForm({ name: 'Nome corrigido' })

    await waitFor(() =>
      expect(sectionOf(MUNICIPAL_HEADING).querySelector('[data-refusal-summary]')).toBeNull(),
    )
  })
})
