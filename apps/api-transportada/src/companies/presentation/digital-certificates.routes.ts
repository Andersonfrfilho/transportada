/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { defineRoute } from '../../http/router.service.js'
import { API_DIGITAL_CERTIFICATES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  DigitalCertificateMetadata,
  DigitalCertificateResult,
} from '../application/digital-certificate.port.js'
import {
  parseCertificateForm,
  parseCertificateIdempotencyKey,
  parseCertificateList,
  type CertificateCursor,
} from './digital-certificates.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

type Metadata = DigitalCertificateMetadata | DigitalCertificateResult
type ListRouteInput = { readonly cursor?: CertificateCursor; readonly limit: number }
type ReplaceRouteInput = {
  readonly certificate: Uint8Array
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly password: Uint8Array
  readonly purpose: 'cte'
}
type Dependencies = {
  readonly listCertificates: {
    execute(input: {
      readonly context: CompanyContext
      readonly cursor?: CertificateCursor
      readonly limit: number
    }): Promise<{ readonly items: readonly Metadata[]; readonly nextCursor?: CertificateCursor }>
  }
  readonly replaceCertificate: {
    execute(input: {
      readonly certificate: Uint8Array
      readonly context: CompanyContext
      readonly correlationId: string
      readonly idempotencyKey: string
      readonly password: Uint8Array
      readonly purpose: 'cte'
    }): Promise<{ readonly certificate: Metadata; readonly replayed: boolean }>
  }
  readonly retireCertificate: {
    execute(input: {
      readonly context: CompanyContext
      readonly correlationId: string
      readonly purpose: 'cte'
    }): Promise<Metadata | null>
  }
}

export function createDigitalCertificateRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    createListRoute(dependencies),
    createReplaceRoute(dependencies),
    createRetireRoute(dependencies),
  ]
}

function createRetireRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<{ readonly correlationId: string; readonly purpose: 'cte' }>({
    async handle({ context, input }): Promise<Response> {
      const certificate = await dependencies.retireCertificate.execute({
        context: context.scope,
        correlationId: input.correlationId,
        purpose: input.purpose,
      })
      return jsonResponse({
        body: { data: certificate === null ? null : serialize(certificate) },
        status: 200,
      })
    },
    method: 'DELETE',
    parse: ({ correlationId }) => ({ correlationId, purpose: 'cte' }),
    pathname: API_DIGITAL_CERTIFICATES_PATH,
    policy: SETTINGS_MANAGE_POLICY,
  })
}

function createListRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<ListRouteInput>({
    async handle({ context, input }): Promise<Response> {
      return listResponse(
        await dependencies.listCertificates.execute({ context: context.scope, ...input }),
      )
    },
    method: 'GET',
    parse: ({ request }) => parseCertificateList(new URL(request.url)),
    pathname: API_DIGITAL_CERTIFICATES_PATH,
    policy: SETTINGS_MANAGE_POLICY,
  })
}

function createReplaceRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<ReplaceRouteInput>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.replaceCertificate.execute({
        context: context.scope,
        ...input,
      })
      return certificateResponse({
        certificate: result.certificate,
        status: result.replayed ? 200 : 201,
      })
    },
    method: 'POST',
    async parse({ correlationId, request }) {
      const idempotencyKey = parseCertificateIdempotencyKey(request.headers.get('idempotency-key'))
      return { ...(await parseCertificateForm(request)), correlationId, idempotencyKey }
    },
    pathname: API_DIGITAL_CERTIFICATES_PATH,
    policy: SETTINGS_MANAGE_POLICY,
  })
}

function listResponse(input: {
  readonly items: readonly Metadata[]
  readonly nextCursor?: CertificateCursor
}): Response {
  return jsonResponse({
    body: {
      data: input.items.map(serialize),
      page: { nextCursor: input.nextCursor === undefined ? null : encodeCursor(input.nextCursor) },
    },
    status: 200,
  })
}

function certificateResponse(input: {
  readonly certificate: Metadata
  readonly status: number
}): Response {
  return jsonResponse({ body: { data: serialize(input.certificate) }, status: input.status })
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serialize(certificate: Metadata): object {
  return {
    expiresAt: certificate.expiresAt.toISOString(),
    id: certificate.id,
    purpose: certificate.purpose,
    status: certificate.status,
    validFrom: certificate.validFrom.toISOString(),
    version: certificate.version.toString(),
  }
}

function encodeCursor(cursor: CertificateCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString(
    'base64url',
  )
}
