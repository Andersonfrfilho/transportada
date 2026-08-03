/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createMdfeIssuanceUseCase } from '../../src/mdfe-manifests/application/mdfe-issuance.use-case.js'
import type {
  AppendMdfeIssuanceEventInput,
  CreateMdfeIssuanceAttemptInput,
  MdfeIssuanceAttemptRecord,
  MdfeIssuancePayloadRecord,
  MdfeIssuancePayloadSource,
  MdfeIssuanceRepositoryPort,
  MdfeIssuanceState,
  MdfeIssuanceTransactionPort,
  PushMdfeIssuanceOutboxInput,
  RecordMdfeCancellationRequestInput,
  RecordMdfeClosureRequestInput,
  ReserveMdfeNumberInput,
} from '../../src/mdfe-manifests/application/mdfe-issuance.port.js'
import type { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const MANIFEST_ID = '44444444-4444-4444-8444-444444444444'
const ACCESS_KEY = '35260712345678000195580010000000011000000010'

const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID }
const CORRELATION_ID = 'correlation-1'
const IDEMPOTENCY_KEY = 'idempotency-key-1'
const NOW = new Date('2026-07-28T12:00:00.000Z')

const DRAFT_STATE: MdfeIssuanceState = {
  accessKey: null,
  authorizationProtocol: null,
  authorizedAt: null,
  fiscalEnvironment: 'homologation',
  manifestId: MANIFEST_ID,
  status: 'draft',
  version: '1',
}

const AUTHORIZED_STATE: MdfeIssuanceState = {
  ...DRAFT_STATE,
  accessKey: ACCESS_KEY,
  authorizationProtocol: '135260000000001',
  authorizedAt: '2026-07-28T09:00:00.000Z',
  status: 'authorized',
  version: '3',
}

const CLOSURE = { closureCityCode: '3550308', closureState: 'SP' } as const
const JUSTIFICATION = 'Viagem cancelada pelo embarcador'

const PAYLOAD_SOURCE: MdfeIssuancePayloadSource = {
  documents: [
    {
      accessKey: ACCESS_KEY,
      cargoValue: '1000.00',
      cargoWeight: '1500.0000',
      dischargeCityCode: '3106200',
      dischargeCityName: 'Belo Horizonte',
    },
  ],
  companyDefaults: {
    bank: { bankBranch: '1234', bankCode: '341', pixKey: '' },
    insurance: {
      insurerName: 'Seguradora Exemplo',
      insurerTaxId: '11222333000181',
      policy: '1234567890',
      responsibility: '1',
    },
  },
  drivers: [{ name: 'Joao da Silva', taxId: '12345678909' }],
  emitter: {
    city: 'Sao Paulo',
    cityIbgeCode: '3550308',
    cnpj: '12345678000195',
    district: 'Bela Vista',
    legalName: 'Transportadora Exemplo Ltda',
    number: '1000',
    postalCode: '01310100',
    state: 'SP',
    stateRegistration: '110042490114',
    street: 'Av Paulista',
    taxRegime: '3',
  },
  loadingCities: [{ code: '3550308', name: 'Sao Paulo' }],
  manifest: {
    additionalInformation: '',
    cargoProduct: 'Carga geral',
    cargoProductNcm: '22021000',
    cargoType: '05',
    cargoUnit: '01',
    cargoValue: '1000.00',
    cargoWeight: '1500.0000',
    contractorName: 'Industria Contratante',
    contractorTaxId: '11222333000181',
    destinationState: 'MG',
    dischargePostalCode: '30130010',
    emitterType: '1',
    freightValue: '750.00',
    insuranceEndorsement: '12345678901234',
    loadingPostalCode: '01310100',
    originState: 'SP',
    rntrc: '12345678',
    transporterType: '1',
    tripStartedAt: null,
  },
  vehicle: {
    bodyType: '01',
    capacityKg: 25000n,
    capacityM3: 90n,
    ownerName: '',
    ownerRntrc: '',
    ownerState: '',
    ownerTaxId: '',
    ownerTaxRegime: '',
    ownership: 'own',
    plate: 'ABC1D23',
    renavam: '12345678901',
    state: 'SP',
    tareWeightKg: 9000n,
    wheelType: '01',
  },
}

type FixtureParams = {
  readonly payloadSource?: MdfeIssuancePayloadSource | null
  readonly pendingAttempt?: MdfeIssuanceAttemptRecord
  readonly state?: MdfeIssuanceState | null
}

