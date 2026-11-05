/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { UserPictureUseCase } from '../../identity/application/user-picture.use-case.js'
import { FleetDriverAttachmentNotFoundError } from '../domain/fleet-driver-attachment.error.js'

export type DriverCnhPictureLookupPort = Readonly<{
  /**
   * `undefined` quando o anexo não existe nesta empresa ou não é CNH; `userId` ausente quando o
   * motorista ainda não tem usuário (a foto fica para o backfill).
   */
  findDriverUser: (input: {
    readonly attachmentId: string
    readonly companyId: string
  }) => Promise<{ readonly userId: string | undefined } | undefined>
}>

export type ApplyDriverCnhPictureParams = {
  readonly attachmentId: string
  readonly bytes: Uint8Array
  readonly companyId: string
}

export type ApplyDriverCnhPictureUseCase = (
  params: ApplyDriverCnhPictureParams,
) => Promise<{ readonly applied: boolean; readonly published: boolean }>

/** Spec 295 Fase 4: a foto da CNH nunca sobrescreve a que a pessoa ou o escritório puseram. */
export function createApplyDriverCnhPictureUseCase(dependencies: {
  readonly lookup: DriverCnhPictureLookupPort
  readonly userPicture: Pick<UserPictureUseCase, 'replaceFromCnh'>
}): ApplyDriverCnhPictureUseCase {
  return async ({ attachmentId, bytes, companyId }) => {
    const driver = await dependencies.lookup.findDriverUser({ attachmentId, companyId })
    if (driver === undefined) throw new FleetDriverAttachmentNotFoundError()
    if (driver.userId === undefined) return { applied: false, published: false }

    const saved = await dependencies.userPicture.replaceFromCnh({
      bytes,
      context: { companyId },
      userId: driver.userId,
    })
    return { applied: saved !== undefined, published: saved?.published ?? false }
  }
}
