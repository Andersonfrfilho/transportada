/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  formatCanhotoOcrNumber,
  formatFieldDeliveryDocumentName,
  resolveFieldDeliveryIdentificationMessage,
  resolveFieldDeliveryReviewFocus,
  toFieldDeliveryTargetOption,
} from '@/modules/trip/shared/fieldDeliveryReview.service'
import {
  createInitialFieldDeliveryWizardState,
  fieldDeliveryWizardReducer,
  type FieldDeliveryCapturedPhoto,
  type FieldDeliveryWizardDocument,
} from '@/modules/trip/shared/fieldDeliveryWizard.service'

const MARKET_A: FieldDeliveryWizardDocument = {
  city: 'Campinas/SP',
  documentId: 'doc-a',
  nfeNumber: '9000',
  nfeSeries: '1',
  recipientName: 'Mercado Bom Preço',
}
const MARKET_B: FieldDeliveryWizardDocument = {
  ...MARKET_A,
  documentId: 'doc-b',
  nfeNumber: '9001',
}
const NO_RECIPIENT: FieldDeliveryWizardDocument = {
  city: '',
  documentId: 'doc-c',
  nfeNumber: '9002',
  nfeSeries: '1',
  recipientName: '',
}

const IMAGE = new Blob(['x'], { type: 'image/jpeg' })

function capture(
  input: Pick<FieldDeliveryCapturedPhoto, 'identification'> &
    Partial<Pick<FieldDeliveryCapturedPhoto, 'ocrSuggestion'>>,
): FieldDeliveryCapturedPhoto {
  return { imageBlob: IMAGE, ...input }
}

describe('seletor da conferência (spec 156 T16)', () => {
  test('duas notas do mesmo destinatário não viram duas linhas iguais', () => {
    const options = [MARKET_A, MARKET_B].map(toFieldDeliveryTargetOption)
    expect(options.map((option) => option.label)).toEqual(['9000/1', '9001/1'])
    expect(options[0]?.description).toBe('Mercado Bom Preço')
  })

  test('sem destinatário, o rótulo é o número — nunca o id interno', () => {
    const option = toFieldDeliveryTargetOption(NO_RECIPIENT)
    expect(option).toEqual({ label: '9002/1', value: 'doc-c' })
  })

  test('nome corrido junta número e destinatário', () => {
    expect(formatFieldDeliveryDocumentName(MARKET_A)).toBe('9000/1 · Mercado Bom Preço')
    expect(formatFieldDeliveryDocumentName(NO_RECIPIENT)).toBe('9002/1')
  })
})

describe('número lido pelo OCR (spec 156 T16)', () => {
  test('tira os zeros à esquerda do número e da série', () => {
    expect(formatCanhotoOcrNumber({ number: '000009000', series: '001' })).toBe('9000/1')
  })

  test('sem série, só o número; zero sozinho continua zero', () => {
    expect(formatCanhotoOcrNumber({ number: '000123', series: null })).toBe('123')
    expect(formatCanhotoOcrNumber({ number: '0', series: '0' })).toBe('0/0')
  })
})

describe('frase e foco da conferência (spec 156 T16, ADR-0067 §4)', () => {
  test('código de barras da nota esperada: "lido", e o Enter confirma', () => {
    const matched = capture({ identification: { documentId: 'doc-a', status: 'matched' } })
    expect(resolveFieldDeliveryIdentificationMessage(matched)).toBe('matched')
    expect(resolveFieldDeliveryReviewFocus(matched)).toBe('confirm')
  })

  test('sugestão do OCR nunca se apresenta como conferida, e o foco vai ao seletor', () => {
    const suggested = capture({
      identification: { documentId: 'doc-a', status: 'matched' },
      ocrSuggestion: { number: '9000', series: '1' },
    })
    expect(resolveFieldDeliveryIdentificationMessage(suggested)).toBe('ocrSuggested')
    expect(resolveFieldDeliveryReviewFocus(suggested)).toBe('target')
  })

  test('outra nota do lote ou leitura falha: foco no seletor', () => {
    const other = capture({ identification: { documentId: 'doc-b', status: 'otherSelected' } })
    const unreadable = capture({ identification: { status: 'unreadable' } })
    expect(resolveFieldDeliveryIdentificationMessage(other)).toBe('otherSelected')
    expect(resolveFieldDeliveryReviewFocus(other)).toBe('target')
    expect(resolveFieldDeliveryIdentificationMessage(unreadable)).toBe('unreadable')
    expect(resolveFieldDeliveryReviewFocus(unreadable)).toBe('target')
  })
})

describe('"Pular nota" no bloqueio (spec 156 T16)', () => {
  test('canhoto fora da viagem: pular leva à próxima nota, sem rascunho', () => {
    const initial = createInitialFieldDeliveryWizardState([MARKET_A, MARKET_B])
    const blocked = fieldDeliveryWizardReducer(initial, {
      capture: capture({ identification: { documentLabel: '777777/1', status: 'notOnTrip' } }),
      kind: 'photoCaptured',
    })
    expect(blocked.step.kind).toBe('blocked')

    const skipped = fieldDeliveryWizardReducer(blocked, { kind: 'skipRequested' })
    expect(skipped.currentIndex).toBe(1)
    expect(skipped.step.kind).toBe('capturing')
    expect(skipped.skippedDocumentIds).toEqual(['doc-a'])
    expect(skipped.drafts).toEqual({})
  })

  test('"Voltar" a partir do resumo retoma a última nota', () => {
    const initial = createInitialFieldDeliveryWizardState([MARKET_A])
    const finished = fieldDeliveryWizardReducer(initial, { kind: 'skipRequested' })
    expect(finished.step.kind).toBe('finished')

    const back = fieldDeliveryWizardReducer(finished, { kind: 'previousRequested' })
    expect(back.step.kind).toBe('capturing')
    expect(back.currentIndex).toBe(0)
  })
})
