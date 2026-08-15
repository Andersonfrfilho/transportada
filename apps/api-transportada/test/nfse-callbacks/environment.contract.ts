/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

const CALLBACK_BASE_URL = 'https://api.transportadora.exemplo.com.br'

describe('nfse callback environment contract', () => {
  test('lê o endereço público de callback declarado no ambiente', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, NFSE_CALLBACK_BASE_URL: CALLBACK_BASE_URL })
        .nfseCallbackBaseUrl,
    ).toBe(CALLBACK_BASE_URL)
  })

  for (const [label, value] of [
    ['ausente', undefined],
    ['declarada e vazia', ''],
    ['só espaço', '   '],
  ] as const) {
    test(`fica indefinida quando a variável está ${label} — instalação sem callback publicado`, () => {
      expect(
        parseEnvironment({ ...API_ENVIRONMENT, NFSE_CALLBACK_BASE_URL: value }).nfseCallbackBaseUrl,
      ).toBeUndefined()
    })
  }

  for (const hostile of [
    'http://callback.exemplo.com.br',
    'ftp://callback.exemplo.com.br',
    'https://usuario:senha@callback.exemplo.com.br',
    'nao-e-url',
  ]) {
    test(`derruba o boot com endereço não confiável ${hostile}`, () => {
      expect(() =>
        parseEnvironment({ ...API_ENVIRONMENT, NFSE_CALLBACK_BASE_URL: hostile }),
      ).toThrow()
    })
  }

  test('aceita localhost em HTTP, que é o ambiente de desenvolvimento', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, NFSE_CALLBACK_BASE_URL: 'http://localhost:53001' })
        .nfseCallbackBaseUrl,
    ).toBe('http://localhost:53001')
  })

  test('o .env.example declara a variável desligada, e ela não tem prefixo público', async () => {
    const example = await Bun.file(new URL('../../../../.env.example', import.meta.url)).text()

    expect(example).toContain('\nNFSE_CALLBACK_BASE_URL=\n')
    expect(example).not.toContain('VITE_NFSE_CALLBACK')
    // O segredo é o token, e ele vive no banco: o endereço público nunca o carrega.
    expect(example).not.toMatch(/NFSE_CALLBACK_TOKEN/)
  })
})
