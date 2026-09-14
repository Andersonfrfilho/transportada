/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const CLIENT_IP_SOURCES = ['x-real-ip', 'x-forwarded-for', 'cf-connecting-ip'] as const
export type ClientIpSource = (typeof CLIENT_IP_SOURCES)[number]

export type ClientIpPolicy = Readonly<{
  source: ClientIpSource
  /** Só vale para `x-forwarded-for`: quantos endereços, do fim da cadeia, nossos proxies anexaram. */
  trustedProxyHops: number
}>

/** ADR-0065: a topologia medida — só o edge do Railway, que sobrescreve `x-real-ip`. */
export const DEFAULT_CLIENT_IP_POLICY: ClientIpPolicy = { source: 'x-real-ip', trustedProxyHops: 1 }
export const MAX_TRUSTED_PROXY_HOPS = 10