const createFixture = (params: FixtureParams = {}) => {
  const attemptsByKey = new Map<string, MdfeIssuanceAttemptRecord>()
  const cancellations: RecordMdfeCancellationRequestInput[] = []
  const closures: RecordMdfeClosureRequestInput[] = []
  const createCalls: CreateMdfeIssuanceAttemptInput[] = []
  const events: AppendMdfeIssuanceEventInput[] = []
  const issuingCalls: object[] = []
  const outbox: PushMdfeIssuanceOutboxInput[] = []
  const payloads: MdfeIssuancePayloadRecord[] = []
  const reservations: ReserveMdfeNumberInput[] = []
  const scopes: object[] = []
  let currentState = params.state === undefined ? DRAFT_STATE : params.state

  const transaction: MdfeIssuanceTransactionPort = {
    async appendEvent(input) {
      events.push(input)
    },
    async createAttempt(input) {
      createCalls.push(input)
      const attempt: MdfeIssuanceAttemptRecord = {
        attemptId: `attempt-${createCalls.length}`,
        attemptKind: input.attemptKind,
        attemptNumber: createCalls.length,
        createdAt: NOW.toISOString(),
        manifestId: input.manifestId,
        requestFingerprint: input.requestFingerprint,
        status: 'pending',
      }
      attemptsByKey.set(input.idempotencyKey, attempt)
      return attempt
    },
    async findAttemptByIdempotencyKey(input) {
      return attemptsByKey.get(input.idempotencyKey) ?? null
    },
    async findIssuanceState() {
      return currentState
    },
    async findPayloadSource() {
      return params.payloadSource === undefined ? PAYLOAD_SOURCE : params.payloadSource
    },
    async findPendingAttempt(input) {
      if (params.pendingAttempt?.attemptKind !== input.attemptKind) return null
      return params.pendingAttempt
    },
    async markManifestIssuing(input) {
      issuingCalls.push(input)
      if (currentState !== null) currentState = { ...currentState, status: 'issuing' }
    },
    async pushOutbox(input) {
      outbox.push(input)
    },
    async recordCancellationRequest(input) {
      cancellations.push(input)
    },
    async recordClosureRequest(input) {
      closures.push(input)
    },
    async reserveNumber(input) {
      reservations.push(input)
      return { number: '17', reservationId: 'reservation-1', series: '1' }
    },
    async savePayload(input) {
      payloads.push(input)
    },
  }

  const repository: MdfeIssuanceRepositoryPort = {
    async transaction(scope, handler) {
      scopes.push(scope)
      return handler(transaction)
    },
  }

  return {
    cancellations,
    closures,
    createCalls,
    events,
    issuingCalls,
    outbox,
    payloads,
    reservations,
    scopes,
    useCase: createMdfeIssuanceUseCase({ now: () => NOW, repository }),
  }
}

const refusal = async (operation: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await operation()
  } catch (error) {
    return error as ApiError
  }
  throw new Error('EXPECTED_REFUSAL')
}

const issueInput = () => ({
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  manifestId: MANIFEST_ID,
})

const closeInput = () => ({ ...issueInput(), ...CLOSURE })

const cancelInput = (justification: string = JUSTIFICATION) => ({
  ...issueInput(),
  justification,
})

