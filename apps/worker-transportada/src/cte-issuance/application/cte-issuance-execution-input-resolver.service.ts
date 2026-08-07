/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { CteProcessingEnvelopeV1 } from '../../messaging/cte-processing-envelope.schema.js'
import type {
  CteFiscalProviderConfig,
  CteResponsavelTecnico,
} from '../infrastructure/cte-fiscal-gateway.js'
import type { CteActiveCertificate } from '../infrastructure/drizzle-cte-certificate.repository.js'
import type { CteIssuancePersistedPayload } from '../infrastructure/drizzle-cte-issuance-payload.repository.js'

import { CteIssuanceFatalError } from './cte-issuance-worker-message-handler.service.js'

const providerConfigSchema = z.object({
  bairro: z.string(),
  cep: z.string(),
  cnpj: z.string().min(1),
  codigoMunicipio: z.string().min(1),
  // Opcionais: payload gravado antes destes campos existirem precisa continuar emitindo.
  complemento: z.string().min(1).optional(),
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
  telefone: z.string().min(1).optional(),
  uf: z.string().length(2),
})

export type CteTechnicalResponsible = CteResponsavelTecnico

export type CteIssuanceExecutionInput = {
  readonly config: CteFiscalProviderConfig
  readonly cteData: unknown
  readonly documentId: string
  readonly tenantId: string
}

export function createCteIssuanceExecutionInputResolver(input: {
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
  /** Ausente quando a instalação não declarou o responsável técnico: o grupo simplesmente não sai. */
  readonly technicalResponsible?: CteTechnicalResponsible
}): (params: { readonly envelope: CteProcessingEnvelopeV1 }) => Promise<CteIssuanceExecutionInput> {
  return async ({ envelope }) => {
    const companyId = envelope.companyId
    const persisted = await input.payloadRepository.findByAttempt({
      attemptId: envelope.payload.attemptId,
      companyId,
    })
    if (persisted === null) {
      throw new CteIssuanceFatalError('cte issuance payload not found for attempt')
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

    const { complemento, telefone, ...requiredConfig } = providerConfig

    return {
      config: {
        ...requiredConfig,
        certificadoBase64: secret.certificateBase64,
        certificadoSenha: secret.password,
        ...(complemento === undefined ? {} : { complemento }),
        ...(input.technicalResponsible === undefined
          ? {}
          : { responsavelTecnico: input.technicalResponsible }),
        ...(telefone === undefined ? {} : { telefone }),
      },
      cteData: persisted.payload,
      documentId: envelope.payload.batchItemId,
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
