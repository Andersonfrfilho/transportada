/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.5x: o operador sai de um rótulo (o salvamento começa) e já digita no seguinte. O campo
 * não pode ficar desabilitado — o navegador tira o foco de campo desabilitado e a digitação cai no vazio —,
 * e as duas edições têm de chegar ao servidor, em ordem, cada `PUT` montado sobre o tipo mais recente.
 * ⚠️ O DOM de teste não move o foco real do Chrome: prova que o campo segue habilitado e com o texto, não
 * que `document.activeElement` sobrevive.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { expandAllTypes, installExceptionsDouble } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'
import { tripHookFakes as fakes } from './tripClientMocks.helper'

const { TripOccurrenceTypesTab } = await import(
  '@/modules/trip/components/TripOccurrenceTypesTab.component'
)

const REFERENCE_TEXT_LABEL = 'Rótulo do número na tela de registro'
const AMOUNT_TEXT_LABEL = 'Rótulo do valor na tela de registro'

function buildType(): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'required',
    declaredAmountLabel: 'Valor pago',
    declaredAmountMode: 'optional',
    declaredAmountScope: 'item',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'required',
    leavesDocumentBehind: false,
    moments: ['document'],
    name: 'Devolução parcial',
    notifies: false,
    redeliveryPolicy: 'blocked',
    referenceNumberLabel: 'Número',
    referenceNumberMode: 'required',
    stage: 'delivery',
  }
}

type PendingSave = { fail: () => void; land: () => void }

/** Servidor falso: cada `PUT` espera o teste soltá-lo; a lista devolve o que foi gravado. */
function installServer() {
  const state = { pending: [] as PendingSave[], record: buildType(), saves: 0 }
  installExceptionsDouble()
  fakes.tripClient = {
    ...fakes.tripClient,
    listOccurrenceTypes: () => Promise.resolve([state.record]),
    saveOccurrenceType: (input) => {
      state.saves += 1
      return new Promise((resolve, reject) => {
        state.pending.push({
          fail: () => reject(new Error('SAVE_REFUSED')),
          land: () => {
            state.record = { ...state.record, ...input } as OccurrenceType
            resolve(state.record)
          },
        })
      })
    },
  }
  return state
}

function textInput(label: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (input === null) throw new Error(`INPUT_NOT_FOUND:${label}`)
  return input
}

async function leaveWith(input: HTMLInputElement, value: string): Promise<void> {
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    valueDescriptor?.set?.call(input, value)
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await Promise.resolve()
  })
}

async function land(server: ReturnType<typeof installServer>, index: number): Promise<void> {
  await act(async () => {
    server.pending[index]?.land()
    await Promise.resolve()
  })
  await settle()
}

async function mountTab() {
  const rendered = await renderWithQueryClient(
    createElement(TripOccurrenceTypesTab, { canManage: true }),
  )
  await waitFor(() => expect(document.body.textContent).toContain('Devolução parcial'))
  await expandAllTypes()
  return rendered
}

describe('digitar enquanto o tipo salva (spec 247 T7.5x)', () => {
  test('o campo seguinte segue habilitado com o texto, e as duas edições chegam ao servidor', async () => {
    const restoreLayout = stubVisibleLayout()
    const server = installServer()
    const rendered = await mountTab()

    await leaveWith(textInput(REFERENCE_TEXT_LABEL), 'TesteN')
    await waitFor(() => expect(server.saves).toBe(1))
    await settle()

    expect(textInput(AMOUNT_TEXT_LABEL).disabled).toBe(false)
    await leaveWith(textInput(AMOUNT_TEXT_LABEL), 'TesteV')
    expect(textInput(AMOUNT_TEXT_LABEL).value).toBe('TesteV')
    expect(server.saves).toBe(1)

    await land(server, 0)
    await waitFor(() => expect(server.saves).toBe(2))
    await land(server, 1)
    await waitFor(() => expect(textInput(AMOUNT_TEXT_LABEL).value).toBe('TesteV'))

    expect(server.record.referenceNumberLabel).toBe('TesteN')
    expect(server.record.declaredAmountLabel).toBe('TesteV')
    expect(textInput(REFERENCE_TEXT_LABEL).value).toBe('TesteN')
    rendered.unmount()
    restoreLayout()
  })

  test('um salvamento recusado mostra o erro e não apaga o que o operador digitou', async () => {
    const restoreLayout = stubVisibleLayout()
    const server = installServer()
    const rendered = await mountTab()

    await leaveWith(textInput(REFERENCE_TEXT_LABEL), 'TesteN')
    await waitFor(() => expect(server.saves).toBe(1))
    await settle()
    await leaveWith(textInput(AMOUNT_TEXT_LABEL), 'TesteV')
    await act(async () => {
      server.pending[0]?.fail()
      await Promise.resolve()
    })
    await settle()

    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(textInput(REFERENCE_TEXT_LABEL).value).toBe('TesteN')
    expect(textInput(AMOUNT_TEXT_LABEL).value).toBe('TesteV')
    expect(textInput(AMOUNT_TEXT_LABEL).disabled).toBe(false)

    await leaveWith(textInput(AMOUNT_TEXT_LABEL), 'TesteV2')
    await waitFor(() => expect(server.saves).toBe(2))
    await land(server, 1)
    await waitFor(() => expect(server.record.declaredAmountLabel).toBe('TesteV2'))
    expect(server.record.referenceNumberLabel).toBe('TesteN')
    rendered.unmount()
    restoreLayout()
  })
})
