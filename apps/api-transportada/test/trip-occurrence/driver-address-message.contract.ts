/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 343 (T6a): o endereço correto da entrega ao grupo de WhatsApp do motorista.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { ContractorReplyWhatsAppSendError } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'
import {
  buildDriverAddressMessage,
  createSendDriverAddressToWhatsAppGroupUseCase,
  type DriverAddressGroupTarget,
} from '../../src/trips/application/send-driver-address-to-whatsapp-group.use-case.js'

const CONTEXT = { companyId: 'company-1', userId: 'user-1' } as never
const LOGGER = { error() {}, info() {}, warn() {} } as never
const OCCURRENCE_ID = '00000000-0000-4000-8000-00000000a001'

type Sent = { body: string; companyId: string; mentionNumber?: string; number: string }
type Pin = {
  address: string
  companyId: string
  latitude: number
  longitude: number
  name: string
  number: string
}

function build(target: DriverAddressGroupTarget | null, fail?: unknown, failPin?: unknown) {
  const sent: Sent[] = []
  const pins: Pin[] = []
  const queries: unknown[] = []
  const useCase = createSendDriverAddressToWhatsAppGroupUseCase({
    logger: LOGGER,
    now: () => new Date('2026-11-17T12:00:00.000Z'),
    reader: {
      findTarget(input) {
        queries.push(input)
        return Promise.resolve(target)
      },
    },
    sender: {
      sendLocation(input) {
        if (failPin !== undefined) return Promise.reject(failPin)
        pins.push(input as Pin)
        return Promise.resolve({})
      },
      sendText(input) {
        if (fail !== undefined) return Promise.reject(fail)
        sent.push(input as Sent)
        return Promise.resolve({})
      },
    },
  })
  return { pins, queries, sent, useCase }
}

