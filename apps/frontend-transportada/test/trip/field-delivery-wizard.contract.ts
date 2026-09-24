import { describe, expect, it } from 'bun:test'

import {
  collectFieldDeliveryDrafts,
  createInitialFieldDeliveryWizardState,
  currentFieldDeliveryDocument,
  fieldDeliveryWizardReducer,
  isFieldDeliveryWizardFinished,
  type FieldDeliveryCargoPhotoDraft,
  type FieldDeliveryDraft,
} from '../../src/modules/trip/shared/fieldDeliveryWizard.service'

const DOCUMENTS = [
  { city: 'São Paulo/SP', documentId: 'doc-1', recipientName: 'Maria' },
  { city: 'Campinas/SP', documentId: 'doc-2', recipientName: 'João' },
  { city: 'Sorocaba/SP', documentId: 'doc-3', recipientName: 'Ana' },
] as const

function draftFor(documentId: string): FieldDeliveryDraft {
  return {
    cargoImageBlobs: [],
    deliveredAt: '2026-09-18T12:00:00.000Z',
    documentId,
    imageBlob: new Blob(),
  }
}

/**
 * Spec 156 T11 (D5, D6, aceite 5/6/7): a máquina do assistente é pura — nenhuma câmera, nenhuma
 * rede. Um passo por nota, avançar/pular/voltar, trocar pela identificação, e bloquear fora da
 * viagem/fora do lote são só transições de estado.
 */
describe('máquina de passos do assistente de baixa (spec 156 D5)', () => {
  it('começa no primeiro documento, em modo de captura', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    expect(state.step).toEqual({ kind: 'capturing' })
    expect(currentFieldDeliveryDocument(state)?.documentId).toBe('doc-1')
  })

  it('sem documento nenhum, já nasce concluído', () => {
    expect(isFieldDeliveryWizardFinished(createInitialFieldDeliveryWizardState([]))).toBe(true)
  })

  it('foto identificada (matched) segue para a conferência', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const next = fieldDeliveryWizardReducer(state, {
      capture: {
        identification: { documentId: 'doc-1', status: 'matched' },
        imageBlob: new Blob(),
      },
      kind: 'photoCaptured',
    })
    expect(next.step.kind).toBe('reviewing')
  })

  it('foto de nota fora da viagem bloqueia com o rótulo da identificação', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const next = fieldDeliveryWizardReducer(state, {
      capture: {
        identification: { documentLabel: '999/1', status: 'notOnTrip' },
        imageBlob: new Blob(),
      },
      kind: 'photoCaptured',
    })
    expect(next.step).toEqual({
      identification: { documentLabel: '999/1', status: 'notOnTrip' },
      kind: 'blocked',
    })
  })

  it('foto de nota da viagem fora do lote também bloqueia', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const next = fieldDeliveryWizardReducer(state, {
      capture: {
        identification: { documentId: 'doc-9', status: 'onTripNotSelected' },
        imageBlob: new Blob(),
      },
      kind: 'photoCaptured',
    })
    expect(next.step.kind).toBe('blocked')
  })

  it('retomar depois do bloqueio ou da conferência volta a capturar o mesmo passo', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const blocked = fieldDeliveryWizardReducer(state, {
      capture: {
        identification: { documentLabel: 'x', status: 'notOnTrip' },
        imageBlob: new Blob(),
      },
      kind: 'photoCaptured',
    })
    const retaken = fieldDeliveryWizardReducer(blocked, { kind: 'retakeRequested' })
    expect(retaken.step).toEqual({ kind: 'capturing' })
    expect(currentFieldDeliveryDocument(retaken)?.documentId).toBe('doc-1')
  })

  it('confirmar grava o rascunho e avança para o próximo passo', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const next = fieldDeliveryWizardReducer(state, {
      draft: draftFor('doc-1'),
      kind: 'confirmRequested',
    })
    expect(currentFieldDeliveryDocument(next)?.documentId).toBe('doc-2')
    expect(collectFieldDeliveryDrafts(next)).toEqual([draftFor('doc-1')])
  })

  it('pular marca a nota como pulada e avança sem gravar rascunho', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const next = fieldDeliveryWizardReducer(state, { kind: 'skipRequested' })
    expect(next.skippedDocumentIds).toEqual(['doc-1'])
    expect(currentFieldDeliveryDocument(next)?.documentId).toBe('doc-2')
    expect(collectFieldDeliveryDrafts(next)).toEqual([])
  })

  it('M13b: pular depois de voltar para uma nota já confirmada descarta o rascunho antigo', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const confirmed = fieldDeliveryWizardReducer(state, {
      draft: draftFor('doc-1'),
      kind: 'confirmRequested',
    })
    expect(collectFieldDeliveryDrafts(confirmed)).toEqual([draftFor('doc-1')])

    const back = fieldDeliveryWizardReducer(confirmed, { kind: 'previousRequested' })
    expect(currentFieldDeliveryDocument(back)?.documentId).toBe('doc-1')

    const skipped = fieldDeliveryWizardReducer(back, { kind: 'skipRequested' })
    expect(skipped.skippedDocumentIds).toContain('doc-1')
    expect(collectFieldDeliveryDrafts(skipped)).toEqual([])
  })

  it('voltar retorna ao passo anterior, sem apagar o que já foi decidido', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const afterSkip = fieldDeliveryWizardReducer(state, { kind: 'skipRequested' })
    const back = fieldDeliveryWizardReducer(afterSkip, { kind: 'previousRequested' })
    expect(currentFieldDeliveryDocument(back)?.documentId).toBe('doc-1')
    expect(back.skippedDocumentIds).toEqual(['doc-1'])
  })

  it('voltar do primeiro passo não anda para índice negativo', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const back = fieldDeliveryWizardReducer(state, { kind: 'previousRequested' })
    expect(currentFieldDeliveryDocument(back)?.documentId).toBe('doc-1')
  })

  it('trocar pela identificação (otherSelected): confirma para a outra nota e deixa a esperada pendente', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const next = fieldDeliveryWizardReducer(state, {
      draft: draftFor('doc-2'),
      kind: 'confirmRequested',
    })
    expect(collectFieldDeliveryDrafts(next)).toEqual([draftFor('doc-2')])
    expect(next.skippedDocumentIds).toEqual(['doc-1'])
    expect(currentFieldDeliveryDocument(next)?.documentId).toBe('doc-3')
  })

  it('a última nota confirmada termina o assistente', () => {
    let state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    for (const document of DOCUMENTS) {
      state = fieldDeliveryWizardReducer(state, {
        draft: draftFor(document.documentId),
        kind: 'confirmRequested',
      })
    }
    expect(isFieldDeliveryWizardFinished(state)).toBe(true)
    expect(collectFieldDeliveryDrafts(state)).toHaveLength(3)
  })

  it('montagem dos drafts preserva a ordem original dos documentos, não a ordem de confirmação', () => {
    let state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    state = fieldDeliveryWizardReducer(state, {
      draft: draftFor('doc-3'),
      kind: 'confirmRequested',
    })
    state = { ...state, currentIndex: 0, step: { kind: 'capturing' } }
    state = fieldDeliveryWizardReducer(state, {
      draft: draftFor('doc-1'),
      kind: 'confirmRequested',
    })
    expect(collectFieldDeliveryDrafts(state).map((draft) => draft.documentId)).toEqual([
      'doc-1',
      'doc-3',
    ])
  })
})

