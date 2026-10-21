/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF16: quem respondeu, puxado do cadastro **na leitura** — editar o contato atualiza as
 * mensagens antigas. O remetente casa só com os contatos da contratante da conversa (e-mail sem
 * diferença de caixa; telefone pelos dígitos, no formato do WhatsApp verificado). O endereço ou
 * número como chegou (`arrivedAs`) nunca muda. Fora dos contatos, a sugestão preenche o cadastro,
 * que só o operador cria.
 *
 * Spec 267 RF9: o usuário da empresa que responde a um e-mail em que estava em cópia é `internal` — nunca sugestão de
 * cadastro. Vale a mesma regra do contato: só com DKIM alinhado, senão um `From` forjado com o endereço dele passaria.
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

/** Spec 267 RF9: usuário da empresa, para reconhecer o responsável que responde a um e-mail com cópia. */
export type ContractorSenderCompanyUser = {
  readonly emails: readonly string[]
  readonly name: string
  readonly userId: string
}

export type ContractorSenderIdentity =
  | {
      readonly arrivedAs: string
      readonly kind: 'internal'
      readonly name: string
      /** Algum contato ativo da contratante estava no `To`/`Cc` do e-mail recebido. */
      readonly reachedContractor: boolean
      readonly userId: string
    }
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

function findCompanyUser(
  users: readonly ContractorSenderCompanyUser[],
  key: string,
): ContractorSenderCompanyUser | undefined {
  if (key.length === 0) return undefined
  return users.find((user) => user.emails.some((email) => normalizeEmail(email) === key))
}

export function identifyContractorSender(input: {
  readonly address: string
  /** E-mail: DKIM alinhado com o domínio do `From`. WhatsApp: o número vem verificado pela Meta. */
  readonly authenticated: boolean
  readonly channel: 'email' | 'whatsapp'
  readonly companyUsers?: readonly ContractorSenderCompanyUser[]
  readonly contacts: readonly ContractorSenderContact[]
  readonly contractorId: string
  readonly displayName: null | string
  /** `To` ∪ `Cc` do e-mail recebido; só serve ao `reachedContractor` do responsável. */
  readonly receivedAddresses?: readonly string[]
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
  const user = unverified || !isEmail ? undefined : findCompanyUser(input.companyUsers ?? [], key)
  if (user !== undefined) {
    const received = new Set((input.receivedAddresses ?? []).map(normalizeEmail))
    return {
      arrivedAs: input.address,
      kind: 'internal',
      name: user.name,
      reachedContractor: input.contacts.some(
        (candidate) =>
          candidate.contractorId === input.contractorId &&
          candidate.status === 'active' &&
          received.has(normalizeEmail(candidate.email)),
      ),
      userId: user.userId,
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
