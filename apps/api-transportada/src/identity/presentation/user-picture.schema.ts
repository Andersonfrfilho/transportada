/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { USER_PICTURE_MAX_BYTES } from '../../database/identity-user-picture.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { UserPictureTooLargeError } from '../domain/user-picture.error.js'

export const USER_PICTURE_FORM_FIELD = 'file'

export async function parseUserPictureUpload(request: Request): Promise<Uint8Array> {
  const form = await readForm(request)
  const file = form.get(USER_PICTURE_FORM_FIELD)
  if (!(file instanceof File)) throw new ApiError(HTTP_ERROR.invalidRequest)
  /** Recusar pelo tamanho declarado evita carregar 20 MiB na memória para depois recusar. */
  if (file.size > USER_PICTURE_MAX_BYTES) throw new UserPictureTooLargeError()
  return new Uint8Array(await file.arrayBuffer())
}

async function readForm(request: Request): Promise<Awaited<ReturnType<Request['formData']>>> {
  try {
    return await request.formData()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}
