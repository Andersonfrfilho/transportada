/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1: o preenchimento dos dois formulários do calendário, campo a campo, pelo rótulo que a pessoa lê.
 */
import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  choose,
  click,
  inputIn,
  sectionOf,
  typeInto,
  waitForText,
} from './businessCalendarHarness.helper'
import { waitFor } from './renderHook.helper'

export const MUNICIPAL_HEADING = 'Feriados municipais'
export const STATE_HEADING = 'Feriados estaduais'

export type MunicipalFormValues = Readonly<{
  city?: string
  date?: string
  day?: string
  kind?: string
  month?: string
  name?: string
  recurrence?: string
  state?: string
}>

export function seedMunicipalities(): void {
  businessCalendarDouble.municipalities = {
    PR: [{ code: '4106902', name: 'Curitiba' }],
    SP: [
      { code: '3509502', name: 'Campinas' },
      { code: '3550308', name: 'São Paulo' },
    ],
  }
}

async function pick(
  input: Readonly<{ heading: string; option: string | undefined; trigger: string }>,
): Promise<void> {
  if (input.option === undefined) return
  await choose({ option: input.option, scope: sectionOf(input.heading), trigger: input.trigger })
}

async function write(
  input: Readonly<{ heading: string; label: string; value: string | undefined }>,
): Promise<void> {
  if (input.value === undefined) return
  await typeInto(inputIn(sectionOf(input.heading), input.label), input.value)
}

export async function fillMunicipalForm(values: MunicipalFormValues): Promise<void> {
  const heading = MUNICIPAL_HEADING
  await pick({ heading, option: values.state, trigger: 'UF do município' })
  if (values.city !== undefined) {
    await waitFor(() => {
      const calls = businessCalendarDouble.calls.filter((call) => call.startsWith('DIRECTORY'))
      if (calls.length === 0) throw new Error('DIRECTORY_NOT_CALLED')
    })
  }
  await pick({ heading, option: values.city, trigger: 'Município' })
  await pick({ heading, option: values.kind, trigger: 'Tipo' })
  await pick({ heading, option: values.recurrence, trigger: 'Recorrência' })
  await pick({ heading, option: values.month, trigger: 'Mês' })
  await write({ heading, label: 'Dia', value: values.day })
  await write({ heading, label: 'Data', value: values.date })
  await write({ heading, label: 'Nome', value: values.name })
}

export async function fillStateForm(values: MunicipalFormValues): Promise<void> {
  const heading = STATE_HEADING
  await pick({ heading, option: values.state, trigger: 'UF' })
  await pick({ heading, option: values.recurrence, trigger: 'Recorrência' })
  await pick({ heading, option: values.month, trigger: 'Mês' })
  await write({ heading, label: 'Dia', value: values.day })
  await write({ heading, label: 'Data', value: values.date })
  await write({ heading, label: 'Nome', value: values.name })
}

export async function submit(input: Readonly<{ heading: string; label: string }>): Promise<void> {
  await click(buttonIn(sectionOf(input.heading), input.label))
}

export async function createRuleInForm(): Promise<void> {
  seedMunicipalities()
  await fillMunicipalForm({
    city: 'Campinas',
    day: '14',
    kind: 'Aniversário da cidade',
    month: 'Julho',
    name: 'Aniversário de Campinas',
    recurrence: 'Todo ano',
    state: 'SP',
  })
  await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })
  await waitForText('Todo ano, 14/07')
}

export function fieldError(heading: string, field: string): HTMLElement | null {
  return sectionOf(heading).querySelector(`[data-field="${field}"] [data-field-error]`)
}

export function controlOf(heading: string, label: string): HTMLElement {
  const control = sectionOf(heading).querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (control === null) throw new Error(`CONTROL_NOT_FOUND:${label}`)
  return control
}
