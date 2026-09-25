/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

/**
 * Spec 185 T6.1 (RF9, ADR-0074 §3): o "Despachar" do escritório troca o diálogo de "forçar com
 * motivo" pela confirmação de "leva todas", contando as notas que o botão vai carregar
 * (`dispatchReadiness.service.ts`). RF7/D5: "Conferir carga" some do cabeçalho.
 */
const CABECALHO = new URL(
  '../../src/modules/trip/components/TripHeaderActions.component.tsx',
  import.meta.url,
)
const DETALHE = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const CLIENTE = new URL('../../src/modules/trip/shared/tripClient.service.ts', import.meta.url)
const WORKSPACE = new URL('../../src/modules/trip/hooks/useTripWorkspace.hook.ts', import.meta.url)

describe('o botão "Despachar" leva todas, com confirmação (spec 185 RF9)', () => {
  const cabecalho = readFileSync(CABECALHO, 'utf8')

  it('conta as notas a carregar pela mesma regra pura de D1', () => {
    expect(cabecalho).toContain('dispatchReadiness.service')
    expect(cabecalho).toContain('resolveDispatchReadiness')
  })

  it('confirma com TripConfirmDialog, nunca o TripReasonDialog antigo de forçar', () => {
    expect(cabecalho).toContain('<TripConfirmDialog')
    expect(cabecalho).not.toContain('stateActions.forceTitle')
    expect(cabecalho).not.toContain('stateActions.forceSubtitle')
    expect(cabecalho).not.toContain('stateActions.forceSubmit')
    expect(cabecalho).not.toContain('forceReasonLabel')
  })

  it('confirma chamando onDispatch com loadRemaining, nunca force', () => {
    const dispatchArea = cabecalho.slice(cabecalho.indexOf('handleDispatchClick'))
    expect(dispatchArea).toContain('loadRemaining')
    expect(cabecalho).not.toContain('onDispatch({ force: true')
  })

  it('a mensagem vem de resolveDispatchConfirmMessage — nunca concatenação de duas traduções', () => {
    expect(cabecalho).toContain('resolveDispatchConfirmMessage')
    expect(cabecalho).toContain('tripDispatchFeedback.service')
    expect(cabecalho).not.toContain('dispatchLoadRemainingMessage')
    expect(cabecalho).not.toContain('dispatchLeftBehindMessage')
  })
})

describe('"Conferir carga" some do cabeçalho do escritório (spec 185 RF7/D5)', () => {
  const cabecalho = readFileSync(CABECALHO, 'utf8')
  const detalhe = readFileSync(DETALHE, 'utf8')
  const cliente = readFileSync(CLIENTE, 'utf8')
  const workspace = readFileSync(WORKSPACE, 'utf8')

  it('o cabeçalho não oferece mais confirmLoad', () => {
    expect(cabecalho).not.toContain("action: 'confirmLoad'")
    expect(cabecalho).not.toContain('fieldActions.confirmLoad')
    expect(cabecalho).not.toContain('isConfirmLoadPending')
    expect(cabecalho).not.toContain('onConfirmLoad')
  })

  it('o detalhe da viagem não pede mais confirmLoadTripMutation', () => {
    expect(detalhe).not.toContain('confirmLoadTripMutation')
    expect(detalhe).not.toContain('onConfirmLoad')
  })

  it('o cliente HTTP não expõe mais confirmLoadTrip — a rota continua na API (RF7), só a tela para de chamar', () => {
    expect(cliente).not.toContain('confirmLoadTrip')
  })

  it('o workspace não monta mais a mutation de confirmLoad', () => {
    expect(workspace).not.toContain('confirmLoadTripMutation')
    expect(workspace).not.toContain('confirmLoadTrip:')
  })
})

describe('o cliente de despacho manda loadRemaining (spec 185 RF4)', () => {
  const cliente = readFileSync(CLIENTE, 'utf8')

  it('dispatchTrip envia loadRemaining quando presente', () => {
    const dispatchBody = cliente.slice(
      cliente.indexOf('async dispatchTrip'),
      cliente.indexOf('async findNfeDocumentByAccessKey'),
    )
    expect(dispatchBody).toContain('loadRemaining')
  })
})
