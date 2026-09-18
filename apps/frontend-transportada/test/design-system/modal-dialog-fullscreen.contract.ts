/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T507, item 3 (`web.md` §10: "Modal fullscreen em mobile; cantos arredondados e margem em
 * desktop"). Não há componente de diálogo no design system: o comportamento (foco preso, `Esc`,
 * retorno do foco) é o hook `useModalDialog`, e a forma é um par overlay/caixa que cada módulo
 * declara no próprio CSS. A maioria já nascia em tela cheia no celular e ganhava margem a partir do
 * tablet; cinco pares ficavam em caixa flutuante no celular. Este contrato fixa o molde em **todo**
 * par — inclusive os que ainda vão nascer: um overlay fixo novo que não esteja na lista reprova.
 */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const TABLET_MEDIA = '@media (min-width: 40rem)'

type Rule = Readonly<{ body: string; media: string; selector: string }>
type DialogShape = Readonly<{ dialog: string; filePath: string; overlay: string }>

/** Todo par overlay/caixa de diálogo modal da app, com o arquivo que o declara. */
const MODAL_DIALOG_SHAPES: readonly DialogShape[] = [
  {
    dialog: '.dialog',
    filePath: 'src/components/ui/barcode-scanner.module.css',
    overlay: '.overlay',
  },
  {
    dialog: '.dialog',
    filePath: 'src/modules/billing/styles/billingBulkCancel.module.css',
    overlay: '.overlay',
  },
  {
    dialog: '.panel',
    filePath: 'src/modules/company-settings/styles/companyWizard.module.css',
    overlay: '.overlay',
  },
  {
    dialog: '.billingDialog',
    filePath: 'src/modules/cte-batch/styles/cteBatch.module.css',
    overlay: '.billingOverlay',
  },
  {
    dialog: '.dialog',
    filePath: 'src/modules/delivery-clients/styles/contractorMailSettings.module.css',
    overlay: '.overlay',
  },
  { dialog: '.dialog', filePath: 'src/modules/fleet/styles/fleet.module.css', overlay: '.overlay' },
  {
    dialog: '.driverDialog',
    filePath: 'src/modules/fleet/styles/fleet.module.css',
    overlay: '.driverDialogOverlay',
  },
  {
    dialog: '.dialog',
    filePath: 'src/modules/identity/styles/userAdministration.module.css',
    overlay: '.overlay',
  },
  {
    dialog: '.dialog',
    filePath: 'src/modules/identity/styles/whatsappPhone.module.css',
    overlay: '.overlay',
  },
  {
    dialog: '.mailDialog',
    filePath: 'src/modules/nfe-workspace/styles/addressReport.module.css',
    overlay: '.mailOverlay',
  },
  {
    dialog: '.dialog',
    filePath: 'src/modules/nfe-workspace/styles/measurementCardPrint.module.css',
    overlay: '.overlay',
  },
  {
    dialog: '.cteEmissionDialog',
    filePath: 'src/modules/nfe-workspace/styles/nfeWorkspace.module.css',
    overlay: '.cteEmissionOverlay',
  },
  {
    dialog: '.dialog',
    filePath: 'src/modules/nfe-workspace/styles/packageBoxCameraFlow.module.css',
    overlay: '.overlay',
  },
  {
    dialog: '.candidatesDialog',
    filePath: 'src/modules/nfe-workspace/styles/packageBoxes.module.css',
    overlay: '.candidatesOverlay',
  },
  {
    dialog: '.emissionDialog',
    filePath: 'src/modules/nfse-invoice/styles/nfseInvoice.module.css',
    overlay: '.emissionOverlay',
  },
  {
    dialog: '.multiVehicleDialog',
    filePath: 'src/modules/routing/styles/routing.module.css',
    overlay: '.multiVehicleOverlay',
  },
  { dialog: '.dialog', filePath: 'src/modules/trip/styles/trip.module.css', overlay: '.overlay' },
  {
    dialog: '.mdfeGateDialog',
    filePath: 'src/modules/trip/styles/trip.module.css',
    overlay: '.mdfeGateOverlay',
  },
]

