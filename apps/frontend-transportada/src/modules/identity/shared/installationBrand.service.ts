/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A marca da transportadora desta instalação, para a tela de entrar. Cada deploy é de uma
 * transportadora só (ADR-0021), então "a empresa" aqui não é ambígua — e quem chega antes de se
 * identificar precisa reconhecer de quem é o sistema.
 *
 * Vem das rotas **públicas que já existem** (`/public/landing-*`), as mesmas que o site
 * institucional consome. Uma rota nova só para isto acrescentaria superfície anônima para servir
 * exatamente o mesmo byte.
 */
const PUBLIC_SETTINGS_PATH = '/public/landing-settings'
const PUBLIC_LOGO_PATH = '/public/landing-logo'

export type InstallationBrand = {
  readonly logoUrl: string
  readonly name: string | null
}

type Dependencies = {
  readonly apiUrl: string
  readonly fetch: typeof globalThis.fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Falha e ausência dão no mesmo: a tela cai na marca do produto. Instalação recém-provisionada não
 * tem logotipo, e a rede cai — nenhum dos dois é motivo para segurar quem quer entrar.
 */
export async function readInstallationBrand({
  apiUrl,
  fetch,
}: Dependencies): Promise<InstallationBrand> {
  const logoUrl = `${apiUrl}${PUBLIC_LOGO_PATH}`

  try {
    const response = await fetch(`${apiUrl}${PUBLIC_SETTINGS_PATH}`)
    if (!response.ok) return { logoUrl, name: null }

    const payload: unknown = await response.json()
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : undefined
    const brandName = typeof data?.brandName === 'string' ? data.brandName.trim() : ''

    return { logoUrl, name: brandName === '' ? null : brandName }
  } catch {
    return { logoUrl, name: null }
  }
}
