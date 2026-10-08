/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.5x: o `PUT` do tipo sobrescreve o registro inteiro e sai montado do tipo que está na tela. Se
 * os campos voltam a ficar livres antes de a lista nova chegar, a segunda edição re-envia o valor antigo do
 * que a primeira acabou de gravar. O contrato usa o hook real, um `QueryClient` real e um servidor falso cuja
 * leitura demora — a tela só edita enquanto o salvamento não está pendente, como `isSaving` garante.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import {
  buildOccurrenceTypeUpdate,
  type OccurrenceTypeEdit,
} from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { renderHook, settle, waitFor } from './renderHook.helper'
import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'

const { useOccurrenceTypeCatalogPanel } = await import(
  '@/modules/trip/hooks/useOccurrenceTypeCatalogPanel.hook'
)

const ORIGINAL_LABEL = 'Valor pago'
const EDITED_LABEL = 'Valor pago pela loja'

function buildType(): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'required',
    declaredAmountLabel: ORIGINAL_LABEL,
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
    referenceNumberLabel: 'Número da NFD',
    referenceNumberMode: 'required',
    stage: 'delivery',
  }
}

/** Servidor falso: o `PUT` grava o que recebeu e a leitura espera o teste soltá-la. */
function installServer(reloadFailure?: Error) {
  const state = { record: buildType(), reloads: 0, saves: 0 }
  let release: () => void = () => undefined
  let gate = Promise.resolve()
  fakes.tripClient = {
    ...fakes.tripClient,
    listOccurrenceTypes: async () => {
      state.reloads += 1
      if (state.reloads > 1) await gate
      if (reloadFailure !== undefined && state.reloads > 1) throw reloadFailure
      return [state.record]
    },
    saveOccurrenceType: (input) => {
      state.saves += 1
      state.record = { ...state.record, ...input } as OccurrenceType
      return Promise.resolve(state.record)
    },
  }
  return {
    hold: () => {
      gate = new Promise<void>((resolve) => (release = resolve))
    },
    release: () => release(),
    state,
  }
}

async function saveTwice(first: OccurrenceTypeEdit, second: OccurrenceTypeEdit) {
  resetTripHookFakes([])
  const server = installServer()
  const rendered = await renderHook(() => useOccurrenceTypeCatalogPanel({ enabled: true }))
  await waitFor(() => expect(rendered.result().query.data).toHaveLength(1))
  server.hold()

  const typeOnScreen = rendered.result().query.data?.[0] as OccurrenceType
  rendered.result().saveMutation.mutate(buildOccurrenceTypeUpdate(typeOnScreen, first))
  await waitFor(() => expect(server.state.saves).toBe(1))
  await settle()

  const isLockedUntilReload = rendered.result().saveMutation.isPending
  if (isLockedUntilReload) {
    server.release()
    await waitFor(() => expect(rendered.result().saveMutation.isPending).toBe(false))
  }
  const typeAfterFirstSave = rendered.result().query.data?.[0] as OccurrenceType
  rendered.result().saveMutation.mutate(buildOccurrenceTypeUpdate(typeAfterFirstSave, second))
  await waitFor(() => expect(server.state.saves).toBe(2))
  server.release()
  await settle()
  rendered.unmount()
  return server.state.record
}

describe('salvamentos seguidos do tipo (spec 247 T7.5x)', () => {
  test('a segunda edição não desfaz o campo que a primeira gravou (o PUT reenvia do cache)', async () => {
    const record = await saveTwice({ notifies: true }, { referenceNumberLabel: 'Número da nota' })

    expect(record.notifies).toBe(true)
    expect(record.referenceNumberLabel).toBe('Número da nota')
  })

  test('o rótulo gravado pela primeira edição segue gravado (regressão: o PUT não o reenvia)', async () => {
    const record = await saveTwice({ declaredAmountLabel: EDITED_LABEL }, { notifies: true })

    expect(record.declaredAmountLabel).toBe(EDITED_LABEL)
    expect(record.notifies).toBe(true)
  })

  test('uma leitura que falha depois do salvamento não deixa o painel travado', async () => {
    resetTripHookFakes([])
    const server = installServer(new Error('RELOAD_FAILED'))
    const rendered = await renderHook(() => useOccurrenceTypeCatalogPanel({ enabled: true }))
    await waitFor(() => expect(rendered.result().query.data).toHaveLength(1))
    server.hold()

    const typeOnScreen = rendered.result().query.data?.[0] as OccurrenceType
    rendered
      .result()
      .saveMutation.mutate(
        buildOccurrenceTypeUpdate(typeOnScreen, { declaredAmountLabel: EDITED_LABEL }),
      )
    await waitFor(() => expect(server.state.saves).toBe(1))
    server.release()

    await waitFor(() => expect(rendered.result().saveMutation.isPending).toBe(false))
    rendered.unmount()
  })
})
