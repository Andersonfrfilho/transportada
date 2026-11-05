/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T1: o grupo de WhatsApp na ficha do motorista. Ler é `fleet.read`; trocar, remover e listar os
 * grupos do Evolution é `fleet.manage` (quem edita a ficha escolhe o grupo).
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_FLEET_DRIVER_WHATSAPP_GROUP_PATH,
  API_FLEET_WHATSAPP_GROUPS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { DriverWhatsappGroupUseCase } from '../application/driver-whatsapp-group.use-case.js'
import { parseSetDriverWhatsappGroupBody } from './driver-whatsapp-group.schema.js'
import { parseUuidPathIdentifier } from './fleet.schema.js'

const FLEET_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const FLEET_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const

type DriverInput = { readonly correlationId: string; readonly driverId: string }

export function createDriverWhatsappGroupRoutes(dependencies: {
  readonly useCase: DriverWhatsappGroupUseCase
}): readonly ReturnType<typeof defineRoute>[] {
  const { useCase } = dependencies
  return [
    defineRoute<DriverInput>({
      async handle({ context, input }): Promise<Response> {
        const group = await useCase.get({
          companyId: context.scope.companyId,
          driverId: input.driverId,
        })
        return jsonResponse(200, { data: group })
      },
      method: 'GET',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        driverId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: API_FLEET_DRIVER_WHATSAPP_GROUP_PATH,
      policy: FLEET_READ_POLICY,
    }),
    defineRoute<DriverInput & { readonly groupJid: string; readonly groupName: string }>({
      async handle({ context, input }): Promise<Response> {
        const group = await useCase.set({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          driverId: input.driverId,
          groupJid: input.groupJid,
          groupName: input.groupName,
        })
        return jsonResponse(200, { data: group })
      },
      method: 'PUT',
      async parse({ correlationId, pathParameters, request }) {
        const driverId = parseUuidPathIdentifier(pathParameters.id ?? '')
        return { correlationId, driverId, ...(await parseSetDriverWhatsappGroupBody(request)) }
      },
      pathname: API_FLEET_DRIVER_WHATSAPP_GROUP_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<DriverInput>({
      async handle({ context, input }): Promise<Response> {
        await useCase.remove({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          driverId: input.driverId,
        })
        return jsonResponse(200, { data: null })
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        driverId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: API_FLEET_DRIVER_WHATSAPP_GROUP_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const groups = await useCase.listGroups({ companyId: context.scope.companyId })
        return jsonResponse(200, { data: groups })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_FLEET_WHATSAPP_GROUPS_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status,
  })
}
