/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149: de onde veio o motorista de um veículo da sugestão — vínculo do cadastro, recomendação
 * pelo score ou escolha manual na revisão.
 */
export const DRIVER_SOURCES = ['link', 'recommended', 'manual'] as const
export type DriverSource = (typeof DRIVER_SOURCES)[number]

/**
 * Spec 149 T5: o que o **cliente** pode declarar. `recommended` é preenchido só pelo servidor
 * (T10) — deixá-lo fora daqui faz o schema recusar com 400 quem tentar mandar essa origem.
 */
export const CLIENT_DRIVER_SOURCES = ['link', 'manual'] as const
export type ClientDriverSource = (typeof CLIENT_DRIVER_SOURCES)[number]
