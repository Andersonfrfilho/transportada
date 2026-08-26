import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  AggregateDocumentRequestError,
  createAggregateDocumentClient,
} from '../../src/modules/fleet/shared/aggregateDocumentClient.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const TAB_PATH = 'src/modules/fleet/components/AggregateDocumentsTab.component.tsx'

async function readApplicationFile(relativePath: string): Promise<string> {
  return readFile(fileURLToPath(new URL(relativePath, APPLICATION_ROOT)), 'utf8')
}

function clientWith(respond: (request: Request) => Response) {
  const requests: Request[] = []
  const client = createAggregateDocumentClient({
    apiBaseUrl: 'http://api.local',
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(respond(request))
    },
    getAccessToken: () => Promise.resolve('token-123'),
  })
  return { client, requests }
}

describe('aggregate document review client', () => {
  test('lists the queue with the divergence the API computed', async () => {
    const { client, requests } = clientWith(
      () =>
        new Response(
          JSON.stringify({
            data: [
              {
                createdAt: '2026-08-26T12:00:00.000Z',
                divergences: [
                  { declared: '12345678901', extracted: '99999999999', field: 'licenseNumber' },
                ],
                hasExtraction: true,
                id: 'document-1',
                rejectionReason: '',
                status: 'pending',
                taxId: '12345678901',
                type: 'cnh',
                updatedAt: '2026-08-26T12:00:00.000Z',
              },
            ],
          }),
          { status: 200 },
        ),
    )

    const documents = await client.list()

    expect(requests[0]?.url).toBe('http://api.local/aggregate-documents')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer token-123')
    expect(documents[0]?.divergences[0]?.field).toBe('licenseNumber')
    expect(documents[0]?.hasExtraction).toBe(true)
  })

  test('sends the decision and the reason on the review route', async () => {
    const { client, requests } = clientWith(() => new Response(JSON.stringify({ data: {} })))

    await client.review({
      decision: 'rejected',
      id: 'document-1',
      rejectionReason: 'foto ilegível',
    })

    expect(requests[0]?.url).toBe('http://api.local/aggregate-documents/document-1/review')
    expect(requests[0]?.method).toBe('POST')
    expect(await (requests[0]?.clone().json() ?? Promise.resolve(null))).toEqual({
      decision: 'rejected',
      rejectionReason: 'foto ilegível',
    })
  })

  /** O binário nunca é servido direto — o painel pede a URL assinada e abre aquela. */
  test('asks for a signed url instead of linking the object', async () => {
    const { client, requests } = clientWith(
      () => new Response(JSON.stringify({ data: { url: 'https://bucket.local/assinada' } })),
    )

    const url = await client.getDownloadUrl('document-1')

    expect(requests[0]?.url).toBe('http://api.local/aggregate-documents/document-1/download')
    expect(url).toBe('https://bucket.local/assinada')
  })

  test('collapses a refusal and a network failure into the same request error', async () => {
    const refused = clientWith(() => new Response(null, { status: 403 }))
    const refusalError = await refused.client.list().catch((caught: unknown) => caught)
    expect(refusalError).toBeInstanceOf(AggregateDocumentRequestError)

    const broken = createAggregateDocumentClient({
      apiBaseUrl: 'http://api.local',
      fetch: () => Promise.reject(new Error('rede fora')),
      getAccessToken: () => Promise.resolve('token-123'),
    })
    const networkError = await broken.list().catch((caught: unknown) => caught)
    expect(networkError).toBeInstanceOf(AggregateDocumentRequestError)
  })
})

describe('aggregate documents tab', () => {
  test('never renders the reject action without a reason behind it', async () => {
    const source = await readApplicationFile(TAB_PATH)

    // a recusa passa pelo diálogo, e o diálogo só confirma com motivo preenchido
    expect(source).toContain("setRejectDialog({ documentId: document.id, reason: '' })")
    expect(source).toContain('const canConfirm = reason.trim().length > 0')
    expect(source).toContain('disabled={!canConfirm}')
  })

  /** "Nada divergiu" e "não deu para conferir" não podem virar o mesmo selo verde. */
  test('separates the unverified document from the one that matches', async () => {
    const source = await readApplicationFile(TAB_PATH)

    expect(source).toContain(
      "if (!document.hasExtraction) return <span>{t('documents.check.unverified')}</span>",
    )
    expect(source).toContain("t('documents.check.matches')")
    expect(source).toContain("t('documents.check.divergent'")
  })

  test('gives each document type an icon from the primitive, never an emoji', async () => {
    const source = await readApplicationFile(TAB_PATH)

    expect(source).toContain("import { Icon, type IconName } from '@/components/ui/icon'")
    expect(source).toContain('TYPE_ICON')
    expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})
