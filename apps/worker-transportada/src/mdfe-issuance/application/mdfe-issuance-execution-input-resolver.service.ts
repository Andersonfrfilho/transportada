/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { MdfeProcessingEnvelopeV1 } from '../../messaging/mdfe-processing-envelope.schema.js'
import type { MdfeFiscalConfig } from '../infrastructure/mdfe-fiscal-gateway.js'
import type { MdfeActiveCertificate } from '../infrastructure/drizzle-mdfe-certificate.repository.js'
import type { MdfeIssuancePersistedPayload } from '../infrastructure/drizzle-mdfe-issuance-payload.repository.js'

import { MdfeIssuanceFatalError } from './mdfe-issuance-worker-message-handler.service.js'

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
  numeroMdfe: z.number().int().positive(),
  razaoSocial: z.string().min(1),
  serie: z.string().min(1),
  telefone: z.string().optional(),
  uf: z.string().length(2),
})

export type MdfeCertificateSecretService = {
  decrypt(input: {
    readonly certificateId: string
    readonly companyId: string
    readonly envelope: unknown
    readonly purpose: 'mdfe'
  }): Promise<{
    readonly certificateBase64: string
    readonly password: string
  }>
}

export type MdfeIssuanceExecutionInput = {
  readonly config: MdfeFiscalConfig
  readonly manifestId: string
  readonly mdfeData: unknown
  readonly tenantId: string
}

type MdfeIssuanceExecutionInputResolverDependencies = {
  readonly certificateRepository: {
    findActiveCertificate(input: {
      readonly companyId: string
    }): Promise<MdfeActiveCertificate | null>
  }
  readonly payloadRepository: {
    findByAttempt(input: {
      readonly attemptId: string
      readonly companyId: string
    }): Promise<MdfeIssuancePersistedPayload | null>
  }
  readonly secretService: MdfeCertificateSecretService
}

export function createMdfeIssuanceExecutionInputResolver(
  input: MdfeIssuanceExecutionInputResolverDependencies,
): (params: {
  readonly envelope: MdfeProcessingEnvelopeV1
}) => Promise<MdfeIssuanceExecutionInput> {
  return async ({ envelope }) => {
    const companyId = envelope.companyId
    const persisted = await input.payloadRepository.findByAttempt({
      attemptId: envelope.payload.attemptId,
      companyId,
    })
    if (persisted === null) {
      throw new MdfeIssuanceFatalError('mdfe issuance payload not found for attempt')
    }

    const providerConfig = parseProviderConfig(persisted.providerConfig)

    return {
      config: {
        ...providerConfig,
        ...(await resolveCertificate({ companyId, dependencies: input })),
      },
      manifestId: envelope.payload.manifestId,
      mdfeData: persisted.payload,
      tenantId: companyId,
    }
  }
}

export async function resolveCertificate(input: {
  readonly companyId: string
  readonly dependencies: Pick<
    MdfeIssuanceExecutionInputResolverDependencies,
    'certificateRepository' | 'secretService'
  >
}): Promise<{ readonly certificadoBase64: string; readonly certificadoSenha: string }> {
  const certificate = await input.dependencies.certificateRepository.findActiveCertificate({
    companyId: input.companyId,
  })
  if (certificate === null) {
    throw new MdfeIssuanceFatalError('company has no active MDF-e certificate')
  }

  const secret = await input.dependencies.secretService.decrypt({
    certificateId: certificate.id,
    companyId: input.companyId,
    envelope: certificate.secretEnvelope,
    purpose: 'mdfe',
  })

  return { certificadoBase64: secret.certificateBase64, certificadoSenha: secret.password }
}

export function parseProviderConfig(
  value: unknown,
): Omit<MdfeFiscalConfig, 'certificadoBase64' | 'certificadoSenha'> {
  const parsed = providerConfigSchema.safeParse(value)
  if (!parsed.success) {
    throw new MdfeIssuanceFatalError('persisted MDF-e provider config is incomplete')
  }

  const { telefone, ...config } = parsed.data
  return { ...config, ...(telefone === undefined ? {} : { telefone }) }
}
