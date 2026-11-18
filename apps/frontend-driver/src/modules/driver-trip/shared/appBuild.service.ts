/* Copyright (c) 2026 Ada Technology. MIT License. */

declare const __APP_BUILD_TIME__: string | undefined

/**
 * Quando o bundle em execução foi gerado (`define` do `vite.config.ts`). Fora do build (testes, dev sem
 * o define) devolve `undefined` — a tela simplesmente não mostra a linha.
 */
export function readAppBuildTime(): string | undefined {
  return typeof __APP_BUILD_TIME__ === 'string' ? __APP_BUILD_TIME__ : undefined
}

/** `2026-11-18T17:05:12.000Z` → `18/11 14:05` no horário do aparelho. */
export function formatAppBuildTime(buildTime: string): string | undefined {
  const date = new Date(buildTime)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  })
}
