/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripDeliveryProof.component.tsx',
  import.meta.url,
)
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const ROW = new URL('../../src/modules/trip/components/TripStopList.component.tsx', import.meta.url)

/**
 * Spec 079 T006 e T025 — são a mesma tela: "ver anexos da entrega" é abrir o comprovante. Contrato
 * por texto de fonte, porque o teste desta app não tem DOM.
 */
describe('comprovante da entrega na tela (spec 079 T006/T025)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  /**
   * O que importa não é o componente citar os quatro nomes — `delivered-with-proof` é a queda, e
   * exigir o literal seria cobrar forma. O que importa é que os três fatos que se confundem tenham
   * **rótulos diferentes**: "não entregue", "entregue sem comprovante" e "devolvida".
   */
  it('separa na tela os estados que se confundem', () => {
    for (const state of ['delivered-without-proof', 'not-delivered', 'returned']) {
      expect(source).toInclude(state)
    }

    const rotulos = [
      trip.deliveryProof.notDelivered,
      trip.deliveryProof.withoutProof,
      trip.deliveryProof.returned,
    ]

    expect(new Set(rotulos).size).toBe(rotulos.length)
    expect(trip.deliveryProof.withoutProof).toInclude('sem comprovante')
    expect(trip.deliveryProof.notDelivered).not.toInclude('sem comprovante')
  })

  /**
   * ⚠️ A URL do comprovante **expira**. Uma tela que a guarda em estado e a reusa depois mostra
   * imagem quebrada sem dizer por quê; o componente a consome direto do que a consulta trouxe.
   */
  it('não guarda a URL assinada em estado próprio', () => {
    expect(source).not.toInclude('useState<string')
    expect(source).toInclude('proof.downloadUrl')
  })

  /** Foto de canhoto não tem quem assine: o nome só aparece quando o serviço o resolveu. */
  it('imprime quem recebeu apenas quando existe', () => {
    expect(source).toInclude('view.receiverName === null ? null :')
  })

  /** Imagem sem alternativa textual é inacessível — e aqui ela descreve o que a foto é. */
  it('descreve a imagem para quem não a vê', () => {
    expect(source).toInclude('alt=')
    expect(trip.deliveryProof.photoAlt).toBeString()
  })

  /**
   * ⚠️ **Componente órfão não é entrega.** Escrever o painel e não montá-lo passa em todo teste de
   * render por texto de fonte e não muda nada na tela de ninguém — é a forma mais fácil de dar uma
   * task por pronta sem ela estar.
   */
  it('está montado, e a linha da nota tem como abri-lo', () => {
    // ⚠️ Regex com limite de identificador, **nunca** `toInclude('<TripDeliveryProof')`: renomear
    // o componente para `<TripDeliveryProofDESLIGADO` mantém a substring e a afirmação passa. Foi o
    // que aconteceu na primeira escrita, e a mutação revelou.
    expect(readFileSync(DETAIL, 'utf8')).toMatch(/<TripDeliveryProof[\s/>]/u)
    expect(readFileSync(ROW, 'utf8')).toInclude('actions.onToggleProof(document.id)')
  })

  /** Ler o canhoto não é administrar a viagem: quem acompanha a operação o abre sem `trip.manage`. */
  it('não esconde o comprovante atrás de permissão de escrita', () => {
    const source = readFileSync(ROW, 'utf8')
    const inicio = source.indexOf('actions.onToggleProof')
    const trecho = source.slice(source.lastIndexOf('{', inicio - 200), inicio)

    expect(trecho).not.toInclude('canManage')
  })
})
