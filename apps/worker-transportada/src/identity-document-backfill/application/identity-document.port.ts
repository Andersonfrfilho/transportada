/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type RealmUser = {
  readonly attributes: Readonly<Record<string, string | readonly string[]>>
  readonly subject: string
}

export type RealmUserPage = {
  readonly hasMore: boolean
  readonly users: readonly RealmUser[]
}

/** A fatia do provedor que o backfill precisa: ler o realm em páginas e escrever atributo. */
export type IdentityRealmPort = {
  listUsers(input: { readonly first: number; readonly limit: number }): Promise<RealmUserPage>
  updateAttributes(input: {
    readonly attributes: Readonly<Record<string, string | readonly string[]>>
    readonly userId: string
  }): Promise<void>
}

export type LocalDocument = {
  readonly companyId: string
  readonly subject: string
  readonly taxId: string
}

/** Lê o documento que a base guarda, endereçado pelo `subject` — a chave que os dois lados têm. */
export type LocalDocumentSource = {
  findBySubjects(input: { readonly subjects: readonly string[] }): Promise<readonly LocalDocument[]>
}
