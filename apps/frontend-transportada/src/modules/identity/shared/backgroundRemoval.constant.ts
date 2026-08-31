/* Copyright (c) 2026 Ada Technology. MIT License. */
import { BACKGROUND_FILL, type BackgroundFill } from '@adatechnology/image-cutout'

/**
 * O modelo e o runtime são servidos **pelo próprio domínio**, de `public/background-removal/`. Não
 * vêm no pacote de propósito: são megabytes que não cabem no `install` de quem não usa o recurso, e
 * servir de casa mantém o rosto de quem trabalha aqui longe de CDN de terceiro — a CSP continua
 * fechada em `'self'`.
 */
export const BACKGROUND_REMOVAL_CONFIG = {
  modelUrl: '/background-removal/u2netp.onnx',
  runtimeUrl: '/background-removal/ort.wasm.min.js',
  /** Sem isto o runtime procura os `.wasm` ao lado do próprio bundle — que é outro caminho. */
  wasmPaths: '/background-removal/',
} as const

/**
 * A cor da marca, em hexadecimal e não em token: o valor vai para o `fillStyle` de um canvas, e
 * `var(--color-asphalt)` não existe lá dentro — sairia como fundo transparente, em silêncio.
 * Espelha `--color-asphalt` de `src/styles/index.css`.
 */
export const COMPANY_BACKGROUND_COLOR = '#10222c'

export const PICTURE_BACKGROUND_CHOICE = {
  COMPANY: 'company',
  TRANSPARENT: 'transparent',
  WHITE: 'white',
} as const
export type PictureBackgroundChoice =
  (typeof PICTURE_BACKGROUND_CHOICE)[keyof typeof PICTURE_BACKGROUND_CHOICE]

export function toBackgroundFill(choice: PictureBackgroundChoice): BackgroundFill {
  if (choice === PICTURE_BACKGROUND_CHOICE.COMPANY) return { color: COMPANY_BACKGROUND_COLOR }
  if (choice === PICTURE_BACKGROUND_CHOICE.TRANSPARENT) return BACKGROUND_FILL.TRANSPARENT
  return BACKGROUND_FILL.WHITE
}
