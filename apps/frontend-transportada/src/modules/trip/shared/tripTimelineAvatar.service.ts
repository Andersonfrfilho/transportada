/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripTimelineItem } from './trip.types'

/** Spec 180 RF10: a paleta é fixa — o índice só escolhe entre elas, nunca inventa uma cor nova. */
export const TRIP_TIMELINE_AVATAR_PALETTE_SIZE = 6

export type TripTimelineAvatar = Readonly<{ initials: string; paletteIndex: number }>

/**
 * Spec 180 RF10: "Eurides Dias Fontes" → "EF" — primeiro e último nome; uma palavra só dá uma
 * letra. Mesmo algoritmo do `initialsOf` de `CompanyUserPictureField.component.tsx` (módulo
 * `identity`), reescrito aqui porque aquele é privado ao arquivo e o conceito é pequeno demais
 * para justificar extrair um pacote compartilhado só por isso.
 */
export function resolveTripTimelineAvatarInitials(actorName: string): string {
  const parts = actorName
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0)
  if (parts.length === 0) return ''
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

/**
 * Spec 180 RF10: a cor nasce do nome, não do sorteio a cada render — o mesmo autor precisa da
 * mesma cor em toda tela, senão parece gente diferente. Hash simples e determinístico, mod o
 * tamanho da paleta fixa em CSS (`tripTimeline.module.css`, `.avatarPalette0`.."5").
 */
export function resolveTripTimelineAvatarPaletteIndex(actorName: string): number {
  let hash = 0
  for (let index = 0; index < actorName.length; index += 1) {
    hash = (hash * 31 + actorName.charCodeAt(index)) % TRIP_TIMELINE_AVATAR_PALETTE_SIZE
  }
  return hash
}

/**
 * Spec 180 RF9/RF11 (CA08/CA09): o avatar só existe quando o item já publica um `actorName` — sem
 * autor identificado (RF3), não há avatar: um círculo de interrogação afirmaria alguém que não
 * existe. Nunca busca nome, id ou imagem — só lê o que a linha do tempo já carrega.
 */
export function resolveTripTimelineAvatar(item: TripTimelineItem): null | TripTimelineAvatar {
  const actorName = item.actorName
  if (actorName === null || actorName.trim() === '') return null

  return {
    initials: resolveTripTimelineAvatarInitials(actorName),
    paletteIndex: resolveTripTimelineAvatarPaletteIndex(actorName),
  }
}
