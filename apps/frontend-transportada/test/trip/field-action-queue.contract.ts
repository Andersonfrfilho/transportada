/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { runFieldActionQueue } from '../../src/modules/trip/shared/tripFieldActionQueue.service'

/**
 * Spec 156 T8b (revisão do code-reviewer): a fila que "Devolver" em massa usa — uma requisição por
 * nota, concorrência limitada, e uma falha isolada não pode derrubar as irmãs.
 */
describe('runFieldActionQueue (spec 156 T8b)', () => {
  it('lista vazia não roda nada e devolve lista vazia', async () => {
    const results = await runFieldActionQueue<string, string>({
      concurrency: 3,
      items: [],
      run: () => Promise.resolve('never'),
    })

    expect(results).toEqual([])
  })

  it('nunca roda mais itens em voo do que a concorrência pedida', async () => {
    let inFlight = 0
    let maxInFlight = 0

    await runFieldActionQueue<number, number>({
      concurrency: 3,
      items: [1, 2, 3, 4, 5, 6, 7, 8],
      run: async (item) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return item
      },
    })

    expect(maxInFlight).toBeLessThanOrEqual(3)
  })

  it('o resultado sai na mesma ordem dos itens, mesmo com concorrência', async () => {
    const items = [1, 2, 3, 4, 5]

    const results = await runFieldActionQueue<number, number>({
      concurrency: 3,
      // O item par "demora" mais — se a ordem dependesse de quem termina primeiro, o array sairia
      // embaralhado.
      run: async (item) => {
        if (item % 2 === 0) await new Promise((resolve) => setTimeout(resolve, 5))
        return item
      },
      items,
    })

    expect(results.map((result) => result.item)).toEqual(items)
    expect(results.map((result) => result.value)).toEqual(items)
    expect(results.every((result) => result.errorCode === null)).toBe(true)
  })

  it('uma falha isolada não impede as outras, e o código de erro vem de error.message', async () => {
    const results = await runFieldActionQueue<number, number>({
      concurrency: 2,
      run: (item) => {
        if (item === 2) return Promise.reject(new Error('TRIP_WITHOUT_DRIVER'))
        return Promise.resolve(item * 10)
      },
      items: [1, 2, 3],
    })

    expect(results).toEqual([
      { errorCode: null, item: 1, value: 10 },
      { errorCode: 'TRIP_WITHOUT_DRIVER', item: 2, value: null },
      { errorCode: null, item: 3, value: 30 },
    ])
  })

  it('erro que não é Error vira UNKNOWN, não derruba a fila', async () => {
    const results = await runFieldActionQueue<number, number>({
      concurrency: 1,
      // O próprio teste é que `readErrorCode` trata rejeição que não é `Error`, não só a que é.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      run: () => Promise.reject('não é um Error'),
      items: [1],
    })

    expect(results).toEqual([{ errorCode: 'UNKNOWN', item: 1, value: null }])
  })
})
