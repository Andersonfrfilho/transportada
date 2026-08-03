/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  MdfeAttemptKind,
  MdfeFiscalEnvironment,
  MdfeIssuanceEvent,
  MdfeIssuanceOutboxEventType,
  MdfeIssuanceStatus,
  MdfeManifestStatus,
} from '../../database/mdfe.schema.js'
import type { BuildMdfePayloadParams, MdfeManifestPayload } from '../domain/mdfe-payload.types.js'

export type MdfeIssuanceState = {
  readonly accessKey: string | null
  readonly authorizationProtocol: string | null
  readonly authorizedAt: string | null
  readonly fiscalEnvironment: MdfeFiscalEnvironment
  readonly manifestId: string
  readonly status: MdfeManifestStatus
  readonly version: string
}

export type MdfeIssuanceAttemptRecord = {
  readonly attemptId: string
  readonly attemptKind: MdfeAttemptKind
  readonly attemptNumber: number
  readonly createdAt: string
  readonly manifestId: string
  readonly requestFingerprint: string
  readonly status: MdfeIssuanceStatus
}

export type MdfeNumberReservation = {
  readonly number: string
  readonly reservationId: string
  readonly series: string
}

export type CreateMdfeIssuanceAttemptInput = {
  readonly attemptKind: MdfeAttemptKind
  readonly correlationId: string
  readonly fiscalEnvironment: MdfeFiscalEnvironment
  readonly fiscalNumber?: string
  readonly fiscalSeries?: string
  readonly idempotencyKey: string
  readonly manifestId: string
  readonly requestFingerprint: string
  readonly reservationId?: string
}

export type AppendMdfeIssuanceEventInput = {
  readonly attemptId: string
  readonly eventName: MdfeIssuanceEvent
  readonly manifestId: string
  readonly occurredAt: string
  readonly payload: Readonly<Record<string, unknown>>
}

export type PushMdfeIssuanceOutboxInput = {
  readonly actorUserId: string
  readonly attemptFingerprint: string
  readonly attemptId: string
  readonly attemptKind: MdfeAttemptKind
  readonly correlationId: string
  readonly eventType: MdfeIssuanceOutboxEventType
  readonly manifestId: string
  readonly payload: Readonly<Record<string, unknown>>
}

export type RecordMdfeClosureRequestInput = {
  readonly closureCityCode: string
  readonly closureState: string
  readonly manifestId: string
}

export type RecordMdfeCancellationRequestInput = {
  readonly justification: string
  readonly manifestId: string
  readonly requestedAt: string
}

export type ReserveMdfeNumberInput = {
  readonly environment: MdfeFiscalEnvironment
  readonly reservationKey: string
}

/** Emitente do MDF-e é sempre a transportadora — o RNTRC viaja no manifesto, não na config. */
export type MdfeIssuanceEmitter = {
  readonly city: string
  readonly cityIbgeCode: string
  readonly cnpj: string
  readonly district: string
  readonly legalName: string
  readonly number: string
  readonly postalCode: string
  readonly state: string
  readonly stateRegistration: string
  readonly street: string
  readonly taxRegime: string
}

/** O CNPJ do emitente vem de `emitter` — repeti-lo na fonte abriria espaço para divergirem. */
export type MdfeIssuancePayloadSource = Omit<BuildMdfePayloadParams, 'emitterTaxId'> & {
  readonly emitter: MdfeIssuanceEmitter
}

/** Espelho de `MdfeConfig` sem o certificado — o worker decifra e acrescenta na transmissão. */
export type MdfeIssuanceProviderConfig = {
  readonly bairro: string
  readonly cep: string
  readonly cnpj: string
  readonly codigoMunicipio: string
  readonly crt: string
  readonly environment: MdfeFiscalEnvironment
  readonly inscricaoEstadual: string
  readonly logradouro: string
  readonly model: 'mdfe'
  readonly municipio: string
  readonly numero: string
  readonly numeroMdfe: number
  readonly razaoSocial: string
  readonly serie: string
  readonly uf: string
}

export type MdfeIssuancePayloadRecord = {
  readonly attemptId: string
  readonly manifestId: string
  readonly payload: MdfeManifestPayload
  readonly payloadSha256: string
  readonly providerConfig: MdfeIssuanceProviderConfig
}

/** Toda operação já nasce dentro do escopo de uma empresa — nenhuma recebe `companyId` do cliente. */
export type MdfeIssuanceTransactionPort = {
  appendEvent(input: AppendMdfeIssuanceEventInput): Promise<void>
  createAttempt(input: CreateMdfeIssuanceAttemptInput): Promise<MdfeIssuanceAttemptRecord>
  findAttemptByIdempotencyKey(input: {
    readonly idempotencyKey: string
  }): Promise<MdfeIssuanceAttemptRecord | null>
  findIssuanceState(input: { readonly manifestId: string }): Promise<MdfeIssuanceState | null>
  findPayloadSource(input: {
    readonly manifestId: string
  }): Promise<MdfeIssuancePayloadSource | null>
  findPendingAttempt(input: {
    readonly attemptKind: MdfeAttemptKind
    readonly manifestId: string
  }): Promise<MdfeIssuanceAttemptRecord | null>
  markManifestIssuing(input: {
    readonly fiscalNumber: string
    readonly fiscalSeries: string
    readonly manifestId: string
  }): Promise<void>
  pushOutbox(input: PushMdfeIssuanceOutboxInput): Promise<void>
  recordCancellationRequest(input: RecordMdfeCancellationRequestInput): Promise<void>
  recordClosureRequest(input: RecordMdfeClosureRequestInput): Promise<void>
  reserveNumber(input: ReserveMdfeNumberInput): Promise<MdfeNumberReservation>
  savePayload(input: MdfeIssuancePayloadRecord): Promise<void>
}

export type MdfeIssuanceRepositoryPort = {
  transaction<TResult>(
    scope: { readonly companyId: string },
    handler: (transaction: MdfeIssuanceTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
