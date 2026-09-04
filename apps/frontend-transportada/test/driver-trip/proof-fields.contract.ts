/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { DriverDeliveryProofSettings } from '@/modules/driver-trip/shared/driverTrip.types'
import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'
import {
  DEFAULT_PROOF_SETTINGS,
  canonicalReceiverDocument,
  listMissingProofFields,
  maskReceiverDocument,
  resolveProofFormPlan,
} from '@/modules/driver-trip/shared/proofFormPlan.service'

function settings(
  overrides: Partial<DriverDeliveryProofSettings> = {},
): DriverDeliveryProofSettings {
  return { ...DEFAULT_PROOF_SETTINGS, ...overrides }
}

describe('os campos do comprovante dirigidos pela configuração (D4/T053)', () => {
  it('"off" não renderiza o campo', () => {
    const plan = resolveProofFormPlan(settings({ photo: 'off', receiverName: 'off' }))
    expect(plan.rendersPhoto).toBe(false)
    expect(plan.rendersReceiverName).toBe(false)
    expect(plan.rendersSignature).toBe(true)
  })

  it('sem configuração no snapshot vale o padrão: documento desligado, o resto opcional', () => {
    const plan = resolveProofFormPlan(null)
    expect(plan.rendersReceiverDocument).toBe(false)
    expect(plan.fields.receiverName).toBe('optional')
  })

  it('"required" vazio bloqueia o envio — e todos os campos faltantes saem de uma vez', () => {
    const plan = resolveProofFormPlan(
      settings({ receiverDocument: 'required', receiverName: 'required', signature: 'required' }),
    )
    expect(
      listMissingProofFields({
        plan,
        values: { hasPhoto: false, hasSignature: false, receiverDocument: '', receiverName: ' ' },
      }),
    ).toEqual(['receiverName', 'receiverDocument', 'signature'])
  })

  it('"required" preenchido libera; "optional" vazio nunca bloqueia', () => {
    const plan = resolveProofFormPlan(settings({ receiverName: 'required' }))
    expect(
      listMissingProofFields({
        plan,
        values: {
          hasPhoto: false,
          hasSignature: false,
          receiverDocument: '',
          receiverName: 'Maria',
        },
      }),
    ).toEqual([])
  })

  it('o documento entra mascarado na digitação e sobe canônico — CPF e CNPJ, com letra', () => {
    expect(maskReceiverDocument('39053344705')).toBe('390.533.447-05')
    expect(maskReceiverDocument('12abc345000190')).toBe('12.ABC.345/0001-90')
    expect(canonicalReceiverDocument('390.533.447-05')).toBe('39053344705')
    expect(canonicalReceiverDocument('12.abc.345/0001-90')).toBe('12ABC345000190')
  })

  it('o snapshot lê stop.deliveryProof, e fora do vocabulário vira null (padrão do app)', () => {
    const stop = {
      arrivedAt: null,
      completedAt: null,
      deliveryProof: {
        photo: 'required',
        receiverDocument: 'optional',
        receiverName: 'required',
        signature: 'off',
      },
      documents: [],
      id: 'stop-1',
      label: 'Rua A, 1',
      sequence: 1,
    }
    const snapshot = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        trips: [
          {
            id: 'trip-1',
            manifest: null,
            status: 'dispatched',
            stops: [stop],
            vehiclePlate: 'ABC1D23',
          },
        ],
      },
    })
    expect(snapshot.trips[0]?.stops[0]?.deliveryProof).toEqual({
      photo: 'required',
      receiverDocument: 'optional',
      receiverName: 'required',
      signature: 'off',
    })

    const broken = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        trips: [
          {
            id: 'trip-1',
            manifest: null,
            status: 'dispatched',
            stops: [{ ...stop, deliveryProof: { photo: 'mandatory' } }],
            vehiclePlate: 'ABC1D23',
          },
        ],
      },
    })
    expect(broken.trips[0]?.stops[0]?.deliveryProof).toBeNull()
  })

  /** Revisão 082 (item 3): a configuração é do DOCUMENTO — a exceção por CNPJ muda nota a nota. */
  it('o snapshot lê document.deliveryProof, e ausente (shape antigo) vira null', () => {
    const snapshot = toDriverTripSnapshot({
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
                documents: [
                  {
                    deliveryProof: {
                      photo: 'off',
                      receiverDocument: 'required',
                      receiverName: 'off',
                      signature: 'off',
                    },
                    id: 'doc-1',
                    separationStatus: 'delivered',
                  },
                  { id: 'doc-2', separationStatus: 'delivered' },
                ],
                id: 'stop-1',
                label: 'Rua A, 1',
                sequence: 1,
              },
            ],
            vehiclePlate: 'ABC1D23',
          },
        ],
      },
    })
    const documents = snapshot.trips[0]?.stops[0]?.documents
    expect(documents?.[0]?.deliveryProof?.receiverDocument).toBe('required')
    expect(documents?.[1]?.deliveryProof).toBeNull()
  })

  it('o formulário lê a configuração do documento, com a parada como reserva', () => {
    const card = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
        import.meta.url,
      ).pathname,
      'utf8',
    )
    expect(card).toInclude('document.deliveryProof ?? stopProofSettings')
    expect(card).not.toInclude('proofSettings={stop.deliveryProof}')
  })

  /** Revisão 082 (item 2): o veredito do serviço manda — assinatura e foto obrigatórias bloqueiam. */
  it('nenhum filtro descarta signature/photo do veredito, e o erro é pintado por campo', () => {
    const card = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
        import.meta.url,
      ).pathname,
      'utf8',
    )
    expect(card).not.toInclude(
      ".filter((field) => field === 'receiverName' || field === 'receiverDocument')",
    )
    expect(card).toInclude("missing.includes('signature')")
    expect(card).toInclude("missing.includes('photo')")
  })

  it('o campo do documento nunca leva inputMode numeric — CNPJ tem letra (regra do repo)', () => {
    const card = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
        import.meta.url,
      ).pathname,
      'utf8',
    )
    expect(card).not.toContain('inputMode="numeric"')
    expect(card).toContain('maskReceiverDocument')
    /* O canônico sobe no proof: a API valida e criptografa (envelope da D4). */
    expect(card).toContain('canonicalReceiverDocument')
  })
})
