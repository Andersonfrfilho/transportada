/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteData } from '@adatechnology/fiscal-provider'

import type {
  CtePayloadCharge,
  CtePayloadInvoice,
  CtePayloadProfile,
} from '../domain/cte-payload.types.js'

export type CteIssuanceFiscalEnvironment = 'homologation' | 'production'

export type CteIssuanceEmitter = {
  readonly city: string
  readonly cityIbgeCode: string
  readonly cnpj: string
  readonly complement: string
  readonly district: string
  readonly legalName: string
  readonly number: string
  readonly phone: string
  readonly postalCode: string
  readonly rntrc: string
  readonly state: string
  readonly stateRegistration: string
  readonly street: string
  readonly taxRegime: string
  readonly tradeName: string
}

export type CteIssuancePayloadSource = {
  readonly charge: CtePayloadCharge
  readonly emitter: CteIssuanceEmitter
  readonly invoices: readonly CtePayloadInvoice[]
  readonly profile: CtePayloadProfile
}

export type CteIssuanceProviderConfig = {
  readonly bairro: string
  readonly cep: string
  readonly cnpj: string
  readonly codigoMunicipio: string
  readonly complemento?: string
  readonly crt: string
  readonly environment: CteIssuanceFiscalEnvironment
  readonly inscricaoEstadual: string
  readonly logradouro: string
  readonly model: 'cte'
  readonly municipio: string
  readonly nomeFantasia?: string
  readonly numero: string
  readonly numeroCte: number
  readonly razaoSocial: string
  readonly rntrc: string
  readonly serie: string
  readonly telefone?: string
  readonly uf: string
}

export type CteIssuancePayloadRecord = {
  readonly attemptId: string
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly payload: CteData
  readonly payloadSha256: string
  readonly providerConfig: CteIssuanceProviderConfig
}

export type CteIssuancePayloadSourceQuery = {
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
}

export type CteIssuancePayloadPort = {
  readonly findPayloadSource: (
    input: CteIssuancePayloadSourceQuery,
  ) => Promise<CteIssuancePayloadSource | null>
  readonly savePayload: (input: CteIssuancePayloadRecord) => Promise<void>
}
