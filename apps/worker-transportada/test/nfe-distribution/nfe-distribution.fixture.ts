/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DfeItem,
  NfeDistribuicaoConfig,
  NfeDistribuicaoResult,
} from '@adatechnology/fiscal-provider'

import type { NfeProcessingEnvelopeV1 } from '../../src/messaging/nfe-processing-envelope.schema.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

export type DistributionCursorRecord = {
  readonly companyId: string
  readonly environment: 'homologation' | 'production'
  readonly leaseExpiresAt: Date | null
  readonly leaseOwner: string | null
  readonly maxNsu: string
  readonly nextAllowedAt: Date | null
  readonly ultNsu: string
  readonly version: bigint
}

export type NfeDistributionEnvironment = 'homologation' | 'production'

export type NfeDistributionRuntimeConfig = Omit<NfeDistribuicaoConfig, 'environment'> & {
  readonly environment: NfeDistributionEnvironment
}

export type NfeDistributionGateway = {
  consultarDFe(input: {
    readonly config: NfeDistributionRuntimeConfig
    readonly ultNSU: string
  }): Promise<NfeDistribuicaoResult>
}

export type NfeDistributionGatewayFactory = {
  create(input: { readonly config: NfeDistributionRuntimeConfig }): NfeDistributionGateway
}

export type NfeDistributionGatewayDependencies = {
  readonly createProvider: (input: {
    readonly config: NfeDistributionRuntimeConfig
  }) => NfeDistributionGateway
}

type CreateNfeDistributionGatewayFactory = (
  input: NfeDistributionGatewayDependencies,
) => NfeDistributionGatewayFactory

export type NfeDistributionCursorRepositoryPort = {
  acquireLease(input: {
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly leaseMs: number
    readonly now: Date
    readonly owner: string
  }): Promise<DistributionCursorRecord | null>
  releaseLease(input: {
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly owner: string
  }): Promise<void>
  saveCursor(input: {
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly maxNsu: string
    readonly nextAllowedAt: Date | null
    readonly owner: string
    readonly ultNsu: string
  }): Promise<void>
}

export type NfeDistributionProfilePort = {
  loadConfig(input: { readonly companyId: string }): Promise<NfeDistributionRuntimeConfig>
}

export type NfeDistributionRepositoryPort = {
  finalizeImport(input: {
    readonly companyId: string
    readonly duplicatedCount: number
    readonly importId: string
    readonly importedCount: number
    readonly processedCount: number
    readonly receivedCount: number
    readonly status: 'completed'
  }): Promise<void>
  persistPage(input: {
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly importId: string
    readonly items: readonly DfeItem[]
    readonly maxNsu: string
    readonly ultNsu: string
  }): Promise<{
    readonly acceptedCount: number
    readonly duplicatedCount: number
  }>
}

export type NfeDistributionClock = {
  now(): Date
}

export type NfeDistributionConsumer = {
  execute(input: { readonly envelope: NfeProcessingEnvelopeV1 }): Promise<{
    readonly duplicatedCount: number
    readonly fetchedCount: number
    readonly persistedCount: number
    readonly status: 'completed' | 'rate-limited'
    readonly ultNsu: string
  }>
}

type CreateNfeDistributionConsumer = (input: {
  readonly clock: NfeDistributionClock
  readonly cursorRepository: NfeDistributionCursorRepositoryPort
  readonly gatewayFactory: NfeDistributionGatewayFactory
  readonly leaseMs: number
  readonly logger: WorkerLogger
  readonly profile: NfeDistributionProfilePort
  readonly repository: NfeDistributionRepositoryPort
}) => NfeDistributionConsumer

export const SILENT_LOGGER: WorkerLogger = {
  error() {},
  info() {},
  warn() {},
}

export async function createNfeDistributionGatewayFixture(
  input: NfeDistributionGatewayDependencies,
): Promise<NfeDistributionGatewayFactory> {
  const module = (await import(
    '../../src/nfe-distribution/infrastructure/nfe-distribution-gateway.js'
  )) as {
    readonly createNfeDistributionGatewayFactory: CreateNfeDistributionGatewayFactory
  }

  return module.createNfeDistributionGatewayFactory(input)
}

export async function createNfeDistributionConsumerFixture(input: {
  readonly clock: NfeDistributionClock
  readonly cursorRepository: NfeDistributionCursorRepositoryPort
  readonly gatewayFactory: NfeDistributionGatewayFactory
  readonly leaseMs: number
  readonly logger: WorkerLogger
  readonly profile: NfeDistributionProfilePort
  readonly repository: NfeDistributionRepositoryPort
}): Promise<NfeDistributionConsumer> {
  const module = (await import(
    '../../src/nfe-distribution/application/nfe-distribution-consumer.service.js'
  )) as {
    readonly createNfeDistributionConsumer: CreateNfeDistributionConsumer
  }

  return module.createNfeDistributionConsumer(input)
}

export function createDistributionItem(input: {
  readonly accessKey: string
  readonly nsu: string
  readonly schema?: string
}): DfeItem {
  return {
    chaveNfe: input.accessKey,
    dataEmissao: '2026-07-22T20:00:00.000Z',
    emitenteCnpj: '30290856000160',
    emitenteNome: 'Emitente sintético',
    mod: '55',
    nsu: input.nsu,
    schema: input.schema ?? 'procNFe',
    situacao: '1',
    valorTotal: 10,
    xmlComprimido: 'H4sIAAAAAAAA',
  }
}

export const DISTRIBUTION_ENVELOPE: NfeProcessingEnvelopeV1 = {
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  correlationId: 'contract-test-correlation',
  eventId: '7c446555-c67b-4545-a060-16d55278665e',
  occurredAt: '2026-07-22T23:00:00.000Z',
  payload: {
    importId: '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c',
  },
  type: 'transportada.nfe.distribution.requested',
  version: 1,
}

export const DISTRIBUTION_CONFIG: NfeDistributionRuntimeConfig = {
  certificadoBase64: 'BASE64CERT',
  certificadoSenha: 'secret-password',
  cnpj: '12345678000190',
  environment: 'homologation',
  model: 'nfe-distribuicao',
  uf: 'SP',
}
