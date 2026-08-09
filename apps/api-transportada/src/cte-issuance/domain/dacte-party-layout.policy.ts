/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DacteAddress, DacteParty, DacteServiceTakerRole } from './dacte.types.js'
import {
  formatDacteDocumentNumber,
  formatDactePhone,
  formatDacteZipCode,
} from './dacte-format.policy.js'
import { DACTE_LAYOUT_COLUMNS, type DacteLayoutSection } from './dacte-layout.types.js'

const TAKER_ROLE_LABELS: Readonly<Record<DacteServiceTakerRole, string>> = {
  delivery: 'Recebedor',
  other: 'Outros',
  receiver: 'Destinatário',
  sender: 'Remetente',
  shipper: 'Expedidor',
}

function describeZipCodeSuffix(address: DacteAddress): string {
  return address.zipCode === undefined ? '' : `   CEP ${formatDacteZipCode(address.zipCode)}`
}

export function formatDacteStreet(address: DacteAddress): string {
  const complement = address.complement === undefined ? '' : ` - ${address.complement}`
  return `${address.street}, ${address.number}${complement} - ${address.district}`
}

export function describeDacteTakerRole(role: DacteServiceTakerRole): string {
  return TAKER_ROLE_LABELS[role]
}

/** O emitente ocupa o cabeçalho em texto corrido, ao lado do logotipo e do código de barras. */
export function buildDacteEmitterLines(party: DacteParty): readonly string[] {
  const registration =
    party.stateRegistration === undefined ? '' : `   IE ${party.stateRegistration}`
  return [
    party.name,
    ...(party.fantasyName === undefined ? [] : [party.fantasyName]),
    formatDacteStreet(party.address),
    `${party.address.city} - ${party.address.state}${describeZipCodeSuffix(party.address)}`,
    `CNPJ/CPF ${formatDacteDocumentNumber(party.document)}${registration}`,
    ...(party.phone === undefined ? [] : [`Fone ${formatDactePhone(party.phone)}`]),
  ]
}

export function buildDactePartySection(title: string, party: DacteParty): DacteLayoutSection {
  return {
    rows: [
      {
        fields: [
          { label: 'NOME', value: party.name, width: 8 },
          { label: 'CNPJ/CPF', value: formatDacteDocumentNumber(party.document), width: 4 },
        ],
      },
      {
        fields: [
          { label: 'ENDEREÇO', value: formatDacteStreet(party.address), width: 8 },
          { label: 'INSCRIÇÃO ESTADUAL', value: party.stateRegistration ?? '', width: 4 },
        ],
      },
      {
        fields: [
          { label: 'MUNICÍPIO', value: party.address.city, width: 5 },
          { label: 'UF', value: party.address.state, width: 1 },
          {
            label: 'CEP',
            value:
              party.address.zipCode === undefined ? '' : formatDacteZipCode(party.address.zipCode),
            width: 3,
          },
          {
            label: 'FONE',
            value: party.phone === undefined ? '' : formatDactePhone(party.phone),
            width: 3,
          },
        ],
      },
    ],
    title,
  }
}

export function buildDacteInvoiceKeysSection(keys: readonly string[]): DacteLayoutSection {
  const width = DACTE_LAYOUT_COLUMNS / 2
  const rows = []
  for (let index = 0; index < keys.length; index += 2) {
    rows.push({
      fields: keys.slice(index, index + 2).map((key) => ({
        label: 'CHAVE DE ACESSO DA NF-E',
        value: key,
        width,
      })),
    })
  }
  return { rows, title: 'DOCUMENTOS ORIGINÁRIOS' }
}
