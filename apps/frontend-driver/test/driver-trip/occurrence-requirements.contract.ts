/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  isDriverOccurrenceType,
  type DriverOccurrencePhoto,
  type DriverOccurrenceType,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  dispatchOccurrenceRegistration,
  type OccurrenceRegistrationHandlers,
} from '../../src/modules/driver-trip/shared/occurrenceDispatch.service'
import {
  canRegisterOccurrence,
  listMissingOccurrenceFields,
} from '../../src/modules/driver-trip/shared/occurrenceRegistration.service'
import {
  addOccurrencePhoto,
  OCCURRENCE_PHOTO_MAXIMUM_COUNT,
  resolveOccurrenceFieldVisibility,
  resolveOccurrenceRequirements,
} from '../../src/modules/driver-trip/shared/occurrenceRequirements.service'

/**
 * Spec 246 (T4.1, T4.1b, RF1, RF7, RF1c, RF1c2): o formulário de ocorrência cobra, no aparelho, os
 * quatro modos que o servidor resolveu para a nota — observação, foto (e o mínimo), assinatura e
 * produtos. `off` não aparece, `optional` aparece sem exigir, `required` segura o botão. E o app novo
 * contra a API anterior (campo ausente) lê como lia antes.
 */
const STOP_ID = '00000000-0000-4000-8000-0000000000b1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'

function photo(name: string): DriverOccurrencePhoto {
  return { blob: new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }), fileName: name }
}
const PHOTO_ONE = photo('um.jpg')
const PHOTO_TWO = photo('dois.jpg')
const PHOTO_THREE = photo('tres.jpg')
const SIGNATURE = {
  blob: new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' }),
  fileName: 'assinatura.png',
}

function documentType(overrides: Partial<DriverOccurrenceType> = {}): DriverOccurrenceType {
  return { flow: 'document', id: 'tipo-1', name: 'Recusa total', stopKind: null, ...overrides }
}

function spyHandlers() {
  const calls: { readonly name: string; readonly input: Record<string, unknown> }[] = []
  const handlers: OccurrenceRegistrationHandlers = {
    enqueueDocumentOccurrence: (input) => calls.push({ input, name: 'enqueueDocumentOccurrence' }),
    reportStopOccurrence: (input) => calls.push({ input, name: 'reportStopOccurrence' }),
  }
  return { calls, handlers }
}

function dispatch(input: {
  readonly description?: string
  readonly extraPhotos?: readonly DriverOccurrencePhoto[]
  readonly handlers: OccurrenceRegistrationHandlers
  readonly hasProducts?: boolean
  readonly photo?: DriverOccurrencePhoto
  readonly signature?: typeof SIGNATURE
  readonly type: DriverOccurrenceType
}) {
  return dispatchOccurrenceRegistration({
    documentId: DOCUMENT_ID,
    draft: {
      description: input.description ?? '',
      ...(input.extraPhotos === undefined ? {} : { extraPhotos: input.extraPhotos }),
      ...(input.hasProducts === undefined ? {} : { hasProducts: input.hasProducts }),
      photo: input.photo,
      ...(input.signature === undefined ? {} : { signature: input.signature }),
    },
    handlers: input.handlers,
    stopId: STOP_ID,
    type: input.type,
  })
}

