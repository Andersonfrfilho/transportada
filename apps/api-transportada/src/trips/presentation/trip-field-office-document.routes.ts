/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T6 (ADR-0067): a baixa de uma nota pelo escritório em nome do motorista — entregar com o
 * canhoto (`field-delivery`), devolver (`field-return`) e anexar o canhoto a uma entrega já feita
 * (`field-proof`).
 */
import { resolveClientIp } from '../../http/client-ip.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { FieldTripTargetPort } from '../application/field-trip-target.port.js'
import type { ResolvedTripFieldTarget } from '../application/field-trip-target.types.js'
import type {
  OfficeDeliveryProofUpload,
  OfficeProofPersistResult,
} from '../application/office-delivery-proof.service.js'
import type { ReportDocumentOutcomeResult } from '../application/report-document-delivery.use-case.js'
import type { DriverReturnReason } from '../domain/driver-return-reason.policy.js'
import { parseIdempotencyKey } from './me-trip.schema.js'
import {
  parseOfficeFieldDeliveryRequest,
  parseOfficeFieldProofRequest,
} from './office-field-delivery.schema.js'
import { parseOfficeFieldReturnRequest } from './trip-field-office.schema.js'
import {
  buildOfficeContextInput,
  OFFICE_REPORT_POLICY,
  OFFICE_TRIP_PATH,
  officeJsonResponse,
  resolveOfficeTarget,
  type OfficeContextInput,
} from './trip-field-office.support.js'

const OFFICE_DOCUMENT_PATH = `${OFFICE_TRIP_PATH}/documents/:documentId`
const OFFICE_DOCUMENT_DELIVER_PATH = `${OFFICE_DOCUMENT_PATH}/field-delivery`
const OFFICE_DOCUMENT_RETURN_PATH = `${OFFICE_DOCUMENT_PATH}/field-return`
const OFFICE_DOCUMENT_PROOF_PATH = `${OFFICE_DOCUMENT_PATH}/field-proof`

const OFFICE_DOCUMENT_AUDIT_ACTION = {
  deliver: 'trip_field_office.document_deliver',
  proof: 'trip_field_office.document_proof',
  return: 'trip_field_office.document_return',
} as const

/**
 * Spec 156 T15 (seg M2): a baixa de nota aguenta o maço de canhotos (concorrência 3 no cliente),
 * no Postgres, entre réplicas, por empresa e usuário. As três rotas dividem o balde.
 */
const OFFICE_DOCUMENT_RATE_LIMIT = {
  maxRequests: 300,
  scope: 'trip-field-office-documents',
  store: 'postgres',
  windowSeconds: 300,
} as const

type OfficeDocumentInput = OfficeContextInput & {
  readonly documentId: string
  readonly idempotencyKey: string
  readonly target: ResolvedTripFieldTarget
}

export type TripFieldOfficeDocumentDependencies = {
  readonly attachProof: (
    input: OfficeDocumentInput & { readonly proof: OfficeDeliveryProofUpload },
  ) => Promise<OfficeProofPersistResult>
  readonly reportDelivery: (
    input: OfficeDocumentInput & {
      readonly deliveredAt: Date
      readonly proof: OfficeDeliveryProofUpload | null
    },
  ) => Promise<ReportDocumentOutcomeResult>
  readonly reportReturn: (
    input: OfficeDocumentInput & {
      readonly reason: DriverReturnReason
      readonly returnedAt: Date
    },
  ) => Promise<ReportDocumentOutcomeResult>
  readonly targets: FieldTripTargetPort
}

type OfficeDocumentRequest = {
  readonly correlationId: string
  readonly documentId: string
  readonly driverId: string | undefined
  readonly idempotencyKey: string
  readonly ipAddress: string
  readonly tripId: string
}

function parseOfficeDocumentRequest(input: {
  readonly correlationId: string
  readonly driverId: string | undefined
  readonly pathParameters: Readonly<Record<string, string>>
  readonly request: Request
}): OfficeDocumentRequest {
  return {
    correlationId: input.correlationId,
    documentId: parseUuidPathIdentifier(input.pathParameters.documentId ?? ''),
    driverId: input.driverId,
    idempotencyKey: parseIdempotencyKey(input.request),
    ipAddress: resolveClientIp(input.request),
    tripId: parseUuidPathIdentifier(input.pathParameters.id ?? ''),
  }
}

/** O alvo resolvido e o contexto de toda baixa de nota — o que muda entre as três é o corpo. */
async function resolveOfficeDocumentInput(input: {
  readonly action: string
  readonly actorUserId: string
  readonly companyId: string
  readonly request: OfficeDocumentRequest
  readonly targets: FieldTripTargetPort
}): Promise<OfficeDocumentInput> {
  const { request } = input
  const target = await resolveOfficeTarget({
    companyId: input.companyId,
    driverId: request.driverId,
    targets: input.targets,
    tripId: request.tripId,
  })

  return {
    ...buildOfficeContextInput({
      action: input.action,
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      correlationId: request.correlationId,
      ipAddress: request.ipAddress,
    }),
    documentId: request.documentId,
    idempotencyKey: request.idempotencyKey,
    target,
  }
}

