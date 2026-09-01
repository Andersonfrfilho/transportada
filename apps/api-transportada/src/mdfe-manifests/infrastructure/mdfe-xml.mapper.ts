/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser'

import { DamdfeXmlInvalidError } from '../domain/damdfe.error.js'
import type { DamdfeDocument } from '../domain/damdfe.types.js'

/**
 * Toda tag que pode repetir precisa chegar como lista: com uma ocorrência só, o parser devolveria
 * objeto, e um manifesto de uma cidade de descarga perderia a cidade na hora de desenhar.
 */
const REPEATING_TAGS = new Set([
  'condutor',
  'infCTe',
  'infMunCarrega',
  'infMunDescarga',
  'infNFe',
  'veicReboque',
])

/** `parseTagValue: false` é obrigatório: `1250.75` convertido para float binário perde centavo. */
const xmlParser = new XMLParser({
  attributeNamePrefix: '@',
  ignoreAttributes: false,
  isArray: (tag) => REPEATING_TAGS.has(tag),
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
})

type XmlNode = Record<string, unknown>

export function parseMdfeXmlForDamdfe(xml: string): DamdfeDocument {
  if (XMLValidator.validate(xml) !== true) throw new DamdfeXmlInvalidError('XML is not well formed')

  const root = asNode(xmlParser.parse(xml))
  if (root === undefined) throw new DamdfeXmlInvalidError('empty document')

  const envelope = child(root, 'mdfeProc')
  const mdfe = envelope === undefined ? child(root, 'MDFe') : child(envelope, 'MDFe')
  if (mdfe === undefined) throw new DamdfeXmlInvalidError('missing MDFe element')

  const infMdfe = requireChild(mdfe, 'infMDFe')
  const identification = requireChild(infMdfe, 'ide')
  const emitter = requireChild(infMdfe, 'emit')
  const address = child(emitter, 'enderEmit')
  const road = child(child(infMdfe, 'infModal'), 'rodo')
  const traction = child(road, 'veicTracao')
  const totals = child(infMdfe, 'tot')
  const protocol = child(child(envelope, 'protMDFe'), 'infProt')

  return {
    accessKey: readAccessKey(infMdfe),
    additionalInformation: text(child(infMdfe, 'infAdic'), 'infCpl') ?? '',
    authorizedAt: text(protocol, 'dhRecbto') ?? '',
    cargoWeight: text(totals, 'qCarga') ?? '',
    cargoValue: text(totals, 'vCarga') ?? '',
    cteCount: text(totals, 'qCTe') ?? '0',
    dischargeCities: list(child(infMdfe, 'infDoc'), 'infMunDescarga').map((city) => ({
      cteKeys: list(city, 'infCTe').map((document) => text(document, 'chCTe') ?? ''),
      name: text(city, 'xMunDescarga') ?? '',
      nfeKeys: list(city, 'infNFe').map((document) => text(document, 'chNFe') ?? ''),
    })),
    drivers: list(traction, 'condutor').map((driver) => ({
      name: text(driver, 'xNome') ?? '',
      taxId: text(driver, 'CPF') ?? '',
    })),
    emitter: {
      address: buildEmitterAddress(address),
      name: text(emitter, 'xNome') ?? '',
      stateRegistration: text(emitter, 'IE') ?? '',
      taxId: text(emitter, 'CNPJ') ?? text(emitter, 'CPF') ?? '',
    },
    environment: requiredText(identification, 'tpAmb') === '1' ? 'production' : 'homologation',
    issuedAt: requiredText(identification, 'dhEmi'),
    loadingCities: list(identification, 'infMunCarrega').map(
      (city) => text(city, 'xMunCarrega') ?? '',
    ),
    modal: requiredText(identification, 'modal'),
    nfeCount: text(totals, 'qNFe') ?? '0',
    number: requiredText(identification, 'nMDF'),
    originState: requiredText(identification, 'UFIni'),
    destinationState: requiredText(identification, 'UFFim'),
    protocol: text(protocol, 'nProt') ?? '',
    rntrc: text(child(road, 'infANTT'), 'RNTRC') ?? '',
    series: requiredText(identification, 'serie'),
    trailerPlates: list(road, 'veicReboque').map((trailer) => text(trailer, 'placa') ?? ''),
    vehicle: {
      capacityKg: text(traction, 'capKG') ?? '',
      plate: text(traction, 'placa') ?? '',
      tare: text(traction, 'tara') ?? '',
    },
  }
}

/** O `Id` vem com o prefixo `MDFe` grudado na chave — é assim no layout, e não é erro. */
function readAccessKey(infMdfe: XmlNode): string {
  const raw = infMdfe['@Id']
  if (typeof raw !== 'string') throw new DamdfeXmlInvalidError('missing infMDFe Id')
  const accessKey = raw.replace(/^MDFe/u, '')
  if (accessKey.length !== 44) throw new DamdfeXmlInvalidError('malformed access key')
  return accessKey
}

function buildEmitterAddress(address: XmlNode | undefined): string {
  if (address === undefined) return ''
  const street = [text(address, 'xLgr'), text(address, 'nro')].filter(Boolean).join(', ')
  const city = [text(address, 'xMun'), text(address, 'UF')].filter(Boolean).join('/')
  return [street, text(address, 'xBairro'), city].filter(Boolean).join(' - ')
}

function asNode(value: unknown): XmlNode | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as XmlNode
}

function child(node: XmlNode | undefined, tag: string): XmlNode | undefined {
  return node === undefined ? undefined : asNode(node[tag])
}

function requireChild(node: XmlNode, tag: string): XmlNode {
  const found = child(node, tag)
  if (found === undefined) throw new DamdfeXmlInvalidError(`missing element ${tag}`)
  return found
}

function text(node: XmlNode | undefined, tag: string): string | undefined {
  if (node === undefined) return undefined
  const value = node[tag]
  if (typeof value !== 'string' || value.length === 0) return undefined
  return value
}

function requiredText(node: XmlNode, tag: string): string {
  const value = text(node, tag)
  if (value === undefined) throw new DamdfeXmlInvalidError(`missing element ${tag}`)
  return value
}

function list(node: XmlNode | undefined, tag: string): readonly XmlNode[] {
  const value = node === undefined ? undefined : node[tag]
  if (!Array.isArray(value)) return []
  return value.map(asNode).filter((item): item is XmlNode => item !== undefined)
}
