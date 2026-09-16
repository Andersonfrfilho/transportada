/* Copyright (c) 2026 Ada Technology. MIT License. */
import { MARKER_DICTIONARY, MARKER_ID } from '@/components/ui/boxDimension.constant'

/**
 * ⚠️ Matriz de bits do marcador ArUco `DICT_4X4_50`, id 0, com a borda de 1 módulo (6×6 células:
 * a borda preta e os 4×4 bits de dado). **Não é inventada**: extraída rodando
 * `cv.generateImageMarker(dictionary, 0, …, 1)` sobre o mesmo artefato de build próprio do
 * OpenCV que o worker de medida usa para detectar (ADR-0065) — o mesmo dicionário que gera o
 * cartão é o que `boxDimension.worker.ts` consulta em `detectMarkerCorners`
 * (`cv.getPredefinedDictionary(cv.DICT_4X4_50)`).
 * Cartão impresso com bits diferentes destes não é detectado, e o defeito não aparece na tela — só
 * no galpão. Cada caractere é `1` (célula preta) ou `0` (célula branca), linha a linha, de cima
 * para baixo, esquerda para direita.
 */
export const MEASUREMENT_CARD_MARKER_GRID: readonly string[] = [
  '111111',
  '101001',
  '110101',
  '111001',
  '111011',
  '111111',
]

export const MEASUREMENT_CARD_MARKER_MODULES = MEASUREMENT_CARD_MARKER_GRID.length

/** Reexportado por conveniência: quem desenha o cartão não precisa importar dois módulos. */
export const MEASUREMENT_CARD_MARKER_DICTIONARY = MARKER_DICTIONARY
export const MEASUREMENT_CARD_MARKER_ID = MARKER_ID
