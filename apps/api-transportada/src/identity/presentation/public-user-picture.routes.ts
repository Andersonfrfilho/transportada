/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineAnonymousRoute, type RegisteredAnonymousRoute } from '../../http/router.service.js'
import { ApiError } from '../../shared/api.error.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import type { UserPictureUseCase } from '../application/user-picture.use-case.js'

/**
 * A foto de perfil por endereço **sem login**, para consumidor do provedor de identidade conseguir
 * exibi-la: o atributo `picture` do realm guarda esta URL, e `<img src>` não manda `Authorization`.
 *
 * ⚠️ O token é a credencial inteira. Ele é imprevisível (32 bytes) e gira a cada troca de foto — o
 * endereço da imagem anterior deixa de abrir —, mas enquanto vale, quem tiver o link vê o rosto da
 * pessoa sem se identificar, e a leitura não deixa trilha. Decisão registrada em `docs/SECURITY.md`.
 */
const PUBLIC_USER_PICTURE_PATH = '/public/company-users/:token/picture'

/** Base64url de 32 bytes. Formato conferido antes do banco: token torto é 404, não consulta. */
const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u

type Dependencies = {
  readonly userPicture: Pick<UserPictureUseCase, 'findPublic'>
}

export function createPublicUserPictureRoutes(
  dependencies: Dependencies,
): readonly RegisteredAnonymousRoute[] {
  return [
    defineAnonymousRoute<{ readonly publicToken: string }>({
      async handle({ input }): Promise<Response> {
        const picture = await dependencies.userPicture.findPublic({
          publicToken: input.publicToken,
        })
        return new Response(picture.bytes, {
          headers: {
            /**
             * `no-store` mesmo sendo endereço público: o token gira a cada troca de foto, e cache
             * intermediário serviria a imagem antiga de um endereço que já deixou de valer.
             */
            'cache-control': 'no-store',
            'content-type': picture.mimeType,
            etag: `"${picture.sha256}"`,
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => {
        const token = pathParameters.token ?? ''
        if (!PUBLIC_TOKEN_PATTERN.test(token)) throw new ApiError(HTTP_ERROR.notFound)
        return { publicToken: token }
      },
      pathname: PUBLIC_USER_PICTURE_PATH,
      pathParameterFormat: 'raw',
    }),
  ]
}
