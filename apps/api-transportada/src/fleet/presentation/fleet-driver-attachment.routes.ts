/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 091 R2: o documento do motorista na ficha da frota. Anexar e remover é `fleet.manage`; abrir o
 * arquivo é `fleet.reveal`, que nenhuma rota de escrita aceita no lugar de `fleet.manage`.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_FLEET_DRIVER_ATTACHMENT_CONTENT_PATH,
  API_FLEET_DRIVER_ATTACHMENT_PATH,
  API_FLEET_DRIVER_ATTACHMENTS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { FleetDriverAttachmentUseCase } from '../application/fleet-driver-attachment.use-case.js'
import { parseUuidPathIdentifier } from './fleet.schema.js'
import {
  parseUploadFleetDriverAttachmentRequest,
  type UploadFleetDriverAttachmentRequest,
} from './fleet-driver-attachment.schema.js'

const FLEET_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const FLEET_REVEAL_POLICY = { permission: 'fleet.reveal', scope: 'company' } as const
const CREATED_STATUS = 201
const OK_STATUS = 200
const NO_CONTENT_STATUS = 204

type Dependencies = { readonly attachments: FleetDriverAttachmentUseCase }

export function createFleetDriverAttachmentRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const { attachments } = dependencies
  return [
    defineRoute<
      UploadFleetDriverAttachmentRequest & {
        readonly correlationId: string
        readonly driverId: string
      }
    >({
      async handle({ context, input }): Promise<Response> {
        const attachment = await attachments.attach({
          bytes: input.bytes,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          declaredMimeType: input.declaredMimeType,
          driverId: input.driverId,
          fileName: input.fileName,
          type: input.type,
          uploadedBy: context.scope.userId,
        })
        return new Response(JSON.stringify({ data: attachment }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: CREATED_STATUS,
        })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const driverId = parseUuidPathIdentifier(pathParameters.id ?? '')
        return {
          correlationId,
          driverId,
          ...(await parseUploadFleetDriverAttachmentRequest(request)),
        }
      },
      pathname: API_FLEET_DRIVER_ATTACHMENTS_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<{ readonly attachmentId: string; readonly driverId: string }>({
      async handle({ context, input }): Promise<Response> {
        await attachments.remove({
          attachmentId: input.attachmentId,
          companyId: context.scope.companyId,
          driverId: input.driverId,
        })
        return new Response(null, { status: NO_CONTENT_STATUS })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({
        attachmentId: parseUuidPathIdentifier(pathParameters.attachmentId ?? ''),
        driverId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: API_FLEET_DRIVER_ATTACHMENT_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<{ readonly attachmentId: string; readonly driverId: string }>({
      /** A URL assinada, e nunca o corpo: a API não serve o documento, e o link morre em minutos. */
      async handle({ context, input }): Promise<Response> {
        const revealed = await attachments.reveal({
          attachmentId: input.attachmentId,
          companyId: context.scope.companyId,
          driverId: input.driverId,
        })
        return new Response(JSON.stringify({ data: revealed }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: OK_STATUS,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        attachmentId: parseUuidPathIdentifier(pathParameters.attachmentId ?? ''),
        driverId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: API_FLEET_DRIVER_ATTACHMENT_CONTENT_PATH,
      policy: FLEET_REVEAL_POLICY,
    }),
  ]
}
