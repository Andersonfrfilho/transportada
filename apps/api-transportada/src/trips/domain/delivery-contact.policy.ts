/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 P2: quem recebe a carga, e como falar com ele.
 *
 * ⚠️ **O dado já vem na nota.** `<enderDest><fone>` é gravado em `nfe_addresses.phone` desde a spec
 * 013, e `nfe_participants` traz razão social, nome fantasia e documento. Nada aqui é coletado — é
 * leitura do que o emitente declarou no XML fiscal.
 *
 * O uso é operacional e nomeado: quem entrega precisa avisar que chegou, e quem atende no
 * escritório precisa retornar a ligação de quem está esperando a carga. O telefone **não sai do
 * detalhe da viagem** para nenhuma lista, nenhum relatório e nenhum canal automático.
 */

const RECIPIENT_ROLES = new Set(['delivery', 'recipient'])
const LANDLINE_DIGITS = 10
const MOBILE_DIGITS = 11

export type DeliveryParty = {
  readonly legalName: string
  readonly phone: string
  readonly role: string
  readonly taxId: string
  readonly tradeName: string
}

export type ContractorRecord = {
  readonly displayName: string
  readonly taxId: string
}

export type DeliveryContact = {
  /** O contratante do frete — quem paga. `null` quando o documento não está cadastrado. */
  readonly contractorName: null | string
  readonly name: string
  /** `null` quando o emitente não declarou telefone. Nunca string vazia. */
  readonly phone: null | string
  readonly taxId: string
}

/**
 * O telefone sai formatado porque é para ser lido e discado, não conferido byte a byte. Número que
 * não é telefone brasileiro **sai como veio**: inventar formato para ele esconderia o defeito do
 * dado, e quem lê precisa ver que está estranho.
 */
function formatPhone(value: string): null | string {
  const digits = value.replace(/\D/g, '')
  if (digits === '') return null

  if (digits.length === LANDLINE_DIGITS) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  if (digits.length === MOBILE_DIGITS) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  return value
}

/**
 * ⚠️ **A nota não diz quem é o contratante** — quem diz é o cadastro. O participante cujo documento
 * está em `contractors` é ele; documento fora do cadastro **não vira contratante por parecer**.
 *
 * O nome fantasia vence a razão social porque é como o cliente é chamado no telefone; a razão
 * social é o que está no contrato, e quem atende não a reconhece.
 */
export function resolveDeliveryContact(input: {
  readonly contractors: readonly ContractorRecord[]
  readonly parties: readonly DeliveryParty[]
}): DeliveryContact | null {
  const recipient = input.parties.find((party) => RECIPIENT_ROLES.has(party.role))
  if (recipient === undefined) return null

  const byTaxId = new Map(input.contractors.map((record) => [record.taxId, record.displayName]))
  const contractor = input.parties
    .map((party) => byTaxId.get(party.taxId))
    .find((name) => name !== undefined)

  return {
    contractorName: contractor ?? null,
    name: recipient.tradeName === '' ? recipient.legalName : recipient.tradeName,
    phone: formatPhone(recipient.phone),
    taxId: recipient.taxId,
  }
}
