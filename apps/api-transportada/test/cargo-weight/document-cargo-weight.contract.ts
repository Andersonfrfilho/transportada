/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CARGO_WEIGHT_SOURCE } from '../../src/nfe-documents/domain/cargo-weight.policy.js'
import { resolveDocumentCargoWeight } from '../../src/nfe-documents/domain/document-cargo-weight.policy.js'

/** O padrão da empresa: peso por volume, ligado. Nulo é estimativa desligada (ADR-0052). */
const PADRAO = '10.0000'

describe('document cargo weight contract', () => {
  test('o peso declarado vence, e a nota inteira é declarada', () => {
    const resolved = resolveDocumentCargoWeight({
      defaultWeightPerVolume: PADRAO,
      volumes: [
        { grossWeight: '108.6700', quantity: '2.0000' },
        { grossWeight: '41.3300', quantity: '1.0000' },
      ],
    })

    expect(resolved).toEqual({ grossWeight: '150.0000', source: CARGO_WEIGHT_SOURCE.xml })
  })

  /**
   * A Zaragoza mandou 883658 com 108,670 kg e 883663 com 0,000 no mesmo caminhão, mesmo lacre,
   * mesmo minuto: o emitente omite `pesoB` por nota, não por política. Estimar só o volume zerado
   * misturaria duas origens dentro da mesma soma, e o total sairia com aparência de declarado.
   */
  test('nota com algum volume pesado não é estimada, e o volume sem massa não é inventado', () => {
    const resolved = resolveDocumentCargoWeight({
      defaultWeightPerVolume: PADRAO,
      volumes: [
        { grossWeight: '108.6700', quantity: '1.0000' },
        { grossWeight: '0.0000', quantity: '5.0000' },
      ],
    })

    expect(resolved).toEqual({ grossWeight: '108.6700', source: CARGO_WEIGHT_SOURCE.xml })
  })

  test('nenhum volume pesado cai na estimativa, e a origem acompanha', () => {
    const resolved = resolveDocumentCargoWeight({
      defaultWeightPerVolume: PADRAO,
      volumes: [
        { grossWeight: null, quantity: '20.0000' },
        { grossWeight: '0.0000', quantity: '4.0000' },
      ],
    })

    expect(resolved).toEqual({ grossWeight: '240.0000', source: CARGO_WEIGHT_SOURCE.estimated })
  })

  /** Ausência é ausência, nunca zero: é ela que mantém de pé o bloqueio de quem não configurou. */
  test('sem peso declarado e sem padrão, a nota não tem peso', () => {
    expect(
      resolveDocumentCargoWeight({
        defaultWeightPerVolume: null,
        volumes: [{ grossWeight: null, quantity: '20.0000' }],
      }),
    ).toBeNull()
  })

  test('nota sem volume nenhum não tem peso, mesmo com padrão configurado', () => {
    expect(resolveDocumentCargoWeight({ defaultWeightPerVolume: PADRAO, volumes: [] })).toBeNull()
  })
})