describe('endereço correto ao grupo do motorista', () => {
  test('posta no grupo da ficha, marca o motorista e leva o link do mapa', async () => {
    const { queries, sent, useCase } = build({
      driverPhone: '(16) 99305-6772',
      groupJid: '120363000000000001@g.us',
    })
    const result = await useCase.execute({
      addressText: 'Rua das Flores, 120, Centro, Ribeirão Preto - SP',
      context: CONTEXT,
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'document',
    })
    expect(result).toEqual({ pinSent: false, sentAt: '2026-11-17T12:00:00.000Z' })
    expect(queries).toEqual([
      { companyId: 'company-1', occurrenceId: OCCURRENCE_ID, occurrenceKind: 'document' },
    ])
    expect(sent).toHaveLength(1)
    expect(sent[0]?.number).toBe('120363000000000001@g.us')
    expect(sent[0]?.mentionNumber).toBe('16993056772')
    expect(sent[0]?.body.startsWith('@16993056772 ')).toBe(true)
    expect(sent[0]?.body).toContain('Rua das Flores, 120, Centro')
    expect(sent[0]?.body).toContain('maps.google.com/?q=Rua%20das%20Flores')
  })

  test('com o ponto, manda também o pino de localização no grupo', async () => {
    const { pins, sent, useCase } = build({
      driverPhone: null,
      groupJid: '120363000000000001@g.us',
    })
    const result = await useCase.execute({
      addressText: 'Rua A, 1',
      context: CONTEXT,
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'stop',
      point: { latitude: -21.1775, longitude: -47.8103 },
    })
    expect(result.pinSent).toBe(true)
    expect(sent).toHaveLength(1)
    expect(pins).toEqual([
      {
        address: 'Rua A, 1',
        companyId: 'company-1',
        latitude: -21.1775,
        longitude: -47.8103,
        name: 'Endereço correto da entrega',
        number: '120363000000000001@g.us',
      },
    ])
  })

  test('o pino que falha não desfaz o texto já enviado', async () => {
    const { sent, useCase } = build(
      { driverPhone: null, groupJid: '120363000000000001@g.us' },
      undefined,
      new ContractorReplyWhatsAppSendError('failed'),
    )
    const result = await useCase.execute({
      addressText: 'Rua A, 1',
      context: CONTEXT,
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'stop',
      point: { latitude: -21.1775, longitude: -47.8103 },
    })
    expect(result.pinSent).toBe(false)
    expect(sent).toHaveLength(1)
  })

  test('com o ponto, o link do mapa usa a coordenada', () => {
    expect(
      buildDriverAddressMessage({
        addressText: 'Rua A, 1',
        point: { latitude: -21.1775, longitude: -47.8103 },
      }),
    ).toContain('?q=-21.1775,-47.8103')
  })

  test('sem grupo vinculado recusa com 422 e não envia', async () => {
    const { sent, useCase } = build({ driverPhone: null, groupJid: null })
    await expect(
      useCase.execute({
        addressText: 'Rua A, 1',
        context: CONTEXT,
        occurrenceId: OCCURRENCE_ID,
        occurrenceKind: 'stop',
      }),
    ).rejects.toMatchObject({ code: 'DRIVER_WHATSAPP_GROUP_MISSING', status: 422 })
    expect(sent).toHaveLength(0)
  })

  test('ocorrência inexistente ou de outra empresa é 404', async () => {
    const { useCase } = build(null)
    await expect(
      useCase.execute({
        addressText: 'Rua A, 1',
        context: CONTEXT,
        occurrenceId: OCCURRENCE_ID,
        occurrenceKind: 'stop',
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  test('Evolution fora do ar vira falha com motivo fechado, sem o grupo nem o texto', async () => {
    const { useCase } = build(
      { driverPhone: null, groupJid: '120363000000000001@g.us' },
      new ContractorReplyWhatsAppSendError('disconnected'),
    )
    await expect(
      useCase.execute({
        addressText: 'Rua A, 1',
        context: CONTEXT,
        occurrenceId: OCCURRENCE_ID,
        occurrenceKind: 'document',
      }),
    ).rejects.toMatchObject({
      code: 'DRIVER_ADDRESS_WHATSAPP_FAILED',
      extraBody: { reason: 'disconnected' },
      status: 409,
    })
  })
})

describe('rota do endereço ao motorista', () => {
  const routes = readFileSync(
    new URL('../../src/trips/presentation/occurrence-resolution.routes.ts', import.meta.url),
    'utf8',
  )

  test('é occurrences.resolve, com limite no Postgres e corpo estrito', () => {
    expect(routes).toContain("'/trip-occurrences/:kind/:id/driver-address/whatsapp-group'")
    expect(routes).toContain("scope: 'trip-occurrence-driver-address-whatsapp-group'")
    expect(routes).toContain('.strict()')
    expect(routes).not.toContain('companyId: body')
  })

  test('o leitor filtra toda consulta por company_id', () => {
    const reader = readFileSync(
      new URL(
        '../../src/trips/infrastructure/drizzle-driver-address-group.reader.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(reader.match(/companyId, input\.companyId/gu)?.length).toBeGreaterThanOrEqual(3)
    expect(reader).toContain('eq(fleetDriverWhatsappGroups.companyId, fleetDrivers.companyId)')
  })
})

describe('ponto do endereço correto (busca por CEP)', () => {
  const routes = readFileSync(
    new URL('../../src/trips/presentation/occurrence-resolution.routes.ts', import.meta.url),
    'utf8',
  )

  test('a rota é occurrences.resolve, estrita, com CEP de 8 dígitos e limite no Postgres', () => {
    expect(routes).toContain("'/trip-occurrences/driver-address/point'")
    expect(routes).toContain("scope: 'trip-occurrence-driver-address-point'")
    expect(routes).toContain('regex(/^\\d{8}$/u)')
  })

  test('devolve a coordenada em número e nada quando o geocodificador não acha', async () => {
    const { createFindDriverAddressPointUseCase } = await import(
      '../../src/trips/application/find-driver-address-point.use-case.js'
    )
    const found = createFindDriverAddressPointUseCase({
      geocoding: {
        geocode: () =>
          Promise.resolve({
            externalPlaceId: 'p',
            latitude: '-21.1775000',
            longitude: '-47.8103000',
            precision: 'rooftop',
            source: 'google',
          }),
      },
    })
    const request = {
      city: 'Ribeirão Preto',
      district: 'Centro',
      number: '120',
      postalCode: '14015000',
      state: 'SP',
      street: 'Rua A',
    }
    expect(await found.execute(request)).toEqual({
      latitude: -21.1775,
      longitude: -47.8103,
      precision: 'rooftop',
    })
    const missing = createFindDriverAddressPointUseCase({
      geocoding: { geocode: () => Promise.resolve(null) },
    })
    expect(await missing.execute(request)).toBeNull()
  })
})
