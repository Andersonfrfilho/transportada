/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { MdfeFiscalEnvironment } from '../../database/mdfe.schema.js'
import { buildMdfePayload } from '../domain/mdfe-payload.builder.js'

import {
  MdfeIssuanceEmitterIncompleteError,
  MdfeIssuanceInvalidFiscalNumberError,
} from './mdfe-issuance-payload.error.js'
import type {
  MdfeIssuanceEmitter,
  MdfeIssuancePayloadRecord,
  MdfeIssuancePayloadSource,
  MdfeIssuanceProviderConfig,
} from './mdfe-issuance.port.js'

const EMITTER_REQUIRED_FIELDS = [
  'city',
  'cityIbgeCode',
  'cnpj',
  'district',
  'legalName',
  'number',
  'postalCode',
  'state',
  'stateRegistration',
  'street',
  'taxRegime',
] as const satisfies readonly (keyof MdfeIssuanceEmitter)[]

export type MdfeIssuanceAttemptTarget = {
  readonly attemptId: string
  readonly fiscalEnvironment: MdfeFiscalEnvironment
  readonly fiscalNumber: string
  readonly fiscalSeries: string
  readonly manifestId: string
}

export type AssembleMdfeIssuancePayloadParams = {
  readonly attempt: MdfeIssuanceAttemptTarget
  readonly source: MdfeIssuancePayloadSource
}

function assertCompleteEmitter(emitter: MdfeIssuanceEmitter): void {
  for (const field of EMITTER_REQUIRED_FIELDS) {
    if (emitter[field].length === 0) throw new MdfeIssuanceEmitterIncompleteError(field)
  }
}

function toFiscalNumber(value: string): number {
  const fiscalNumber = Number(value)
  if (!Number.isSafeInteger(fiscalNumber) || fiscalNumber <= 0) {
    throw new MdfeIssuanceInvalidFiscalNumberError(value)
  }
  return fiscalNumber
}

function composeProviderConfig(
  input: Readonly<{ attempt: MdfeIssuanceAttemptTarget; emitter: MdfeIssuanceEmitter }>,
): MdfeIssuanceProviderConfig {
  const { attempt, emitter } = input

  return {
    bairro: emitter.district,
    cep: emitter.postalCode,
    cnpj: emitter.cnpj,
    codigoMunicipio: emitter.cityIbgeCode,
    crt: emitter.taxRegime,
    environment: attempt.fiscalEnvironment,
    inscricaoEstadual: emitter.stateRegistration,
    logradouro: emitter.street,
    model: 'mdfe',
    municipio: emitter.city,
    numero: emitter.number,
    numeroMdfe: toFiscalNumber(attempt.fiscalNumber),
    razaoSocial: emitter.legalName,
    serie: attempt.fiscalSeries,
    uf: emitter.state,
  }
}

export function assembleMdfeIssuancePayload(
  params: AssembleMdfeIssuancePayloadParams,
): MdfeIssuancePayloadRecord {
  const { attempt, source } = params
  assertCompleteEmitter(source.emitter)

  const payload = buildMdfePayload({
    companyDefaults: source.companyDefaults,
    documents: source.documents,
    drivers: source.drivers,
    emitterTaxId: source.emitter.cnpj,
    loadingCities: source.loadingCities,
    manifest: source.manifest,
    vehicle: source.vehicle,
  })
  const providerConfig = composeProviderConfig({ attempt, emitter: source.emitter })

  return {
    attemptId: attempt.attemptId,
    manifestId: attempt.manifestId,
    payload,
    payloadSha256: createHash('sha256')
      .update(JSON.stringify({ payload, providerConfig }))
      .digest('hex'),
    providerConfig,
  }
}
