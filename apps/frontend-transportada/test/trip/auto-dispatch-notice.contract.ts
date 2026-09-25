/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

/**
 * Spec 185 T6.1 (RF2/RF3): as mutations de carregar (linha e lote) e a ocorrência de separação leem
 * `autoDispatch` da resposta — `dispatched` vira aviso de sucesso ("Viagem despachada."), `blocked`
 * vira a mesma frase de recusa do botão "Despachar" (RF8).
 */
const WORKSPACE = new URL('../../src/modules/trip/hooks/useTripWorkspace.hook.ts', import.meta.url)
const DETALHE = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

describe('o workspace captura o autoDispatch de quem fecha a carga (spec 185 RF2/RF3)', () => {
  const workspace = readFileSync(WORKSPACE, 'utf8')

  it('carregar a nota (linha) captura result.autoDispatch', () => {
    const area = workspace.slice(
      workspace.indexOf('const transitionDocumentMutation'),
      workspace.indexOf('const batchStatusMutation'),
    )
    expect(area).toContain('autoDispatch')
  })

  it('carregar em lote captura result.autoDispatch', () => {
    const area = workspace.slice(
      workspace.indexOf('const batchStatusMutation'),
      workspace.indexOf('const dispatchMutation'),
    )
    expect(area).toContain('autoDispatch')
  })

  it('registrar a ocorrência de separação também captura autoDispatch', () => {
    expect(workspace).toContain('registered.autoDispatch')
  })

  it('expõe o desfecho para a tela ler', () => {
    expect(workspace).toContain('autoDispatchOutcome')
  })

  /**
   * Spec 185 revisão (achado 1): a viagem mudando por outra ação torna o aviso de `autoDispatch`
   * anterior obsoleto — um bloqueio antigo ("A viagem não saiu: …") não pode sobreviver a um
   * despacho manual, um cancelamento ou um replanejamento de rota bem-sucedidos.
   */
  it('despachar pelo botão limpa o aviso anterior', () => {
    const area = workspace.slice(
      workspace.indexOf('const dispatchMutation'),
      workspace.indexOf('const cancelMutation'),
    )
    expect(area).toContain('setAutoDispatchOutcome(undefined)')
  })

  it('cancelar a viagem limpa o aviso anterior', () => {
    const area = workspace.slice(
      workspace.indexOf('const cancelMutation'),
      workspace.indexOf('createCteBatchMutation ='),
    )
    expect(area).toContain('setAutoDispatchOutcome(undefined)')
  })

  it('replanejar a rota limpa o aviso anterior', () => {
    const area = workspace.slice(workspace.indexOf('const planRouteMutation'))
    expect(area).toContain('setAutoDispatchOutcome(undefined)')
  })
})

describe('o detalhe da viagem mostra o desfecho do gatilho automático', () => {
  const detalhe = readFileSync(DETALHE, 'utf8')

  it('lê resolveAutoDispatchFeedback com as paradas da viagem', () => {
    expect(detalhe).toContain('resolveAutoDispatchFeedback')
    expect(detalhe).toContain('tripDispatchFeedback.service')
  })

  it('o aviso de sucesso usa um estilo diferente do alerta de erro', () => {
    expect(detalhe).toContain('successNotice')
  })

  it('a recusa do botão "Despachar" também usa a frase específica (RF8)', () => {
    expect(detalhe).toContain('resolveDispatchErrorFeedback')
  })
})