describe('o app novo contra a API anterior: campo ausente lê como hoje (spec 246, ADR-0081 §9)', () => {
  const LEGACY: DriverOccurrenceType = { id: 'legado', name: 'Legado' }

  it('sem nenhum modo novo: observação opcional, assinatura desligada, produtos opcional, mínimo 1', () => {
    expect(resolveOccurrenceRequirements(LEGACY)).toEqual({
      itemsMode: 'optional',
      noteMode: 'optional',
      photoMinimumCount: 1,
      photoMode: 'off',
      signatureMode: 'off',
    })
    expect(resolveOccurrenceFieldVisibility(LEGACY)).toEqual({
      photoLimit: 1,
      rendersNote: true,
      rendersPhoto: false,
      rendersProducts: false,
      rendersSignature: false,
    })
  })

  it('a foto vem do attachmentMode quando o photoMode não veio, e o photoMode vence quando veio', () => {
    expect(resolveOccurrenceRequirements({ ...LEGACY, attachmentMode: 'required' }).photoMode).toBe(
      'required',
    )
    expect(
      resolveOccurrenceRequirements({
        ...LEGACY,
        attachmentMode: 'required',
        photoMode: 'optional',
      }).photoMode,
    ).toBe('optional')
  })

  it('o tipo antigo só pede o que pedia: a foto obrigatória, e nada mais', () => {
    const legacyRequired = { ...LEGACY, attachmentMode: 'required' } as const

    expect(listMissingOccurrenceFields({ hasPhoto: false, type: legacyRequired })).toEqual([
      'photo',
    ])
    expect(
      canRegisterOccurrence({ hasPhoto: true, isPhotoReading: false, type: legacyRequired }),
    ).toBe(true)
    expect(canRegisterOccurrence({ hasPhoto: false, isPhotoReading: false, type: LEGACY })).toBe(
      true,
    )
  })

  it('mínimo de fotos ausente, fracionário ou fora de 1 a 5 vale 1', () => {
    for (const photoMinimumCount of [undefined, 0, 6, 2.5, -1]) {
      const type = documentType({ photoMinimumCount, photoMode: 'required' } as never)
      expect(resolveOccurrenceRequirements(type).photoMinimumCount).toBe(1)
    }
  })

  it('o guard aceita os campos novos ausentes ou no vocabulário, e recusa valor desconhecido', () => {
    expect(isDriverOccurrenceType({ id: 'x', name: 'X' })).toBe(true)
    expect(
      isDriverOccurrenceType({
        id: 'x',
        itemsMinimumCount: null,
        itemsMode: 'required',
        name: 'X',
        noteMode: 'required',
        photoMinimumCount: 3,
        photoMode: 'required',
        signatureMode: 'optional',
      }),
    ).toBe(true)
    for (const field of ['itemsMode', 'noteMode', 'photoMode', 'signatureMode']) {
      expect(isDriverOccurrenceType({ id: 'x', name: 'X', [field]: 'mandatory' })).toBe(false)
    }
  })
})

