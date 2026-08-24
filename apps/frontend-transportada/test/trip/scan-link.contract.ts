/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule, NFE_ACCESS_KEY } from './trip.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const LINK_HOOK_PATH = 'src/modules/trip/hooks/useTripDocumentLinkForm.hook.ts'
const DETAIL_PATH = 'src/modules/trip/components/TripDetail.component.tsx'
const SCAN_QUEUE_PATH = 'src/modules/trip/components/TripScanQueue.component.tsx'

const SECOND_ACCESS_KEY = '352608A1B2C3D4E5F644444444444444444444444444'
/** A DANFE traz a chave dentro da URL do portal: o mesmo papel lido duas vezes é a mesma nota. */
const SCANNED_URL = `https://www.nfe.fazenda.gov.br/portal/consulta.aspx?chNFe=${NFE_ACCESS_KEY}`

type TripScanEntry = Readonly<{ accessKey: string; issueKey?: string; status: string }>
type TripScanQueue = readonly TripScanEntry[]
type TripScanAcceptance = Readonly<{ accessKey?: string; queue: TripScanQueue }>

type ScanQueueModule = {
  readonly acceptScannedText: (
    input: Readonly<{ queue: TripScanQueue; text: string }>,
  ) => TripScanAcceptance
  readonly isTripScanEntryPending: (entry: TripScanEntry) => boolean
  readonly markScanEntry: (
    input: Readonly<{
      accessKey: string
      issueKey?: string
      queue: TripScanQueue
      status: string
    }>,
  ) => TripScanQueue
}

function loadScanQueue(): Promise<ScanQueueModule> {
  return loadFutureModule<ScanQueueModule>('../../src/modules/trip/shared/tripScanQueue.service')
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** A asserção é sobre o corpo de uma função só: `setIsScannerOpen` continua vivo em `closeScanner`. */
function readFunctionBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`TRIP_CONTRACT_FUNCTION_MISSING:${signature}`)

  let depth = 0
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }

  throw new Error(`TRIP_CONTRACT_FUNCTION_UNCLOSED:${signature}`)
}

