/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 301: os envios de XML por e-mail e WhatsApp, com o desfecho de cada um. Leitura só: quem grava é o webhook
 * (WhatsApp) e o consumidor de e-mail; quem decide o desfecho é o worker.
 */
/** Spec 303: o desfecho da importação que o envio gerou. `finishedAt` nulo = ainda entrando. */
export type NfeXmlReceiptImport = Readonly<{
  contractors: readonly Readonly<{ count: number; name: string; taxId: null | string }>[]
  counts: Readonly<{
    duplicated: number
    failed: number
    imported: number
    invalid: number
    received: number
    rejected: number
  }>
  finishedAt: null | string
  status: string
}>

export type NfeXmlReceipt = Readonly<{
  channel: 'email' | 'whatsapp'
  createdAt: string
  filesCount: number
  id: string
  import: NfeXmlReceiptImport | null
  importId: null | string
  lastErrorCode: null | string
  rejectReason: null | string
  sender: string
  status: 'failed' | 'imported' | 'pending' | 'processing' | 'rejected'
}>

const STATUSES: ReadonlySet<string> = new Set([
  'failed',
  'imported',
  'pending',
  'processing',
  'rejected',
])

type Dependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export function createNfeXmlReceiptsClient(dependencies: Dependencies) {
  return {
    async list(limit = 20): Promise<readonly NfeXmlReceipt[]> {
      const accessToken = await dependencies.getAccessToken()
      const response = await dependencies.fetch(
        new Request(`${dependencies.apiUrl}/nfe-xml-receipts?limit=${limit}`, {
          cache: 'no-store',
          headers: { authorization: `Bearer ${accessToken}` },
          method: 'GET',
        }),
      )
      if (!response.ok) throw new Error('NFE_XML_RECEIPTS_REQUEST_FAILED')
      return parseNfeXmlReceipts((await response.json()) as unknown)
    },
  }
}

export function parseNfeXmlReceipts(body: unknown): readonly NfeXmlReceipt[] {
  const data = isRecord(body) ? body.data : undefined
  if (!Array.isArray(data)) throw new Error('NFE_XML_RECEIPTS_RESPONSE_INVALID')
  return data.flatMap((item): NfeXmlReceipt[] => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      (item.channel !== 'email' && item.channel !== 'whatsapp') ||
      typeof item.status !== 'string' ||
      !STATUSES.has(item.status) ||
      typeof item.createdAt !== 'string' ||
      typeof item.sender !== 'string'
    ) {
      return []
    }
    return [
      {
        channel: item.channel,
        createdAt: item.createdAt,
        filesCount: typeof item.filesCount === 'number' ? item.filesCount : 0,
        id: item.id,
        import: parseImport(item.import),
        importId: typeof item.importId === 'string' ? item.importId : null,
        lastErrorCode: typeof item.lastErrorCode === 'string' ? item.lastErrorCode : null,
        rejectReason: typeof item.rejectReason === 'string' ? item.rejectReason : null,
        sender: item.sender,
        status: item.status as NfeXmlReceipt['status'],
      },
    ]
  })
}

/** Só o que não terminou bem pede olho: recusado, falhou ou ainda na fila. */
export function needsAttention(receipt: NfeXmlReceipt): boolean {
  return receipt.status !== 'imported'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseImport(value: unknown): NfeXmlReceiptImport | null {
  if (!isRecord(value) || !isRecord(value.counts) || typeof value.status !== 'string') return null
  const counts = value.counts
  return {
    contractors: Array.isArray(value.contractors)
      ? value.contractors.flatMap((contractor): NfeXmlReceiptImport['contractors'] => {
          if (!isRecord(contractor) || typeof contractor.name !== 'string') return []
          return [
            {
              count: count(contractor.count),
              name: contractor.name,
              taxId: typeof contractor.taxId === 'string' ? contractor.taxId : null,
            },
          ]
        })
      : [],
    counts: {
      duplicated: count(counts.duplicated),
      failed: count(counts.failed),
      imported: count(counts.imported),
      invalid: count(counts.invalid),
      received: count(counts.received),
      rejected: count(counts.rejected),
    },
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : null,
    status: value.status,
  }
}
