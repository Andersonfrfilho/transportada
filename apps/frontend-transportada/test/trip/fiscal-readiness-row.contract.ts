/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 174: o estado fiscal é **da nota** — ele mora na linha dela, ao lado da separação, com ação
 * própria (RF3), não numa segunda lista no fim do bloco de prontidão (RF5).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveDocumentRowAction } from '@/modules/trip/shared/documentRowAction.service'
import type { TripDocumentReadiness } from '@/modules/trip/shared/trip.types'

const CAN_SUBMIT_CTE = { canIssueNfse: false, canSubmitCte: true }

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
  nfseProfileId: null,
  reason: 'ok',
  rejectionCode: null,
  rejectionMessage: null,
  tripDocumentId: '00000000-0000-4000-8000-000000000002',
}

/**
 * Spec 175: a decisão de "aceita emitir CT-e nesta linha" deixou de viver em
 * `canGenerateCteForDocument` — agora é um dos dois ramos de `resolveDocumentRowAction`, que
 * também decide o ramo NFS-e. Os casos abaixo restatam a mesma regra da spec 174 RF3 pelo novo
 * ponto de entrada.
 */
describe('ação de emitir CT-e na própria linha da nota (spec 174 RF3, spec 175 RF1)', () => {
  it('aceita nota sem CT-e', () => {
    expect(resolveDocumentRowAction({ ...READY, reason: 'no_cte' }, CAN_SUBMIT_CTE)).toEqual({
      kind: 'cte',
    })
  })

  it('aceita CT-e rejeitado ou cancelado — a mesma regra do lote', () => {
    expect(resolveDocumentRowAction({ ...READY, reason: 'cte_rejected' }, CAN_SUBMIT_CTE)).toEqual({
      kind: 'cte',
    })
    expect(resolveDocumentRowAction({ ...READY, reason: 'cte_cancelled' }, CAN_SUBMIT_CTE)).toEqual(
      { kind: 'cte' },
    )
  })

  it('recusa nota já pronta', () => {
    expect(resolveDocumentRowAction({ ...READY, reason: 'ok' }, CAN_SUBMIT_CTE)).toBeNull()
  })

  it('recusa nota que espera NFS-e, não CT-e, sem nfse.issue', () => {
    expect(
      resolveDocumentRowAction(
        { ...READY, expectedDocument: 'nfse', reason: 'nfse_expected' },
        CAN_SUBMIT_CTE,
      ),
    ).toBeNull()
  })

  it('recusa nota sem prontidão carregada — não oferecer é melhor que oferecer errado', () => {
    expect(resolveDocumentRowAction(undefined, CAN_SUBMIT_CTE)).toBeNull()
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

  it('a ação só aparece com a permissão de emitir (spec 175: sai de resolveDocumentRowAction)', () => {
    const source = readFileSync(LISTA, 'utf8')

    expect(source).toInclude('resolveDocumentRowAction(fiscalReadiness, {')
    expect(source).toInclude('canSubmitCte: actions.canSubmitCte')
  })
})

describe('o bloco de prontidão deixa de listar as notas (spec 174 RF5, CA05)', () => {
  it('não repete mais a lista de pendências', () => {
    const source = readFileSync(PAINEL, 'utf8')

    expect(source).not.toInclude('readinessList')
    expect(source).not.toInclude('pending.map')
  })
})