describe('trip scan sequence contract', () => {
  test('turns the read that carries a key into a row waiting for the lookup', async () => {
    const { acceptScannedText } = await loadScanQueue()

    const acceptance = acceptScannedText({ queue: [], text: SCANNED_URL })

    expect(acceptance.accessKey).toBe(NFE_ACCESS_KEY)
    expect(acceptance.queue).toEqual([{ accessKey: NFE_ACCESS_KEY, status: 'resolving' }])
  })

  test('reads in sequence, keeping the order in which the notes passed the camera', async () => {
    const { acceptScannedText } = await loadScanQueue()

    const first = acceptScannedText({ queue: [], text: NFE_ACCESS_KEY })
    const second = acceptScannedText({ queue: first.queue, text: SECOND_ACCESS_KEY })

    expect(second.accessKey).toBe(SECOND_ACCESS_KEY)
    expect(second.queue.map((entry) => entry.accessKey)).toEqual([
      NFE_ACCESS_KEY,
      SECOND_ACCESS_KEY,
    ])
  })

  /**
   * A câmera devolve o que estiver na frente dela: código de embalagem e QR de rastreio passam o
   * tempo todo, e transformar cada um deles em linha entulharia a tela de quem separa o palete.
   */
  test('discards in silence the read that carries no key', async () => {
    const { acceptScannedText } = await loadScanQueue()
    const queue = acceptScannedText({ queue: [], text: NFE_ACCESS_KEY }).queue

    for (const text of ['7891234567895', 'https://rastreio.example.test/AB123', '   ']) {
      const acceptance = acceptScannedText({ queue, text })

      expect(acceptance.accessKey).toBeUndefined()
      expect(acceptance.queue).toBe(queue)
    }
  })

  /**
   * O código fica segundos na frente da lente e a leitura dispara a cada quadro: sem a recusa da
   * repetição, uma nota só renderia dezenas de buscas e dezenas de vínculos.
   */
  test('says nothing when the same note comes back in front of the camera', async () => {
    const { acceptScannedText } = await loadScanQueue()
    const queue = acceptScannedText({ queue: [], text: NFE_ACCESS_KEY }).queue

    for (const text of [NFE_ACCESS_KEY, SCANNED_URL, NFE_ACCESS_KEY.toLowerCase()]) {
      const acceptance = acceptScannedText({ queue, text })

      expect(acceptance.accessKey).toBeUndefined()
      expect(acceptance.queue).toBe(queue)
    }
  })

  /** Nota recusada continua na lista, e continuar na lista é o que impede a segunda chamada. */
  test('keeps refusing the second read of a note the trip already turned down', async () => {
    const { acceptScannedText, markScanEntry } = await loadScanQueue()
    const accepted = acceptScannedText({ queue: [], text: NFE_ACCESS_KEY }).queue
    const queue = markScanEntry({
      accessKey: NFE_ACCESS_KEY,
      issueKey: 'documentAlreadyLinked',
      queue: accepted,
      status: 'refused',
    })

    const acceptance = acceptScannedText({ queue, text: NFE_ACCESS_KEY })

    expect(acceptance.accessKey).toBeUndefined()
    expect(acceptance.queue).toBe(queue)
  })

  test('lands the refusal on the row of its note, leaving the neighbours as they were', async () => {
    const { acceptScannedText, markScanEntry } = await loadScanQueue()
    const first = acceptScannedText({ queue: [], text: NFE_ACCESS_KEY }).queue
    const both = acceptScannedText({ queue: first, text: SECOND_ACCESS_KEY }).queue
    const linked = markScanEntry({ accessKey: NFE_ACCESS_KEY, queue: both, status: 'linked' })

    const queue = markScanEntry({
      accessKey: SECOND_ACCESS_KEY,
      issueKey: 'documentAlreadyDelivered',
      queue: linked,
      status: 'refused',
    })

    expect(queue).toEqual([
      { accessKey: NFE_ACCESS_KEY, status: 'linked' },
      {
        accessKey: SECOND_ACCESS_KEY,
        issueKey: 'documentAlreadyDelivered',
        status: 'refused',
      },
    ])
  })

  /** Vereditos chegam fora de ordem: o que perdeu a linha dele não pode ressuscitá-la. */
  test('ignores a verdict for a key the list no longer holds', async () => {
    const { markScanEntry } = await loadScanQueue()
    const queue: TripScanQueue = [{ accessKey: NFE_ACCESS_KEY, status: 'linked' }]

    expect(
      markScanEntry({
        accessKey: SECOND_ACCESS_KEY,
        issueKey: 'documentNotFound',
        queue,
        status: 'refused',
      }),
    ).toBe(queue)
  })

  test('calls pending exactly what the skeleton has to cover', async () => {
    const { isTripScanEntryPending } = await loadScanQueue()

    expect(isTripScanEntryPending({ accessKey: NFE_ACCESS_KEY, status: 'resolving' })).toBe(true)
    expect(isTripScanEntryPending({ accessKey: NFE_ACCESS_KEY, status: 'linking' })).toBe(true)
    expect(isTripScanEntryPending({ accessKey: NFE_ACCESS_KEY, status: 'linked' })).toBe(false)
    expect(
      isTripScanEntryPending({
        accessKey: NFE_ACCESS_KEY,
        issueKey: 'documentNotFound',
        status: 'refused',
      }),
    ).toBe(false)
  })

  /** Confirmar nota a nota mata o ritmo: a lente segue aberta enquanto o palete passa por ela. */
  test('leaves the camera open between reads', async () => {
    const hook = await readApplicationFile(LINK_HOOK_PATH)

    expect(hook).toContain('acceptScannedText')
    expect(readFunctionBody(hook, 'function acceptScan(')).not.toContain('setIsScannerOpen')
  })

  /** A recusa da linha é a mesma da tela: código do erro traduzido pelo mapa que o módulo já tem. */
  test('names the refusal through the shared error map, never by hand', async () => {
    const hook = await readApplicationFile(LINK_HOOK_PATH)

    expect(hook).toContain("from '../shared/tripFeedback.service'")
    expect(hook).toContain('resolveTripFeedbackKey')
  })

  test('covers the key resolution with the skeleton and prints the refusal on the row', async () => {
    const detail = await readApplicationFile(DETAIL_PATH)
    const queue = await readApplicationFile(SCAN_QUEUE_PATH)

    expect(detail).toContain('<TripScanQueue')
    expect(detail).toContain('entries={linkForm.scanEntries}')
    expect(queue).toContain("from '@/components/ui/skeleton'")
    expect(queue).toContain('entries.map(')
    expect(queue).toContain('isTripScanEntryPending(entry)')
    expect(queue).toContain('<Skeleton')
    expect(queue).toContain('feedback.${entry.issueKey}')
  })

  test('names every label of the sequence in both locales', async () => {
    const [ptBr, english] = await Promise.all([
      readApplicationFile('src/modules/trip/locales/trip.locale.json'),
      readApplicationFile('src/modules/trip/locales/trip.en.locale.json'),
    ])

    const detailKeys = [
      'scanQueueTitle',
      'scanQueueKeyColumn',
      'scanQueueStatusColumn',
      'scanQueueResolving',
      'scanQueueLinking',
      'scanQueueLinked',
      'scanQueueClear',
    ]

    const ptBrLocale = JSON.parse(ptBr) as Readonly<{ detail: Readonly<Record<string, string>> }>
    const englishLocale = JSON.parse(english) as Readonly<{
      detail: Readonly<Record<string, string>>
    }>

    for (const key of detailKeys) {
      expect(ptBrLocale.detail).toHaveProperty(key)
      expect(englishLocale.detail).toHaveProperty(key)
    }
  })
})
