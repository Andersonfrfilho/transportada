/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import {
  isDriverOccurrenceType,
  type DriverFieldReport,
  type DriverOccurrenceType,
  type DriverTripDocument,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import { listAvailableOccurrenceTypes } from '../../src/modules/driver-trip/shared/notDelivered.service'
import {
  canRegisterOccurrence,
  dispatchOccurrenceRegistration,
  listMissingOccurrenceFields,
  resolveOccurrenceAttachmentMode,
  resolveOccurrenceTypesForDocument,
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

function buildDocument(overrides: Partial<DriverTripDocument> = {}): DriverTripDocument {
  return {
    accessKey: '',
    deliveredAt: null,
    deliveryProof: null,
    grossWeight: '0',
    id: DOCUMENT_ID,
    number: '1',
    occurrenceTypes: null,
    proofPending: false,
    recipientDisplayName: 'Cliente',
    recipientIsCompany: false,
    recipientName: 'Cliente',
    returnReason: null,
    separationStatus: 'loaded',
    series: '1',
    totalAmount: '0',
    volumeCount: '0',
    ...overrides,
  }
}

/**
 * Spec 218 RF-B2 (follow-up): a lista do formulário passa a vir por nota — os tipos de nota já
 * resolvidos para o contratante/destinatário desta nota (embutidos no documento), mais os de
 * parada da viagem inteira, que não têm um contratante/destinatário único para resolver contra.
 */
describe('a lista por documento resolve a exceção de ocorrência por nota (spec 218 follow-up)', () => {
  const CONTRACTOR_RESOLVED: DriverOccurrenceType = {
    attachmentMode: 'required',
    flow: 'document',
    id: DOCUMENT_REQUIRED.id,
    name: DOCUMENT_REQUIRED.name,
    stopKind: null,
  }

  it('documento com occurrenceTypes resolvido troca os tipos de nota, mas mantém os de parada', () => {
    const document = buildDocument({ occurrenceTypes: [CONTRACTOR_RESOLVED] })

    const types = resolveOccurrenceTypesForDocument({
      document,
      tripWideTypes: [DOCUMENT_OFF, STOP_OPTIONAL, STOP_REQUIRED],
    })

    expect(types).toEqual([CONTRACTOR_RESOLVED, STOP_OPTIONAL, STOP_REQUIRED])
  })

  it('occurrenceTypes null (cache antigo ou falha no servidor) cai na lista da viagem inteira', () => {
    const document = buildDocument({ occurrenceTypes: null })

    const types = resolveOccurrenceTypesForDocument({
      document,
      tripWideTypes: [DOCUMENT_REQUIRED, STOP_OPTIONAL],
    })

    expect(types).toEqual([DOCUMENT_REQUIRED, STOP_OPTIONAL])
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
      reportStopOccurrence: (input) => calls.push({ input, name: 'reportStopOccurrence' }),
    }
    return { calls, handlers }
  }

  /**
   * Spec 226: a 218 D1/D3 deixou a nota sem foto como chamada direta ("mudança de arquitetura
   * maior"). Sem rede o toque falhava e o texto digitado se perdia. O item `documentOccurrence` já
   * aceitava `photo: null` — "Não entreguei" o usa assim — e o servidor recebe o mesmo `POST`.
   */
  it('tipo de nota sem foto: o mesmo item da fila, com photo nula (spec 226)', () => {
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
          occurrenceTypeName: DOCUMENT_OFF.name,
          photo: null,
        },
        name: 'enqueueDocumentOccurrence',
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

    expect(calls.map((call) => call.name)).toEqual(['enqueueDocumentOccurrence'])
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