function cargoPhoto(id: string): FieldDeliveryCargoPhotoDraft {
  return { id, imageBlob: new Blob(), previewUrl: `blob:${id}` }
}

/**
 * Achado de revisão (spec 184): as fotos da carga viviam só no `useState` local de
 * `FieldDeliveryReviewStep` — "Tirar outra foto" (`retakeRequested`) desmonta o passo de revisão e
 * apagava tudo sem avisar. Subir para o estado do assistente (onde o rascunho da nota vive) faz as
 * fotos sobreviverem ao retake e reaparecerem ao reabrir a revisão.
 */
describe('fotos da carga sobrevivem ao "Tirar outra foto" (achado de revisão spec 184)', () => {
  it('nasce vazio', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    expect(state.cargoPhotosByDocumentId).toEqual({})
  })

  it('cargoPhotosAdded acumula por nota', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const withOne = fieldDeliveryWizardReducer(state, {
      documentId: 'doc-1',
      kind: 'cargoPhotosAdded',
      photos: [cargoPhoto('a')],
    })
    const withTwo = fieldDeliveryWizardReducer(withOne, {
      documentId: 'doc-1',
      kind: 'cargoPhotosAdded',
      photos: [cargoPhoto('b')],
    })
    expect(withTwo.cargoPhotosByDocumentId['doc-1']).toEqual([cargoPhoto('a'), cargoPhoto('b')])
  })

  it('cargoPhotoRemoved tira só a foto pedida, mantém as outras e as de outra nota', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const withPhotos = fieldDeliveryWizardReducer(
      fieldDeliveryWizardReducer(state, {
        documentId: 'doc-1',
        kind: 'cargoPhotosAdded',
        photos: [cargoPhoto('a'), cargoPhoto('b')],
      }),
      { documentId: 'doc-2', kind: 'cargoPhotosAdded', photos: [cargoPhoto('c')] },
    )
    const afterRemove = fieldDeliveryWizardReducer(withPhotos, {
      documentId: 'doc-1',
      kind: 'cargoPhotoRemoved',
      photoId: 'a',
    })
    expect(afterRemove.cargoPhotosByDocumentId['doc-1']).toEqual([cargoPhoto('b')])
    expect(afterRemove.cargoPhotosByDocumentId['doc-2']).toEqual([cargoPhoto('c')])
  })

  it('retakeRequested preserva as fotos já adicionadas da nota atual', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const withPhotos = fieldDeliveryWizardReducer(state, {
      documentId: 'doc-1',
      kind: 'cargoPhotosAdded',
      photos: [cargoPhoto('a')],
    })
    const retaken = fieldDeliveryWizardReducer(withPhotos, { kind: 'retakeRequested' })
    expect(retaken.cargoPhotosByDocumentId['doc-1']).toEqual([cargoPhoto('a')])
  })

  it('confirmar a nota limpa as fotos de carga dela (já foram para o rascunho)', () => {
    const state = createInitialFieldDeliveryWizardState(DOCUMENTS)
    const withPhotos = fieldDeliveryWizardReducer(state, {
      documentId: 'doc-1',
      kind: 'cargoPhotosAdded',
      photos: [cargoPhoto('a')],
    })
    const confirmed = fieldDeliveryWizardReducer(withPhotos, {
      draft: { ...draftFor('doc-1'), cargoImageBlobs: [new Blob()] },
      kind: 'confirmRequested',
    })
    expect(confirmed.cargoPhotosByDocumentId['doc-1']).toBeUndefined()
  })
})
