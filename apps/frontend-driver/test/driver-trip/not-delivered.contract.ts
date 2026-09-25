/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import type {
  DriverOccurrenceTypesState,
  DriverReturnReason,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  NOT_DELIVERED_FIELDS,
  OCCURRENCE_PHOTO_MAX_BYTES,
  buildNotDeliveredReports,
  isOccurrencePhotoWithinLimit,
  listMissingNotDeliveredFields,
  type NotDeliveredDraft,
} from '../../src/modules/driver-trip/shared/notDelivered.service'

const PHOTO = { blob: new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }), fileName: 'a.jpg' }

const TYPES: DriverOccurrenceTypesState = {
  status: 'loaded',
  types: [
    { attachmentMode: 'required', id: 'type-refused', name: 'Recusa total' },
    { attachmentMode: 'optional', id: 'type-absent', name: 'Destinatário ausente' },
    /** A rota de hoje devolve só id e nome — o modo chega quando a API passar a mandá-lo. */
    { id: 'type-legacy', name: 'Avaria no transporte' },
  ],
}

function draft(overrides: Partial<NotDeliveredDraft> = {}): NotDeliveredDraft {
  return {
    note: '',
    occurrenceTypeId: 'type-absent',
    photo: PHOTO,
    reason: 'recipient_absent' satisfies DriverReturnReason,
    ...overrides,
  }
}

/**
 * Spec 179 T301 (CA04), com o ajuste do usuário de 25/09: "Não entreguei" registra a ocorrência da
 * nota com foto **e** a devolução. A tela não habilita o confirmar sem o que o servidor exige, e diz
 * o que falta — todos de uma vez, nunca um por tentativa.
 */
describe('o que falta para confirmar "Não entreguei" (spec 179 T301, CA04)', () => {
  it('completo, nada falta', () => {
    expect(listMissingNotDeliveredFields({ draft: draft(), occurrenceTypes: TYPES })).toEqual([])
  })

  it('sem foto, a foto falta — em todo tipo, porque "Não entreguei" sempre leva prova', () => {
    for (const occurrenceTypeId of ['type-refused', 'type-absent', 'type-legacy']) {
      const missing = listMissingNotDeliveredFields({
        draft: draft({ note: 'Cliente recusou', occurrenceTypeId, photo: undefined }),
        occurrenceTypes: TYPES,
      })
      expect(missing).toEqual(['photo'])
    }
  })

  it('tipo required sem observação: a observação falta', () => {
    const missing = listMissingNotDeliveredFields({
      draft: draft({ note: '   ', occurrenceTypeId: 'type-refused' }),
      occurrenceTypes: TYPES,
    })
    expect(missing).toEqual(['note'])
  })

  it('tipo required sem foto e sem observação: os dois, na ordem da tela', () => {
    const missing = listMissingNotDeliveredFields({
      draft: draft({ note: '', occurrenceTypeId: 'type-refused', photo: undefined }),
      occurrenceTypes: TYPES,
    })
    expect(missing).toEqual(['photo', 'note'])
  })

  it('tipo optional ou sem modo declarado: a observação continua opcional', () => {
    for (const occurrenceTypeId of ['type-absent', 'type-legacy']) {
      expect(
        listMissingNotDeliveredFields({
          draft: draft({ occurrenceTypeId }),
          occurrenceTypes: TYPES,
        }),
      ).toEqual([])
    }
  })

  it('nada escolhido: motivo, tipo e foto, na ordem da tela', () => {
    const missing = listMissingNotDeliveredFields({
      draft: { note: '', occurrenceTypeId: undefined, photo: undefined, reason: undefined },
      occurrenceTypes: TYPES,
    })
    expect(missing).toEqual(['reason', 'occurrenceType', 'photo'])
  })

  it('tipo que saiu da lista conta como não escolhido', () => {
    const missing = listMissingNotDeliveredFields({
      draft: draft({ occurrenceTypeId: 'type-retired' }),
      occurrenceTypes: TYPES,
    })
    expect(missing).toEqual(['occurrenceType'])
  })

  it('tipos ainda carregando: o tipo falta, e a tela espera', () => {
    const missing = listMissingNotDeliveredFields({
      draft: draft(),
      occurrenceTypes: { status: 'loading' },
    })
    expect(missing).toEqual(['occurrenceType'])
  })

  /**
   * Spec 157 RF5: devolver nunca depende da lista de tipos. Sem ela (falha sem cópia guardada, ou a
   * empresa sem tipo de rua), não há ocorrência onde pendurar a foto — a devolução segue só com o
   * motivo, e a tela diz isso.
   */
  it('sem tipos disponíveis, só o motivo da devolução é exigido', () => {
    for (const occurrenceTypes of [
      { status: 'failed' } as const,
      { status: 'loaded', types: [] } as const,
    ]) {
      expect(
        listMissingNotDeliveredFields({
          draft: { note: '', occurrenceTypeId: undefined, photo: undefined, reason: undefined },
          occurrenceTypes,
        }),
      ).toEqual(['reason'])
    }
  })

  it('cada campo que pode faltar tem texto em pt-BR e en', () => {
    for (const field of NOT_DELIVERED_FIELDS) {
      expect(driverTrip.notDelivered.missing[field]).toBeString()
      expect(driverTripEn.notDelivered.missing[field]).toBeString()
    }
  })
})

