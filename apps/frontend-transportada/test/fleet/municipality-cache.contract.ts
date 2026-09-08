/* Copyright (c) 2026 Ada Technology. MIT License. */
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  MUNICIPALITY_CACHE_TTL_MS,
  readCachedMunicipalities,
  writeCachedMunicipalities,
} from '../../src/modules/fleet/shared/municipalityCache.service'

const AGORA = Date.parse('2026-09-08T12:00:00.000Z')
const LISTA = ['Barrinha', 'Pontal', 'Sertãozinho'] as const

/**
 * ⚠️ O depósito é um `Map`, não o `localStorage`: o teste desta app não tem DOM, e é por isso que a
 * dependência entra pela porta em vez de o serviço falar com o global.
 */
let deposito: Map<string, string>
const storage = {
  getItem: (key: string) => deposito.get(key) ?? null,
  setItem: (key: string, value: string) => {
    deposito.set(key, value)
  },
}

beforeEach(() => {
  deposito = new Map()
})

describe('cache dos municípios por UF', () => {
  /**
   * A lista de municípios de um estado muda de década em década — a última alteração no país foi em
   * 2013. Pedi-la a cada troca de UF é uma ida à rede por um dado que não muda.
   */
  it('devolve a lista gravada dentro da validade', () => {
    writeCachedMunicipalities({ at: AGORA, names: LISTA, state: 'SP', storage })

    expect(readCachedMunicipalities({ at: AGORA + 1_000, state: 'SP', storage })).toEqual(LISTA)
  })

  /** Um ano: prazo longo porque o dado é estável, e finito porque nada no navegador é para sempre. */
  it('vale por um ano', () => {
    expect(MUNICIPALITY_CACHE_TTL_MS).toBe(365 * 24 * 60 * 60 * 1000)
    writeCachedMunicipalities({ at: AGORA, names: LISTA, state: 'SP', storage })

    expect(
      readCachedMunicipalities({ at: AGORA + MUNICIPALITY_CACHE_TTL_MS - 1, state: 'SP', storage }),
    ).toEqual(LISTA)
    expect(
      readCachedMunicipalities({ at: AGORA + MUNICIPALITY_CACHE_TTL_MS + 1, state: 'SP', storage }),
    ).toBeNull()
  })

  /** Cada UF tem a sua entrada: São Paulo no cache não pode responder por Minas. */
  it('não mistura estados', () => {
    writeCachedMunicipalities({ at: AGORA, names: LISTA, state: 'SP', storage })

    expect(readCachedMunicipalities({ at: AGORA, state: 'MG', storage })).toBeNull()
  })

  /**
   * ⚠️ Cache corrompido é ausência, nunca exceção: `localStorage` é do navegador do usuário, e uma
   * entrada quebrada por qualquer motivo não pode derrubar o formulário de motorista — ela só manda
   * perguntar ao provedor de novo.
   */
  it('entrada ilegível é ausência, não erro', () => {
    deposito.set('fleet.municipalities.SP', 'isto não é json')

    expect(readCachedMunicipalities({ at: AGORA, state: 'SP', storage })).toBeNull()
  })

  /** Lista vazia não é gravada: ela viria de provedor fora do ar, e cachear isso por um ano seria travar o campo. */
  it('não grava lista vazia', () => {
    writeCachedMunicipalities({ at: AGORA, names: [], state: 'SP', storage })

    expect(readCachedMunicipalities({ at: AGORA, state: 'SP', storage })).toBeNull()
  })
})
