/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  selectPendingCteDocumentIds,
  PENDING_CTE_REASONS,
} from '@/modules/trip/shared/cteSelection.service'
import type { TripDocumentReadiness } from '@/modules/trip/shared/trip.types'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readiness(
  input: Partial<TripDocumentReadiness> & Pick<TripDocumentReadiness, 'tripDocumentId'>,
): TripDocumentReadiness {
  return {
    cteAccessKey: null,
    cteFiscalDocumentId: null,
    expectedDocument: 'cte',
    nfeDocumentId: '00000000-0000-4000-8000-00000000aa01',
    reason: 'no_cte',
    rejectionCode: null,
    rejectionMessage: null,
    ...input,
  }
}

/**
 * O botão da seleção emite **só o que foi marcado**, e por isso precisa saber o que da marcação
 * ainda tem CT-e a emitir: oferecer emissão para nota já autorizada faria a API recusar o clique
 * inteiro, e o operador perderia a seleção sem entender por quê.
 */
describe('emitir CT-e pela seleção', () => {
  test('leva só o que está marcado e pendente', () => {
    const chosen = selectPendingCteDocumentIds({
      documents: [
        readiness({ tripDocumentId: 'a' }),
        readiness({ tripDocumentId: 'b' }),
        readiness({ tripDocumentId: 'c' }),
      ],
      selectedIds: new Set(['a', 'c']),
    })

    expect(chosen).toEqual(['a', 'c'])
  })

  test('descarta da seleção a nota que já autorizou', () => {
    const chosen = selectPendingCteDocumentIds({
      documents: [
        readiness({ reason: 'ok', tripDocumentId: 'a' }),
        readiness({ tripDocumentId: 'b' }),
      ],
      selectedIds: new Set(['a', 'b']),
    })

    expect(chosen).toEqual(['b'])
  })

  /** A urbana vira NFS-e: ela não tem CT-e a emitir, e entraria no lote como linha que não autoriza. */
  test('descarta a nota de NFS-e', () => {
    const chosen = selectPendingCteDocumentIds({
      documents: [
        readiness({ expectedDocument: 'nfse', reason: 'nfse_expected', tripDocumentId: 'a' }),
      ],
      selectedIds: new Set(['a']),
    })

    expect(chosen).toEqual([])
  })

  /**
   * O caso que isola a condição do documento esperado: razão pendente, mas o que se espera daquela
   * nota **não é CT-e**. Sem esta asserção, remover a checagem de `expectedDocument` não reprovava
   * nada — a razão sozinha já barrava a NFS-e do teste anterior.
   */
  test('descarta a nota pendente cujo documento esperado não é CT-e', () => {
    const chosen = selectPendingCteDocumentIds({
      documents: [
        readiness({ expectedDocument: null, reason: 'no_cte', tripDocumentId: 'a' }),
        readiness({ expectedDocument: 'nfse', reason: 'no_cte', tripDocumentId: 'b' }),
        readiness({ tripDocumentId: 'c' }),
      ],
      selectedIds: new Set(['a', 'b', 'c']),
    })

    expect(chosen).toEqual(['c'])
  })

  /** Sem prontidão carregada não há o que afirmar: melhor não oferecer do que oferecer errado. */
  test('sem prontidão, nada é oferecido', () => {
    expect(
      selectPendingCteDocumentIds({ documents: undefined, selectedIds: new Set(['a']) }),
    ).toEqual([])
  })

  /** Mesma razão que a API considera pendente — as duas listas dizem a mesma coisa ou o botão mente. */
  test('as razões pendentes são as mesmas da API', () => {
    expect([...PENDING_CTE_REASONS]).toEqual(['no_cte', 'cte_rejected', 'cte_cancelled'])
  })

  test('a tela oferece a emissão da seleção, e o cliente manda os ids', async () => {
    const [actions, client] = await Promise.all([
      Bun.file(
        new URL('src/modules/trip/components/TripStateActions.component.tsx', APPLICATION_ROOT),
      ).text(),
      Bun.file(new URL('src/modules/trip/shared/tripClient.service.ts', APPLICATION_ROOT)).text(),
    ])

    expect(actions).toContain('stateActions.generateCteSelection')
    expect(client).toContain('tripDocumentIds')
  })
})
