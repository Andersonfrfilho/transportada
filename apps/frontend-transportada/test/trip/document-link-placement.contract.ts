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
const PAGE = new URL('../../src/modules/trip/pages/TripDetail.page.tsx', import.meta.url)
const PANEL = new URL(
  '../../src/modules/trip/components/TripLinkDocumentPanel.component.tsx',
  import.meta.url,
)

describe('posição do bloco de vínculo de nota na tela de detalhe', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('aparece depois do fluxo de processo e antes do painel de carga', () => {
    const processFlowIndex = source.indexOf('<TripProcessFlow')
    const linkFormIndex = source.indexOf('<TripLinkDocumentPanel')
    const cargoPanelIndex = source.indexOf('<TripCargoPanel')

    expect(processFlowIndex).toBeGreaterThan(-1)
    expect(linkFormIndex).toBeGreaterThan(-1)
    expect(cargoPanelIndex).toBeGreaterThan(-1)
    expect(linkFormIndex).toBeGreaterThan(processFlowIndex)
    expect(cargoPanelIndex).toBeGreaterThan(linkFormIndex)
  })

  it('preserva a condição de exibição e o comportamento do bloco movido', () => {
    const linkFormIndex = source.indexOf('<TripLinkDocumentPanel')
    const blockStart = source.lastIndexOf('{canManage && isEditable ?', linkFormIndex)

    expect(blockStart).toBeGreaterThan(-1)
    expect(source.slice(blockStart, linkFormIndex)).not.toInclude('<TripScanQueue')
    expect(source).toInclude('handleLinkDocument')

    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toInclude("t('detail.linkDocumentTitle')")
    expect(panel).toInclude('<TripScanQueue')
    expect(panel).toInclude('<BarcodeScanner')
  })

  it('o painel oferece busca com os filtros da tela de notas e a inserção rápida', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).toInclude('<TripDocumentSearch')
    expect(panel).toInclude("id: 'search'")
    expect(panel).toInclude("id: 'quick'")
  })

  /**
   * Abrir o detalhe de uma viagem não pode varrer a base de notas da empresa (até 40 páginas de 100):
   * a lista só é pedida quando a pessoa abre a busca ou digita um número. Os smokes do painel que
   * abrem o detalhe também não dublam essa rota, e a requisição solta derrubava `failures()`.
   */
  it('só carrega as notas livres quando a pessoa pede', () => {
    const page = readFileSync(PAGE, 'utf8')
    const panel = readFileSync(PANEL, 'utf8')

    expect(page).toInclude('canManageTrips && documentsWanted')
    expect(panel).toInclude('onOpen={onNeedDocuments}')
    expect(panel).toInclude('if (isNfe) onNeedDocuments()')
  })
})
