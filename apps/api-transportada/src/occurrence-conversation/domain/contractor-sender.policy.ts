/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF16: quem respondeu, puxado do cadastro **na leitura** — editar o contato atualiza as
 * mensagens antigas. O remetente casa só com os contatos da contratante da conversa (e-mail sem
 * diferença de caixa; telefone pelos dígitos, no formato do WhatsApp verificado). O endereço ou
 * número como chegou (`arrivedAs`) nunca muda. Fora dos contatos, a sugestão preenche o cadastro,
 * que só o operador cria.
 *
 * Spec 183 T903 (S2): no e-mail, o endereço só casa com o cadastro quando o DKIM alinhado com o
 * domínio do `From` confirma quem mandou (`authenticated`). Sem isso o `From` é texto livre, e a
 * mensagem sai como remetente não confirmado — nunca com o nome e os selos de um contato.
 */
import type {
  ContractorContactChannel,
  ContractorContactStatus,
  ContractorContactType,
} from '../../database/contractor-mail.schema.js'

export type ContractorSenderContact = {
  readonly contractorId: string
  readonly email: string
  readonly id: string
  readonly name: string
  readonly phone: null | string
  readonly preferredChannel: ContractorContactChannel
  readonly roleLabel: string
  readonly status: ContractorContactStatus
  readonly types: readonly ContractorContactType[]
  readonly whatsappOptInAt: null | string
}

export type ContractorSenderIdentity =
  | {
      readonly arrivedAs: string
      readonly contact: ContractorSenderContact
      readonly inactive: boolean
      readonly kind: 'contact'
      /** WhatsApp: o nome do perfil, só quando difere do cadastrado. */
      readonly profileName: null | string
    }
  | {
      readonly arrivedAs: string
      readonly displayName: null | string
      readonly kind: 'unknown'
      readonly suggestion: {
        readonly email: null | string
        readonly name: string
        readonly phone: null | string
      }
      /** E-mail sem DKIM alinhado: o endereço não prova quem mandou (T903, S2). */
      readonly unverified: boolean
    }

const normalizeEmail = (value: string): string => value.trim().toLowerCase()
const digitsOf = (value: string): string => value.replace(/\D/gu, '')

export function identifyContractorSender(input: {
  readonly address: string
  /** E-mail: DKIM alinhado com o domínio do `From`. WhatsApp: o número vem verificado pela Meta. */
  readonly authenticated: boolean
  readonly channel: 'email' | 'whatsapp'
  readonly contacts: readonly ContractorSenderContact[]
  readonly contractorId: string
  readonly displayName: null | string
}): ContractorSenderIdentity {
  const isEmail = input.channel === 'email'
  const key = isEmail ? normalizeEmail(input.address) : digitsOf(input.address)
  const unverified = isEmail && !input.authenticated
  const matches = input.contacts.filter(
    (candidate) =>
      !unverified &&
      candidate.contractorId === input.contractorId &&
      key.length > 0 &&
      (isEmail
        ? normalizeEmail(candidate.email) === key
        : candidate.phone !== null && digitsOf(candidate.phone) === key),
  )
  const match = matches.find((candidate) => candidate.status === 'active') ?? matches[0]

  if (match !== undefined) {
    const profileName =
      !isEmail && input.displayName !== null && input.displayName.trim() !== match.name.trim()
        ? input.displayName
        : null
    return {
      arrivedAs: input.address,
      contact: match,
      inactive: match.status !== 'active',
      kind: 'contact',
      profileName,
    }
  }
  return {
    arrivedAs: input.address,
    displayName: input.displayName,
    kind: 'unknown',
    suggestion: {
      email: isEmail ? key : null,
      name: input.displayName?.trim() ?? '',
      phone: isEmail ? null : key,
    },
    unverified,
  }
}
