/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Medido em staging em 23/09 às 00:38**: a API recusou o registro com `422` e um código
 * próprio, e a tela disse "Sem conexão com o servidor. Confira a internet e tente de novo." O
 * operador conferiu a internet, que estava boa, e tentou de novo — o mesmo 422, a mesma frase.
 *
 * A causa era o **fallback**: qualquer código que o dicionário não conhecesse caía em
 * `requestFailed`, a frase de falha de rede. Mensagem errada é pior que mensagem genérica: ela
 * manda a pessoa procurar o problema onde ele não está.
 */
import { describe, expect, it } from 'bun:test'

import { resolveTripFeedbackKey } from '@/modules/trip/shared/tripFeedback.service'
import trip from '@/modules/trip/locales/trip.locale.json'

describe('mensagem de falha do registro (defeito medido em 23/09)', () => {
  it('só a falha de rede de verdade fala em internet', () => {
    expect(resolveTripFeedbackKey(new Error('TRIP_REQUEST_FAILED'))).toBe('requestFailed')
    expect(trip.feedback.requestFailed).toContain('internet')
  })

  /** O servidor respondeu e recusou: dizer "sem conexão" manda procurar o defeito no lugar errado. */
  it('código desconhecido do servidor não vira falha de conexão', () => {
    expect(resolveTripFeedbackKey(new Error('OCCURRENCE_PRODUCT_SELECTION_CONFLICT'))).toBe(
      'serverRefused',
    )
    expect(trip.feedback.serverRefused).not.toContain('internet')
  })

  it('a recusa nomeia o que fazer, sem inventar a causa', () => {
    expect(trip.feedback.serverRefused.length).toBeGreaterThan(20)
  })

  /** Código conhecido continua com a frase própria — o fallback não engole tradução existente. */
  it('código conhecido mantém a própria mensagem', () => {
    expect(resolveTripFeedbackKey(new Error('TRIP_NOT_FOUND'))).toBe('notFound')
  })

  it('o que não é erro não vira mensagem', () => {
    expect(resolveTripFeedbackKey('texto solto')).toBeNull()
  })
})
