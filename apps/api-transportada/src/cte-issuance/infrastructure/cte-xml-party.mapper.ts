/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DacteXmlInvalidError } from '../domain/dacte.error.js'
import type {
  DacteAddress,
  DacteParty,
  DacteServiceTaker,
  DacteServiceTakerRole,
} from '../domain/dacte.types.js'

import {
  child,
  firstText,
  optional,
  requiredText,
  text,
  type XmlNode,
} from './cte-xml-node.mapper.js'

type DacteLinkedTakerRole = Exclude<DacteServiceTakerRole, 'other'>

/** `toma` aponta para um dos quadros já presentes no CT-e; `toma4` traz o tomador por extenso. */
const TAKER_ROLE_BY_CODE: Readonly<Record<string, DacteLinkedTakerRole>> = {
  '0': 'sender',
  '1': 'shipper',
  '2': 'delivery',
  '3': 'receiver',
}

export type DacteTakerParties = Readonly<{
  delivery: DacteParty | undefined
  receiver: DacteParty
  sender: DacteParty
  shipper: DacteParty | undefined
}>

export type ResolveServiceTakerParams = Readonly<{
  identification: XmlNode
  parties: DacteTakerParties
}>

export function readAddress(node: XmlNode | undefined): DacteAddress {
  if (node === undefined) throw new DacteXmlInvalidError('missing party address')
  return {
    city: requiredText(node, 'xMun'),
    district: requiredText(node, 'xBairro'),
    number: requiredText(node, 'nro'),
    state: requiredText(node, 'UF'),
    street: requiredText(node, 'xLgr'),
    ...optional('complement', text(node, 'xCpl')),
    ...optional('country', text(node, 'xPais')),
    ...optional('zipCode', text(node, 'CEP')),
  }
}

export function readParty(node: XmlNode, addressTag: string): DacteParty {
  const document = firstText(node, ['CNPJ', 'CPF'])
  if (document === undefined) throw new DacteXmlInvalidError('missing party document')
  const addressNode = child(node, addressTag)
  return {
    address: readAddress(addressNode),
    document,
    name: requiredText(node, 'xNome'),
    ...optional('email', text(node, 'email')),
    ...optional('fantasyName', text(node, 'xFant')),
    // O emitente declara o telefone dentro do endereço; as demais partes, na raiz do quadro.
    ...optional('phone', text(node, 'fone') ?? text(addressNode, 'fone')),
    ...optional('stateRegistration', text(node, 'IE')),
  }
}

export function readOptionalParty(
  node: XmlNode | undefined,
  addressTag: string,
): DacteParty | undefined {
  return node === undefined ? undefined : readParty(node, addressTag)
}

export function resolveServiceTaker(input: ResolveServiceTakerParams): DacteServiceTaker {
  const other = child(input.identification, 'toma4')
  if (other !== undefined) return { party: readParty(other, 'enderToma'), role: 'other' }

  const code = text(child(input.identification, 'toma3'), 'toma')
  const role = code === undefined ? undefined : TAKER_ROLE_BY_CODE[code]
  const party = role === undefined ? undefined : input.parties[role]
  if (role === undefined || party === undefined) {
    throw new DacteXmlInvalidError('service taker is not identified')
  }
  return { party, role }
}
