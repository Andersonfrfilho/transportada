/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §6, D6): quem assina o e-mail da ocorrência e as três variáveis que isso gera. Pura. O assinante
 * não é gravado: ele só existe até o e-mail ser montado.
 */
import { COMPANY_ROLES, type CompanyRole } from '../../database/identity.schema.js'
import { COMPANY_ROLE_LABELS } from '../../identity/domain/company-role-label.constant.js'

/** Manual → o operador; automático → o dono (porta da 273) ou, sem dono, a equipe. */
export type OccurrenceMailSigner =
  | {
      /** Já resolvido por `resolveSignerJobTitle`; ausente é sem cargo nem papel. */
      readonly jobTitle?: string
      readonly kind: 'operator' | 'owner'
      readonly name: string
      readonly userId: string
    }
  | { readonly kind: 'team' }

export type SignerMailValues = {
  readonly assinaturaCargo: string
  readonly assinaturaIniciais: string
  readonly assinaturaNome: string
}

const INITIALS_LENGTH = 2
const INITIAL_PATTERN = /^[\p{L}\p{N}]/u
const WHITESPACE = /\s+/u

/**
 * O cargo livre (D10) vence; sem ele, o rótulo do primeiro papel **direto** na ordem de `COMPANY_ROLES` (D11), nunca
 * na ordem em que a leitura devolveu; nenhum dos dois, ausente.
 */
export function resolveSignerJobTitle(params: {
  readonly directRoles: readonly CompanyRole[]
  readonly jobTitle: null | string | undefined
}): string | undefined {
  const jobTitle = params.jobTitle?.trim() ?? ''
  if (jobTitle !== '') return jobTitle
  const role = COMPANY_ROLES.find((candidate) => params.directRoles.includes(candidate))
  return role === undefined ? undefined : COMPANY_ROLE_LABELS[role]
}

/** As primeiras letras das duas primeiras palavras, em maiúscula; pontuação solta não conta. */
export function buildInitials(name: string): string {
  return name
    .split(WHITESPACE)
    .filter((word) => INITIAL_PATTERN.test(word))
    .slice(0, INITIALS_LENGTH)
    .map((word) => (Array.from(word)[0] ?? '').toLocaleUpperCase('pt-BR'))
    .join('')
}

export function buildSignerValues(params: {
  readonly companyDisplayName: string
  readonly signer: OccurrenceMailSigner
}): SignerMailValues {
  const { companyDisplayName, signer } = params
  if (signer.kind === 'team') {
    return {
      assinaturaCargo: '',
      assinaturaIniciais: buildInitials(companyDisplayName),
      assinaturaNome: `Equipe ${companyDisplayName}`,
    }
  }
  return {
    assinaturaCargo: signer.jobTitle ?? '',
    assinaturaIniciais: buildInitials(signer.name),
    assinaturaNome: signer.name,
  }
}
