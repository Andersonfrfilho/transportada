/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 175 RF1/RF2/RF7: o botão da linha deixa de ser fixo em "Gerar CT-e" e passa a sair de
 * `expectedDocument`. Campo ausente na resposta trata como `null` (city_unknown) — ausência nunca
 * vira "é CT-e".
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveDocumentRowAction } from '@/modules/trip/shared/documentRowAction.service'
import type { TripDocumentReadiness } from '@/modules/trip/shared/trip.types'

const LISTA = new URL(
  '../../src/modules/trip/components/TripStopList.component.tsx',
  import.meta.url,
)

const BASE: TripDocumentReadiness = {
  cteAccessKey: null,
  cteFiscalDocumentId: null,
  expectedDocument: 'cte',
  nfeDocumentId: '00000000-0000-4000-8000-000000000003',
  reason: 'no_cte',
  rejectionCode: null,
  rejectionMessage: null,
  tripDocumentId: '00000000-0000-4000-8000-000000000002',
}

describe('a ação da linha sai do dado (spec 175 RF1, RF2, RF7)', () => {
  it('expectedDocument cte pendente, com cte.submit, oferece emitir CT-e', () => {
    expect(
      resolveDocumentRowAction(BASE, { canIssueNfse: false, canSubmitCte: true }),
    ).toEqual({ kind: 'cte' })
  })

  it('expectedDocument nfse pendente, com nfse.issue, oferece emitir NFS-e', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: 'nfse', reason: 'nfse_expected' },
        { canIssueNfse: true, canSubmitCte: false },
      ),
    ).toEqual({ kind: 'nfse' })
  })

  it('expectedDocument null (city_unknown) não oferece ação nenhuma', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: null, reason: 'city_unknown' },
        { canIssueNfse: true, canSubmitCte: true },
      ),
    ).toBeNull()
  })

  it('campo ausente na resposta (entry undefined) trata como null — sem ação', () => {
    expect(resolveDocumentRowAction(undefined, { canIssueNfse: true, canSubmitCte: true })).toBeNull()
  })

  it('nota cte já pronta não oferece ação', () => {
    expect(
      resolveDocumentRowAction({ ...BASE, reason: 'ok' }, { canIssueNfse: true, canSubmitCte: true }),
    ).toBeNull()
  })

  it('nota nfse já emitida (reason ok) não oferece ação', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: 'nfse', reason: 'ok' },
        { canIssueNfse: true, canSubmitCte: true },
      ),
    ).toBeNull()
  })

  it('permissão por documento: sem cte.submit não oferece CT-e mesmo pendente', () => {
    expect(
      resolveDocumentRowAction(BASE, { canIssueNfse: true, canSubmitCte: false }),
    ).toBeNull()
  })

  it('permissão por documento: sem nfse.issue não oferece NFS-e mesmo pendente', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: 'nfse', reason: 'nfse_expected' },
        { canIssueNfse: false, canSubmitCte: true },
      ),
    ).toBeNull()
  })
})

describe('a linha usa o rótulo derivado do documento esperado (spec 175 CA01)', () => {
  it('não fixa mais o rótulo de CT-e sem checar o documento esperado', () => {
    const source = readFileSync(LISTA, 'utf8')

    expect(source).toInclude('resolveDocumentRowAction(')
    expect(source).toInclude("t('actions.emitNfse')")
  })
})
