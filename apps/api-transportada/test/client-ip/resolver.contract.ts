/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0076 §6: o IP do cliente sai só do cabeçalho que o proxy conhecido escreve. O que o cliente
 * escreve — o começo de `x-forwarded-for`, ou qualquer cabeçalho que nenhum proxy nosso sobrescreve
 * — nunca muda a chave do limitador.
 */
import { describe, expect, test } from 'bun:test'

import { createClientIpResolver, UNKNOWN_CLIENT_IP } from '../../src/http/client-ip.service.js'

const EDGE_IP = '198.51.100.7'
const FORGED_IP = '203.0.113.66'

function requestWith(headers: Readonly<Record<string, string>>): Request {
  return new Request('http://localhost:53001/public/anything', { headers })
}

describe('resolvedor do IP do cliente — edge do Railway (x-real-ip)', () => {
  const resolve = createClientIpResolver({ source: 'x-real-ip', trustedProxyHops: 1 })

  test('lê o x-real-ip que o edge escreve', () => {
    expect(resolve(requestWith({ 'x-real-ip': EDGE_IP }))).toBe(EDGE_IP)
  })

  test('x-forwarded-for forjado não muda a chave', () => {
    const keys = new Set(
      ['1.1.1.1', '2.2.2.2', `${FORGED_IP}, 10.0.0.1`].map((forged) =>
        resolve(requestWith({ 'x-forwarded-for': forged, 'x-real-ip': EDGE_IP })),
      ),
    )
    expect([...keys]).toEqual([EDGE_IP])
  })

  test('cf-connecting-ip forjado não muda a chave — não há Cloudflare na frente', () => {
    expect(resolve(requestWith({ 'cf-connecting-ip': FORGED_IP, 'x-real-ip': EDGE_IP }))).toBe(
      EDGE_IP,
    )
  })

  test('cabeçalho ausente cai no balde único, sem ler x-forwarded-for', () => {
    expect(resolve(requestWith({ 'x-forwarded-for': FORGED_IP }))).toBe(UNKNOWN_CLIENT_IP)
    expect(resolve(requestWith({}))).toBe(UNKNOWN_CLIENT_IP)
  })

  test('valor que não é endereço IP não vira chave', () => {
    expect(resolve(requestWith({ 'x-real-ip': 'qualquer-coisa' }))).toBe(UNKNOWN_CLIENT_IP)
  })

  test('aceita IPv6', () => {
    expect(resolve(requestWith({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1')
  })
})

describe('resolvedor do IP do cliente — cadeia x-forwarded-for com saltos confiáveis', () => {
  test('um salto: vale o último endereço, o que o proxy anexou', () => {
    const resolve = createClientIpResolver({ source: 'x-forwarded-for', trustedProxyHops: 1 })
    expect(resolve(requestWith({ 'x-forwarded-for': `${FORGED_IP}, ${EDGE_IP}` }))).toBe(EDGE_IP)
  })

  test('trocar o começo da cadeia a cada requisição não muda a chave', () => {
    const resolve = createClientIpResolver({ source: 'x-forwarded-for', trustedProxyHops: 1 })
    const keys = new Set(
      ['1.1.1.1', '2.2.2.2', '3.3.3.3, 4.4.4.4'].map((forged) =>
        resolve(requestWith({ 'x-forwarded-for': `${forged}, ${EDGE_IP}` })),
      ),
    )
    expect([...keys]).toEqual([EDGE_IP])
  })

  test('dois saltos: vale o penúltimo, e o último é do proxy interno', () => {
    const resolve = createClientIpResolver({ source: 'x-forwarded-for', trustedProxyHops: 2 })
    expect(resolve(requestWith({ 'x-forwarded-for': `${FORGED_IP}, ${EDGE_IP}, 10.0.0.2` }))).toBe(
      EDGE_IP,
    )
  })

  test('cadeia mais curta que os saltos declarados cai no balde único', () => {
    const resolve = createClientIpResolver({ source: 'x-forwarded-for', trustedProxyHops: 2 })
    expect(resolve(requestWith({ 'x-forwarded-for': EDGE_IP }))).toBe(UNKNOWN_CLIENT_IP)
  })

  test('cabeçalho ausente ou vazio cai no balde único', () => {
    const resolve = createClientIpResolver({ source: 'x-forwarded-for', trustedProxyHops: 1 })
    expect(resolve(requestWith({}))).toBe(UNKNOWN_CLIENT_IP)
    expect(resolve(requestWith({ 'x-forwarded-for': ' , ' }))).toBe(UNKNOWN_CLIENT_IP)
  })
})

describe('resolvedor do IP do cliente — Cloudflare obrigatória (cf-connecting-ip)', () => {
  const resolve = createClientIpResolver({ source: 'cf-connecting-ip', trustedProxyHops: 1 })

  test('lê só o cf-connecting-ip', () => {
    expect(
      resolve(
        requestWith({
          'cf-connecting-ip': EDGE_IP,
          'x-forwarded-for': FORGED_IP,
          'x-real-ip': FORGED_IP,
        }),
      ),
    ).toBe(EDGE_IP)
  })

  test('sem o cabeçalho, balde único', () => {
    expect(resolve(requestWith({ 'x-real-ip': FORGED_IP }))).toBe(UNKNOWN_CLIENT_IP)
  })
})
