/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  externalIdentities,
  identityUserPictures,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import type {
  SaveUserPictureInput,
  UserPicture,
  UserPictureMetadata,
  UserPictureRepositoryPort,
} from '../application/user-picture.port.js'
import { UserPictureNotFoundError } from '../domain/user-picture.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * O recorte é sempre do banco: toda consulta atravessa `user_company_memberships` filtrando por
 * `company_id`. Conferir a empresa em memória, antes de ler, deixaria a leitura em si aberta — e é
 * a leitura que devolve bytes para o navegador de quem pediu.
 */
export class DrizzleUserPictureRepository implements UserPictureRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async find(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<UserPicture | null> {
    const [row] = await this.database
      .select({
        contentBase64: identityUserPictures.contentBase64,
        mimeType: identityUserPictures.mimeType,
        publicToken: identityUserPictures.publicToken,
        sha256: identityUserPictures.sha256,
      })
      .from(identityUserPictures)
      .innerJoin(
        userCompanyMemberships,
        eq(userCompanyMemberships.userId, identityUserPictures.userId),
      )
      .where(this.scopedTo(input))
      .limit(1)
    if (row === undefined) return null

    return {
      bytes: Buffer.from(row.contentBase64, 'base64'),
      mimeType: row.mimeType,
      publicToken: row.publicToken,
      sha256: row.sha256,
    }
  }

  /**
   * Sem `companyId` de propósito: o token é a credencial. Ele é imprevisível e gira a cada troca de
   * foto, e é o que substitui o recorte que toda outra leitura desta tabela carrega.
   */
  public async findByPublicToken(input: {
    readonly publicToken: string
  }): Promise<UserPicture | null> {
    const [row] = await this.database
      .select({
        contentBase64: identityUserPictures.contentBase64,
        mimeType: identityUserPictures.mimeType,
        publicToken: identityUserPictures.publicToken,
        sha256: identityUserPictures.sha256,
      })
      .from(identityUserPictures)
      .where(eq(identityUserPictures.publicToken, input.publicToken))
      .limit(1)
    if (row === undefined) return null

    return {
      bytes: Buffer.from(row.contentBase64, 'base64'),
      mimeType: row.mimeType,
      publicToken: row.publicToken,
      sha256: row.sha256,
    }
  }

  public async findIdentitySubject(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<string | undefined> {
    const [row] = await this.database
      .select({ subject: externalIdentities.subject })
      .from(userCompanyMemberships)
      .innerJoin(externalIdentities, eq(externalIdentities.userId, userCompanyMemberships.userId))
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.userId),
        ),
      )
      .limit(1)

    return row?.subject
  }

  public async remove(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<boolean> {
    if (!(await this.belongsToCompany(input))) return false

    const removed = await this.database
      .delete(identityUserPictures)
      .where(eq(identityUserPictures.userId, input.userId))
      .returning({ userId: identityUserPictures.userId })

    return removed.length > 0
  }

  public async save(input: SaveUserPictureInput): Promise<UserPictureMetadata> {
    /** Vínculo de outra empresa não vira foto: sem o portão, o id bastaria para escrever lá. */
    if (!(await this.belongsToCompany(input))) throw new UserPictureNotFoundError()

    const updatedAt = new Date()
    /**
     * Token novo a cada gravação, e é isso que revoga o endereço anterior: um link sem login não
     * tem outra forma de deixar de valer. Quem tinha o link da foto antiga passa a receber 404.
     */
    const publicToken = createPublicPictureToken()
    const [row] = await this.database
      .insert(identityUserPictures)
      .values({
        byteSize: input.byteSize,
        contentBase64: input.contentBase64,
        mimeType: input.mimeType,
        publicToken,
        sha256: input.sha256,
        updatedAt,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        set: {
          byteSize: input.byteSize,
          contentBase64: input.contentBase64,
          mimeType: input.mimeType,
          publicToken,
          sha256: input.sha256,
          updatedAt,
        },
        target: identityUserPictures.userId,
      })
      .returning({
        byteSize: identityUserPictures.byteSize,
        mimeType: identityUserPictures.mimeType,
        publicToken: identityUserPictures.publicToken,
        sha256: identityUserPictures.sha256,
        updatedAt: identityUserPictures.updatedAt,
      })
    if (row === undefined) throw new UserPictureNotFoundError()

    return row
  }

  private async belongsToCompany(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<boolean> {
    const [membership] = await this.database
      .select({ id: userCompanyMemberships.id })
      .from(userCompanyMemberships)
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.userId),
        ),
      )
      .limit(1)

    return membership !== undefined
  }

  private scopedTo(input: { readonly companyId: string; readonly userId: string }) {
    return and(
      eq(identityUserPictures.userId, input.userId),
      eq(userCompanyMemberships.companyId, input.companyId),
    )
  }
}

/** 32 bytes de aleatório, base64url: o endereço público é a credencial, então ele é imprevisível. */
function createPublicPictureToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}
