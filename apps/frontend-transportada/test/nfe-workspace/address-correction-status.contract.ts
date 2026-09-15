/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import type { AddressCorrectionFields } from '../../src/modules/nfe-workspace/shared/addressCorrection.validation'
import type { AddressCorrectionRequestRecord } from '../../src/modules/nfe-workspace/shared/addressCorrection.validation'
import {
  findDraftRequest,
  initialAddressCorrectionFields,
  resolveAddressCorrectionStatus,
} from '../../src/modules/nfe-workspace/shared/addressCorrectionStatus.service'
import type { AddressFinding } from '../../src/modules/nfe-workspace/shared/addressReport.validation'

const REPORTED_FIELDS: AddressCorrectionFields = {
  city: 'RIBEIRAO PRETO',
  cityCode: '3543402',
  complement: '',
  district: 'CENTRO',
  number: '533',
  postalCode: '14010100',
  state: 'SP',
  street: 'R AMERICA DE ARAUJO PERES',
}

const PROPOSED_FIELDS: AddressCorrectionFields = {
  ...REPORTED_FIELDS,
  number: '540',
  street: 'R DAS AMERICAS',
}

function buildRequest(
  overrides: Partial<AddressCorrectionRequestRecord>,
): AddressCorrectionRequestRecord {
  return {
    addressKey: '3543402|14010100|533',
    id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3ea1',
    proposed: PROPOSED_FIELDS,
    reasonDistanceMetres: null,
    reasonMatchLevel: 'unresolved',
    recipientName: null,
    reported: REPORTED_FIELDS,
    sentAt: null,
    status: 'draft',
    ...overrides,
  }
}

const FINDING: AddressFinding = {
  addressKey: '3543402|14010100|533',
  city: 'RIBEIRAO PRETO',
  distanceMetres: null,
  kind: 'street_different',
  noteDistrict: 'CENTRO',
  noteNumber: '533',
  notePostalCode: '14010100',
  noteStreet: 'R AMERICA DE ARAUJO PERES',
  providerPostalCode: '14010100',
  providerStreet: 'R DAS AMERICAS',
  recipientName: null,
  state: 'SP',
}

describe('estado do pedido de correção por endereço (spec 150, T202)', () => {
  test('sem nenhuma linha, o estado é "none"', () => {
    expect(resolveAddressCorrectionStatus([])).toEqual({
      lastSentAt: null,
      proposedSummary: null,
      sentAt: null,
      state: 'none',
    })
  })

  test('só um rascunho: estado "draft" com o resumo do proposto', () => {
    const status = resolveAddressCorrectionStatus([buildRequest({ status: 'draft' })])
    expect(status.state).toBe('draft')
    expect(status.sentAt).toBeNull()
    expect(status.lastSentAt).toBeNull()
    expect(status.proposedSummary).toBe('R DAS AMERICAS, 540 — RIBEIRAO PRETO/SP · 14010-100')
  })

  test('só um envio: estado "sent" com a data do envio', () => {
    const status = resolveAddressCorrectionStatus([
      buildRequest({ sentAt: '2026-09-10T12:00:00.000Z', status: 'sent' }),
    ])
    expect(status).toEqual({
      lastSentAt: null,
      proposedSummary: null,
      sentAt: '2026-09-10T12:00:00.000Z',
      state: 'sent',
    })
  })

  /** Um `sent` e um `draft` mais novo convivem: o estado é "draft", com o último envio ao lado. */
  test('envio seguido de rascunho novo: estado "draft" com o último envio', () => {
    const status = resolveAddressCorrectionStatus([
      buildRequest({ sentAt: '2026-09-01T09:00:00.000Z', status: 'sent' }),
      buildRequest({ sentAt: null, status: 'draft' }),
    ])
    expect(status.state).toBe('draft')
    expect(status.lastSentAt).toBe('2026-09-01T09:00:00.000Z')
    expect(status.sentAt).toBeNull()
  })

  test('mais de um envio: o último envio é o mais recente', () => {
    const status = resolveAddressCorrectionStatus([
      buildRequest({ sentAt: '2026-08-01T09:00:00.000Z', status: 'sent' }),
      buildRequest({ sentAt: '2026-09-01T09:00:00.000Z', status: 'sent' }),
    ])
    expect(status.sentAt).toBe('2026-09-01T09:00:00.000Z')
  })

  /** Pedido de uma chave que não aparece no relatório: quem lê por chave nunca acha essa linha. */
  test('chave sem linha no relatório é ignorada, não derruba a leitura das outras', () => {
    const requests = [buildRequest({ addressKey: 'OTHER|00000000|1', status: 'draft' })]
    const matches = requests.filter((request) => request.addressKey === FINDING.addressKey)
    expect(resolveAddressCorrectionStatus(matches)).toEqual({
      lastSentAt: null,
      proposedSummary: null,
      sentAt: null,
      state: 'none',
    })
  })

  test('findDraftRequest só acha o rascunho, nunca um pedido enviado', () => {
    const requests = [buildRequest({ sentAt: '2026-09-01T09:00:00.000Z', status: 'sent' })]
    expect(findDraftRequest(FINDING.addressKey, requests)).toBeUndefined()

    const withDraft = [...requests, buildRequest({ status: 'draft' })]
    expect(findDraftRequest(FINDING.addressKey, withDraft)?.status).toBe('draft')
  })

  test('valor inicial do formulário: sem rascunho, vem do "como veio" da nota', () => {
    expect(initialAddressCorrectionFields({ draft: undefined, finding: FINDING })).toEqual({
      city: 'RIBEIRAO PRETO',
      cityCode: '3543402',
      complement: '',
      district: 'CENTRO',
      number: '533',
      postalCode: '14010100',
      state: 'SP',
      street: 'R AMERICA DE ARAUJO PERES',
    })
  })

  test('valor inicial do formulário: com rascunho, vem do proposto salvo', () => {
    const draft = buildRequest({ status: 'draft' })
    expect(initialAddressCorrectionFields({ draft, finding: FINDING })).toEqual(PROPOSED_FIELDS)
  })
})
