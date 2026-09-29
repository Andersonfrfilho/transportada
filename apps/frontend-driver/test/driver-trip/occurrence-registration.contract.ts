/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import type {
  DriverFieldReport,
  DriverOccurrenceType,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import { isDriverOccurrenceType } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import { listAvailableOccurrenceTypes } from '../../src/modules/driver-trip/shared/notDelivered.service'
import {
  canRegisterOccurrence,
  dispatchOccurrenceRegistration,
  listMissingOccurrenceFields,
  mergeResolvedOccurrenceAttachmentModes,
  resolveOccurrenceAttachmentMode,
  type OccurrenceRegistrationHandlers,
} from '../../src/modules/driver-trip/shared/occurrenceRegistration.service'
import { buildStopOccurrenceReports } from '../../src/modules/driver-trip/shared/stopOccurrencePhoto.service'

/**
 * Spec 218 (RF-A5, D1–D4): um botão só de ocorrência, por nota. A lista tem todos os tipos do
 * catálogo — os de nota (`flow: document`) e os de parada (`flow: stop`) juntos —, cada um dizendo
 * se pede foto. Com `attachmentMode: required`, "Registrar" só habilita com a foto já capturada no
 * aparelho (nunca espera upload). Confirmar sai por uma rota só, a que o `flow` do tipo manda.
 */
const STOP_ID = '00000000-0000-4000-8000-0000000000b1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'
const PHOTO = {
  blob: new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }),
  fileName: 'x.jpg',
}

const DOCUMENT_REQUIRED: DriverOccurrenceType = {
  attachmentMode: 'required',
  flow: 'document',
  id: 'tipo-recusa',
  name: 'Recusa parcial',
  stopKind: null,
}
const DOCUMENT_OFF: DriverOccurrenceType = {
  attachmentMode: 'off',
  flow: 'document',
  id: 'tipo-endereco',
  name: 'Endereço não encontrado',
  stopKind: null,
}
const STOP_OPTIONAL: DriverOccurrenceType = {
  attachmentMode: 'optional',
  flow: 'stop',
  id: 'tipo-espera',
  name: 'Espera longa',
  stopKind: 'long_wait',
}
const STOP_REQUIRED: DriverOccurrenceType = {
  attachmentMode: 'required',
  flow: 'stop',
  id: 'tipo-cobranca',
  name: 'Cobrança inesperada',
  stopKind: 'unexpected_charge',
}

describe('a lista única traz os dois fluxos, cada tipo com o seu attachmentMode (RF-A5)', () => {
  it('a rota do motorista entrega flow e stopKind, e o app os aceita', async () => {
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: () =>
        Promise.resolve(Response.json({ data: [DOCUMENT_REQUIRED, STOP_OPTIONAL, DOCUMENT_OFF] })),
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    })

    const result = await client.listOccurrenceTypes()

    expect(result).toEqual({
      status: 'loaded',
      types: [DOCUMENT_REQUIRED, STOP_OPTIONAL, DOCUMENT_OFF],
    })
  })

  /**
   * Spec 219 RF3: `contractorId`/`recipientTaxId`, quando o chamador os tem, viram query string —
   * a rota já os aceita (spec 218 T9), o cliente só passa a mandar.
   */
  it('manda contractorId e recipientTaxId na query string quando informados', async () => {
    const seen: string[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        seen.push((input as Request).url)
        return Promise.resolve(Response.json({ data: [] }))
      },
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    })

    await client.listOccurrenceTypes({
      contractorId: '00000000-0000-4000-8000-0000000000c1',
      recipientTaxId: '11222333000181',
    })

    const url = new URL(seen[0] ?? '')
    expect(url.pathname).toBe('/me/trips/current/occurrence-types')
    expect(url.searchParams.get('contractorId')).toBe('00000000-0000-4000-8000-0000000000c1')
    expect(url.searchParams.get('recipientTaxId')).toBe('11222333000181')
  })

  it('sem contractorId nem recipientTaxId, a query string sai vazia — o comportamento de hoje', async () => {
    const seen: string[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        seen.push((input as Request).url)
        return Promise.resolve(Response.json({ data: [] }))
      },
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    })

    await client.listOccurrenceTypes()
    await client.listOccurrenceTypes({ contractorId: null, recipientTaxId: null })

    for (const url of seen) expect(new URL(url).search).toBe('')
  })

  it('cada tipo diz se pede foto — ausente (API anterior) é "sem foto"', () => {
    expect(resolveOccurrenceAttachmentMode(DOCUMENT_REQUIRED)).toBe('required')
    expect(resolveOccurrenceAttachmentMode(STOP_OPTIONAL)).toBe('optional')
    expect(resolveOccurrenceAttachmentMode({ id: 'legado', name: 'Legado' })).toBe('off')
  })

  it('flow fora do vocabulário é corpo inválido, não um tipo sem rota', () => {
    expect(isDriverOccurrenceType({ ...STOP_OPTIONAL, flow: 'both' })).toBe(false)
    expect(isDriverOccurrenceType({ ...STOP_OPTIONAL, stopKind: 'damaged_goods' })).toBe(false)
    /** A cópia guardada antes da spec 218 não tem flow — continua valendo, como tipo de nota. */
    expect(isDriverOccurrenceType({ id: 'legado', name: 'Legado' })).toBe(true)
  })

  /** "Não entreguei" é devolução de nota: tipo de parada ali abriria ocorrência de nota errada. */
  it('"Não entreguei" oferece só os tipos de nota', () => {
    const types = listAvailableOccurrenceTypes({
      status: 'loaded',
      types: [DOCUMENT_REQUIRED, STOP_OPTIONAL, DOCUMENT_OFF],
    })

    expect(types?.map((type) => type.id)).toEqual([DOCUMENT_REQUIRED.id, DOCUMENT_OFF.id])
  })
})

