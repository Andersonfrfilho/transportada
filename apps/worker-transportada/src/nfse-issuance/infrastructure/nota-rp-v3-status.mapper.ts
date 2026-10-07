/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { asRecord, readIdentifier, readText } from './nota-rp-v3-envelope.js'
import type { NotaRpStatusOutcome } from './nota-rp-v2.client.js'

const FAILURE_REJECTION = {
  code: 'NOTA_RP_FALHA',
  message: 'A Nota RP informou falha na emissão da nota; o listar não traz o motivo.',
} as const

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/u
const BRAZILIAN_DATE = /^(\d{2})\/(\d{2})\/(\d{4})/u
/** Âncora fixa: `new Date(authorizedAt)` cai no dia da competência em America/Sao_Paulo. */
const MIDNIGHT_SAO_PAULO = 'T00:00:00-03:00'

const PENDING_STATUSES: ReadonlySet<string> = new Set(['criada', 'enviando', 'pendente'])

export function interpretListResponse(input: {
  readonly data: Readonly<Record<string, unknown>>
  readonly providerDocumentId: string
}): NotaRpStatusOutcome {
  const results = input.data['results']
  if (!Array.isArray(results)) return { cause: 'malformed_response', status: 'error' }

  const note = asRecord(results[0])
  if (note === undefined) return { cause: 'not_found', status: 'error' }

  const returnedId = readIdentifier(note, 'id_nota')
  if (returnedId !== undefined && returnedId !== input.providerDocumentId) {
    return { cause: 'not_found', status: 'error' }
  }

  return interpretNote({ note, providerDocumentId: input.providerDocumentId })
}

function interpretNote(input: {
  readonly note: Readonly<Record<string, unknown>>
  readonly providerDocumentId: string
}): NotaRpStatusOutcome {
  const status = (readText(input.note, 'status') ?? '').toLowerCase()

  if (PENDING_STATUSES.has(status)) return { status: 'pending' }
  if (status === 'cancelada') return { status: 'cancelled' }
  if (status === 'falha') return { rejection: FAILURE_REJECTION, status: 'rejected' }
  if (status === 'sucesso') return readAuthorized(input)

  return { cause: 'malformed_response', status: 'error' }
}

/** Autorização sem número, chave de acesso ou data não é autorização arquivável. */
function readAuthorized(input: {
  readonly note: Readonly<Record<string, unknown>>
  readonly providerDocumentId: string
}): NotaRpStatusOutcome {
  const fiscalNumber = readIdentifier(input.note, 'numero')
  const verificationCode = readText(input.note, 'chave_acesso')
  const authorizedAt = readAuthorizedAt(input.note)
  if (fiscalNumber === undefined || verificationCode === undefined || authorizedAt === undefined) {
    return { cause: 'malformed_response', status: 'error' }
  }

  return {
    document: {
      authorizedAt,
      fiscalNumber,
      providerDocumentId: input.providerDocumentId,
      verificationCode,
    },
    status: 'authorized',
  }
}

/** `data_emissao` está depreciada no swagger: a competência manda e a emissão é só reserva. */
function readAuthorizedAt(note: Readonly<Record<string, unknown>>): string | undefined {
  for (const field of ['data_competencia', 'data_emissao']) {
    const day = toIsoDay(readText(note, field))
    if (day !== undefined) return `${day}${MIDNIGHT_SAO_PAULO}`
  }
  return undefined
}

function toIsoDay(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const iso = ISO_DATE.exec(value)
  if (iso?.[1] !== undefined) return iso[1]
  const brazilian = BRAZILIAN_DATE.exec(value)
  if (brazilian === null) return undefined
  return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`
}