function serializeOutcome(result: ReportDocumentOutcomeResult): object {
  return {
    alreadySettled: result.alreadySettled,
    id: result.id,
    stopCompleted: result.stopCompleted,
    tripCompleted: result.tripCompleted,
  }
}

function createDeliveryRoute(
  dependencies: TripFieldOfficeDocumentDependencies,
): ReturnType<typeof defineRoute> {
  return defineRoute<
    OfficeDocumentRequest & {
      readonly deliveredAt: Date
      readonly proof: OfficeDeliveryProofUpload | null
    }
  >({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.reportDelivery({
        ...(await resolveOfficeDocumentInput({
          action: OFFICE_DOCUMENT_AUDIT_ACTION.deliver,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          request: input,
          targets: dependencies.targets,
        })),
        deliveredAt: input.deliveredAt,
        proof: input.proof,
      })

      return officeJsonResponse({
        body: { data: { ...serializeOutcome(result), proofId: result.proofId } },
        status: 201,
      })
    },
    method: 'POST',
    async parse({ correlationId, pathParameters, request }) {
      const body = await parseOfficeFieldDeliveryRequest(request)
      return {
        ...parseOfficeDocumentRequest({
          correlationId,
          driverId: body.driverId,
          pathParameters,
          request,
        }),
        deliveredAt: body.deliveredAt,
        proof: body.proof,
      }
    },
    pathname: OFFICE_DOCUMENT_DELIVER_PATH,
    policy: OFFICE_REPORT_POLICY,
    rateLimit: OFFICE_DOCUMENT_RATE_LIMIT,
  })
}

function createReturnRoute(
  dependencies: TripFieldOfficeDocumentDependencies,
): ReturnType<typeof defineRoute> {
  return defineRoute<
    OfficeDocumentRequest & { readonly reason: DriverReturnReason; readonly returnedAt: Date }
  >({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.reportReturn({
        ...(await resolveOfficeDocumentInput({
          action: OFFICE_DOCUMENT_AUDIT_ACTION.return,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          request: input,
          targets: dependencies.targets,
        })),
        reason: input.reason,
        returnedAt: input.returnedAt,
      })

      return officeJsonResponse({ body: { data: serializeOutcome(result) }, status: 201 })
    },
    method: 'POST',
    async parse({ correlationId, pathParameters, request }) {
      const body = await parseOfficeFieldReturnRequest(request)
      return {
        ...parseOfficeDocumentRequest({
          correlationId,
          driverId: body.driverId,
          pathParameters,
          request,
        }),
        reason: body.reason,
        returnedAt: body.returnedAt ?? new Date(),
      }
    },
    pathname: OFFICE_DOCUMENT_RETURN_PATH,
    policy: OFFICE_REPORT_POLICY,
    rateLimit: OFFICE_DOCUMENT_RATE_LIMIT,
  })
}

/**
 * Anexa a uma entrega **já feita** (ADR-0067 §2): não cria evento, não muda `delivered_at`. Exige
 * `Idempotency-Key`, reservada em `trip_field_reports` com a operação `office.document.proof`
 * (spec 156 T6); o unique `(company, stop_event, kind)` é o que faz o canhoto novo do escritório
 * substituir o anterior do escritório — nunca o do motorista (T15 M1).
 */
function createProofRoute(
  dependencies: TripFieldOfficeDocumentDependencies,
): ReturnType<typeof defineRoute> {
  return defineRoute<OfficeDocumentRequest & { readonly proof: OfficeDeliveryProofUpload }>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.attachProof({
        ...(await resolveOfficeDocumentInput({
          action: OFFICE_DOCUMENT_AUDIT_ACTION.proof,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          request: input,
          targets: dependencies.targets,
        })),
        proof: input.proof,
      })

      return officeJsonResponse({ body: { data: { id: result.id } }, status: 201 })
    },
    method: 'POST',
    async parse({ correlationId, pathParameters, request }) {
      const body = await parseOfficeFieldProofRequest(request)
      return {
        ...parseOfficeDocumentRequest({
          correlationId,
          driverId: body.driverId,
          pathParameters,
          request,
        }),
        proof: body.proof,
      }
    },
    pathname: OFFICE_DOCUMENT_PROOF_PATH,
    policy: OFFICE_REPORT_POLICY,
    rateLimit: OFFICE_DOCUMENT_RATE_LIMIT,
  })
}

export function createTripFieldOfficeDocumentRoutes(
  dependencies: TripFieldOfficeDocumentDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    createDeliveryRoute(dependencies),
    createReturnRoute(dependencies),
    createProofRoute(dependencies),
  ]
}
