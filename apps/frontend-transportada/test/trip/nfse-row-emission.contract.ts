/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Emitir NFS-e não é um clique: a rota exige `profileId`, e quem escolhe o perfil é o operador. A
 * ação da linha **abre o diálogo** com a nota pré-selecionada; disparar a emissão a partir da linha
 * emitiria contra um perfil que ninguém escolheu.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const LISTA = new URL(
  '../../src/modules/trip/components/TripStopList.component.tsx',
  import.meta.url,
)
const DETALHE = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

const lista = () => readFileSync(LISTA, 'utf8')
const detalhe = () => readFileSync(DETALHE, 'utf8')

describe('a ação de NFS-e da linha abre o diálogo (spec 175 RF3, CA03)', () => {
  it('a linha renderiza o componente de ação do módulo dono', () => {
    const source = lista()

    expect(source).toInclude('NfseEmissionAction')
    expect(source).toMatch(/from '@\/modules\/nfse-invoice\//)
  })

  it('a nota da linha vai pré-selecionada, uma só', () => {
    expect(lista()).toMatch(/documentIds=\{\[[^\]]*\]\}/)
  })

  /** A fronteira do módulo: o diálogo e o hook são internos do dono, e ninguém os importa daqui. */
  it('a viagem não importa o diálogo nem o hook internos da NFS-e', () => {
    for (const source of [lista(), detalhe()]) {
      expect(source).not.toInclude('NfseEmissionDialog')
      expect(source).not.toInclude('useNfseEmissionDialog')
    }
  })

  /** Nada na linha chama a emissão: o disparo é do diálogo, depois do perfil escolhido. */
  it('a linha não dispara emissão', () => {
    for (const source of [lista(), detalhe()]) {
      expect(source).not.toInclude('emitNfseInvoice')
      expect(source).not.toInclude('createNfseInvoice')
    }
  })

  /** O `void documentId` da fase anterior era ponto de extensão; ele não pode sobreviver à abertura. */
  it('o no-op da fase anterior não sobrou', () => {
    expect(detalhe()).not.toInclude('void documentId')
  })
})
