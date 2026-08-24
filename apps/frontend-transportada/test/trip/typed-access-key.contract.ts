/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule, NFE_ACCESS_KEY, NFE_DOCUMENT_ID } from './trip.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const DETAIL_PATH = 'src/modules/trip/components/TripDetail.component.tsx'
const LINK_HOOK_PATH = 'src/modules/trip/hooks/useTripDocumentLinkForm.hook.ts'
const FORM_SERVICE_PATH = '../../src/modules/trip/shared/tripForm.service'

type TripDocumentLinkDraft = Readonly<{ mode: 'freight' | 'nfe'; value: string }>

type TripLinkReference =
  | Readonly<{ kind: 'accessKey'; value: string }>
  | Readonly<{ kind: 'identifier'; value: string }>
  | undefined

type TripFormModule = Readonly<{
  resolveTripLinkReference: (draft: TripDocumentLinkDraft) => TripLinkReference
}>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function loadTripForm(): Promise<TripFormModule> {
  return loadFutureModule<TripFormModule>(FORM_SERVICE_PATH)
}

type LocaleFile = Readonly<{
  detail: Readonly<Record<string, string>>
  feedback: Readonly<Record<string, string>>
}>

describe('trip typed access key contract', () => {
  /**
   * O separador sem câmera lê a chave impressa sob o código de barras e digita: o campo é o mesmo
   * que já recebia o identificador, e quem separa as duas leituras é o formato, não um segundo campo.
   */
  test('reads the printed key in the field that already took the identifier', async () => {
    const { resolveTripLinkReference } = await loadTripForm()

    expect(resolveTripLinkReference({ mode: 'nfe', value: NFE_ACCESS_KEY })).toEqual({
      kind: 'accessKey',
      value: NFE_ACCESS_KEY,
    })
    expect(
      resolveTripLinkReference({ mode: 'nfe', value: ` ${NFE_ACCESS_KEY.toLowerCase()} ` }),
    ).toEqual({
      kind: 'accessKey',
      value: NFE_ACCESS_KEY,
    })
    expect(
      resolveTripLinkReference({
        mode: 'nfe',
        value: `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?p=${NFE_ACCESS_KEY}|2|1|1|abc`,
      }),
    ).toEqual({ kind: 'accessKey', value: NFE_ACCESS_KEY })
  })

  /** O identificador continua sendo identificador: a chave não substituiu o caminho que já existia. */
  test('keeps the identifier the operator pastes from the workspace', async () => {
    const { resolveTripLinkReference } = await loadTripForm()

    expect(resolveTripLinkReference({ mode: 'nfe', value: NFE_DOCUMENT_ID })).toEqual({
      kind: 'identifier',
      value: NFE_DOCUMENT_ID,
    })
  })

  /**
   * Cálculo de frete não tem chave de acesso: ler 44 caracteres ali como chave mandaria a busca de
   * nota atrás de um frete, e a nota não seria achada por motivo nenhum que o operador entendesse.
   */
  test('never reads a freight reference as a note key', async () => {
    const { resolveTripLinkReference } = await loadTripForm()

    expect(resolveTripLinkReference({ mode: 'freight', value: NFE_ACCESS_KEY })).toEqual({
      kind: 'identifier',
      value: NFE_ACCESS_KEY,
    })
  })

  /** Campo vazio não é referência: sem isso o botão de vincular dispararia uma busca em branco. */
  test('says nothing when the field is empty', async () => {
    const { resolveTripLinkReference } = await loadTripForm()

    expect(resolveTripLinkReference({ mode: 'nfe', value: '' })).toBeUndefined()
    expect(resolveTripLinkReference({ mode: 'nfe', value: '   ' })).toBeUndefined()
    expect(resolveTripLinkReference({ mode: 'freight', value: ' ' })).toBeUndefined()
  })

  /** Botão que não pode funcionar é pior que botão ausente — no iPhone sem HTTPS ele nunca abriria. */
  test('hides the reading button where the camera is impossible', async () => {
    const [detail, hook] = await Promise.all([
      readApplicationFile(DETAIL_PATH),
      readApplicationFile(LINK_HOOK_PATH),
    ])

    expect(hook).toContain(
      "import { isCameraCapable } from '@/components/ui/barcodeScanner.service'",
    )
    expect(hook).toContain('isCameraCapable(globalThis.navigator)')
    expect(detail).toContain("import { BarcodeScanner } from '@/components/ui/barcode-scanner'")
    expect(detail).toContain('linkForm.canScan ? (')
  })

  /**
   * A leitura preenche o campo com a chave canônica: o QR-Code da DANFE traz a URL inteira, e
   * gravar a URL no campo mandaria a busca atrás de uma chave que não existe.
   */
  test('fills the field with the canonical key, never the whole QR-Code payload', async () => {
    const hook = await readApplicationFile(LINK_HOOK_PATH)

    expect(hook).toContain(
      "import { extractNfeAccessKey } from '@/modules/shared/nfeAccessKey.service'",
    )
    expect(hook).toContain('extractNfeAccessKey(text)')
  })

  /** Chave que a empresa não tem é recusa dita no lugar, não vínculo silencioso que nunca acontece. */
  test('links the scanned key through the identifier the lookup returns', async () => {
    const hook = await readApplicationFile(LINK_HOOK_PATH)

    expect(hook).toContain('findNfeDocumentByAccessKey')
    expect(hook).toContain("'scannedDocumentNotFound'")
  })

  /** Rótulo visível não nasce no componente — nem em português nem em inglês. */
  test('names every new label in both locales', async () => {
    const [ptBr, english] = await Promise.all([
      readApplicationFile('src/modules/trip/locales/trip.locale.json'),
      readApplicationFile('src/modules/trip/locales/trip.en.locale.json'),
    ])

    const detailKeys = [
      'linkValueHint',
      'scan',
      'scanClose',
      'scanDenied',
      'scanReading',
      'scanStarting',
      'scanTitle',
      'scanUnavailable',
    ]

    const ptBrLocale = JSON.parse(ptBr) as LocaleFile
    const englishLocale = JSON.parse(english) as LocaleFile

    for (const key of detailKeys) {
      expect(ptBrLocale.detail).toHaveProperty(key)
      expect(englishLocale.detail).toHaveProperty(key)
    }
    expect(ptBrLocale.feedback).toHaveProperty('scannedDocumentNotFound')
    expect(englishLocale.feedback).toHaveProperty('scannedDocumentNotFound')
  })
})
