/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED_CODE,
  packageBoxMeasureFailureMessage,
} from '../../src/modules/nfe-workspace/shared/packageBoxMeasurementLabel.service'

const fakeTranslate = (key: string, options?: Record<string, unknown>): string =>
  options === undefined ? key : `${key}:${JSON.stringify(options)}`

/**
 * A defeito reportada: no caminho digitado, o `PUT` recusado fechava a linha calado — sem nenhuma
 * mensagem. `packageBoxMeasureFailureMessage` é a menor unidade pura que decide o texto exibido, a
 * mesma decisão que a linha usa para renderizar a recusa.
 */
describe('packageBoxMeasureFailureMessage', () => {
  it('código com chave própria (câmera desligada) usa a mensagem específica', () => {
    expect(fakeTranslate).toBeDefined()
    expect(
      packageBoxMeasureFailureMessage(fakeTranslate, PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED_CODE),
    ).toBe('packageBoxes.cameraMeasurementDisabledError')
  })

  it('código sem chave própria cai na mensagem genérica, com o código anexado', () => {
    expect(packageBoxMeasureFailureMessage(fakeTranslate, 'PACKAGE_BOX_MEASURE_FAILED')).toBe(
      'packageBoxes.saveFailed:{"code":"PACKAGE_BOX_MEASURE_FAILED"}',
    )
  })
})

/**
 * Sem DOM nesta app: o contrato lê a fonte de `PackageBoxMeasurementPanel.component.tsx` — mesmo
 * padrão já usado pelos contratos vizinhos deste módulo.
 */
describe('a linha do caminho digitado não fecha calada quando o PUT falha', () => {
  it('setEditingId(null) e os desdobramentos do bipe só rodam dentro do onSuccess da mutação', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const onMeasureProp = panel
      .split('onMeasure={(measurement) => {')[1]
      ?.split('onMeasureWithCamera={')[0]
    expect(onMeasureProp).toBeDefined()

    /** O `onSuccess` é o segundo argumento da chamada — é ele que abre e fecha, não a linha toda. */
    const outerCallStart = onMeasureProp?.indexOf(
      'onMeasure({ ...measurement, id: box.id }, () => {',
    )
    const successCallback = onMeasureProp?.split(
      'onMeasure({ ...measurement, id: box.id }, () => {',
    )[1]
    expect(outerCallStart).toBeGreaterThanOrEqual(0)
    expect(successCallback).toBeDefined()
    expect(successCallback).toContain('setEditingId(null)')
    expect(successCallback).toContain('if (cameFromScan) setIsScannerOpen(true)')
    expect(successCallback).toContain('if (cameFromKeyboardScan) {')

    /**
     * Nada disso pode aparecer ENTRE o fim da chamada a `onMeasure(...)` (o `})` que fecha o
     * `onSuccess`) e o `}}` que fecha a prop inteira — ou seja, fora do callback de sucesso.
     */
    const afterOnSuccessClose = onMeasureProp?.split(
      '                          })\n                        }}',
    )[1]
    expect(afterOnSuccessClose).toBeDefined()
    expect(afterOnSuccessClose).not.toContain('setEditingId(null)')
    expect(afterOnSuccessClose).not.toContain('setIsScannerOpen(true)')
  })

  it('abrir e cancelar a edição zeram a recusa anterior (onResetSaveError)', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const onCancelBlock = panel.split('onCancel={() => {')[1]?.split('}}')[0]
    expect(onCancelBlock).toBeDefined()
    expect(onCancelBlock).toContain('onResetSaveError()')
    expect(onCancelBlock).toContain('setEditingId(null)')

    const onOpenBlock = panel.split('onOpen={() => {')[1]?.split('}}')[0]
    expect(onOpenBlock).toBeDefined()
    expect(onOpenBlock).toContain('onResetSaveError()')
    expect(onOpenBlock).toContain('setEditingId(box.id)')
  })

  it('a linha em edição mostra a mensagem de falha, acessível (role="alert" + ícone, não só cor)', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain(
      "import {\n  formatMeasuredAtDate,\n  measurementSourceLabel,\n  packageBoxMeasureFailureMessage,\n  type Translate,\n} from '../shared/packageBoxMeasurementLabel.service'",
    )

    const editingBlock = panel.split('{isEditing ? (')[1]?.split(') : (')[0]
    expect(editingBlock).toBeDefined()
    expect(editingBlock).toContain('saveErrorCode === undefined ? null : (')
    expect(editingBlock).toContain('role="alert"')
    expect(editingBlock).toContain('<Icon name="alert" size="sm" />')
    expect(editingBlock).toContain('packageBoxMeasureFailureMessage(t as Translate, saveErrorCode)')
  })

  it('PackageBoxRow recebe saveErrorCode e o passa adiante à linha em edição', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('saveErrorCode={saveErrorCode}')
    expect(panel).toContain('saveErrorCode: string | undefined')
  })
})
