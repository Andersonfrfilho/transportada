/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { isIP } from 'node:net'

import type { ClientIpPolicy } from '../shared/client-ip.constant'

export { DEFAULT_CLIENT_IP_POLICY } from '../shared/client-ip.constant'

export type ClientIpResolver = (request: Request) => string

/** Sem endereço confiável, todo tráfego divide um balde só — limita a mais, nunca a menos. */
export const UNKNOWN_CLIENT_IP = 'unknown'

/**
 * ADR-0065: o IP sai só do cabeçalho que o proxy conhecido **escreve**, nunca do que o cliente
 * manda. O começo de `x-forwarded-for` é do cliente — o proxy anexa ao fim —, e confiar nele
 * deixava trocar de balde do limitador a cada requisição. Medido em 2026-09-14: a zona está na
 * Cloudflare só como DNS (sem `cf-ray`), então o único salto é o edge do Railway, que escreve
 * `x-real-ip`. `cf-connecting-ip` nessa topologia é texto livre do cliente.
 */
export function createClientIpResolver(policy: ClientIpPolicy): ClientIpResolver {
  return (request) => toClientIp(readTrustedAddress({ policy, request }))
}

function readTrustedAddress(input: {
  readonly policy: ClientIpPolicy
  readonly request: Request
}): string | undefined {
  const value = input.request.headers.get(input.policy.source)
  if (value === null) return undefined
  if (input.policy.source !== 'x-forwarded-for') return value

  const chain = value.split(',').map((address) => address.trim())
  if (chain.length < input.policy.trustedProxyHops) return undefined
  return chain[chain.length - input.policy.trustedProxyHops]
}

function toClientIp(address: string | undefined): string {
  const trimmed = address?.trim()
  if (trimmed === undefined || isIP(trimmed) === 0) return UNKNOWN_CLIENT_IP
  return trimmed
}
