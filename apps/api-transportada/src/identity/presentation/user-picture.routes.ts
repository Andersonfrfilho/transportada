/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_COMPANY_USERS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { UserPictureMetadata } from '../application/user-picture.port.js'
import type { UserPictureUseCase } from '../application/user-picture.use-case.js'
import { parseUserPictureUpload } from './user-picture.schema.js'
import { parseUuidPathIdentifier } from './user-administration.schema.js'

const USER_PICTURE_PATH = `${API_COMPANY_USERS_PATH}/:id/picture`
const USERS_MANAGE_POLICY = { permission: 'users.manage', scope: 'company' } as const

type Dependencies = {
  readonly userPicture: UserPictureUseCase
}

export function createUserPictureRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly userId: string }>({
      async handle({ context, input }): Promise<Response> {
        const picture = await dependencies.userPicture.find({
          context: context.scope,
          userId: input.userId,
        })
        return new Response(picture.bytes, {
          headers: {
            /**
             * `no-store` como no logotipo: a foto é dado de pessoa, e cache compartilhado a
             * entregaria a quem pedisse a mesma URL depois. O `etag` continua servindo à revalidação.
             */
            'cache-control': 'no-store',
            'content-type': picture.mimeType,
            etag: `"${picture.sha256}"`,
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ userId: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: USER_PICTURE_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly bytes: Uint8Array; readonly userId: string }>({
      async handle({ context, input }): Promise<Response> {
        const picture = await dependencies.userPicture.replace({
          bytes: input.bytes,
          context: context.scope,
          userId: input.userId,
        })
        return jsonResponse({ body: { data: serialize(picture) }, status: 200 })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        return {
          bytes: await parseUserPictureUpload(request),
          userId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: USER_PICTURE_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly userId: string }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.userPicture.remove({
          context: context.scope,
          userId: input.userId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({ userId: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: USER_PICTURE_PATH,
      policy: USERS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serialize(picture: UserPictureMetadata): object {
  return {
    byteSize: picture.byteSize,
    mimeType: picture.mimeType,
    sha256: picture.sha256,
    updatedAt: picture.updatedAt.toISOString(),
  }
}
