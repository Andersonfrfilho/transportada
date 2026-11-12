/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { UserPictureOrigin } from '../../database/identity-user-picture.schema.js'
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
  readonly logger?: { readonly warn: (message: string, meta?: Record<string, unknown>) => void }
  readonly publicBaseUrl?: string
  readonly repository: UserPictureRepositoryPort
}

type Target = { readonly context: { readonly companyId: string }; readonly userId: string }

export type UserPictureUseCase = {
  readonly find: (input: Target) => Promise<UserPicture>
  readonly findPublic: (input: { readonly publicToken: string }) => Promise<UserPicture>
  readonly remove: (input: Target & { readonly idempotent?: boolean }) => Promise<void>
  /**
   * Sem foto, ou foto anterior também da CNH; `undefined` quando `self`/`admin` já existe.
   * `published: false` = a foto está salva mas o atributo no provedor ainda não; o backfill refaz.
   */
  readonly replaceFromCnh: (
    input: Target & { readonly bytes: Uint8Array },
  ) => Promise<{ readonly published: boolean } | undefined>
  readonly replace: (
    input: Target & {
      readonly bytes: Uint8Array
      readonly origin: Exclude<UserPictureOrigin, 'cnh'>
    },
  ) => Promise<UserPictureMetadata>
}

export function createUserPictureUseCase(dependencies: Dependencies): UserPictureUseCase {
  /**
   * O provedor é sistema de fora, e ele cai. A foto já está gravada quando esta chamada acontece:
   * derrubar a resposta faria o operador subir de novo a mesma imagem, que já está lá.
   */
  async function publishToRealm(
    input: Target & { readonly pictureUrl?: string },
  ): Promise<boolean> {
    if (dependencies.publicBaseUrl === undefined) return true

    const subject = await dependencies.repository.findIdentitySubject({
      companyId: input.context.companyId,
      userId: input.userId,
    })
    /** Quem ainda não tem conta no provedor tem foto aqui; o atributo fica para quando tiver. */
    if (subject === undefined) return false

    try {
      await dependencies.identityGateway.setProfilePicture({
        pictureUrl: input.pictureUrl,
        userId: subject,
      })
      return true
    } catch {
      dependencies.logger?.warn('user_picture.publish_failed', {
        companyId: input.context.companyId,
        userId: input.userId,
      })
      return false
    }
  }

  /**
   * O provedor guarda o **endereço público** da foto, e não o conteúdo nem a rota autenticada.
   * A rota autenticada não servia a consumidor nenhum do lado de lá (`<img src>` não manda
   * `Authorization`), e o conteúdo inteiro no atributo pesa centenas de kilobytes por pessoa.
   *
   * O token gira a cada gravação: o endereço da foto anterior deixa de abrir, que é a única
   * revogação que um link sem login admite.
   */
  async function publishSaved(
    input: Target & { readonly saved: UserPictureMetadata },
  ): Promise<boolean> {
    return publishToRealm({
      context: input.context,
      ...(input.saved.publicToken === null
        ? {}
        : {
            pictureUrl: `${dependencies.publicBaseUrl ?? ''}/public/company-users/${input.saved.publicToken}/picture`,
          }),
      userId: input.userId,
    })
  }

  return {
    find: async ({ context, userId }) => {
      const picture = await dependencies.repository.find({ companyId: context.companyId, userId })
      if (picture === null) throw new UserPictureNotFoundError()
      return picture
    },

    /** Sem empresa e sem token de acesso: quem tem o endereço tem a foto, e é só isso que ele abre. */
    findPublic: async ({ publicToken }) => {
      const picture = await dependencies.repository.findByPublicToken({ publicToken })
      if (picture === null) throw new UserPictureNotFoundError()
      return picture
    },

    remove: async ({ context, idempotent = false, userId }) => {
      const removed = await dependencies.repository.remove({
        companyId: context.companyId,
        userId,
      })
      if (!removed && !idempotent) throw new UserPictureNotFoundError()

      /** Avatar no token apontando para 404 é pior que avatar nenhum: o atributo sai junto, inclusive no idempotente (corrige claim de falha parcial). */
      await publishToRealm({ context, userId })
    },

    replace: async ({ bytes, context, origin, userId }) => {
      const saved = await dependencies.repository.save({
        ...describePicture(bytes),
        companyId: context.companyId,
        origin,
        userId,
      })
      await publishSaved({ context, saved, userId })
      return saved
    },

    replaceFromCnh: async ({ bytes, context, userId }) => {
      const saved = await dependencies.repository.saveFromCnh({
        ...describePicture(bytes),
        companyId: context.companyId,
        userId,
      })
      if (saved === null) return undefined

      const published = await publishSaved({ context, saved, userId })
      if (published)
        await dependencies.repository.markPublished({ companyId: context.companyId, userId })
      return { published }
    },
  }
}

/**
 * A metade pública do caso de uso: só a leitura por token. Ela não precisa do provedor de identidade
 * nem do endereço público da instalação — e montar o caso de uso inteiro para servir uma imagem
 * anônima obrigaria as rotas anônimas a conhecer a credencial de administração do realm.
 */
export function createPublicUserPictureUseCase(dependencies: {
  readonly repository: Pick<UserPictureRepositoryPort, 'findByPublicToken'>
}): Pick<UserPictureUseCase, 'findPublic'> {
  return {
    findPublic: async ({ publicToken }) => {
      const picture = await dependencies.repository.findByPublicToken({ publicToken })
      if (picture === null) throw new UserPictureNotFoundError()
      return picture
    },
  }
}

function describePicture(bytes: Uint8Array) {
  const mimeType = assertUserPictureBytes(bytes)
  const content = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    byteSize: content.byteLength,
    contentBase64: content.toString('base64'),
    mimeType,
    sha256: createHash('sha256').update(content).digest('hex'),
  }
}
