/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './trip.fixture'

const DIALOG_PATH = 'src/modules/trip/components/TripQuickCreateDialog.component.tsx'
const WORKSPACE_PATH = 'src/modules/trip/pages/TripWorkspace.page.tsx'
const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const KEY = '35260805868574001090550020008797821213909363'
const OTHER_KEY = '35260805868574001090550020008797831510434413'

type ScannedDocument = Readonly<{
  accessKey: string
  emitterName: string
  id: string
  issuedAt: string
  number: string
  recipientName: string
  series: string
  status: 'authorized' | 'cancelled' | 'denied'
  totalAmount: string
  tripId: null | string
}>

function scanned(overrides: Partial<ScannedDocument> = {}): ScannedDocument {
  return {
    accessKey: KEY,
    emitterName: 'ZARAGOZA',
    id: 'document-1',
    issuedAt: '2026-08-24T10:00:00.000Z',
    number: '879782',
    recipientName: 'GOLFETO',
    series: '2',
    status: 'authorized',
    totalAmount: '881.07',
    tripId: null,
    ...overrides,
  }
}

type QuickCreateModule = Readonly<{
  acceptQuickCreateScan: (input: {
    queue: readonly unknown[]
    text: string
  }) => Readonly<{ accessKey?: string; queue: readonly { accessKey: string; status: string }[] }>
  resolveQuickCreateEntry: (input: {
    accessKey: string
    document: ScannedDocument | null
    queue: readonly unknown[]
  }) => readonly Readonly<{ accessKey: string; refusal?: string; status: string }>[]
  stagedDocumentIds: (queue: readonly unknown[]) => readonly string[]
  validateQuickCreate: (input: {
    driverIds: readonly string[]
    queue: readonly unknown[]
    vehicleId: string
  }) => readonly string[]
}>

function loadQuickCreate(): Promise<QuickCreateModule> {
  return loadFutureModule<QuickCreateModule>(
    '../../src/modules/trip/shared/tripQuickCreate.service',
  )
}

describe('trip quick create contract', () => {
  /**
   * A câmera dispara a cada quadro e a mesma etiqueta passa duas vezes o tempo todo. Sem isto a
   * lista ganharia uma linha por quadro e a mesma nota seria consultada dezenas de vezes.
   */
  test('ignores text without a key and never queues the same key twice', async () => {
    const { acceptQuickCreateScan } = await loadQuickCreate()

    expect(acceptQuickCreateScan({ queue: [], text: 'nada aqui' }).accessKey).toBeUndefined()

    const first = acceptQuickCreateScan({ queue: [], text: KEY })
    expect(first.accessKey).toBe(KEY)
    expect(first.queue).toHaveLength(1)

    const repeated = acceptQuickCreateScan({ queue: first.queue, text: KEY })
    expect(repeated.accessKey).toBeUndefined()
    expect(repeated.queue).toHaveLength(1)
  })

  /**
   * ⚠️ **É esta a regra que a tela existe para cumprir.** Nota já em viagem é encontrada pela busca:
   * sem a recusa aqui, ela entraria na lista e o operador só descobriria no vínculo — com a viagem
   * criada e a carga já no caminhão.
   */
  test('refuses an invoice that is already on another trip', async () => {
    const { resolveQuickCreateEntry, stagedDocumentIds } = await loadQuickCreate()

    const queue = resolveQuickCreateEntry({
      accessKey: KEY,
      document: scanned({ tripId: 'trip-9' }),
      queue: [{ accessKey: KEY, status: 'resolving' }],
    })

    expect(queue[0]?.status).toBe('refused')
    expect(queue[0]?.refusal).toBe('alreadyOnTrip')
    expect(stagedDocumentIds(queue)).toEqual([])
  })

  test('refuses an invoice the tax authority did not authorise, and one that does not exist', async () => {
    const { resolveQuickCreateEntry } = await loadQuickCreate()

    const cancelled = resolveQuickCreateEntry({
      accessKey: KEY,
      document: scanned({ status: 'cancelled' }),
      queue: [{ accessKey: KEY, status: 'resolving' }],
    })
    expect(cancelled[0]?.refusal).toBe('notAuthorized')

    const missing = resolveQuickCreateEntry({
      accessKey: KEY,
      document: null,
      queue: [{ accessKey: KEY, status: 'resolving' }],
    })
    expect(missing[0]?.refusal).toBe('notFound')
  })

  /** O veredito chega fora de ordem, e "limpar" pode ter passado no meio da consulta. */
  test('drops a verdict for a key that left the queue', async () => {
    const { resolveQuickCreateEntry } = await loadQuickCreate()

    const queue = resolveQuickCreateEntry({
      accessKey: KEY,
      document: scanned(),
      queue: [{ accessKey: OTHER_KEY, status: 'resolving' }],
    })

    expect(queue).toEqual([{ accessKey: OTHER_KEY, status: 'resolving' }] as never)
  })

  test('only staged invoices become links, and the trip needs an invoice, a driver and a vehicle', async () => {
    const { resolveQuickCreateEntry, stagedDocumentIds, validateQuickCreate } =
      await loadQuickCreate()

    const staged = resolveQuickCreateEntry({
      accessKey: KEY,
      document: scanned(),
      queue: [{ accessKey: KEY, status: 'resolving' }],
    })
    expect(stagedDocumentIds(staged)).toEqual(['document-1'])

    expect(validateQuickCreate({ driverIds: [], queue: [], vehicleId: '' })).toEqual([
      'noDocument',
      'driverRequired',
      'vehicleRequired',
    ])
    expect(
      validateQuickCreate({ driverIds: ['driver-1'], queue: staged, vehicleId: 'vehicle-1' }),
    ).toEqual([])
  })

  /**
   * Câmera é opcional por desenho: navegador sem ela, ou com a permissão negada, tem de continuar
   * criando viagem — e o caminho é o campo digitado, que passa pelo mesmo serviço do bipe.
   */
  test('keeps the typed key as a path of its own, gated behind the same service', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain('quickCreate.acceptScan(typedKey)')
    expect(dialog).toContain('quickCreate.canScan ? (')
  })

  /** A viagem criada abre no detalhe: quem bipou dez notas quer conferir o roteiro, não procurá-lo. */
  test('opens the created trip instead of leaving the operator on the list', async () => {
    const workspace = await readApplicationFile(WORKSPACE_PATH)

    expect(workspace).toContain('navigateToTrip({ navigator: createBrowserWorkspaceNavigator()')
    expect(workspace).toContain('<TripQuickCreateDialog')
  })

  /**
   * O formulário vazio saiu: ele criava uma casca sem nota e obrigava a abrir o detalhe para só
   * então começar a bipar. Se ele voltar, voltam dois caminhos de criação discordando na mesma tela.
   */
  test('leaves no empty creation form behind', async () => {
    const workspace = await readApplicationFile(WORKSPACE_PATH)

    expect(workspace).not.toContain('TripCreationPanel')
    expect(workspace).not.toContain('useTripCreation')
  })
})