describe('a exceção por contratante/destinatário sobrescreve o attachmentMode (spec 219 RF4)', () => {
  it('sem resolução por nota, a lista geral sai intacta (P3, offline/sem contratante)', () => {
    expect(
      mergeResolvedOccurrenceAttachmentModes({
        resolvedByTypeId: undefined,
        types: [DOCUMENT_REQUIRED, STOP_OPTIONAL],
      }),
    ).toEqual([DOCUMENT_REQUIRED, STOP_OPTIONAL])
  })

  it('com resolução por nota, o attachmentMode do tipo casado é o da resposta por nota', () => {
    const result = mergeResolvedOccurrenceAttachmentModes({
      resolvedByTypeId: new Map([[DOCUMENT_OFF.id, 'required']]),
      types: [DOCUMENT_OFF, STOP_OPTIONAL],
    })

    expect(result).toEqual([{ ...DOCUMENT_OFF, attachmentMode: 'required' }, STOP_OPTIONAL])
  })

  it('tipo ausente na resposta por nota mantém o attachmentMode geral — nunca some da lista', () => {
    const result = mergeResolvedOccurrenceAttachmentModes({
      resolvedByTypeId: new Map([[DOCUMENT_OFF.id, 'required']]),
      types: [DOCUMENT_OFF, STOP_OPTIONAL],
    })

    expect(result.map((type) => type.id)).toEqual([DOCUMENT_OFF.id, STOP_OPTIONAL.id])
    expect(result.find((type) => type.id === STOP_OPTIONAL.id)?.attachmentMode).toBe('optional')
  })
})

describe('o gate da foto obrigatória (P5): captura local, nunca upload', () => {
  it('required sem foto falta a foto; com a foto capturada, nada falta', () => {
    expect(listMissingOccurrenceFields({ hasPhoto: false, type: STOP_REQUIRED })).toEqual(['photo'])
    expect(listMissingOccurrenceFields({ hasPhoto: true, type: STOP_REQUIRED })).toEqual([])
  })

  it('optional e off nunca pedem nada', () => {
    expect(listMissingOccurrenceFields({ hasPhoto: false, type: STOP_OPTIONAL })).toEqual([])
    expect(listMissingOccurrenceFields({ hasPhoto: false, type: DOCUMENT_OFF })).toEqual([])
  })

  it('"Registrar" habilita ao capturar — o estado que decide é só o do aparelho', () => {
    const base = { isPhotoReading: false }

    expect(canRegisterOccurrence({ ...base, hasPhoto: false, type: undefined })).toBe(false)
    expect(canRegisterOccurrence({ ...base, hasPhoto: false, type: DOCUMENT_REQUIRED })).toBe(false)
    expect(canRegisterOccurrence({ ...base, hasPhoto: true, type: DOCUMENT_REQUIRED })).toBe(true)
    expect(canRegisterOccurrence({ ...base, hasPhoto: false, type: STOP_OPTIONAL })).toBe(true)
  })

  it('a foto ainda sendo reduzida segura o botão — ela não pode ficar para trás', () => {
    expect(
      canRegisterOccurrence({ hasPhoto: false, isPhotoReading: true, type: STOP_OPTIONAL }),
    ).toBe(false)
  })
})

