/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 174: o estado fiscal é **da nota** — ele mora na linha dela, ao lado da separação, com ação
 * própria (RF3), não numa segunda lista no fim do bloco de prontidão (RF5).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { canGenerateCteForDocument } from '@/modules/trip/shared/cteSelection.service'
import type { TripDocumentReadiness } from '@/modules/trip/shared/trip.types'

const LISTA = new URL(
  '../../src/modules/trip/components/TripStopList.component.tsx',
  import.meta.url,
)
const PAINEL = new URL(
  '../../src/modules/trip/components/TripFiscalReadinessPanel.component.tsx',
  import.meta.url,
)

const READY: TripDocumentReadiness = {
  cteAccessKey: '1'.repeat(44),
  cteFiscalDocumentId: '00000000-0000-4000-8000-000000000001',
  expectedDocument: 'cte',
  nfeDocumentId: '00000000-0000-4000-8000-000000000003',
  reason: 'ok',
  rejectionCode: null,
  rejectionMessage: null,
  tripDocumentId: '00000000-0000-4000-8000-000000000002',
}

describe('ação de emitir CT-e na própria linha da nota (spec 174 RF3)', () => {
  it('aceita nota sem CT-e', () => {
    expect(canGenerateCteForDocument({ ...READY, reason: 'no_cte' })).toBe(true)
  })

  it('aceita CT-e rejeitado ou cancelado — a mesma regra do lote', () => {
    expect(canGenerateCteForDocument({ ...READY, reason: 'cte_rejected' })).toBe(true)
    expect(canGenerateCteForDocument({ ...READY, reason: 'cte_cancelled' })).toBe(true)
  })

  it('recusa nota já pronta', () => {
    expect(canGenerateCteForDocument({ ...READY, reason: 'ok' })).toBe(false)
  })

  it('recusa nota que espera NFS-e, não CT-e', () => {
    expect(
      canGenerateCteForDocument({
        ...READY,
        expectedDocument: 'nfse',
        reason: 'nfse_expected',
      }),
    ).toBe(false)
  })

  it('recusa nota sem prontidão carregada — não oferecer é melhor que oferecer errado', () => {
    expect(canGenerateCteForDocument(undefined)).toBe(false)
  })
})

describe('a linha da nota mostra o próprio estado fiscal (spec 174 CA01, CA02, CA03, CA06)', () => {
  it('usa o tooltip do design system, nunca o title nativo', () => {
    const source = readFileSync(LISTA, 'utf8')

    expect(source).toInclude("from '@/components/ui/tooltip'")
    expect(source).toInclude('<Tooltip')
  })

  it('a ação por nota emite só aquela nota, via onGenerateCte', () => {
    const source = readFileSync(LISTA, 'utf8')

    expect(source).toInclude('onGenerateCte(document.id)')
  })

  it('a ação só aparece com a permissão de emitir', () => {
    const source = readFileSync(LISTA, 'utf8')

    expect(source).toInclude('actions.canSubmitCte && canGenerateCteForDocument(')
  })
})

describe('o bloco de prontidão deixa de listar as notas (spec 174 RF5, CA05)', () => {
  it('não repete mais a lista de pendências', () => {
    const source = readFileSync(PAINEL, 'utf8')

    expect(source).not.toInclude('readinessList')
    expect(source).not.toInclude('pending.map')
  })
})
