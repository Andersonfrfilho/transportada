/**
 * Contrato do vínculo com a nota de serviço na coluna de status das Notas. A frase inteira ("já
 * vinculada a uma nota de serviço") ocupava mais espaço que o próprio status e se repetia linha após
 * linha; aqui ela é um ícone que leva ao detalhe da nota, e o texto vive no rótulo acessível. O
 * número só existe depois que a prefeitura autoriza, então os dois rótulos são guardados.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildNfseInvoiceDetailHref,
  parseNfseInvoiceParameter,
} from '../../src/modules/nfse-invoice/shared/nfseInvoiceRoute.service'
import { NFSE_LINK_BLOCK_REASON } from '../../src/modules/nfe-workspace/shared/nfeWorkspace.constant'
import type { NfeDocumentListItem } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import {
  DOCUMENT_LIST_PAGE,
  SYNTHETIC_ACCESS_TOKEN,
  loadFutureModule,
} from './nfe-workspace.fixture'

type NfeWorkspaceClientModule = {
  readonly createNfeWorkspaceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    listDocuments: (input: {
      readonly cursor: null | string
      readonly limit: number
    }) => Promise<{ readonly items: readonly NfeDocumentListItem[] }>
  }
}

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const TABLE_PATH = 'src/modules/nfe-workspace/components/NfeDocumentTable.component.tsx'
const STYLES_PATH = 'src/modules/nfe-workspace/styles/nfeWorkspace.module.css'
const NAVIGATION_PATH = 'src/main.tsx'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function listDocumentsFrom(
  payload: unknown,
): Promise<{ readonly items: readonly NfeDocumentListItem[] }> {
  return loadFutureModule<NfeWorkspaceClientModule>(
    '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
  ).then(({ createNfeWorkspaceClient }) =>
    createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(Response.json({ data: payload, page: { nextCursor: null } })),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    }).listDocuments({ cursor: null, limit: 20 }),
  )
}

describe('nfe document nfse link payload contract', () => {
  test('carries the invoice id and number from the listing into the document item', async () => {
    const page = await listDocumentsFrom([
      {
        ...DOCUMENT_LIST_PAGE.items[0],
        cteBlockReason: NFSE_LINK_BLOCK_REASON,
        nfseBlockReason: NFSE_LINK_BLOCK_REASON,
        nfseInvoiceId: 'invoice-1',
        nfseInvoiceNumber: '451',
      },
    ])

    expect(page.items[0]?.nfseInvoiceId).toBe('invoice-1')
    expect(page.items[0]?.nfseInvoiceNumber).toBe('451')
  })

  test('accepts a link without number: the vínculo existe antes da prefeitura numerar', async () => {
    const page = await listDocumentsFrom([
      {
        ...DOCUMENT_LIST_PAGE.items[0],
        cteBlockReason: NFSE_LINK_BLOCK_REASON,
        nfseBlockReason: NFSE_LINK_BLOCK_REASON,
        nfseInvoiceId: 'invoice-1',
        nfseInvoiceNumber: null,
      },
    ])

    expect(page.items[0]?.nfseInvoiceId).toBe('invoice-1')
    expect(page.items[0]?.nfseInvoiceNumber).toBeNull()
  })

  test('rejects a listing payload whose invoice link is not a nullable string', async () => {
    const failure = await listDocumentsFrom([
      { ...DOCUMENT_LIST_PAGE.items[0], nfseInvoiceId: 7 },
    ]).catch((caught: unknown) => caught)

    expect(failure).toEqual(expect.objectContaining({ message: 'NFE_WORKSPACE_RESPONSE_INVALID' }))
  })
})

describe('nfse invoice detail address contract', () => {
  test('the address is the listing with the invoice open, and it round-trips', () => {
    const href = buildNfseInvoiceDetailHref('invoice-1')

    expect(href).toBe('/nfse-invoices?invoice=invoice-1')
    expect(parseNfseInvoiceParameter(new URL(href, 'https://app.example.test').search)).toBe(
      'invoice-1',
    )
  })

  test('no invoice parameter means no invoice to open', () => {
    expect(parseNfseInvoiceParameter('')).toBeNull()
    expect(parseNfseInvoiceParameter('?cursor=abc')).toBeNull()
    expect(parseNfseInvoiceParameter('?invoice=')).toBeNull()
  })

  test('the navigation hands the parameter to the workspace page', async () => {
    const navigation = await readApplicationFile(NAVIGATION_PATH)

    expect(navigation).toContain('parseNfseInvoiceParameter')
    expect(navigation).toContain('openInvoiceId={parseNfseInvoiceParameter(input.search)}')
  })
})

describe('nfe document nfse link icon contract', () => {
  test('the link is an icon from the design system, never a raw svg', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(table).toContain('<Icon name="invoice" />')
    expect(table).not.toContain('<svg')
  })

  test('the icon carries the text it replaced, on hover and for the screen reader', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(table).toContain('aria-label={nfseLink.label}')
    /**
     * A dica saiu do `title` nativo para `@/components/ui/tooltip` — o atributo só aparecia depois
     * de cerca de um segundo com o ponteiro parado, e quem passava o mouse concluía que não havia
     * dica nenhuma. O que este contrato cobra não mudou: o texto continua existindo na passagem do
     * mouse **e** no leitor de tela, por caminhos separados.
     */
    expect(table).toContain('<Tooltip label={nfseLink.label}>')
    expect(table).not.toContain('title={nfseLink.label}')
    expect(table).toContain("t('documents.nfseLink', { number: document.nfseInvoiceNumber })")
    expect(table).toContain("t('documents.nfseLinkPending')")
  })

  test('the icon links to the invoice detail built by the route service', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(table).toContain('buildNfseInvoiceDetailHref(document.nfseInvoiceId)')
    expect(table).toContain('href={nfseLink.href}')
  })

  test('only the nfse block becomes a link, and only when there is an invoice to open', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(NFSE_LINK_BLOCK_REASON).toBe('CTE_BATCH_DOCUMENT_LINKED_TO_NFSE')
    expect(table).toContain('if (document.cteBlockReason !== NFSE_LINK_BLOCK_REASON) return null')
    expect(table).toContain('if (document.nfseInvoiceId === null) return null')
  })

  test('the long phrase stays for the other block reasons, and only for them', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(table).toContain('{nfseLink === null && document.cteBlockReason !== null && (')
  })

  test('the icon sits beside the status without pushing the column', async () => {
    const styles = await readApplicationFile(STYLES_PATH)

    expect(styles).toMatch(/\.nfseLink\s*\{[^}]*display:\s*inline-flex;/)
    expect(styles).toMatch(/\.nfseLink\s*\{[^}]*margin-left:\s*var\(--space-2\);/)
  })
})

describe('nfe document nfse link locale contract', () => {
  test('both locales carry the two labels, with the number interpolated', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'),
      readApplicationFile('src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'),
    ])

    for (const locale of [ptLocale, enLocale]) {
      expect(locale).toContain('"nfseLink"')
      expect(locale).toContain('"nfseLinkPending"')
      expect(locale).toContain('{{number}}')
    }
  })
})
