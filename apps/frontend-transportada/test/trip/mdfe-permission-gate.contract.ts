/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveMdfeIssueButtonVisibility } from '@/modules/trip/shared/tripMdfeGate.service'

/**
 * "Emitir MDF-e" era oferecido por `trip.manage`, e as duas pontas estavam erradas: o separador
 * (`trip.manage`, sem `mdfe.manage`) via o botão para tomar 403 no workspace fiscal, e o papel
 * `fiscal` (`mdfe.manage`, sem `trip.manage`) — quem emite — não o via. É o defeito que
 * `state-gates.contract.ts` descreve para estado, agora por permissão, e nenhum outro contrato
 * desta app o pegaria, porque nenhum renderiza.
 */
const DETALHE = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

describe('o botão de emitir MDF-e exige mdfe.manage, nunca trip.manage', () => {
  it('oferece a quem tem mdfe.manage', () => {
    expect(
      resolveMdfeIssueButtonVisibility({
        canManageMdfe: true,
        documentCount: 2,
        isCompleted: false,
      }),
    ).toBe(true)
  })

  it('esconde de quem não tem mdfe.manage — o caso do separador', () => {
    expect(
      resolveMdfeIssueButtonVisibility({
        canManageMdfe: false,
        documentCount: 2,
        isCompleted: false,
      }),
    ).toBe(false)
  })

  it('esconde na viagem encerrada e na viagem sem nota', () => {
    expect(
      resolveMdfeIssueButtonVisibility({
        canManageMdfe: true,
        documentCount: 2,
        isCompleted: true,
      }),
    ).toBe(false)
    expect(
      resolveMdfeIssueButtonVisibility({
        canManageMdfe: true,
        documentCount: 0,
        isCompleted: false,
      }),
    ).toBe(false)
  })

  it('o detalhe decide pelo serviço, nunca por canManage solto', () => {
    const source = readFileSync(DETALHE, 'utf8')

    expect(source).toInclude('resolveMdfeIssueButtonVisibility')
    expect(source).not.toInclude('canManage && !isCompleted && trip.documents.length > 0')
  })
})
