/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LoginIdentifierKind } from '../../database/login-identifier.schema.js'

export type LoginIdentifierRepositoryPort = {
  /**
   * Todos os donos do identificador, não o primeiro. Telefone é compartilhado no mundo real, e é a
   * política que decide o que fazer com o empate — devolver um só esconderia a ambiguidade aqui.
   */
  findByIdentifier(input: {
    readonly kind: LoginIdentifierKind
    readonly value: string
  }): Promise<readonly { readonly username: string }[]>
}
