/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser'

import { DacteXmlInvalidError } from '../domain/dacte.error.js'
import type {
  DacteAuthorization,
  DacteCargo,
  DacteDocument,
  DacteParty,
  DacteRelatedDocument,
  DacteService,
  DacteTax,
} from '../domain/dacte.types.js'

import {
  asNode,
  child,
  list,
  optional,
  requireChild,
  requiredText,
  text,
  type XmlNode,
} from './cte-xml-node.mapper.js'
import { readOptionalParty, readParty, resolveServiceTaker } from './cte-xml-party.mapper.js'

const REPEATING_TAGS = new Set(['Comp', 'infNFe', 'infQ'])

const ACCESS_KEY_PATTERN = /^\d{44}$/u

/** `parseTagValue: false` é obrigatório: `1250.75` convertido para float binário perde centavo. */
const xmlParser = new XMLParser({
  attributeNamePrefix: '@',
  ignoreAttributes: false,
  isArray: (tag) => REPEATING_TAGS.has(tag),
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
})

export function parseCteXmlForDacte(xml: string): DacteDocument {
  if (XMLValidator.validate(xml) !== true) throw new DacteXmlInvalidError('XML is not well formed')

  const root = asNode(xmlParser.parse(xml))
  if (root === undefined) throw new DacteXmlInvalidError('empty document')

  const envelope = child(root, 'cteProc')
  const cte = envelope === undefined ? child(root, 'CTe') : child(envelope, 'CTe')
  if (cte === undefined) throw new DacteXmlInvalidError('missing CTe element')

  return buildDacteDocument({ cte, envelope })
}

type BuildDacteDocumentParams = Readonly<{
  cte: XmlNode
  envelope: XmlNode | undefined
}>

function buildDacteDocument(input: BuildDacteDocumentParams): DacteDocument {
  const infCte = requireChild(input.cte, 'infCte')
  const identification = requireChild(infCte, 'ide')
  const normal = child(infCte, 'infCTeNorm')
  const parties = readParties(infCte)

  return {
    accessKey: readAccessKey(infCte),
    cargo: readCargo(child(normal, 'infCarga')),
    cfop: requiredText(identification, 'CFOP'),
    destination: {
      city: requiredText(identification, 'xMunFim'),
      state: requiredText(identification, 'UFFim'),
    },
    documentType: requiredText(identification, 'tpCTe'),
    emitter: parties.emitter,
    environment: requiredText(identification, 'tpAmb') === '1' ? 'production' : 'homologation',
    issuedAt: requiredText(identification, 'dhEmi'),
    modal: requiredText(identification, 'modal'),
    model: requiredText(identification, 'mod'),
    natureOfOperation: requiredText(identification, 'natOp'),
    number: requiredText(identification, 'nCT'),
    origin: {
      city: requiredText(identification, 'xMunIni'),
      state: requiredText(identification, 'UFIni'),
    },
    printMode: requiredText(identification, 'tpImp'),
    receiver: parties.receiver,
    relatedDocuments: readRelatedDocuments(child(normal, 'infDoc')),
    sender: parties.sender,
    series: requiredText(identification, 'serie'),
    service: readService(requireChild(infCte, 'vPrest')),
    serviceTaker: resolveServiceTaker({ identification, parties }),
    serviceType: requiredText(identification, 'tpServ'),
    tax: readTax(requireChild(infCte, 'imp')),
    ...optional('authorization', readAuthorization(input.envelope)),
    ...optional('deliveryParty', parties.delivery),
    ...optional('observations', text(child(infCte, 'compl'), 'xObs')),
    ...optional('qrCodeUrl', text(child(input.cte, 'infCTeSupl'), 'qrCodCTe')),
    ...optional('rntrc', text(child(child(normal, 'infModal'), 'rodo'), 'RNTRC')),
    ...optional('shipper', parties.shipper),
  }
}

type CteParties = Readonly<{
  delivery: DacteParty | undefined
  emitter: DacteParty
  receiver: DacteParty
  sender: DacteParty
  shipper: DacteParty | undefined
}>

function readParties(infCte: XmlNode): CteParties {
  return {
    delivery: readOptionalParty(child(infCte, 'receb'), 'enderReceb'),
    emitter: readParty(requireChild(infCte, 'emit'), 'enderEmit'),
    receiver: readParty(requireChild(infCte, 'dest'), 'enderDest'),
    sender: readParty(requireChild(infCte, 'rem'), 'enderReme'),
    shipper: readOptionalParty(child(infCte, 'exped'), 'enderExped'),
  }
}

function readAccessKey(infCte: XmlNode): string {
  const identifier = infCte['@Id']
  const digits = typeof identifier === 'string' ? identifier.replace(/^CTe/u, '') : ''
  if (!ACCESS_KEY_PATTERN.test(digits)) {
    throw new DacteXmlInvalidError('infCte Id is not a 44 digit access key')
  }
  return digits
}

function readService(node: XmlNode): DacteService {
  return {
    components: list(node, 'Comp').map((component) => ({
      name: requiredText(component, 'xNome'),
      value: requiredText(component, 'vComp'),
    })),
    totalAmount: requiredText(node, 'vTPrest'),
    ...optional('receivedAmount', text(node, 'vRec')),
  }
}

function readCargo(node: XmlNode | undefined): DacteCargo {
  if (node === undefined) throw new DacteXmlInvalidError('missing infCarga')
  return {
    predominantProduct: requiredText(node, 'proPred'),
    quantities: list(node, 'infQ').map((quantity) => ({
      measureType: requiredText(quantity, 'tpMed'),
      quantity: requiredText(quantity, 'qCarga'),
      unitCode: requiredText(quantity, 'cUnid'),
    })),
    ...optional('insuredAmount', text(node, 'vCargaAverb')),
    ...optional('totalAmount', text(node, 'vCarga')),
  }
}

/** O grupo do ICMS varia com o regime (`ICMS00`, `ICMS60`, `ICMSSN`…), mas o CST é sempre `CST`. */
function readTax(node: XmlNode): DacteTax {
  const group = child(node, 'ICMS')
  const situation = group === undefined ? undefined : findIcmsSituation(group)
  if (situation === undefined) throw new DacteXmlInvalidError('missing ICMS group')

  return {
    isSimplesNacional: situation.tag === 'ICMSSN',
    situationCode: requiredText(situation.node, 'CST'),
    ...optional('amount', text(situation.node, 'vICMS')),
    ...optional('approximateTaxAmount', text(node, 'vTotTrib')),
    ...optional('baseAmount', text(situation.node, 'vBC')),
    ...optional('rate', text(situation.node, 'pICMS')),
    ...optional('reductionPercent', text(situation.node, 'pRedBC')),
  }
}

function findIcmsSituation(group: XmlNode): { node: XmlNode; tag: string } | undefined {
  for (const [tag, value] of Object.entries(group)) {
    const node = asNode(value)
    if (node !== undefined && tag.startsWith('ICMS')) return { node, tag }
  }
  return undefined
}

function readRelatedDocuments(node: XmlNode | undefined): readonly DacteRelatedDocument[] {
  return list(node, 'infNFe').map((document) => ({
    accessKey: requiredText(document, 'chave'),
    ...optional('expectedDeliveryDate', text(document, 'dPrev')),
  }))
}

function readAuthorization(envelope: XmlNode | undefined): DacteAuthorization | undefined {
  const protocol = child(child(envelope, 'protCTe'), 'infProt')
  if (protocol === undefined) return undefined
  return {
    protocol: requiredText(protocol, 'nProt'),
    receivedAt: requiredText(protocol, 'dhRecbto'),
  }
}
