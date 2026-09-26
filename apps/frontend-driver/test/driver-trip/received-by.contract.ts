/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { createDriverTripClient } from '@/modules/driver-trip/shared/driverTripClient.service'
import type { DriverDeliveryProofSettings } from '@/modules/driver-trip/shared/driverTrip.types'
import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'
import {
  applyAttachmentReceiverFields,
  detectReceiverDrift,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import {
  applyRecipientShortcut,
  buildReceiverFields,
  DEFAULT_PROOF_SETTINGS,
  listPendingReceiverFields,
  resolveProofFormPlan,
} from '@/modules/driver-trip/shared/proofFormPlan.service'
import { buildProofReceiverReport } from '@/modules/driver-trip/shared/proofReceiver.service'

function settings(
  overrides: Partial<DriverDeliveryProofSettings> = {},
): DriverDeliveryProofSettings {
  return { ...DEFAULT_PROOF_SETTINGS, ...overrides }
}

function snapshotWithDocument(document: Record<string, unknown>) {
  return toDriverTripSnapshot({
    data: {
      isRegisteredDriver: true,
      trips: [
        {
          id: 'trip-1',
          manifest: null,
          status: 'dispatched',
          stops: [
            {
              arrivedAt: null,
              completedAt: null,
              deliveryProof: null,
              documents: [{ id: 'doc-1', separationStatus: 'loaded', ...document }],
              id: 'stop-1',
              label: 'Rua A, 1',
              sequence: 1,
            },
          ],
          vehiclePlate: 'ABC1D23',
        },
      ],
    },
  }).trips[0]?.stops[0]?.documents[0]
}

describe('o snapshot traz quem recebeu e o nome do cliente (spec 193 D6, D14)', () => {
  it('receivedBy vem da nota; ausente (API anterior) vale optional', () => {
    const withMode = snapshotWithDocument({
      deliveryProof: {
        photo: 'required',
        receivedBy: 'required',
        receiverDocument: 'off',
        receiverName: 'optional',
        signature: 'optional',
      },
    })
    const withoutMode = snapshotWithDocument({
      deliveryProof: {
        photo: 'required',
        receiverDocument: 'off',
        receiverName: 'optional',
        signature: 'optional',
      },
    })

    expect(withMode?.deliveryProof?.receivedBy).toBe('required')
    expect(withoutMode?.deliveryProof?.receivedBy).toBe('optional')
    expect(withoutMode?.deliveryProof?.photo).toBe('required')
  })

  it('um campo inválido cai no padrão dele — o conjunto não vira null por um campo só', () => {
    const document = snapshotWithDocument({
      deliveryProof: {
        photo: 'mandatory',
        receivedBy: 'always',
        receiverDocument: 'required',
        receiverName: 'off',
        signature: 'off',
      },
    })

    expect(document?.deliveryProof).toEqual({
      photo: DEFAULT_PROOF_SETTINGS.photo,
      receivedBy: 'optional',
      receiverDocument: 'required',
      receiverName: 'off',
      signature: 'off',
    })
  })

  it('recipientDisplayName vem da API; ausente é vazio', () => {
    expect(snapshotWithDocument({ recipientDisplayName: 'Mercado Bom Preço' })).toMatchObject({
      recipientDisplayName: 'Mercado Bom Preço',
    })
    expect(snapshotWithDocument({})?.recipientDisplayName).toBe('')
  })
})

describe('o bloco "Quem recebeu" (spec 193 R1, R2, D14)', () => {
  it('off esconde o seletor; o atalho some quando o nome está desligado', () => {
    expect(resolveProofFormPlan(settings({ receivedBy: 'off' })).rendersReceivedBy).toBe(false)
    expect(resolveProofFormPlan(settings()).rendersReceivedBy).toBe(true)
    expect(resolveProofFormPlan(settings()).rendersRecipientShortcut).toBe(true)
    expect(resolveProofFormPlan(settings({ receiverName: 'off' })).rendersRecipientShortcut).toBe(
      false,
    )
  })

  it('required vazio é pendência, e "outro" sem detalhe também — nunca bloqueio', () => {
    const required = resolveProofFormPlan(settings({ receivedBy: 'required' }))
    const optional = resolveProofFormPlan(settings())

    expect(
      listPendingReceiverFields({
        plan: required,
        values: { receivedBy: '', receivedByDetail: '' },
      }),
    ).toEqual(['receivedBy'])
    expect(
      listPendingReceiverFields({
        plan: optional,
        values: { receivedBy: 'other', receivedByDetail: '  ' },
      }),
    ).toEqual(['receivedByDetail'])
    expect(
      listPendingReceiverFields({
        plan: optional,
        values: { receivedBy: '', receivedByDetail: '' },
      }),
    ).toEqual([])
  })

  it('o que falta de quem recebeu nunca entra no bloqueio do anexo (C1)', () => {
    const source = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    const blocked = source.slice(
      source.indexOf('function blockedByFields('),
      source.indexOf('function attach('),
    )

    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked).not.toContain('receivedBy')
  })

  it('"O próprio cliente recebeu" marca recipient e preenche o nome do cliente', () => {
    expect(
      applyRecipientShortcut({
        plan: resolveProofFormPlan(settings()),
        recipientDisplayName: 'Mercado Bom Preço',
      }),
    ).toEqual({ receivedBy: 'recipient', receiverName: 'Mercado Bom Preço' })
    expect(
      applyRecipientShortcut({
        plan: resolveProofFormPlan(settings({ receivedBy: 'off' })),
        recipientDisplayName: 'Maria da Silva',
      }),
    ).toEqual({ receiverName: 'Maria da Silva' })
  })

  it('os campos que sobem: trim, sem caractere de controle, e detalhe sem relação fica de fora', () => {
    expect(
      buildReceiverFields({
        receivedBy: 'neighbor',
        receivedByDetail: '  casa\u0007 12 ',
        receiverDocument: '',
        receiverName: '  Maria  ',
      }),
    ).toEqual({ receivedBy: 'neighbor', receivedByDetail: 'casa 12', receiverName: 'Maria' })
    expect(
      buildReceiverFields({
        receivedBy: '',
        receivedByDetail: 'casa 12',
        receiverDocument: '',
        receiverName: '',
      }),
    ).toEqual({})
  })
})

