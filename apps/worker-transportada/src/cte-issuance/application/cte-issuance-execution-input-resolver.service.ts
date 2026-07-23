/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteProcessingEnvelopeV1 } from '../../messaging/cte-processing-envelope.schema.js'

import type { CteIssuanceExecutionPrerequisites } from '../infrastructure/drizzle-cte-issuance-execution-input.repository.js'

export function createCteIssuanceExecutionInputResolver(input: {
  readonly repository: {
    findByCompanyId(input: {
      readonly companyId: string
    }): Promise<CteIssuanceExecutionPrerequisites>
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
}): (params: { readonly envelope: CteProcessingEnvelopeV1 }) => Promise<null> {
  return async ({ envelope }) => {
    const prerequisites = await input.repository.findByCompanyId({
      companyId: envelope.companyId,
    })
    if (prerequisites.profile === null) return null
    if (prerequisites.sequence === null) return null
    if (prerequisites.certificate === null) return null

    await input.secretService.decrypt({
      certificateId: prerequisites.certificate.id,
      companyId: envelope.companyId,
      envelope: prerequisites.certificate.secretEnvelope,
      purpose: 'cte',
    })

    // The worker still lacks persisted CT-e payload data and certificate decryption.
    return null
  }
}