/** Os mesmos limites do servidor: 512 KiB é o teto da foto da ocorrência (spec 161 D13). */
describe('o teto da foto da ocorrência', () => {
  it('aceita até o teto e recusa acima', () => {
    expect(
      isOccurrencePhotoWithinLimit(new Blob([new Uint8Array(OCCURRENCE_PHOTO_MAX_BYTES)])),
    ).toBe(true)
    expect(
      isOccurrencePhotoWithinLimit(new Blob([new Uint8Array(OCCURRENCE_PHOTO_MAX_BYTES + 1)])),
    ).toBe(false)
    expect(OCCURRENCE_PHOTO_MAX_BYTES).toBe(512 * 1024)
  })
})

/**
 * Spec 179 T303 (RF5): a foto e a ocorrência entram na fila **junto** da devolução, no mesmo toque.
 * A ocorrência vai primeiro: sem rede ela para a drenagem e a devolução espera com ela; a ordem
 * garante que a prova sobe antes de a nota fechar.
 */
describe('os itens de fila de "Não entreguei"', () => {
  let counter = 0
  const createKey = (): string => {
    counter += 1
    return `key-${counter}`
  }

  it('ocorrência com foto, depois a devolução — cada uma com a própria chave', () => {
    const reports = buildNotDeliveredReports({
      createIdempotencyKey: createKey,
      documentId: 'document-1',
      draft: draft({ note: '  Portão fechado  ', occurrenceTypeId: 'type-absent' }),
      occurrenceTypes: TYPES,
    })

    expect(reports).toHaveLength(2)
    const [occurrence, returned] = reports
    expect(occurrence).toMatchObject({
      documentId: 'document-1',
      kind: 'documentOccurrence',
      note: 'Portão fechado',
      occurrenceTypeId: 'type-absent',
      occurrenceTypeName: 'Destinatário ausente',
      photo: PHOTO,
      productCode: '',
    })
    expect(returned).toMatchObject({
      documentId: 'document-1',
      kind: 'return',
      location: null,
      reason: 'recipient_absent',
    })
    expect(occurrence?.idempotencyKey).not.toBe(returned?.idempotencyKey)
  })

  it('sem tipos disponíveis, só a devolução', () => {
    const reports = buildNotDeliveredReports({
      createIdempotencyKey: createKey,
      documentId: 'document-1',
      draft: { note: '', occurrenceTypeId: undefined, photo: undefined, reason: 'damaged_goods' },
      occurrenceTypes: { status: 'failed' },
    })

    expect(reports.map((report) => report.kind)).toEqual(['return'])
  })

  it('rascunho incompleto não vira item nenhum', () => {
    expect(() =>
      buildNotDeliveredReports({
        createIdempotencyKey: createKey,
        documentId: 'document-1',
        draft: draft({ photo: undefined }),
        occurrenceTypes: TYPES,
      }),
    ).toThrow('NOT_DELIVERED_INCOMPLETE')
  })
})
