/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O motorista que não consegue compartilhar a localização pelo clipe manda o link do Google Maps. Quando o link
 * traz as coordenadas na própria URL, elas valem como o ponto; link curto ou só com nome de lugar não traz nada
 * e segue sem ponto (o bot nunca abre a URL: nada de rede aqui).
 */

export type MapsLocation = { readonly latitude: number; readonly longitude: number }

const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu
const MAPS_HOST_PATTERN = /^(?:[a-z0-9-]+\.)*(?:google\.[a-z.]+|goo\.gl)$/iu
const NUMBER = '-?\\d{1,3}(?:\\.\\d+)?'
const AT_PATTERN = new RegExp(`@(${NUMBER}),(${NUMBER})`, 'u')
const PIN_PATTERN = new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`, 'u')
const PAIR_PATTERN = new RegExp(`^(${NUMBER}),\\s*(${NUMBER})$`, 'u')
const PAIR_PARAMETERS = ['q', 'query', 'll', 'destination', 'center', 'daddr'] as const

function toLocation(latitude: string, longitude: string): MapsLocation | null {
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  // 0,0 é o "sem ponto" do mapa, nunca um endereço do motorista.
  if (lat === 0 && lng === 0) return null
  return { latitude: lat, longitude: lng }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function fromUrl(rawUrl: string): MapsLocation | null {
  let url: URL
  try {
    url = new URL(rawUrl.replace(/[).,;]+$/u, ''))
  } catch {
    return null
  }
  if (!MAPS_HOST_PATTERN.test(url.hostname)) return null
  // Link curto (maps.app.goo.gl) só tem um código e não traz ponto: a URL longa é que decide.
  const host = url.hostname.toLowerCase()
  if (!host.startsWith('maps.') && !url.pathname.toLowerCase().startsWith('/maps')) return null

  const target = safeDecode(`${url.pathname}${url.hash}`)
  const pin = PIN_PATTERN.exec(target)
  if (pin !== null) return toLocation(pin[1] ?? '', pin[2] ?? '')
  const at = AT_PATTERN.exec(target)
  if (at !== null) return toLocation(at[1] ?? '', at[2] ?? '')

  for (const name of PAIR_PARAMETERS) {
    const value = url.searchParams.get(name)
    const pair = value === null ? null : PAIR_PATTERN.exec(value.trim())
    if (pair !== null) return toLocation(pair[1] ?? '', pair[2] ?? '')
  }
  return null
}

/** O primeiro link do Maps com coordenadas dentro do texto da mensagem, ou `null`. */
export function parseMapsLocation(text: string): MapsLocation | null {
  for (const match of text.matchAll(URL_PATTERN)) {
    const location = fromUrl(match[0])
    if (location !== null) return location
  }
  return null
}
