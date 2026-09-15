/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Os nomes das imagens que o estilo do mapa pede e o `AssemblyVectorMap` desenha no
 * `styleimagemissing`. Arquivo próprio para o estilo (`vectorBasemap.service.ts`) e o selo
 * (`mapBadge.service.ts`) importarem o mesmo nome sem um depender do outro.
 */
export const MAP_BADGE_IDS = { radar: 'selo-radar', toll: 'selo-pedagio' } as const

/**
 * O radar com limite conhecido pede `selo-radar-<velocidade>`: uma imagem por valor, com a placa
 * de velocidade ao lado da câmera, desenhada na primeira vez que o valor aparece.
 */
export const RADAR_SPEED_BADGE_PREFIX = `${MAP_BADGE_IDS.radar}-`

export type MapBadgeKind = keyof typeof MAP_BADGE_IDS
export type MapBadgeId = (typeof MAP_BADGE_IDS)[MapBadgeKind]
