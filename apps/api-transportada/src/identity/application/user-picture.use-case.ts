/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { UserPictureNotFoundError } from '../domain/user-picture.error.js'
import { assertUserPictureBytes } from '../domain/user-picture.policy.js'
import type {
  UserPicture,
  UserPictureIdentityGatewayPort,
  UserPictureMetadata,
  UserPictureRepositoryPort,
} from './user-picture.port.js'

type Dependencies = {
  readonly identityGateway: UserPictureIdentityGatewayPort
  /**
   * O endereço público desta instalação. Ele **não** é adivinhável a partir do request: atrás de
   * proxy o `Host` é o do proxy, e o realm guardaria uma URL interna que ninguém alcança. Ausente,
   * a foto é gravada aqui e o atributo não é escrito.
   */
  readonly publicBaseUrl?: string
  readonly repository: UserPictureRepositoryPort
}

type Target = { readonly context: { readonly companyId: string }; readonly userId: string }

export type UserPictureUseCase = {
  readonly find: (input: Target) => Promise<UserPicture>
  readonly remove: (input: Target) => Promise<void>
  readonly replace: (input: Target & { readonly bytes: Uint8Array }) => Promise<UserPictureMetadata>
}

export function createUserPictureUseCase(dependencies: Dependencies): UserPictureUseCase {
  /**
   * O provedor é sistema de fora, e ele cai. A foto já está gravada quando esta chamada acontece:
   * derrubar a resposta faria o operador subir de novo a mesma imagem, que já está lá.
   */
  async function publishToRealm(input: Target & { readonly pictureUrl?: string }): Promise<void> {
    if (dependencies.publicBaseUrl === undefined) return

    const subject = await dependencies.repository.findIdentitySubject({
      companyId: input.context.companyId,
      userId: input.userId,
    })
    /** Quem ainda não tem conta no provedor tem foto aqui; o atributo fica para quando tiver. */
    if (subject === undefined) return

    try {
      await dependencies.identityGateway.setProfilePicture({
        pictureUrl: input.pictureUrl,
        userId: subject,
      })
    } catch {
      /* O erro do provedor não desfaz a escrita que já valeu. */
    }
  }

  return {
    find: async ({ context, userId }) => {
      const picture = await dependencies.repository.find({ companyId: context.companyId, userId })
      if (picture === null) throw new UserPictureNotFoundError()
      return picture
    },

    remove: async ({ context, userId }) => {
      const removed = await dependencies.repository.remove({
        companyId: context.companyId,
        userId,
      })
      if (!removed) throw new UserPictureNotFoundError()

      /** Avatar no token apontando para 404 é pior que avatar nenhum: o atributo sai junto. */
      await publishToRealm({ context, userId })
    },

    replace: async ({ bytes, context, userId }) => {
      const mimeType = assertUserPictureBytes(bytes)
      const content = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const saved = await dependencies.repository.save({
        byteSize: content.byteLength,
        companyId: context.companyId,
        contentBase64: content.toString('base64'),
        mimeType,
        sha256: createHash('sha256').update(content).digest('hex'),
        userId,
      })

      await publishToRealm({
        context,
        pictureUrl: `${dependencies.publicBaseUrl ?? ''}/company-users/${userId}/picture`,
        userId,
      })

      return saved
    },
  }
}
