/* Copyright (c) 2026 Ada Technology. MIT License. */
export const COLOR_THEMES = ['dark', 'light'] as const
export type ColorTheme = (typeof COLOR_THEMES)[number]

export const COLOR_THEME_STORAGE_KEY = 'transportada:color-theme'