describe('observação e assinatura: required segura o botão, optional aparece, off some (T4.1)', () => {
  it('observação obrigatória: falta até haver texto; espaços não contam', () => {
    const type = documentType({ noteMode: 'required' })

    expect(listMissingOccurrenceFields({ hasNote: false, hasPhoto: false, type })).toEqual(['note'])
    expect(
      canRegisterOccurrence({ hasNote: false, hasPhoto: false, isPhotoReading: false, type }),
    ).toBe(false)
    expect(
      canRegisterOccurrence({ hasNote: true, hasPhoto: false, isPhotoReading: false, type }),
    ).toBe(true)

    const { calls, handlers } = spyHandlers()
    expect(dispatch({ description: '   ', handlers, type })).toBe('blocked')
    expect(calls).toHaveLength(0)
  })

  it('observação opcional aparece e nunca segura; desligada não aparece e não sai', () => {
    const optional = documentType({ noteMode: 'optional' })
    const off = documentType({ noteMode: 'off' })

    expect(resolveOccurrenceFieldVisibility(optional).rendersNote).toBe(true)
    expect(canRegisterOccurrence({ hasPhoto: false, isPhotoReading: false, type: optional })).toBe(
      true,
    )
    expect(resolveOccurrenceFieldVisibility(off).rendersNote).toBe(false)

    const { calls, handlers } = spyHandlers()
    dispatch({ description: 'digitado antes de trocar de tipo', handlers, type: off })
    expect(calls[0]?.input.note).toBe('')
  })

  it('assinatura obrigatória: falta até ser desenhada; opcional e desligada nunca seguram', () => {
    const required = documentType({ signatureMode: 'required' })

    expect(listMissingOccurrenceFields({ hasPhoto: false, type: required })).toEqual(['signature'])
    expect(
      canRegisterOccurrence({
        hasPhoto: false,
        hasSignature: true,
        isPhotoReading: false,
        type: required,
      }),
    ).toBe(true)
    for (const signatureMode of ['optional', 'off'] as const) {
      expect(
        canRegisterOccurrence({
          hasPhoto: false,
          isPhotoReading: false,
          type: documentType({ signatureMode }),
        }),
      ).toBe(true)
    }
  })

  it('o SignaturePad só é oferecido com a assinatura pedida (modo diferente de off)', () => {
    expect(
      resolveOccurrenceFieldVisibility(documentType({ signatureMode: 'required' }))
        .rendersSignature,
    ).toBe(true)
    expect(
      resolveOccurrenceFieldVisibility(documentType({ signatureMode: 'optional' }))
        .rendersSignature,
    ).toBe(true)
    expect(
      resolveOccurrenceFieldVisibility(documentType({ signatureMode: 'off' })).rendersSignature,
    ).toBe(false)
    expect(resolveOccurrenceFieldVisibility(documentType()).rendersSignature).toBe(false)

    const form = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/DriverOccurrenceRegistrationForm.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    expect(form).toInclude('visibility?.rendersSignature === true')
    expect(form).not.toInclude('<SignaturePad')
  })

  it('assinatura capturada num tipo e depois o tipo trocado para off: ela não sai', () => {
    const { calls, handlers } = spyHandlers()

    dispatch({ handlers, signature: SIGNATURE, type: documentType({ signatureMode: 'off' }) })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).not.toHaveProperty('signature')
  })

  it('a ocorrência de parada segue só com a foto: nota, assinatura e produtos obrigatórios não valem lá (D-d)', () => {
    const stop = documentType({
      flow: 'stop',
      itemsMode: 'required',
      noteMode: 'required',
      photoMode: 'required',
      signatureMode: 'required',
      stopKind: 'long_wait',
    })

    expect(listMissingOccurrenceFields({ hasPhoto: false, type: stop })).toEqual(['photo'])
    expect(listMissingOccurrenceFields({ hasPhoto: true, type: stop })).toEqual([])
    expect(resolveOccurrenceFieldVisibility(stop)).toMatchObject({
      photoLimit: 1,
      rendersNote: true,
      rendersProducts: false,
      rendersSignature: false,
    })
  })
})

