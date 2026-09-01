/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LoginIdentifierKind } from '../../database/login-identifier.schema.js'

export type IdentityProfileSnapshot = {
  readonly contactAddress: string
  readonly contactChannel: string
  readonly email: string
  readonly phone: string
  readonly taxId: string
}

export type ProjectedLoginIdentifier = {
  readonly kind: LoginIdentifierKind
  readonly value: string
}

/**
 * Por onde a pessoa pode se identificar, derivado da ficha dela.
 *
 * `login_identifiers` é **projeção**, não cadastro paralelo: ela é reconstruída a cada escrita do
 * perfil, e por isso não tem como divergir dele. A alternativa — inserir na criação e lembrar de
 * manter — é a que produziu a tabela vazia que existia antes desta regra: criada, lida pela tela de
 * login e pela listagem, e nunca escrita por ninguém.
 *
 * E-mail é **conjunto**: o endereço por onde o convite foi e o que autentica no provedor são os dois
 * da mesma pessoa, e quem digita na tela de login lembra de um ou de outro. Guardar um só obrigaria
 * a escolher qual dos dois deixa de funcionar.
 */
export function projectLoginIdentifiers(
  profile: IdentityProfileSnapshot,
): readonly ProjectedLoginIdentifier[] {
  const emails = [
    profile.email,
    /** O contato só é e-mail quando o canal diz que é: telefone ali viraria e-mail que nunca casa. */
    profile.contactChannel === 'email' ? profile.contactAddress : '',
  ]

  const identifiers = [
    ...emails.map((value) => ({ kind: 'email' as const, value: normalize(value) })),
    { kind: 'document' as const, value: normalize(profile.taxId) },
    { kind: 'phone' as const, value: normalize(profile.phone) },
  ].filter((identifier) => identifier.value !== '')

  /** O banco tem unique por `(usuário, tipo, valor)`: o mesmo endereço nos dois campos é um só. */
  return [...new Map(identifiers.map((entry) => [`${entry.kind}:${entry.value}`, entry])).values()]
}

/**
 * O CHECK da tabela exige `value = lower(btrim(value))`: guardar com caixa ou espaço faria a busca
 * por igualdade não achar quem existe, e o banco recusaria a linha antes disso.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase()
}