describe('quem recebeu depois da captura (spec 193 D7, CA12)', () => {
  const PHOTO: QueuedAttachment = {
    attachmentKey: 'anexo-1',
    blob: new Blob(['x']),
    capturedAt: '2026-09-25T12:00:00.000Z',
    documentId: 'doc-1',
    fileName: 'canhoto.jpg',
    kind: 'photo',
  }

  it('com o anexo ainda na fila, a edição atualiza o item do mesmo documento', () => {
    const [updated] = applyAttachmentReceiverFields({
      documentId: 'doc-1',
      items: [PHOTO],
      receivedBy: 'neighbor',
      receivedByDetail: 'casa 12',
    })

    expect(updated).toMatchObject({ receivedBy: 'neighbor', receivedByDetail: 'casa 12' })
  })

  it('a edição feita durante o envio vira diferença a mandar depois', () => {
    expect(detectReceiverDrift({ sent: PHOTO, stored: PHOTO })).toBeUndefined()
    expect(
      detectReceiverDrift({ sent: PHOTO, stored: { ...PHOTO, receivedBy: 'doorman' } }),
    ).toEqual({ receivedBy: 'doorman', receivedByDetail: null })
  })

  it('o evento proofReceiver vira PATCH com a chave do toque e o corpo JSON', async () => {
    const seen: Request[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        seen.push((input as Request).clone())
        return Promise.resolve(Response.json({ data: { changed: true } }))
      },
      getAccessToken: () => Promise.resolve('token'),
    })

    await client.send(
      buildProofReceiverReport({
        documentId: 'doc-1',
        fields: { receivedBy: 'neighbor', receivedByDetail: 'casa 12', receiverName: 'Maria' },
        idempotencyKey: 'toque-1',
      }),
    )

    expect(seen).toHaveLength(1)
    expect(seen[0]?.method).toBe('PATCH')
    expect(new URL(seen[0]?.url ?? '').pathname).toBe(
      '/me/trips/current/documents/doc-1/proof/receiver',
    )
    expect(seen[0]?.headers.get('Idempotency-Key')).toBe('toque-1')
    expect(await seen[0]?.json()).toEqual({
      receivedBy: 'neighbor',
      receivedByDetail: 'casa 12',
      receiverName: 'Maria',
    })
  })
})
