/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_NFSE_PROVIDER_CREDENTIALS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { NfseProviderCredentialSummary } from '../application/nfse-profile.port.js'
import type {
  ReadNfseProviderCredentialInput,
  SaveNfseProviderCredentialInput,
} from '../application/nfse-provider-credentials.use-case.js'
import { parseFiscalEnvironmentQuery, parseSaveCredentialRequest } from './nfse-profiles.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type Dependencies = {
  readonly readCredential: {
    execute(
      input: TenantInput<ReadNfseProviderCredentialInput>,
    ): Promise<NfseProviderCredentialSummary | null>
  }
  readonly saveCredential: {
    execute(
      input: TenantInput<SaveNfseProviderCredentialInput>,
    ): Promise<NfseProviderCredentialSummary>
  }
}

export function createNfseProviderCredentialRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<ReadNfseProviderCredentialInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const credential = await dependencies.readCredential.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: { data: credential === null ? null : serializeCredential(credential) },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => ({
        fiscalEnvironment: parseFiscalEnvironmentQuery(new URL(request.url)),
      }),
      pathname: API_NFSE_PROVIDER_CREDENTIALS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Omit<SaveNfseProviderCredentialInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const credential = await dependencies.saveCredential.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeCredential(credential) }, status: 200 })
      },
      method: 'PUT',
      async parse({ correlationId, request }) {
        return { correlationId, ...(await parseSaveCredentialRequest(request)) }
      },
      pathname: API_NFSE_PROVIDER_CREDENTIALS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

/**
 * A projeção é uma lista fechada de campos: o resumo vem do repositório já sem segredo, e escrever
 * os campos um a um garante que nenhum campo novo do agregado passe a vazar por espalhamento.
 */
function serializeCredential(credential: NfseProviderCredentialSummary): object {
  return {
    apiTokenConfigured: credential.apiTokenConfigured,
    callbackTokenConfigured: credential.callbackTokenConfigured,
    createdAt: credential.createdAt,
    fiscalEnvironment: credential.fiscalEnvironment,
    id: credential.id,
    municipalRegistration: credential.municipalRegistration,
    provider: credential.provider,
    status: credential.status,
    taxId: credential.taxId,
    updatedAt: credential.updatedAt,
    version: credential.version,
  }
}