describe('produtos e quantidade mínima de fotos (T4.1b, RF1c, RF1c2)', () => {
  it('produtos obrigatórios: falta até apontar a nota inteira; opcional e desligado nunca seguram', () => {
    const required = documentType({ itemsMode: 'required' })

    expect(resolveOccurrenceFieldVisibility(required).rendersProducts).toBe(true)
    expect(listMissingOccurrenceFields({ hasPhoto: false, type: required })).toEqual(['products'])
    expect(
      canRegisterOccurrence({
        hasPhoto: false,
        hasProducts: true,
        isPhotoReading: false,
        type: required,
      }),
    ).toBe(true)
    for (const itemsMode of ['optional', 'off'] as const) {
      const type = documentType({ itemsMode })
      expect(resolveOccurrenceFieldVisibility(type).rendersProducts).toBe(false)
      expect(canRegisterOccurrence({ hasPhoto: false, isPhotoReading: false, type })).toBe(true)
    }
  })

  /**
   * O snapshot não traz a lista de itens, então o app só aponta a **nota inteira** — e ela satisfaz
   * "todos os itens" (mínimo nulo) e "ao menos N" igualmente: o servidor soma todos os itens dela.
   */
  it('"todos os itens" e "ao menos N" pedem o mesmo do aparelho: apontar a nota inteira', () => {
    for (const itemsMinimumCount of [null, 2]) {
      const type = documentType({ itemsMinimumCount, itemsMode: 'required' })

      expect(listMissingOccurrenceFields({ hasPhoto: false, type })).toEqual(['products'])
      expect(listMissingOccurrenceFields({ hasPhoto: false, hasProducts: true, type })).toEqual([])
    }
  })

  it('produtos só saem com a nota inteira apontada, e o tipo que não os pede não os leva', () => {
    const { calls, handlers } = spyHandlers()

    expect(dispatch({ handlers, type: documentType({ itemsMode: 'required' }) })).toBe('blocked')
    expect(
      dispatch({ handlers, hasProducts: true, type: documentType({ itemsMode: 'required' }) }),
    ).toBe('document-queued')
    expect(calls).toHaveLength(1)
  })

  it('fotos obrigatórias com mínimo 3: nenhuma é "photo", duas é "photoMinimum", três libera', () => {
    const type = documentType({ photoMinimumCount: 3, photoMode: 'required' })

    expect(listMissingOccurrenceFields({ hasPhoto: false, type })).toEqual(['photo'])
    expect(listMissingOccurrenceFields({ hasPhoto: true, photoCount: 2, type })).toEqual([
      'photoMinimum',
    ])
    expect(listMissingOccurrenceFields({ hasPhoto: true, photoCount: 3, type })).toEqual([])
    expect(resolveOccurrenceFieldVisibility(type).photoLimit).toBe(OCCURRENCE_PHOTO_MAXIMUM_COUNT)
  })

  it('o mínimo só vale com a foto obrigatória: opcional, ou mínimo 1, fica na foto única de sempre', () => {
    expect(
      resolveOccurrenceFieldVisibility(
        documentType({ photoMinimumCount: 3, photoMode: 'optional' }),
      ).photoLimit,
    ).toBe(1)
    expect(
      resolveOccurrenceFieldVisibility(
        documentType({ photoMinimumCount: 1, photoMode: 'required' }),
      ).photoLimit,
    ).toBe(1)
    expect(
      canRegisterOccurrence({
        hasPhoto: true,
        isPhotoReading: false,
        photoCount: 1,
        type: documentType({ photoMinimumCount: 3, photoMode: 'optional' }),
      }),
    ).toBe(true)
  })

  it('a foto escolhida substitui com limite 1 e acrescenta até o teto com mais de um', () => {
    expect(addOccurrencePhoto({ current: [PHOTO_ONE], limit: 1, photo: PHOTO_TWO })).toEqual([
      PHOTO_TWO,
    ])
    const grown = addOccurrencePhoto({ current: [PHOTO_ONE], limit: 3, photo: PHOTO_TWO })
    expect(grown).toHaveLength(2)
    expect(grown[1]).toBe(PHOTO_TWO)
    const full = [PHOTO_ONE, PHOTO_TWO, PHOTO_THREE]
    expect(addOccurrencePhoto({ current: full, limit: 3, photo: PHOTO_ONE })).toBe(full)
  })

  it('várias fotos: a primeira vai em photo e as demais em extraPhotos; uma só segue como sempre', () => {
    const type = documentType({ photoMinimumCount: 3, photoMode: 'required' })
    const many = spyHandlers()

    expect(
      dispatch({
        extraPhotos: [PHOTO_TWO, PHOTO_THREE],
        handlers: many.handlers,
        photo: PHOTO_ONE,
        type,
      }),
    ).toBe('document-queued')
    expect(many.calls[0]?.input.photo).toBe(PHOTO_ONE)
    expect(many.calls[0]?.input.extraPhotos).toEqual([PHOTO_TWO, PHOTO_THREE])

    const single = spyHandlers()
    dispatch({
      handlers: single.handlers,
      photo: PHOTO_ONE,
      type: documentType({ photoMode: 'required' }),
    })
    expect(single.calls[0]?.input.photo).toBe(PHOTO_ONE)
    expect(single.calls[0]?.input).not.toHaveProperty('extraPhotos')
  })

  it('duas fotos num tipo que pede três: nada entra na fila', () => {
    const { calls, handlers } = spyHandlers()

    const route = dispatch({
      extraPhotos: [PHOTO_TWO],
      handlers,
      photo: PHOTO_ONE,
      type: documentType({ photoMinimumCount: 3, photoMode: 'required' }),
    })

    expect(route).toBe('blocked')
    expect(calls).toHaveLength(0)
  })
})
