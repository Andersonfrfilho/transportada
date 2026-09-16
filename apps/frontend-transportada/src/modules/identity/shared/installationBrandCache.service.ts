/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { InstallationBrand } from './installationBrand.service'

/**
 * A última marca lida, para a próxima abertura já nascer com ela. É dado público — o mesmo que
 * `/public/landing-settings` entrega a qualquer um —, então cabe no `localStorage` sem risco.
 */
const INSTALLATION_BRAND_STORAGE_KEY = 'transportada.installation-brand.v1'

export type InstallationBrandStorage = Pick<Storage, 'getItem' | 'setItem'>

function resolveStorage(): InstallationBrandStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function isInstallationBrand(value: unknown): value is InstallationBrand {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.logoUrl === 'string' &&
    (candidate.name === null || typeof candidate.name === 'string')
  )
}

export function readCachedInstallationBrand(
  storage: InstallationBrandStorage | null = resolveStorage(),
): InstallationBrand | undefined {
  try {
    const raw = storage?.getItem(INSTALLATION_BRAND_STORAGE_KEY)
    if (raw == null) return undefined
    const parsed: unknown = JSON.parse(raw)
    return isInstallationBrand(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Leitura sem nome não apaga a marca guardada: a API fora do ar responde igual a instalação sem
 * nome, e trocar a transportadora pelo produto por uma queda de rede é a piscada que se quer evitar.
 */
export function mergeInstallationBrand(params: {
  readonly cached: InstallationBrand | undefined
  readonly fetched: InstallationBrand
}): InstallationBrand {
  if (params.fetched.name === null && params.cached?.name != null) return params.cached
  return params.fetched
}

export function writeCachedInstallationBrand(
  brand: InstallationBrand,
  storage: InstallationBrandStorage | null = resolveStorage(),
): void {
  try {
    storage?.setItem(INSTALLATION_BRAND_STORAGE_KEY, JSON.stringify(brand))
  } catch {
    // Navegador sem armazenamento (aba privada, cota cheia): a marca só não nasce pronta da próxima vez.
  }
}
