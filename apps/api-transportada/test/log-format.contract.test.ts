/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O modo `pretty` do logger imprime só a mensagem — o `meta` é descartado. Em
 * staging isso apagava todo o contexto estruturado dos logs da API. A mesma
 * regra vive nas outras apps implantadas, cada uma com o seu contrato.
 */
import { describe, expect, test } from 'bun:test'

import { shouldPrettyPrintLogs } from '../src/logging/log-format.policy'

const DEPLOYED_ENVIRONMENTS = ['staging', 'production'] as const

describe('api log format contract', () => {
  test('só o ambiente local ganha saída legível para humano', () => {
    expect(shouldPrettyPrintLogs('local')).toBe(true)
  })

  test('todo ambiente implantado emite JSON, para o meta sobreviver', () => {
    for (const appEnv of DEPLOYED_ENVIRONMENTS) {
      expect(shouldPrettyPrintLogs(appEnv)).toBe(false)
    }
  })

  test('ambiente desconhecido é tratado como implantado', () => {
    expect(shouldPrettyPrintLogs('homologacao-do-cliente')).toBe(false)
    expect(shouldPrettyPrintLogs('')).toBe(false)
  })
})
