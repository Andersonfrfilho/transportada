/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Largura máxima do quadro que sai do `<video>` para processamento — leitura de etiqueta e medida de
 * caixa reduzem a imagem ao mesmo teto antes de qualquer conta.
 *
 * ⚠️ **Uma declaração só.** O número vivia duplicado em `useBarcodeScanner.hook.ts` e em
 * `boxDimensionFrame.service.ts` (§16 do padrão de código): um telefone moderno filma em 1920 ou
 * mais, nem o ArUco nem o código de barras precisam disso, e mudar o teto num lugar só deixaria os
 * dois leitores decidindo em espaços diferentes.
 */
export const MAXIMUM_FRAME_WIDTH = 720
