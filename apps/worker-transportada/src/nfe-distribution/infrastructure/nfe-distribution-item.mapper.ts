/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

import type { DfeItem, ImportedNfeXml } from '@adatechnology/fiscal-provider'

import type { NfeItemVariant } from '../../database/nfe.schema.js'
import { CHAVE_PATTERN } from '../../shared/tax-id.service.js'
import type { NfeXmlImporter } from '../../nfe-imports/infrastructure/nfe-xml-importer.gateway.js'
import type { DistributionSummary } from './drizzle-nfe-distribution.repository.js'

const SUMMARY_SCHEMAS: ReadonlySet<string> = new Set(['resNFe', 'resEvento'])
const EVENT_SCHEMA = 'procEventoNFe'
// A SEFAZ manda o nome do arquivo do schema no docZip (`resEvento_v1.01.xsd`), versão e extensão
// inclusas; o pacote fiscal entrega cru
const SCHEMA_VERSION_SUFFIX = /_v\d+(?:\.\d+)*(?:\.xsd)?$/i
// O prefixo de namespace é opcional porque falhar aqui não derruba a página: a chave viraria nula
// em silêncio, e um resumo sem chave não serve para nada
const SUMMARY_ACCESS_KEY_ELEMENT =
  /<(?:[A-Za-z0-9._-]+:)?chNFe>\s*([A-Za-z0-9]{44})\s*<\/(?:[A-Za-z0-9._-]+:)?chNFe>/

export type PreparedSummary = {
  readonly accessKey: string | undefined
  readonly dfe: DfeItem
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
  readonly variant: 'summary'
}

export type PreparedEvent = {
  readonly accessKey: string
  readonly dfe: DfeItem
  readonly normalizedXml: ImportedNfeXml
  readonly sequence: string
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
  readonly type: string
  readonly variant: 'event'
}

export type PreparedDocument = {
  readonly accessKey: string
  readonly dfe: DfeItem
  readonly normalizedXml: ImportedNfeXml
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
  readonly variant: 'complete'
}

export type PreparedItem = PreparedDocument | PreparedEvent | PreparedSummary

/**
 * O XML é lido e classificado sem tocar em bucket nem em banco — é essa separação que permite
 * perguntar o que já existe antes de gravar qualquer coisa.
 */
export async function prepareDistributionItem(params: {
  readonly dfe: DfeItem
  readonly xmlImporter: NfeXmlImporter
}): Promise<PreparedItem> {
  const { dfe, xmlImporter } = params
  const sourceBytes = gunzipSync(Buffer.from(dfe.xmlComprimido, 'base64'))
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex')
  const variant = classifyVariant(dfe.schema)

  if (variant === 'summary') {
    const accessKey = resolveSummaryAccessKey({ dfe, sourceBytes })
    return { accessKey, dfe, sourceBytes, sourceSha256, variant }
  }

  const xml = new TextDecoder().decode(sourceBytes)
  const normalizedXml = await xmlImporter.importXml({ xml })

  if (variant === 'event') {
    if (normalizedXml.kind !== 'nfe-event') {
      throw new Error('NFE_DISTRIBUTION_EVENT_XML_MISMATCH')
    }
    return {
      accessKey: normalizedXml.event.accessKey,
      dfe,
      normalizedXml,
      sequence: String(normalizedXml.event.sequence),
      sourceBytes,
      sourceSha256,
      type: normalizedXml.event.type,
      variant,
    }
  }

  if (normalizedXml.kind === 'nfe-event') {
    throw new Error('NFE_DISTRIBUTION_DOCUMENT_XML_MISMATCH')
  }
  return {
    accessKey: normalizedXml.document.accessKey,
    dfe,
    normalizedXml,
    sourceBytes,
    sourceSha256,
    variant,
  }
}

export function buildDistributionSummary(params: {
  readonly accessKey: string | undefined
  readonly dfe: DfeItem
}): DistributionSummary {
  const { accessKey, dfe } = params
  return {
    ...(accessKey !== undefined ? { accessKey } : {}),
    ...(dfe.emitenteCnpj !== undefined ? { emitterCnpj: dfe.emitenteCnpj } : {}),
    ...(dfe.dataEmissao !== undefined ? { issuedAt: dfe.dataEmissao } : {}),
    ...(dfe.situacao !== undefined ? { situacao: dfe.situacao } : {}),
    ...(dfe.valorTotal !== undefined ? { totalValue: String(dfe.valorTotal) } : {}),
  }
}

/**
 * O pacote fiscal nem sempre preenche `chaveNfe` no resumo, e a chave verdadeira está no `<chNFe>`
 * do próprio XML — sintetizar um valor a partir do NSU violava o CHECK da coluna e derrubava a
 * página inteira. A guarda é `CHAVE_PATTERN`, não dígito: a chave de emitente com CNPJ alfanumérico
 * tem letra nas doze posições da base, e um literal só de dígito a jogaria fora em silêncio.
 */
function resolveSummaryAccessKey(params: {
  readonly dfe: DfeItem
  readonly sourceBytes: Uint8Array
}): string | undefined {
  const { dfe, sourceBytes } = params

  if (dfe.chaveNfe !== undefined && CHAVE_PATTERN.test(dfe.chaveNfe)) {
    return dfe.chaveNfe
  }

  const xml = new TextDecoder().decode(sourceBytes)
  const candidate = SUMMARY_ACCESS_KEY_ELEMENT.exec(xml)?.[1]
  return candidate !== undefined && CHAVE_PATTERN.test(candidate) ? candidate : undefined
}

function classifyVariant(schema: string): NfeItemVariant {
  const normalizedSchema = schema.replace(SCHEMA_VERSION_SUFFIX, '')

  if (SUMMARY_SCHEMAS.has(normalizedSchema)) {
    return 'summary'
  }
  if (normalizedSchema === EVENT_SCHEMA) {
    return 'event'
  }
  return 'complete'
}
