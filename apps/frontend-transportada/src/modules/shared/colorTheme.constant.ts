/* Copyright (c) 2026 Ada Technology. MIT License. */
export const COLOR_THEMES = ['dark', 'light'] as const
export type ColorTheme = (typeof COLOR_THEMES)[number]

export const COLOR_THEME_STORAGE_KEY = 'transportada:color-theme'

/**
 * O nome que leva a escolha do painel até a tela de login. Ele viaja na URL porque é a única via:
 * o Keycloak é outra origem e não alcança o `localStorage` onde a escolha mora.
 */
export const COLOR_THEME_AUTH_PARAM = 'transportada_theme'
