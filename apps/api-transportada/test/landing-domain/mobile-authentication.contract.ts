/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveMobileAuthentication } from '../../src/landing/domain/mobile-authentication.policy'

const CLIENT_ID = 'transportada-mobile'

describe('resolveMobileAuthentication', () => {
  test('parte o issuer em endereço e realm, para não haver duas fontes da mesma coisa', () => {
    expect(
      resolveMobileAuthentication({
        clientId: CLIENT_ID,
        issuer: 'https://auth.cliente.com.br/realms/transportada',
      }),
    ).toEqual({ clientId: CLIENT_ID, realm: 'transportada', url: 'https://auth.cliente.com.br' })
  })

  /* O ambiente local roda o Keycloak em http na 58080, e é o issuer que o `.env.example` traz. */
  test('aceita o issuer de localhost, com porta e http', () => {
    expect(
      resolveMobileAuthentication({
        clientId: CLIENT_ID,
        issuer: 'http://localhost:58080/realms/transportada-local',
      }),
    ).toEqual({
      clientId: CLIENT_ID,
      realm: 'transportada-local',
      url: 'http://localhost:58080',
    })
  })

  /* Instalação atrás de proxy compartilhado serve o Keycloak sob um prefixo. */
  test('preserva o caminho anterior a /realms', () => {
    expect(
      resolveMobileAuthentication({
        clientId: CLIENT_ID,
        issuer: 'https://cliente.com.br/auth/realms/transportada',
      }),
    ).toEqual({
      clientId: CLIENT_ID,
      realm: 'transportada',
      url: 'https://cliente.com.br/auth',
    })
  })

  test('tolera a barra final do issuer', () => {
    const resolved = resolveMobileAuthentication({
      clientId: CLIENT_ID,
      issuer: 'https://auth.cliente.com.br/realms/transportada/',
    })

    expect(resolved?.url).toBe('https://auth.cliente.com.br')
    expect(resolved?.realm).toBe('transportada')
  })

  test('tira o espaço em volta do que veio do ambiente', () => {
    expect(
      resolveMobileAuthentication({
        clientId: `  ${CLIENT_ID}  `,
        issuer: '  https://auth.cliente.com.br/realms/transportada  ',
      }),
    ).toEqual({ clientId: CLIENT_ID, realm: 'transportada', url: 'https://auth.cliente.com.br' })
  })

  /**
   * Instalação que não publica o aplicativo: o bloco some da rota, e o app recusa aquela instalação.
   * Derrubar o boot faria toda API em produção parar de subir por causa do aplicativo.
   */
  test('devolve ausência quando a instalação não declara o cliente do aplicativo', () => {
    for (const clientId of [undefined, '', '   ']) {
      expect(
        resolveMobileAuthentication({
          clientId,
          issuer: 'https://auth.cliente.com.br/realms/transportada',
        }),
      ).toBeNull()
    }
  })

  test('devolve ausência quando o issuer não tem a forma de realm', () => {
    for (const issuer of [
      'https://auth.cliente.com.br',
      'https://auth.cliente.com.br/realms/',
      'https://auth.cliente.com.br/auth/transportada',
      'ftp://auth.cliente.com.br/realms/transportada',
      '',
    ]) {
      expect(resolveMobileAuthentication({ clientId: CLIENT_ID, issuer })).toBeNull()
    }
  })
})