describe('confirmar sai por uma rota só, a do flow do tipo (D1, D3, D4)', () => {
  function spyHandlers() {
    const calls: { readonly name: string; readonly input: unknown }[] = []
    const handlers: OccurrenceRegistrationHandlers = {
      enqueueDocumentOccurrence: (input) =>
        calls.push({ input, name: 'enqueueDocumentOccurrence' }),
      registerDocumentOccurrence: (input) =>
        calls.push({ input, name: 'registerDocumentOccurrence' }),
      reportStopOccurrence: (input) => calls.push({ input, name: 'reportStopOccurrence' }),
    }
    return { calls, handlers }
  }

  it('tipo de nota sem foto: a chamada direta de hoje, na nota tocada', () => {
    const { calls, handlers } = spyHandlers()

    dispatchOccurrenceRegistration({
      documentId: DOCUMENT_ID,
      draft: { description: 'Portão sem número', photo: undefined },
      handlers,
      stopId: STOP_ID,
      type: DOCUMENT_OFF,
    })

    expect(calls).toEqual([
      {
        input: {
          documentId: DOCUMENT_ID,
          note: 'Portão sem número',
          occurrenceTypeId: DOCUMENT_OFF.id,
        },
        name: 'registerDocumentOccurrence',
      },
    ])
  })

  it('tipo de nota com foto: o item documentOccurrence da fila, que sobe a foto antes (D3)', () => {
    const { calls, handlers } = spyHandlers()

    dispatchOccurrenceRegistration({
      documentId: DOCUMENT_ID,
      draft: { description: '', photo: PHOTO },
      handlers,
      stopId: STOP_ID,
      type: DOCUMENT_REQUIRED,
    })

    expect(calls).toEqual([
      {
        input: {
          documentId: DOCUMENT_ID,
          note: '',
          occurrenceTypeId: DOCUMENT_REQUIRED.id,
          occurrenceTypeName: DOCUMENT_REQUIRED.name,
          photo: PHOTO,
        },
        name: 'enqueueDocumentOccurrence',
      },
    ])
  })

  /** D4: a nota é só de onde veio o toque — o tipo de parada registra na parada. */
  it('tipo de parada: a fila da parada, com o tipo do catálogo e sem a nota', () => {
    const { calls, handlers } = spyHandlers()

    dispatchOccurrenceRegistration({
      documentId: DOCUMENT_ID,
      draft: { description: 'Duas horas na fila', photo: PHOTO },
      handlers,
      stopId: STOP_ID,
      type: STOP_REQUIRED,
    })

    expect(calls).toEqual([
      {
        input: {
          description: 'Duas horas na fila',
          isPhotoRequired: true,
          occurrenceTypeId: STOP_REQUIRED.id,
          photo: PHOTO,
          stopId: STOP_ID,
        },
        name: 'reportStopOccurrence',
      },
    ])
  })

  it('tipo sem flow (cópia antiga) é de nota — nunca as duas rotas, nunca nenhuma', () => {
    const { calls, handlers } = spyHandlers()

    dispatchOccurrenceRegistration({
      documentId: DOCUMENT_ID,
      draft: { description: '', photo: undefined },
      handlers,
      stopId: STOP_ID,
      type: { id: 'legado', name: 'Legado' },
    })

    expect(calls.map((call) => call.name)).toEqual(['registerDocumentOccurrence'])
  })
})

describe('a ocorrência de parada vai com o tipo do catálogo, não com o kind (D2)', () => {
  it('os itens da fila levam occurrenceTypeId, e nenhum kind fixo', () => {
    let counter = 0
    const reports = buildStopOccurrenceReports({
      createKey: () => `chave-${++counter}`,
      description: 'Doca fechada',
      occurrenceTypeId: STOP_OPTIONAL.id,
      photo: PHOTO,
      stopId: STOP_ID,
    })

    expect(reports.map((report) => report.kind)).toEqual(['occurrence', 'stopOccurrencePhoto'])
    for (const report of reports) {
      expect(report).toMatchObject({ occurrenceTypeId: STOP_OPTIONAL.id })
      expect(report).not.toHaveProperty('occurrenceKind')
    }
  })

  async function postedBody(report: DriverFieldReport): Promise<unknown> {
    const seen: Request[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        seen.push((input as Request).clone())
        return Promise.resolve(Response.json({ data: { id: 'ocorrencia-1' } }, { status: 201 }))
      },
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    })
    await client.send(report)
    return seen[0]?.json()
  }

  it('o corpo manda occurrenceTypeId', async () => {
    expect(
      await postedBody({
        description: 'Doca fechada',
        documentId: null,
        idempotencyKey: 'chave-1',
        kind: 'occurrence',
        occurrenceTypeId: STOP_OPTIONAL.id,
        stopId: STOP_ID,
      }),
    ).toEqual({ description: 'Doca fechada', documentId: null, occurrenceTypeId: STOP_OPTIONAL.id })
  })

  /** O item gravado antes da atualização do app ainda sai da fila — com o corpo que a API aceita. */
  it('o item antigo da fila, com o kind fixo, continua saindo com kind', async () => {
    expect(
      await postedBody({
        description: 'Doca fechada',
        documentId: null,
        idempotencyKey: 'chave-1',
        kind: 'occurrence',
        occurrenceKind: 'dock_closed',
        stopId: STOP_ID,
      }),
    ).toEqual({ description: 'Doca fechada', documentId: null, kind: 'dock_closed' })
  })
})
