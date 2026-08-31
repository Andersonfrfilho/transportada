/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { UserPictureMimeType } from '../../database/identity-user-picture.schema.js'

export type UserPictureMetadata = {
  readonly byteSize: number
  readonly mimeType: UserPictureMimeType
  /** O endereço público desta versão da foto. Ele gira a cada gravação — ver `publicToken`. */
  readonly publicToken: string | null
  readonly sha256: string
  readonly updatedAt: Date
}

export type UserPicture = {
  readonly bytes: Buffer
  readonly mimeType: UserPictureMimeType
  /** O endereço público desta versão. Nulo em foto gravada antes de a coluna existir. */
  readonly publicToken: string | null
  readonly sha256: string
}

export type SaveUserPictureInput = {
  readonly byteSize: number
  readonly companyId: string
  readonly contentBase64: string
  readonly mimeType: UserPictureMimeType
  readonly sha256: string
  readonly userId: string
}

/**
 * Toda leitura e escrita leva `companyId`: o recorte é do banco, não de uma conferência em memória
 * antes da consulta. É ele que impede alcançar a foto de alguém da empresa vizinha por id.
 */
export type UserPictureRepositoryPort = {
  readonly find: (input: {
    readonly companyId: string
    readonly userId: string
  }) => Promise<UserPicture | null>
  /**
   * A leitura sem login. Ela **não** recebe empresa: o token é a credencial, e exigir o recorte
   * obrigaria quem abre o link a dizer de qual empresa é a pessoa — que é justamente o que um
   * endereço público não sabe.
   */
  readonly findByPublicToken: (input: {
    readonly publicToken: string
  }) => Promise<UserPicture | null>
  readonly findIdentitySubject: (input: {
    readonly companyId: string
    readonly userId: string
  }) => Promise<string | undefined>
  readonly remove: (input: {
    readonly companyId: string
    readonly userId: string
  }) => Promise<boolean>
  readonly save: (input: SaveUserPictureInput) => Promise<UserPictureMetadata>
}

export type UserPictureIdentityGatewayPort = {
  readonly setProfilePicture: (input: {
    readonly pictureUrl: string | undefined
    readonly userId: string
  }) => Promise<void>
}
