/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { buildCtePayload } from '../domain/cte-payload.builder.js'

import {
  CteIssuanceEmitterIncompleteError,
  CteIssuanceInvalidFiscalNumberError,
} from './cte-issuance-payload.error.js'
import type {
  CteIssuanceEmitter,
  CteIssuanceFiscalEnvironment,
  CteIssuancePayloadRecord,
  CteIssuancePayloadSource,
  CteIssuanceProviderConfig,
} from './cte-issuance-payload.port.js'

const EMITTER_REQUIRED_FIELDS = [
  'city',
  'cityIbgeCode',
  'cnpj',
  'district',
  'legalName',
  'number',
  'postalCode',
  'rntrc',
  'state',
  'stateRegistration',
  'street',
  'taxRegime',
] as const satisfies readonly (keyof CteIssuanceEmitter)[]

export type CteIssuanceAttemptTarget = {
  readonly attemptId: string
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly fiscalEnvironment: CteIssuanceFiscalEnvironment
  readonly fiscalNumber: string
  readonly fiscalSeries: string
}

export type AssembleCteIssuancePayloadParams = {
  readonly attempt: CteIssuanceAttemptTarget
  readonly source: CteIssuancePayloadSource
}

function assertCompleteEmitter(emitter: CteIssuanceEmitter): void {
  for (const field of EMITTER_REQUIRED_FIELDS) {
    if (emitter[field].length === 0) throw new CteIssuanceEmitterIncompleteError(field)
  }
}

function toFiscalNumber(value: string): number {
  const fiscalNumber = Number(value)
  if (!Number.isSafeInteger(fiscalNumber) || fiscalNumber <= 0) {
    throw new CteIssuanceInvalidFiscalNumberError(value)
  }
  return fiscalNumber
}

function composeProviderConfig(
  input: Readonly<{ attempt: CteIssuanceAttemptTarget; emitter: CteIssuanceEmitter }>,
): CteIssuanceProviderConfig {
  const { attempt, emitter } = input

  return {
    bairro: emitter.district,
    cep: emitter.postalCode,
    cnpj: emitter.cnpj,
    codigoMunicipio: emitter.cityIbgeCode,
    // Campo opcional do cadastro: string vazia viraria uma tag vazia no XML do emitente.
    ...(emitter.complement === '' ? {} : { complemento: emitter.complement }),
    crt: emitter.taxRegime,
    environment: attempt.fiscalEnvironment,
    inscricaoEstadual: emitter.stateRegistration,
    logradouro: emitter.street,
    model: 'cte',
    municipio: emitter.city,
    numero: emitter.number,
    numeroCte: toFiscalNumber(attempt.fiscalNumber),
    razaoSocial: emitter.legalName,
    rntrc: emitter.rntrc,
    serie: attempt.fiscalSeries,
    ...(emitter.phone === '' ? {} : { telefone: emitter.phone }),
    uf: emitter.state,
  }
}

export function assembleCteIssuancePayload(
  params: AssembleCteIssuancePayloadParams,
): CteIssuancePayloadRecord {
  const { attempt, source } = params
  assertCompleteEmitter(source.emitter)

  const payload = buildCtePayload({
    carrier: { rntrc: source.emitter.rntrc },
    charge: source.charge,
    invoices: source.invoices,
    profile: source.profile,
  })
  const providerConfig = composeProviderConfig({ attempt, emitter: source.emitter })

  return {
    attemptId: attempt.attemptId,
    batchId: attempt.batchId,
    batchItemId: attempt.batchItemId,
    companyId: attempt.companyId,
    payload,
    payloadSha256: createHash('sha256')
      .update(JSON.stringify({ payload, providerConfig }))
      .digest('hex'),
    providerConfig,
  }
}
