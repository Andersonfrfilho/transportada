/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  NfseCredentialStatus,
  NfseFiscalEnvironment,
  NfseProfileCompanyContext,
  NfseProfileUnitOfWorkPort,
  NfseProviderCredentialSummary,
} from './nfse-profile.port.js'
import type { NfseCredentialSecretService } from './nfse-credential-secret.service.js'

const CALLBACK_TOKEN_BYTES = 32
const CREDENTIAL_ACTION = { SAVED: 'nfse.provider-credential.saved' } as const
const ENTITY_TYPE = 'nfse_provider_credential'
const PROVIDER = 'notarp'

export type ReadNfseProviderCredentialInput = {
  readonly context: NfseProfileCompanyContext
  readonly fiscalEnvironment: NfseFiscalEnvironment
}

export type SaveNfseProviderCredentialInput = {
  readonly apiToken: string
  readonly context: NfseProfileCompanyContext
  readonly correlationId: string
  readonly fiscalEnvironment: NfseFiscalEnvironment
  readonly municipalRegistration: string
  readonly status: NfseCredentialStatus
  readonly taxId: string
}

export type NfseProviderCredentialsUseCase = {
  read(input: ReadNfseProviderCredentialInput): Promise<NfseProviderCredentialSummary | null>
  save(input: SaveNfseProviderCredentialInput): Promise<NfseProviderCredentialSummary>
}

export function createNfseProviderCredentialsUseCase(dependencies: {
  readonly secretService: NfseCredentialSecretService
  readonly unitOfWork: NfseProfileUnitOfWorkPort
}): NfseProviderCredentialsUseCase {
  const { secretService, unitOfWork } = dependencies

  return {
    async read(input) {
      return unitOfWork.execute(async (transaction) =>
        transaction.findCredentialSummary({
          companyId: input.context.companyId,
          fiscalEnvironment: input.fiscalEnvironment,
        }),
      )
    },

    /**
     * O token de callback é gerado aqui e rotacionado a cada gravação: quem tinha a URL antiga
     * deixa de ser atendido no mesmo instante em que a credencial muda de mãos.
     */
    async save(input) {
      const callbackToken = createCallbackToken()
      const callbackTokenSha256 = await sha256Hex(callbackToken)

      return unitOfWork.execute(async (transaction) => {
        const existing = await transaction.findCredential({
          companyId: input.context.companyId,
          fiscalEnvironment: input.fiscalEnvironment,
        })
        const credentialId = existing?.id ?? crypto.randomUUID()
        const secretEnvelope = await secretService.encrypt({
          apiToken: input.apiToken,
          callbackToken,
          companyId: input.context.companyId,
          credentialId,
        })

        const summary = await transaction.upsertCredential({
          callbackTokenSha256,
          companyId: input.context.companyId,
          credentialId,
          fiscalEnvironment: input.fiscalEnvironment,
          municipalRegistration: input.municipalRegistration,
          provider: PROVIDER,
          secretEnvelope,
          status: input.status,
          taxId: input.taxId,
        })
        await transaction.appendAudit({
          action: CREDENTIAL_ACTION.SAVED,
          after: auditSnapshot(summary),
          before: existing === null ? null : { id: existing.id, version: existing.version },
          companyId: input.context.companyId,
          correlationId: input.correlationId,
          targetId: summary.id,
          targetType: ENTITY_TYPE,
          userId: input.context.userId,
        })

        return summary
      })
    },
  }
}

/** A trilha registra que a credencial mudou — nunca o que ela passou a valer. */
function auditSnapshot(summary: NfseProviderCredentialSummary): Record<string, unknown> {
  return {
    fiscalEnvironment: summary.fiscalEnvironment,
    id: summary.id,
    municipalRegistration: summary.municipalRegistration,
    provider: summary.provider,
    status: summary.status,
    taxId: summary.taxId,
    version: summary.version,
  }
}

function createCallbackToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(CALLBACK_TOKEN_BYTES))).toString(
    'base64url',
  )
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Buffer.from(digest).toString('hex')
}
