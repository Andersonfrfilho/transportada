/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503 (revisão final, defeito 9): `TollBoothCatalogReloadPanel` usava dois `useEffect`
 * para estado derivado (contra `standards/react.md`) — um deles fechava o diálogo de confirmação
 * "na mão" quando a recarga terminava com sucesso. Consequência real: o código antigo passava
 * `errorCode={confirming === null ? undefined : props.errorCode}` ao diálogo — ou seja, reabrir o
 * diálogo depois de uma recarga que **falhou** mostrava o erro antigo (ainda em `props.errorCode`,
 * porque a mutação só troca `error` na tentativa seguinte) antes mesmo do operador confirmar de
 * novo.
 *
 * `resolveReloadDialogState` (função pura, extraída do componente) fecha as duas pontas: deriva
 * `dialogExtract`/`dialogErrorCode` a cada render, sem efeito nenhum, e só mostra o erro quando
 * `hasSubmittedConfirmation` é verdadeiro — que volta a `false` toda vez que o painel reabre o
 * diálogo. Este contrato prova a lógica pura isolada (sem `renderToStaticMarkup`: é só um cálculo,
 * não JSX) e, no comentário de cada `it`, o que a versão antiga (`confirming === null ? undefined
 * : errorCode`, sem noção de "esta sessão já submeteu") teria devolvido de errado.
 */
import { describe, expect, it } from 'bun:test'

import { resolveReloadDialogState } from '@/modules/fleet/components/TollBoothCatalogReloadPanel.component'
import type { TollBoothExtractRow } from '@/modules/fleet/shared/tollBoothExtract.validation'

const EXTRACT: TollBoothExtractRow = {
  boothCount: 10,
  boothsWithAxleCharge: 8,
  boothsWithCharge: 9,
  dataset: 'brasil',
  missingObjectObservedAt: null,
  objectKey: 'toll-booths/osm/brasil/2026-01-01/toll-booths.json',
  observedOn: '2026-01-01',
  reloadedAt: null,
  reloadedBoothCount: null,
  reloadedByUserId: null,
  sha256: 'a'.repeat(64),
  uploadedByUserId: 'user-1',
}

describe('estado do diálogo de recarga é derivado, nunca por useEffect (spec 154 T503, defeito 9)', () => {
  it('reabrir o diálogo depois de uma recarga que falhou não mostra o erro antigo', () => {
    // A versão antiga (`confirming === null ? undefined : props.errorCode`) devolveria o erro da
    // tentativa anterior aqui, porque só olhava se o diálogo estava aberto — não se ESTA sessão de
    // confirmação já tinha submetido.
    const state = resolveReloadDialogState({
      confirming: EXTRACT,
      errorCode: 'TOLL_BOOTH_EXTRACT_NOT_FOUND',
      hasSubmittedConfirmation: false,
      result: undefined,
    })

    expect(state.dialogErrorCode).toBeUndefined()
    expect(state.dialogExtract).toEqual(EXTRACT)
  })

  it('depois de confirmar e falhar, o erro da tentativa atual aparece', () => {
    const state = resolveReloadDialogState({
      confirming: EXTRACT,
      errorCode: 'TOLL_BOOTH_EXTRACT_NOT_FOUND',
      hasSubmittedConfirmation: true,
      result: undefined,
    })

    expect(state.dialogErrorCode).toBe('TOLL_BOOTH_EXTRACT_NOT_FOUND')
    expect(state.dialogExtract).toEqual(EXTRACT)
  })

  it('depois de confirmar e ter sucesso, o diálogo fecha sozinho', () => {
    const state = resolveReloadDialogState({
      confirming: EXTRACT,
      errorCode: undefined,
      hasSubmittedConfirmation: true,
      result: {
        boothsMissingFromExtract: 0,
        catalogBoothCount: 10,
        dataset: 'brasil',
        observedOn: '2026-01-01',
        reloadedAt: '2026-01-01T00:00:00.000Z',
        reloadedByUserId: 'user-1',
        savedBoothCount: 10,
      },
    })

    expect(state.dialogExtract).toBeNull()
  })

  it('sem nenhuma sessão de confirmação aberta, o diálogo fica fechado', () => {
    const state = resolveReloadDialogState({
      confirming: null,
      errorCode: 'TOLL_BOOTH_EXTRACT_NOT_FOUND',
      hasSubmittedConfirmation: false,
      result: undefined,
    })

    expect(state.dialogExtract).toBeNull()
    expect(state.dialogErrorCode).toBeUndefined()
  })
})
