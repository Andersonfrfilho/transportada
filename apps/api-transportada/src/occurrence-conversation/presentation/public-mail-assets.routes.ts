/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyLogoRepositoryPort } from '../../companies/application/company-logo.port.js'
import { defineAnonymousRoute, type RegisteredAnonymousRoute } from '../../http/router.service.js'
import type { UserPictureRepositoryPort } from '../../identity/application/user-picture.port.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  PUBLIC_MAIL_ASSET_LOGO_PATH,
  PUBLIC_MAIL_ASSET_PICTURE_PATH,
} from '../domain/occurrence-mail-html.constant.js'

/**
 * As imagens do e-mail da ocorrência por endereço **estável e sem login**: o cliente de e-mail da contratante busca
 * `<img src>` sem `Authorization`. Diferente da foto de perfil do realm (`/public/company-users/:token/picture`), o
 * endereço aqui não leva credencial — são os ids da empresa e da pessoa, que não giram quando a foto muda, então e-mail
 * antigo continua mostrando a imagem atual. Quem tem o link vê o logo da empresa e o rosto de quem assinou; a foto só
 * abre para quem tem vínculo ativo com a empresa e, removida, o endereço responde 404 (o e-mail cai no `alt`).
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
/** Curto de propósito: a troca do logo ou da foto aparece em minutos, e o e-mail não carrega versão no endereço. */
const CACHE_CONTROL = 'public, max-age=300'

type Dependencies = {
  readonly companyLogo: Pick<CompanyLogoRepositoryPort, 'find'>
  readonly userPicture: Pick<UserPictureRepositoryPort, 'find'>
}

type Image = { readonly bytes: Uint8Array; readonly mimeType: string; readonly sha256: string }

function imageResponse(image: Image | null): Response {
  if (image === null) throw new ApiError(HTTP_ERROR.notFound)
  return new Response(image.bytes, {
    headers: {
      'cache-control': CACHE_CONTROL,
      'content-type': image.mimeType,
      etag: `"${image.sha256}"`,
      'x-content-type-options': 'nosniff',
    },
    status: 200,
  })
}

function uuid(value: string | undefined): string {
  const candidate = value ?? ''
  if (!UUID_PATTERN.test(candidate)) throw new ApiError(HTTP_ERROR.notFound)
  return candidate.toLowerCase()
}

export function createPublicMailAssetRoutes(
  dependencies: Dependencies,
): readonly RegisteredAnonymousRoute[] {
  return [
    defineAnonymousRoute<{ readonly companyId: string }>({
      async handle({ input }): Promise<Response> {
        return imageResponse(await dependencies.companyLogo.find({ companyId: input.companyId }))
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ companyId: uuid(pathParameters.companyId) }),
      pathname: PUBLIC_MAIL_ASSET_LOGO_PATH,
      pathParameterFormat: 'raw',
    }),
    defineAnonymousRoute<{ readonly companyId: string; readonly userId: string }>({
      async handle({ input }): Promise<Response> {
        return imageResponse(await dependencies.userPicture.find(input))
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        companyId: uuid(pathParameters.companyId),
        userId: uuid(pathParameters.userId),
      }),
      pathname: PUBLIC_MAIL_ASSET_PICTURE_PATH,
      pathParameterFormat: 'raw',
    }),
  ]
}
