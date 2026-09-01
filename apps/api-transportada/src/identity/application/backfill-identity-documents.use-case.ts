/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { IDENTITY_DOCUMENT_BACKFILL_JOB } from '../../shared/job-catalog.constant.js'
import { IDENTITY_USER_ATTRIBUTE } from '../domain/identity-attribute.constant.js'
import type { IdentityAccessGatewayPort } from '../infrastructure/keycloak-admin.gateway.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

type BackfillIdentityDocumentsDependencies = {
  readonly gateway: Pick<IdentityAccessGatewayPort, 'updateAttributes'>
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'listForReconciliation' | 'recordManualJobRun'
  >
}

export type BackfillIdentityDocumentsInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly correlationId: string
}

export type BackfillIdentityDocumentsResult = {
  /** Sem vínculo com o provedor ou sem documento cadastrado: não há o que escrever. */
  readonly skipped: number
  readonly written: number
}

export type BackfillIdentityDocumentsUseCase = {
  execute(input: BackfillIdentityDocumentsInput): Promise<BackfillIdentityDocumentsResult>
}

/**
 * A mesma passada da rotina agendada, no recorte de uma empresa e no tempo do operador. Aqui o
 * realm não precisa ser lido: os `subject` já estão na base, então a escrita vai direto em quem tem
 * documento cadastrado — o Keycloak aceita o mesmo valor de novo sem reclamar, e repetir converge.
 */
export function createBackfillIdentityDocumentsUseCase({
  gateway,
  repository,
}: BackfillIdentityDocumentsDependencies): BackfillIdentityDocumentsUseCase {
  return {
    async execute({ context, correlationId }) {
      const records = await repository.listForReconciliation({ companyId: context.companyId })
      let written = 0
      let skipped = 0

      for (const record of records) {
        if (record.subject === undefined || record.taxId === '') {
          skipped += 1
          continue
        }
        /**
         * O Admin API substitui o conjunto inteiro: sem o `company_id` junto, o backfill apagaria a
         * empresa do usuário e o login seguinte entraria sem ela.
         */
        await gateway.updateAttributes({
          attributes: {
            [IDENTITY_USER_ATTRIBUTE.COMPANY_ID]: context.companyId,
            [IDENTITY_USER_ATTRIBUTE.TAX_ID]: record.taxId,
          },
          userId: record.subject,
        })
        written += 1
      }

      const counters = { skipped, written }
      /**
       * A execução manual entra na mesma trilha da agendada, com quem pediu: passada que muda dado
       * em provedor externo e não deixa rastro é passada que ninguém consegue auditar depois.
       */
      await repository.recordManualJobRun({
        companyId: context.companyId,
        correlationId,
        counters,
        job: IDENTITY_DOCUMENT_BACKFILL_JOB,
        outcome: 'succeeded',
        requestedBy: context.userId,
      })

      return counters
    },
  }
}
