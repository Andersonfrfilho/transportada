/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 278 D7: salvar a edição de um tipo que já existe (inclusive o bloco "Salvar retorno") confirma na tela,
 * no mesmo estilo do aviso de tipo criado. O aviso só vem depois de o `PUT` dar certo; some quando outro
 * salvamento começa, quando a gravação falha e quando o que se salva é um tipo novo. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import { buildOccurrenceTypeUpdate } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { installExceptionsDouble } from './occurrenceTypesPanelHarness.helper'
import { renderHook, renderWithQueryClient, settle, waitFor } from './renderHook.helper'
import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'

const { useOccurrenceTypeCatalogPanel } = await import(
  '@/modules/trip/hooks/useOccurrenceTypeCatalogPanel.hook'
)

const SAVED = 'Configuração salva. Vale para as próximas ocorrências.'

function buildType(): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    moments: ['document'],
    name: 'Prorrogação do boleto',
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
  }
}

/** Servidor falso: o `PUT` grava o que recebeu; `hold` segura o próximo até o teste soltá-lo. */
function installServer(failure?: Error) {
  const state = {
    gate: Promise.resolve(),
    hold() {
      this.gate = new Promise<void>((resolve) => (this.release = resolve))
    },
    record: buildType(),
    release: () => undefined as void,
    saves: 0,
  }
  fakes.tripClient = {
    ...fakes.tripClient,
    listOccurrenceTypes: () => Promise.resolve([state.record]),
    saveOccurrenceType: async (input) => {
      state.saves += 1
      await state.gate
      if (failure !== undefined) throw failure
      state.record = { ...state.record, ...input } as OccurrenceType
      return state.record
    },
  }
  return state
}

async function mountHook(failure?: Error) {
  resetTripHookFakes([])
  const state = installServer(failure)
  const rendered = await renderHook(() => useOccurrenceTypeCatalogPanel({ enabled: true }))
  await waitFor(() => expect(rendered.result().query.data).toHaveLength(1))
  return { rendered, state }
}

describe('a edição salva do tipo confirma na tela (spec 278 D7)', () => {
  test('o PUT de um tipo existente que dá certo liga o aviso', async () => {
    const { rendered, state } = await mountHook()
    expect(rendered.result().editSaved).toBe(false)

    rendered.result().saveType(buildOccurrenceTypeUpdate(state.record, { notifies: true }))
    await waitFor(() => expect(rendered.result().editSaved).toBe(true))
    expect(state.saves).toBe(1)
    rendered.unmount()
  })

  test('outro salvamento apaga o aviso até dar certo de novo', async () => {
    const { rendered, state } = await mountHook()
    rendered.result().saveType(buildOccurrenceTypeUpdate(state.record, { notifies: true }))
    await waitFor(() => expect(rendered.result().editSaved).toBe(true))

    state.hold()
    rendered.result().saveType(buildOccurrenceTypeUpdate(state.record, { notifies: false }))
    await waitFor(() => expect(state.saves).toBe(2))
    await settle()
    expect(rendered.result().editSaved).toBe(false)
    state.release()
    await waitFor(() => expect(rendered.result().editSaved).toBe(true))
    expect(state.saves).toBe(2)
    rendered.unmount()
  })

  test('a gravação que falha não confirma', async () => {
    const { rendered, state } = await mountHook(new Error('SAVE_FAILED'))
    rendered.result().saveType(buildOccurrenceTypeUpdate(state.record, { notifies: true }))
    await waitFor(() => expect(state.saves).toBe(1))
    await waitFor(() => expect(rendered.result().saveMutation.isPending).toBe(false))
    await settle()
    expect(rendered.result().editSaved).toBe(false)
    rendered.unmount()
  })

  test('o cadastro de um tipo novo não usa este aviso (tem o dele)', async () => {
    const { rendered, state } = await mountHook()
    rendered.result().saveType({
      ...buildOccurrenceTypeUpdate(state.record, { name: 'Tipo novo' }),
      occurrenceTypeId: null,
    })
    await waitFor(() => expect(state.saves).toBe(1))
    await waitFor(() => expect(rendered.result().saveMutation.isPending).toBe(false))
    await settle()
    expect(rendered.result().editSaved).toBe(false)
    rendered.unmount()
  })

  test('o painel mostra o aviso com role=status (o mesmo parágrafo do aviso de criado); com erro, não', async () => {
    const restoreLayout = stubVisibleLayout()
    const mounted: { unmount: () => void }[] = []
    try {
      installExceptionsDouble()
      const props = {
        canManage: true,
        editSaved: true,
        isSaving: false,
        loadStatus: 'ready' as const,
        onRetry: () => undefined,
        onSave: () => undefined,
        saveFeedbackKey: null,
        types: [buildType()],
      }
      mounted.push(await renderWithQueryClient(createElement(OccurrenceTypeCatalogPanel, props)))
      const notice = [...document.querySelectorAll('[role="status"]')].find(
        (element) => element.textContent === SAVED,
      )
      expect(notice?.tagName).toBe('P')
      mounted.pop()?.unmount()

      mounted.push(
        await renderWithQueryClient(
          createElement(OccurrenceTypeCatalogPanel, { ...props, saveFeedbackKey: 'saveFailed' }),
        ),
      )
      expect(document.body.textContent).not.toContain(SAVED)
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
    }
  })
})
