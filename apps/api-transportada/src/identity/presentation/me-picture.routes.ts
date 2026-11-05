/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_ME_PICTURE_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { UserPictureUseCase } from '../application/user-picture.use-case.js'
import { parseUserPictureUpload } from './user-picture.schema.js'

/** A foto é da própria pessoa: qualquer membership ativa troca a sua, e só a sua. */
const MEMBERSHIP_POLICY = { membership: 'active', scope: 'company' } as const

type Dependencies = {
  readonly userPicture: UserPictureUseCase
}

/**
 * Spec 295. Sem parâmetro de id: o alvo é sempre `context.scope.userId`, vindo do token, então
 * nenhum pedido consegue apontar a foto de outra pessoa.
 */
export function createMePictureRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const picture = await dependencies.userPicture.find({
          context: context.scope,
          userId: context.scope.userId,
        })
        return new Response(picture.bytes, {
          headers: {
            'cache-control': 'no-store',
            'content-type': picture.mimeType,
            etag: `"${picture.sha256}"`,
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: API_ME_PICTURE_PATH,
      policy: MEMBERSHIP_POLICY,
    }),
    defineRoute<{ readonly bytes: Uint8Array }>({
      async handle({ context, input }): Promise<Response> {
        const picture = await dependencies.userPicture.replace({
          bytes: input.bytes,
          context: context.scope,
          userId: context.scope.userId,
        })
        return new Response(
          JSON.stringify({
            data: {
              byteSize: picture.byteSize,
              mimeType: picture.mimeType,
              sha256: picture.sha256,
              updatedAt: picture.updatedAt.toISOString(),
            },
          }),
          {
            headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
            status: 200,
          },
        )
      },
      method: 'PUT',
      async parse({ request }) {
        return { bytes: await parseUserPictureUpload(request) }
      },
      pathname: API_ME_PICTURE_PATH,
      policy: MEMBERSHIP_POLICY,
    }),
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        await dependencies.userPicture.remove({
          context: context.scope,
          userId: context.scope.userId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: () => ({}),
      pathname: API_ME_PICTURE_PATH,
      policy: MEMBERSHIP_POLICY,
    }),
  ]
}
