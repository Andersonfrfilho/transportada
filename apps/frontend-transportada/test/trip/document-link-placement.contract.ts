/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O bloco "Vincular nota" é o primeiro passo de uma viagem em montagem. Ele nasceu depois do mapa
 * e das ações de campo, enterrado — quem abria a tela para vincular a primeira nota rolava a viagem
 * inteira. Contrato de tela, por texto de fonte, no molde de `test/trip/assembly-route-selector.contract.ts`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

describe('posição do bloco de vínculo de nota na tela de detalhe', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('aparece depois do fluxo de processo e antes do painel de carga', () => {
    const processFlowIndex = source.indexOf('<TripProcessFlow')
    const linkFormIndex = source.indexOf("t('detail.linkDocumentTitle')")
    const cargoPanelIndex = source.indexOf('<TripCargoPanel')

    expect(processFlowIndex).toBeGreaterThan(-1)
    expect(linkFormIndex).toBeGreaterThan(-1)
    expect(cargoPanelIndex).toBeGreaterThan(-1)
    expect(linkFormIndex).toBeGreaterThan(processFlowIndex)
    expect(cargoPanelIndex).toBeGreaterThan(linkFormIndex)
  })

  it('preserva a condição de exibição e o comportamento do bloco movido', () => {
    const linkFormIndex = source.indexOf("t('detail.linkDocumentTitle')")
    const blockStart = source.lastIndexOf('{canManage && isEditable ?', linkFormIndex)

    expect(blockStart).toBeGreaterThan(-1)

    const blockEnd = source.indexOf('</BarcodeScanner', linkFormIndex)
    const block = source.slice(blockStart, blockEnd === -1 ? undefined : blockEnd)

    expect(block).toInclude('<TripScanQueue')
    expect(block).toInclude('<BarcodeScanner')
    expect(block).toInclude('handleLinkDocument')
  })
})
