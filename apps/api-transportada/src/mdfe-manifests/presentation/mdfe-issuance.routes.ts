/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_MDFE_MANIFESTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { MdfeIssuanceSummary } from '../application/mdfe-issuance-attempt.service.js'
import type {
  CancelMdfeManifestInput,
  CloseMdfeManifestInput,
  MdfeIssuanceRequest,
} from '../application/mdfe-issuance.use-case.js'
import {
  cancelManifestSchema,
  closeManifestSchema,
  issueManifestSchema,
} from './mdfe-issuance-request.schema.js'

const MDFE_ISSUE_POLICY = { permission: 'mdfe.issue', scope: 'company' } as const
/** Encerrar tira o manifesto da estrada na SEFAZ — não basta poder transmitir. */
const MDFE_CLOSE_POLICY = { permission: 'mdfe.close', scope: 'company' } as const
const MDFE_CANCEL_POLICY = { permission: 'mdfe.cancel', scope: 'company' } as const

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type Dependencies = {
  readonly mdfeIssuance: {
    cancel(input: TenantInput<CancelMdfeManifestInput>): Promise<MdfeIssuanceSummary>
    close(input: TenantInput<CloseMdfeManifestInput>): Promise<MdfeIssuanceSummary>
    issue(input: TenantInput<MdfeIssuanceRequest>): Promise<MdfeIssuanceSummary>
  }
}

export function createMdfeIssuanceRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<MdfeIssuanceRequest, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const summary = await dependencies.mdfeIssuance.issue({ context: context.scope, ...input })
        return jsonResponse(summary)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        await parseBody(issueManifestSchema, request)
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          manifestId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: `${API_MDFE_MANIFESTS_PATH}/:id/issue`,
      policy: MDFE_ISSUE_POLICY,
    }),
    defineRoute<Omit<CloseMdfeManifestInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const summary = await dependencies.mdfeIssuance.close({ context: context.scope, ...input })
        return jsonResponse(summary)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseBody(closeManifestSchema, request)
        return {
          closureCityCode: body.closureCityCode,
          closureState: body.closureState,
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          manifestId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: `${API_MDFE_MANIFESTS_PATH}/:id/close`,
      policy: MDFE_CLOSE_POLICY,
    }),
    defineRoute<Omit<CancelMdfeManifestInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const summary = await dependencies.mdfeIssuance.cancel({ context: context.scope, ...input })
        return jsonResponse(summary)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseBody(cancelManifestSchema, request)
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          justification: body.justification,
          manifestId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: `${API_MDFE_MANIFESTS_PATH}/:id/cancel`,
      policy: MDFE_CANCEL_POLICY,
    }),
  ]
}

/** A SEFAZ é chamada pelo worker: a rota só devolve o aceite do pedido. */
function jsonResponse(summary: MdfeIssuanceSummary): Response {
  return new Response(JSON.stringify({ data: serializeSummary(summary) }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 202,
  })
}

function serializeSummary(summary: MdfeIssuanceSummary): object {
  return {
    attemptId: summary.attemptId,
    attemptKind: summary.attemptKind,
    manifestId: summary.manifestId,
    manifestStatus: summary.manifestStatus,
    replayed: summary.replayed,
    requestedAt: summary.requestedAt,
  }
}
