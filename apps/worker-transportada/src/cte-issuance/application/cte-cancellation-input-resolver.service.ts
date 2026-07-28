/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { CteProcessingEnvelopeV1 } from '../../messaging/cte-processing-envelope.schema.js'
import type { CteFiscalProviderConfig } from '../infrastructure/cte-fiscal-gateway.js'
import type { CteActiveCertificate } from '../infrastructure/drizzle-cte-certificate.repository.js'
import type { CteCancellationTarget } from '../infrastructure/drizzle-cte-cancellation-target.repository.js'
import type { CteIssuancePersistedPayload } from '../infrastructure/drizzle-cte-issuance-payload.repository.js'

import { CteIssuanceFatalError } from './cte-issuance-worker-message-handler.service.js'

const MINIMUM_JUSTIFICATION_LENGTH = 15

const providerConfigSchema = z.object({
  bairro: z.string(),
  cep: z.string(),
  cnpj: z.string().min(1),
  codigoMunicipio: z.string().min(1),
  crt: z.string().min(1),
  environment: z.enum(['homologation', 'production']),
  inscricaoEstadual: z.string(),
  logradouro: z.string(),
  municipio: z.string().min(1),
  numero: z.string(),
  numeroCte: z.number().int().positive(),
  razaoSocial: z.string().min(1),
  rntrc: z.string(),
  serie: z.string().min(1),
  uf: z.string().length(2),
})

export type CteCancellationExecutionInput = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly config: CteFiscalProviderConfig
  readonly documentId: string
  readonly justification: string
  readonly tenantId: string
}

export function createCteCancellationInputResolver(input: {
  readonly certificateRepository: {
    findActiveCertificate(input: {
      readonly companyId: string
    }): Promise<CteActiveCertificate | null>
  }
  readonly payloadRepository: {
    findByAttempt(input: {
      readonly attemptId: string
      readonly companyId: string
    }): Promise<CteIssuancePersistedPayload | null>
  }
  readonly secretService: {
    decrypt(input: {
      readonly certificateId: string
      readonly companyId: string
      readonly envelope: unknown
      readonly purpose: 'cte'
    }): Promise<{
      readonly certificateBase64: string
      readonly password: string
    }>
  }
  readonly targetRepository: {
    findAuthorizedDocument(input: {
      readonly batchItemId: string
      readonly companyId: string
    }): Promise<CteCancellationTarget | null>
  }
}): (params: {
  readonly envelope: CteProcessingEnvelopeV1
}) => Promise<CteCancellationExecutionInput | null> {
  return async ({ envelope }) => {
    const companyId = envelope.companyId
    const target = await input.targetRepository.findAuthorizedDocument({
      batchItemId: envelope.payload.batchItemId,
      companyId,
    })
    if (target === null) return null

    const justification = target.justification ?? ''
    if (justification.length < MINIMUM_JUSTIFICATION_LENGTH) {
      throw new CteIssuanceFatalError('cte cancellation justification is shorter than SEFAZ allows')
    }

    // A tentativa de cancelamento não persiste payload: a config do provedor vem da emissão.
    const persisted = await input.payloadRepository.findByAttempt({
      attemptId: target.issuanceAttemptId,
      companyId,
    })
    if (persisted === null) {
      throw new CteIssuanceFatalError('cte issuance payload not found for authorized attempt')
    }

    const providerConfig = parseProviderConfig(persisted.providerConfig)
    const certificate = await input.certificateRepository.findActiveCertificate({ companyId })
    if (certificate === null) {
      throw new CteIssuanceFatalError('company has no active CT-e certificate')
    }

    const secret = await input.secretService.decrypt({
      certificateId: certificate.id,
      companyId,
      envelope: certificate.secretEnvelope,
      purpose: 'cte',
    })

    return {
      accessKey: target.accessKey,
      authorizationProtocol: target.authorizationProtocol,
      config: {
        ...providerConfig,
        certificadoBase64: secret.certificateBase64,
        certificadoSenha: secret.password,
      },
      documentId: envelope.payload.batchItemId,
      justification,
      tenantId: companyId,
    }
  }
}

function parseProviderConfig(value: unknown): z.infer<typeof providerConfigSchema> {
  const parsed = providerConfigSchema.safeParse(value)
  if (!parsed.success) {
    throw new CteIssuanceFatalError('persisted CT-e provider config is incomplete')
  }
  return parsed.data
}
