/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Pedido do usuário (01/10): o motorista rever o canhoto já enviado. O que esta suíte cobra é o
 * recorte — `trip.read` vale para a empresa inteira, então a nota precisa ser alcançável **pelo
 * motorista** — e o que a resposta **não** carrega.
 */
import { describe, expect, it } from 'bun:test'

import { readDriverDeliveryProofs } from '../../src/trips/application/read-driver-delivery-proof.use-case.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { TripDocumentNotReachableError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000010'
const DRIVER_ID = '00000000-0000-4000-8000-000000000020'
const TRIP_ID = '00000000-0000-4000-8000-000000000030'

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

const PROOF_RECORD = {
  bucket: 'canhotos',
  createdAt: '2026-10-01T12:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000040',
  kind: 'photo',
  lateRegistration: false,
  mimeType: 'image/jpeg',
  objectKey: 'tenants/empresa/delivery-proofs/evento/objeto',
  receivedBy: 'recipient',
  receivedByDetail: null,
  receiverDocumentMasked: '***.938.570-**',
  receiverName: 'Quem Recebeu',
  thumbnail: {
    bucket: 'canhotos',
    mimeType: 'image/jpeg',
    objectKey: 'tenants/empresa/delivery-proofs/evento/miniatura',
  },
} as const

function createDownloads() {
  return {
    createDownloadUrl: (input: { readonly objectKey: string }) =>
      Promise.resolve({
        expiresAt: '2026-10-01T12:05:00.000Z',
        url: `https://bucket.test/${input.objectKey}?assinatura`,
      }),
  }
}

function createRepository(input: { readonly reachable: boolean }) {
  const listed: unknown[] = []
  return {
    listed: () => listed,
    findReachableDocument: (query: unknown) => {
      listed.push(query)
      return Promise.resolve(input.reachable ? { tripId: TRIP_ID } : null)
    },
    listDeliveryProofs: (query: unknown) => {
      listed.push(query)
      return Promise.resolve([PROOF_RECORD])
    },
  }
}

describe('o motorista relê o canhoto da própria nota', () => {
  it('devolve a URL assinada do original e da miniatura', async () => {
    const proofs = await readDriverDeliveryProofs({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      downloads: createDownloads(),
      driverId: DRIVER_ID,
      repository: createRepository({ reachable: true }),
    })

    expect(proofs).toHaveLength(1)
    expect(proofs[0]?.downloadUrl).toContain('/objeto?assinatura')
    expect(proofs[0]?.thumbnailUrl).toContain('/miniatura?assinatura')
    expect(proofs[0]?.kind).toBe('photo')
  })

  /** A viagem vem da consulta, nunca do cliente: é ela que impede ler canhoto de nota alheia. */
  it('a nota fora das viagens do motorista não existe para ele', async () => {
    const repository = createRepository({ reachable: false })

    await expect(
      readDriverDeliveryProofs({
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        downloads: createDownloads(),
        driverId: DRIVER_ID,
        repository,
      }),
    ).rejects.toBeInstanceOf(TripDocumentNotReachableError)
    expect(repository.listed()).toHaveLength(1)
  })

  it('a leitura das provas usa a viagem que a consulta resolveu, não um id do cliente', async () => {
    const repository = createRepository({ reachable: true })
    await readDriverDeliveryProofs({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      downloads: createDownloads(),
      driverId: DRIVER_ID,
      repository,
    })

    expect(repository.listed()[1]).toEqual({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      tripId: TRIP_ID,
    })
  })

  /** A rua reconhece a própria foto; auditar a entrega é do painel. */
  it('não publica quem recebeu, documento, veredito nem chave do objeto', async () => {
    const [proof] = await readDriverDeliveryProofs({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      downloads: createDownloads(),
      driverId: DRIVER_ID,
      repository: createRepository({ reachable: true }),
    })

    expect(Object.keys(proof ?? {}).toSorted()).toEqual([
      'createdAt',
      'downloadUrl',
      'expiresAt',
      'id',
      'kind',
      'thumbnailUrl',
    ])
  })

  it('sem miniatura, a chave nem aparece — a tela cai no original', async () => {
    const repository = createRepository({ reachable: true })
    const withoutThumbnail = {
      ...repository,
      listDeliveryProofs: () => Promise.resolve([{ ...PROOF_RECORD, thumbnail: null }]),
    }
    const [proof] = await readDriverDeliveryProofs({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      downloads: createDownloads(),
      driverId: DRIVER_ID,
      repository: withoutThumbnail,
    })

    expect(proof).not.toHaveProperty('thumbnailUrl')
  })
})

describe('a rota de leitura do canhoto no campo', () => {
  const routes = createMeTripRoutes({
    attachProof: NOT_CALLED,
    confirmOccurrenceUpload: NOT_CALLED,
    createOccurrenceUpload: NOT_CALLED,
    dispatchCurrentTrip: NOT_CALLED,
    registerDriverOccurrence: NOT_CALLED,
    findCurrentTrip: NOT_CALLED,
    listFieldOccurrenceTypes: NOT_CALLED,
    reportArrival: NOT_CALLED,
    reportDeparture: NOT_CALLED,
    cancelStopDeparture: NOT_CALLED,
    reportDelivery: NOT_CALLED,
    reportOccurrence: NOT_CALLED,
    readDeliveryProofs: NOT_CALLED,
    readManifestXml: NOT_CALLED,
    renderManifestDamdfe: NOT_CALLED,
    reportReturn: NOT_CALLED,
    resolveDriverId: NOT_CALLED,
    startFieldTrip: NOT_CALLED,
  })

  it('é um GET no mesmo caminho do envio, pedindo só `trip.read`', () => {
    const route = routes.find(
      (candidate) =>
        candidate.method === 'GET' &&
        candidate.pathname === '/me/trips/current/documents/:documentId/proof',
    )

    expect(route).toBeDefined()
    expect(route?.policy).toEqual({ permission: 'trip.read', scope: 'company' })
  })

  it('o envio continua sendo POST com `trip.report`', () => {
    const route = routes.find(
      (candidate) =>
        candidate.method === 'POST' &&
        candidate.pathname === '/me/trips/current/documents/:documentId/proof',
    )

    expect(route?.policy).toEqual({ permission: 'trip.report', scope: 'company' })
  })
})