describe('issue MDF-e manifest', () => {
  test('reserves the number, records the attempt and schedules the outbox event', async () => {
    const fixture = createFixture()

    const summary = await fixture.useCase.issue(issueInput())

    expect(summary).toEqual({
      attemptId: 'attempt-1',
      attemptKind: 'issue',
      manifestId: MANIFEST_ID,
      manifestStatus: 'issuing',
      replayed: false,
      requestedAt: NOW.toISOString(),
    })
    expect(fixture.scopes).toEqual([{ companyId: COMPANY_ID }])
    expect(fixture.reservations).toEqual([
      { environment: 'homologation', reservationKey: `mdfe:${MANIFEST_ID}:1` },
    ])
    expect(fixture.createCalls[0]).toMatchObject({
      attemptKind: 'issue',
      correlationId: CORRELATION_ID,
      fiscalEnvironment: 'homologation',
      fiscalNumber: '17',
      fiscalSeries: '1',
      idempotencyKey: IDEMPOTENCY_KEY,
      manifestId: MANIFEST_ID,
      reservationId: 'reservation-1',
    })
    expect(fixture.issuingCalls).toEqual([
      { fiscalNumber: '17', fiscalSeries: '1', manifestId: MANIFEST_ID },
    ])
    expect(fixture.events).toEqual([
      {
        attemptId: 'attempt-1',
        eventName: 'issue_requested',
        manifestId: MANIFEST_ID,
        occurredAt: NOW.toISOString(),
        payload: { attemptKind: 'issue', fiscalEnvironment: 'homologation' },
      },
    ])
    expect(fixture.outbox).toEqual([
      {
        actorUserId: USER_ID,
        attemptFingerprint: fixture.createCalls[0]?.requestFingerprint ?? '',
        attemptId: 'attempt-1',
        attemptKind: 'issue',
        correlationId: CORRELATION_ID,
        eventType: 'transportada.mdfe.manifest.issue.requested',
        manifestId: MANIFEST_ID,
        payload: { attemptKind: 'issue', manifestId: MANIFEST_ID },
      },
    ])
  })

  test('replays the same idempotency key without creating a second attempt', async () => {
    const fixture = createFixture()

    const first = await fixture.useCase.issue(issueInput())
    const replay = await fixture.useCase.issue(issueInput())

    expect(replay).toEqual({ ...first, replayed: true })
    expect(fixture.createCalls).toHaveLength(1)
    expect(fixture.outbox).toHaveLength(1)
    expect(fixture.reservations).toHaveLength(1)
  })

  test('refuses to reuse the idempotency key for a different request', async () => {
    const fixture = createFixture({ state: AUTHORIZED_STATE })

    await fixture.useCase.cancel(cancelInput())
    const error = await refusal(() =>
      fixture.useCase.cancel(cancelInput('Outra justificativa do embarcador')),
    )

    expect(error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    expect(error.status).toBe(409)
    expect(fixture.createCalls).toHaveLength(1)
  })

  test('refuses to transmit a manifest that is not issuable', async () => {
    const inFlight = createFixture({ state: { ...DRAFT_STATE, status: 'issuing' } })
    const busy = await refusal(() => inFlight.useCase.issue(issueInput()))
    expect(busy.code).toBe('MDFE_MANIFEST_IN_FLIGHT')
    expect(busy.status).toBe(409)
    expect(inFlight.reservations).toEqual([])

    const closed = createFixture({ state: { ...AUTHORIZED_STATE, status: 'closed' } })
    const refused = await refusal(() => closed.useCase.issue(issueInput()))
    expect(refused.code).toBe('MDFE_MANIFEST_NOT_ISSUABLE')
    expect(closed.createCalls).toEqual([])
  })

  // O worker não remonta o MdfeData: transmitir depois de o manifesto ser editado mudaria o XML
  test('freezes the payload and the provider config of the attempt before scheduling it', async () => {
    const fixture = createFixture()

    await fixture.useCase.issue(issueInput())

    expect(fixture.payloads).toHaveLength(1)
    const record = fixture.payloads[0]
    expect(record?.attemptId).toBe('attempt-1')
    expect(record?.manifestId).toBe(MANIFEST_ID)
    expect(record?.payloadSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(record?.providerConfig).toEqual({
      bairro: 'Bela Vista',
      cep: '01310100',
      cnpj: '12345678000195',
      codigoMunicipio: '3550308',
      crt: '3',
      environment: 'homologation',
      inscricaoEstadual: '110042490114',
      logradouro: 'Av Paulista',
      model: 'mdfe',
      municipio: 'Sao Paulo',
      numero: '1000',
      numeroMdfe: 17,
      razaoSocial: 'Transportadora Exemplo Ltda',
      serie: '1',
      uf: 'SP',
    })
    expect(record?.payload).toMatchObject({
      municipiosCarregamento: [{ codigo: '3550308', nome: 'Sao Paulo' }],
      municipiosDescarga: [{ chavesCte: [ACCESS_KEY], codigo: '3106200', nome: 'Belo Horizonte' }],
      rntrc: '12345678',
      ufFim: 'MG',
      ufInicio: 'SP',
      veiculoTracao: {
        condutores: [{ cpf: '12345678909', nome: 'Joao da Silva' }],
        placa: 'ABC1D23',
      },
    })
  })

  test('refuses to transmit a manifest whose payload source no longer resolves', async () => {
    const fixture = createFixture({ payloadSource: null })

    const error = await refusal(() => fixture.useCase.issue(issueInput()))

    expect(error.code).toBe('MDFE_ISSUANCE_PAYLOAD_SOURCE_MISSING')
    expect(error.status).toBe(422)
    expect(fixture.outbox).toEqual([])
  })

  test('refuses to transmit while the company fiscal profile is incomplete', async () => {
    const fixture = createFixture({
      payloadSource: { ...PAYLOAD_SOURCE, emitter: { ...PAYLOAD_SOURCE.emitter, cnpj: '' } },
    })

    const error = await refusal(() => fixture.useCase.issue(issueInput()))

    expect(error.code).toBe('MDFE_ISSUANCE_EMITTER_INCOMPLETE')
    expect(error.status).toBe(422)
    expect(fixture.payloads).toEqual([])
    expect(fixture.outbox).toEqual([])
  })

  test('reports a manifest of another company as not found', async () => {
    const fixture = createFixture({ state: null })

    const error = await refusal(() => fixture.useCase.issue(issueInput()))

    expect(error.code).toBe('MDFE_MANIFEST_NOT_FOUND')
    expect(error.status).toBe(404)
    expect(fixture.createCalls).toEqual([])
  })
})

describe('close MDF-e manifest', () => {
  test('records the closure municipality and schedules the event without a new number', async () => {
    const fixture = createFixture({ state: AUTHORIZED_STATE })

    const summary = await fixture.useCase.close(closeInput())

    expect(summary).toEqual({
      attemptId: 'attempt-1',
      attemptKind: 'close',
      manifestId: MANIFEST_ID,
      manifestStatus: 'authorized',
      replayed: false,
      requestedAt: NOW.toISOString(),
    })
    expect(fixture.reservations).toEqual([])
    expect(fixture.issuingCalls).toEqual([])
    expect(fixture.payloads).toEqual([])
    expect(fixture.closures).toEqual([{ ...CLOSURE, manifestId: MANIFEST_ID }])
    expect(fixture.createCalls[0]).toMatchObject({ attemptKind: 'close', manifestId: MANIFEST_ID })
    expect(fixture.createCalls[0]?.reservationId).toBeUndefined()
    expect(fixture.events[0]?.eventName).toBe('close_requested')
    expect(fixture.outbox[0]?.eventType).toBe('transportada.mdfe.manifest.close.requested')
  })

  test('refuses to close a manifest that SEFAZ never authorized', async () => {
    const fixture = createFixture()

    const error = await refusal(() => fixture.useCase.close(closeInput()))

    expect(error.code).toBe('MDFE_MANIFEST_NOT_AUTHORIZED')
    expect(error.status).toBe(409)
    expect(fixture.closures).toEqual([])
  })

  test('refuses to close twice while the first request is in flight', async () => {
    const fixture = createFixture({
      pendingAttempt: {
        attemptId: 'attempt-0',
        attemptKind: 'close',
        attemptNumber: 1,
        createdAt: NOW.toISOString(),
        manifestId: MANIFEST_ID,
        requestFingerprint: 'other-fingerprint',
        status: 'pending',
      },
      state: AUTHORIZED_STATE,
    })

    const error = await refusal(() => fixture.useCase.close(closeInput()))

    expect(error.code).toBe('MDFE_MANIFEST_IN_FLIGHT')
    expect(fixture.createCalls).toEqual([])
  })

  test('refuses to close a manifest that is already closed', async () => {
    const fixture = createFixture({ state: { ...AUTHORIZED_STATE, status: 'closed' } })

    const error = await refusal(() => fixture.useCase.close(closeInput()))

    expect(error.code).toBe('MDFE_MANIFEST_ALREADY_CLOSED')
  })
})

describe('cancel MDF-e manifest', () => {
  test('records the justification and schedules the cancellation event', async () => {
    const fixture = createFixture({ state: AUTHORIZED_STATE })

    const summary = await fixture.useCase.cancel(cancelInput())

    expect(summary.attemptKind).toBe('cancel')
    expect(summary.manifestStatus).toBe('authorized')
    expect(fixture.reservations).toEqual([])
    expect(fixture.payloads).toEqual([])
    expect(fixture.cancellations).toEqual([
      { justification: JUSTIFICATION, manifestId: MANIFEST_ID, requestedAt: NOW.toISOString() },
    ])
    expect(fixture.events[0]?.eventName).toBe('cancel_requested')
    expect(fixture.outbox[0]?.eventType).toBe('transportada.mdfe.manifest.cancel.requested')
  })

  test('refuses a justification shorter than SEFAZ accepts', async () => {
    const fixture = createFixture({ state: AUTHORIZED_STATE })

    const error = await refusal(() => fixture.useCase.cancel(cancelInput('erro')))

    expect(error.code).toBe('MDFE_MANIFEST_CANCELLATION_JUSTIFICATION_INVALID')
    expect(error.status).toBe(422)
    expect(fixture.cancellations).toEqual([])
  })

  test('refuses to cancel after the authorization window expired', async () => {
    const fixture = createFixture({
      state: { ...AUTHORIZED_STATE, authorizedAt: '2026-07-26T09:00:00.000Z' },
    })

    const error = await refusal(() => fixture.useCase.cancel(cancelInput()))

    expect(error.code).toBe('MDFE_MANIFEST_CANCELLATION_WINDOW_EXPIRED')
    expect(error.status).toBe(422)
    expect(fixture.createCalls).toEqual([])
  })

  test('refuses to cancel a manifest that is already closed', async () => {
    const fixture = createFixture({ state: { ...AUTHORIZED_STATE, status: 'closed' } })

    const error = await refusal(() => fixture.useCase.cancel(cancelInput()))

    expect(error.code).toBe('MDFE_MANIFEST_ALREADY_CLOSED')
    expect(fixture.cancellations).toEqual([])
  })
})