/** Overlays fixos que não são caixa de diálogo: gaveta lateral, foto ampliada e aviso de carga. */
const NON_DIALOG_OVERLAYS: readonly string[] = [
  'src/components/ui/box-dimension-scanner.module.css .loadingOverlay',
  'src/modules/nfe-workspace/styles/nfeWorkspace.module.css .eventHistoryOverlay',
  'src/modules/trip/styles/trip.module.css .occurrencePhotoOverlay',
]

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function listRules(stylesheet: string): readonly Rule[] {
  const source = stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  const rules: Rule[] = []
  const preludes: string[] = []
  let buffer = ''

  for (const character of source) {
    if (character === '{') {
      preludes.push(buffer.replaceAll(/\s+/g, ' ').trim())
      buffer = ''
      continue
    }
    if (character === '}') {
      const prelude = preludes.pop() ?? ''
      const media = preludes.find((candidate) => candidate.startsWith('@media')) ?? ''
      if (!prelude.startsWith('@')) rules.push({ body: buffer.trim(), media, selector: prelude })
      buffer = ''
      continue
    }
    buffer += character
  }

  return rules
}

function declarationsOf(
  rules: readonly Rule[],
  selector: string,
  media: string,
): readonly string[] {
  return rules
    .filter((rule) => rule.selector === selector && rule.media === media)
    .flatMap((rule) => rule.body.split(';'))
    .map((declaration) => declaration.replaceAll(/\s+/g, ' ').trim())
    .filter(Boolean)
}

async function listModuleStylesheets(directory = 'src'): Promise<readonly string[]> {
  const entries = await readdir(new URL(`${directory}/`, APPLICATION_ROOT), { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) return listModuleStylesheets(path)
      return entry.name.endsWith('.module.css') ? [path] : []
    }),
  )
  return nested.flat()
}

describe('diálogo modal em tela cheia no celular (web.md §10, spec 154 T507 item 3)', () => {
  test.each(MODAL_DIALOG_SHAPES.map((shape) => [`${shape.filePath} ${shape.dialog}`, shape]))(
    '%s ocupa a tela no celular e volta a ser caixa do tablet para cima',
    async (_name, shape) => {
      const rules = listRules(await readApplicationFile(shape.filePath))
      const overlayBase = declarationsOf(rules, shape.overlay, '')
      const dialogBase = declarationsOf(rules, shape.dialog, '')
      const dialogTablet = declarationsOf(rules, shape.dialog, TABLET_MEDIA)

      expect(overlayBase).toContain('padding: 0')
      expect(dialogBase).toContain('width: 100%')
      expect(dialogBase).toContain('height: 100%')
      expect(dialogBase).toContain('max-height: 100vh')
      expect(dialogTablet).toContain('height: auto')
      expect(dialogTablet.some((declaration) => declaration.startsWith('width: min('))).toBe(true)
    },
  )

  test('todo overlay fixo da app é um diálogo da lista ou uma exceção declarada', async () => {
    const known = new Set([
      ...MODAL_DIALOG_SHAPES.map((shape) => `${shape.filePath} ${shape.overlay}`),
      ...NON_DIALOG_OVERLAYS,
    ])
    const unknown: string[] = []

    for (const filePath of await listModuleStylesheets()) {
      for (const rule of listRules(await readApplicationFile(filePath))) {
        if (rule.media !== '' || !/[oO]verlay$/.test(rule.selector)) continue
        if (!rule.body.includes('position: fixed')) continue
        if (!known.has(`${filePath} ${rule.selector}`)) unknown.push(`${filePath} ${rule.selector}`)
      }
    }

    expect(unknown).toEqual([])
  })
})
