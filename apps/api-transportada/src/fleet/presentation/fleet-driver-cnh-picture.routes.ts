/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: o robô do worker entrega o rosto extraído da CNH anexada. O alvo é só o anexo
 * (a API resolve o usuário) e a empresa vem do contexto; a permissão é do serviço (`driver.cnh-picture`).
 */
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { parseUserPictureUpload } from '../../identity/presentation/user-picture.schema.js'
import {
  API_FLEET_DRIVER_ATTACHMENT_CNH_PICTURE_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { ApplyDriverCnhPictureUseCase } from '../application/apply-driver-cnh-picture.use-case.js'

const CNH_PICTURE_POLICY = { permission: 'driver.cnh-picture', scope: 'company' } as const

export function createFleetDriverCnhPictureRoutes(dependencies: {
  readonly applyDriverCnhPicture: ApplyDriverCnhPictureUseCase
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly attachmentId: string; readonly bytes: Uint8Array }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.applyDriverCnhPicture({
          attachmentId: input.attachmentId,
          bytes: input.bytes,
          companyId: context.scope.companyId,
        })
        return new Response(
          JSON.stringify({ data: { applied: result.applied, published: result.published } }),
          {
            headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
            status: 200,
          },
        )
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        return {
          attachmentId: parseUuidPathIdentifier(pathParameters.attachmentId ?? ''),
          bytes: await parseUserPictureUpload(request),
        }
      },
      pathname: API_FLEET_DRIVER_ATTACHMENT_CNH_PICTURE_PATH,
      policy: CNH_PICTURE_POLICY,
    }),
  ]
}
