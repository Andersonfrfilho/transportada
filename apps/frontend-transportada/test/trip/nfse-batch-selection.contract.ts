/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Seleção mista: marcar notas de CT-e e de NFS-e oferece as **duas** ações em lote. Antes, só a de
 * CT-e existia, e a nota de NFS-e saía da seleção em silêncio — o operador marcava quatro notas,
 * via um botão falando de três, e não tinha como agir sobre a que faltava sem desmarcar o resto.
 *
 * ⚠️ A NFS-e viaja em id de **nota** (`nfeDocumentId`), não em id de documento da viagem: são
 * espaços de id diferentes, e a emissão recusa o que não conhece. Nota sem id de nota fica de fora.
 */
import { describe, expect, it } from 'bun:test'

import { selectPendingNfseDocumentIds } from '@/modules/trip/shared/cteSelection.service'
import type { TripDocumentReadiness } from '@/modules/trip/shared/trip.types'

function readiness(input: Partial<TripDocumentReadiness>): TripDocumentReadiness {
  return {
    cteAccessKey: null,
    cteFiscalDocumentId: null,
    expectedDocument: 'nfse',
    nfeDocumentId: 'nfe-1',
    nfseProfileId: null,
    reason: 'nfse_expected',
    rejectionCode: null,
    rejectionMessage: null,
    tripDocumentId: 'trip-doc-1',
    ...input,
  }
}

describe('seleção de NFS-e em lote', () => {
  it('devolve o id da nota, não o do documento da viagem', () => {
    const selecionadas = selectPendingNfseDocumentIds({
      documents: [readiness({})],
      selectedIds: new Set(['trip-doc-1']),
    })

    expect(selecionadas).toEqual(['nfe-1'])
  })

  it('ignora o que não está marcado', () => {
    expect(
      selectPendingNfseDocumentIds({
        documents: [readiness({})],
        selectedIds: new Set(['outra']),
      }),
    ).toEqual([])
  })

  it('ignora a nota que espera CT-e', () => {
    expect(
      selectPendingNfseDocumentIds({
        documents: [readiness({ expectedDocument: 'cte', reason: 'no_cte' })],
        selectedIds: new Set(['trip-doc-1']),
      }),
    ).toEqual([])
  })

  /** Sem id de nota não há o que emitir — e o id da linha é de outro espaço. */
  it('deixa de fora a nota sem id de nota', () => {
    expect(
      selectPendingNfseDocumentIds({
        documents: [readiness({ nfeDocumentId: null })],
        selectedIds: new Set(['trip-doc-1']),
      }),
    ).toEqual([])
  })

  it('sem prontidão carregada não oferece nada', () => {
    expect(
      selectPendingNfseDocumentIds({ documents: undefined, selectedIds: new Set(['trip-doc-1']) }),
    ).toEqual([])
  })
})
