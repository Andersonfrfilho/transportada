/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 181 RF6/RF7 (CA06/CA07). `TripDeliveryProof.component.tsx` despejava produtos e ocorrências
 * **incondicionalmente** nos três estados (`proposta-ux.md` item 1, "o comprovante despeja tudo de
 * uma vez") — é daí que vem o "muro de texto" do card do usuário. Cada lista vira a própria
 * expansão, reusando o padrão da spec 180 (`aria-expanded`/`aria-controls`, chevron), com a
 * contagem no rótulo fechado para produtos.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripLocale from '@/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripDeliveryProof.component.tsx',
  import.meta.url,
)

describe('produtos e ocorrências do comprovante abrem sob demanda (spec 181 RF6/RF7)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('nenhum dos três estados despeja a lista de produtos incondicionalmente', () => {
    /**
     * ⚠️ Os três estados chamavam `<TripDocumentProducts products={products} />` direto, um por
     * estado — três chamadas. Agora só a própria expansão (`TripDeliveryProofDetail`) chama, uma
     * vez só, e os três estados chamam a expansão no lugar.
     */
    const chamadasDiretas = (source.match(/<TripDocumentProducts[\s/>]/gu) ?? []).length
    const chamadasDaExpansao = (source.match(/<TripDeliveryProofDetail[\s/>]/gu) ?? []).length

    expect(chamadasDiretas).toBe(1)
    expect(chamadasDaExpansao).toBe(3)
  })

  /** RF6/CA06: o rótulo fechado da expansão de produtos carrega a contagem. */
  it('o rótulo fechado de produtos mostra quantos itens a nota tem', () => {
    expect(source).toContain("t('deliveryProof.productsToggle', { count: products.length })")
    expect(tripLocale.deliveryProof.productsToggle_other).toContain('{{count}}')
  })

  /** CA07/CA16: nota sem produto não ganha o disclosure vazio — só o aviso de que não há item. */
  it('nota sem produto não oferece a expansão vazia', () => {
    const inicio = source.indexOf('products.length === 0')
    const ramoVazio = source.slice(inicio, source.indexOf(') : (', inicio))

    expect(ramoVazio).toContain("t('deliveryProof.withoutProducts')")
    expect(ramoVazio).not.toContain('aria-expanded')
  })

  /** As duas expansões reusam o mesmo botão fora do fluxo do texto que a spec 180 já usa. */
  it('as duas expansões reusam o padrão de disclosure — nunca um terceiro jeito de expandir', () => {
    const ariaControles = (source.match(/aria-controls=/gu) ?? []).length
    const ariaExpandidos = (source.match(/aria-expanded=/gu) ?? []).length

    expect(ariaControles).toBe(2)
    expect(ariaExpandidos).toBe(2)
    expect(source).toContain('styles.stopDocumentToggle')
  })

  it('cada expansão tem um id estável por nota, para o aria-controls apontar certo', () => {
    expect(source).toContain('documentId')
    expect(source).toContain('trip-delivery-proof-products-${documentId}')
    expect(source).toContain('trip-delivery-proof-occurrences-${documentId}')
  })
})
