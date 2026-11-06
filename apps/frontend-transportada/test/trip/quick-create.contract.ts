/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './trip.fixture'

const DIALOG_PATH = 'src/modules/trip/components/TripQuickCreateDialog.component.tsx'
const INTAKE_PATH = 'src/modules/trip/components/TripNoteIntake.component.tsx'
const WORKSPACE_PATH = 'src/modules/trip/pages/TripWorkspace.page.tsx'
const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const KEY = '35260805868574001090550020008797821213909363'

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

type QuickCreateEntry = Readonly<{ accessKey: string; refusal?: string; status: string }>

type QuickCreateModule = Readonly<{
  stageQuickCreateDocuments: (input: {
    documents: readonly ScannedDocument[]
    queue: readonly unknown[]
  }) => readonly QuickCreateEntry[]
  stagedDocumentIds: (queue: readonly unknown[]) => readonly string[]
  validateQuickCreate: (input: {
    dailyAllowanceDays: Readonly<{ of: string }>
    driverIds: readonly string[]
    path: 'draft' | 'singleClick'
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
   * ⚠️ **É esta a regra que a tela existe para cumprir.** Nota já em viagem é encontrada pela busca:
   * sem a recusa aqui, ela entraria na lista e o operador só descobriria no vínculo — com a viagem
   * criada e a carga já no caminhão.
   */
  test('refuses an invoice that is already on another trip', async () => {
    const { stageQuickCreateDocuments, stagedDocumentIds } = await loadQuickCreate()

    const queue = stageQuickCreateDocuments({
      documents: [scanned({ tripId: 'trip-9' })],
      queue: [],
    })

    expect(queue[0]?.status).toBe('refused')
    expect(queue[0]?.refusal).toBe('alreadyOnTrip')
    expect(stagedDocumentIds(queue)).toEqual([])
  })

  test('refuses an invoice the tax authority did not authorise', async () => {
    const { stageQuickCreateDocuments } = await loadQuickCreate()

    const cancelled = stageQuickCreateDocuments({
      documents: [scanned({ status: 'cancelled' })],
      queue: [],
    })
    expect(cancelled[0]?.refusal).toBe('notAuthorized')
  })

  /** A mesma nota vinda do bipe e depois da busca continua com uma linha só. */
  test('never queues the same key twice', async () => {
    const { stageQuickCreateDocuments } = await loadQuickCreate()

    const once = stageQuickCreateDocuments({ documents: [scanned()], queue: [] })
    const twice = stageQuickCreateDocuments({ documents: [scanned()], queue: once })

    expect(twice).toHaveLength(1)
  })

  test('only staged invoices become links, and the trip needs an invoice, a driver and a vehicle', async () => {
    const { stageQuickCreateDocuments, stagedDocumentIds, validateQuickCreate } =
      await loadQuickCreate()

    const staged = stageQuickCreateDocuments({ documents: [scanned()], queue: [] })
    expect(stagedDocumentIds(staged)).toEqual(['document-1'])

    const absentDays = { of: 'absent' } as const
    expect(
      validateQuickCreate({
        dailyAllowanceDays: absentDays,
        driverIds: [],
        path: 'singleClick',
        queue: [],
        vehicleId: '',
      }),
    ).toEqual(['noDocument', 'driverRequired', 'vehicleRequired'])
    expect(
      validateQuickCreate({
        dailyAllowanceDays: absentDays,
        driverIds: ['driver-1'],
        path: 'singleClick',
        queue: staged,
        vehicleId: 'vehicle-1',
      }),
    ).toEqual([])
  })

  /**
   * Spec 217 (RF1/D5, T503): o caminho do rascunho não exige tripulação — só nota — e o clique
   * único continua exigindo os dois. A mesma função, dois caminhos, para não divergirem em silêncio.
   */
  test('the draft path needs only a document; the single-click path still needs a driver and a vehicle', async () => {
    const { stageQuickCreateDocuments, validateQuickCreate } = await loadQuickCreate()

    const staged = stageQuickCreateDocuments({ documents: [scanned()], queue: [] })
    const absentDays = { of: 'absent' } as const

    expect(
      validateQuickCreate({
        dailyAllowanceDays: absentDays,
        driverIds: [],
        path: 'draft',
        queue: staged,
        vehicleId: '',
      }),
    ).toEqual([])
    expect(
      validateQuickCreate({
        dailyAllowanceDays: absentDays,
        driverIds: [],
        path: 'draft',
        queue: [],
        vehicleId: '',
      }),
    ).toEqual(['noDocument'])
    expect(
      validateQuickCreate({
        dailyAllowanceDays: absentDays,
        driverIds: [],
        path: 'singleClick',
        queue: staged,
        vehicleId: '',
      }),
    ).toEqual(['driverRequired', 'vehicleRequired'])
  })

  /**
   * Spec 298 (T3.2): o bipe deixou de acrescentar direto. O campo de leitura é o do design system
   * (leitor de mão primeiro, câmera como segundo caminho) e quem decide a entrada é "Acrescentar".
   */
  test('reads keys through the handheld field, with the camera as a second path', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)
    const intake = await readApplicationFile(INTAKE_PATH)

    expect(dialog).toContain('<TripNoteIntake')
    expect(dialog).not.toContain('acceptScan')
    expect(dialog).not.toContain('submitTyped')
    expect(intake).toContain('<TripBippedNotes')
    const bippedNotes = await readApplicationFile(
      'src/modules/trip/components/TripBippedNotes.component.tsx',
    )
    expect(bippedNotes).toContain('<KeyReaderField')
    expect(bippedNotes).toContain('canScan ? (')
  })

  /**
   * Spec 217 (RF1/D5, T504): "Salvar rascunho" fica ao lado do botão de criar-e-planejar, chamando
   * a mesma mutação com `asDraft: true` — e gated pelo `draftIssues` do caminho do rascunho, não
   * pelo `issues` do clique único.
   */
  test('offers "save draft" beside the single-click button, gated by the draft issues', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain('quickCreate.createMutation.mutate({ asDraft: true })')
    expect(dialog).toContain('quickCreate.createMutation.mutate({ asDraft: false })')
    expect(dialog).toContain('disabled={quickCreate.draftIssues.length > 0')
    expect(dialog).toContain("{t('quickCreate.submitDraft')}")
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
