/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149: de onde veio o motorista de um veículo da sugestão — vínculo do cadastro, recomendação
 * pelo score ou escolha manual na revisão.
 */
export const DRIVER_SOURCES = ['link', 'recommended', 'manual'] as const
export type DriverSource = (typeof DRIVER_SOURCES)[number]
