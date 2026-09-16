/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BOX_DIMENSION_DOMAIN_WARNINGS,
  BOX_DIMENSION_INTERNAL_WARNINGS,
  BOX_DIMENSION_WARNINGS,
  CORNER_SIGMA_FLOOR_PX,
  DEFAULT_HORIZONTAL_FOV_DEGREES,
  FALLBACK_FOCAL_RELATIVE_SIGMA,
  MARGIN_RELIABLE_MM,
  MARGIN_UNRELIABLE_MM,
  MARKER_SIDE_MM,
  MEASUREMENT_ENGINE,
  MONTE_CARLO_SAMPLES,
  PRINT_FLOOR_MM,
  PRINT_SCALE_TOLERANCE,
  TOUCH_SIGMA_PX,
} from '@/components/ui/boxDimension.constant'
import {
  classifyMargin,
  classifyMeasurement,
  createSeededRandom,
  defaultFocalPx,
  estimateMargins,
  estimateMarkerView,
  measureBox,
  printFloorMm,
  type BoxMeasurementInput,
} from '@/components/ui/boxDimension.service'
import {
  computeHomography,
  projectPoint,
  recoverPose,
  type CameraPose,
  type Point,
  type Vector3,
} from '@/components/ui/boxDimensionGeometry.service'
import { detectWarnings, selectDomainWarnings } from '@/components/ui/boxDimensionWarnings.service'

const WIDTH = 1920
const HEIGHT = 1080
const FOCAL = 1450
const SYNTHETIC_TILT_DEGREES = 40
const BOX = { lengthMm: 600, widthMm: 400, heightMm: 350 } as const
const BOX_ORIGIN_MM = -100

/** Pose sintética: câmera acima e à frente da caixa, olhando para baixo e inclinada ~40°. */
function buildPose(): CameraPose {
  const tilt = (SYNTHETIC_TILT_DEGREES * Math.PI) / 180
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)
  return {
    focalPx: FOCAL,
    principal: { x: WIDTH / 2, y: HEIGHT / 2 },
    rotation: [1, 0, 0, 0, cos, -sin, 0, sin, cos],
    translation: [-200, -150, 1200],
  }
}

function synthesize(pose: CameraPose): BoxMeasurementInput {
  const project = (world: Vector3): Point => projectPoint(pose, world)
  const origin = BOX_ORIGIN_MM
  return {
    markerCorners: [
      project([0, 0, 0]),
      project([MARKER_SIDE_MM, 0, 0]),
      project([MARKER_SIDE_MM, MARKER_SIDE_MM, 0]),
      project([0, MARKER_SIDE_MM, 0]),
    ],
    facePoints: [
      project([origin, origin + BOX.widthMm, 0]),
      project([origin + BOX.lengthMm, origin + BOX.widthMm, 0]),
      project([origin + BOX.lengthMm, origin, 0]),
      project([origin, origin, 0]),
    ],
    footPoint: project([origin, origin + BOX.widthMm, BOX.heightMm]),
    imageWidth: WIDTH,
    imageHeight: HEIGHT,
  }
}

const MARKER_OBJECT_POINTS: readonly Point[] = [
  { x: 0, y: 0 },
  { x: MARKER_SIDE_MM, y: 0 },
  { x: MARKER_SIDE_MM, y: MARKER_SIDE_MM },
  { x: 0, y: MARKER_SIDE_MM },
]

describe('boxDimension.constant', () => {
  test('os limites de precisão são os do spike e da API (10/30 mm)', () => {
    expect(MARGIN_RELIABLE_MM).toBe(10)
    expect(MARGIN_UNRELIABLE_MM).toBe(30)
  })

  test('parâmetros de incerteza e do marcador iguais aos do spike', () => {
    expect(MARKER_SIDE_MM).toBe(150)
    expect(PRINT_FLOOR_MM).toBe(2)
    expect(PRINT_SCALE_TOLERANCE).toBe(0.002)
    expect(CORNER_SIGMA_FLOOR_PX).toBe(0.3)
    expect(TOUCH_SIGMA_PX).toBe(1.5)
    expect(DEFAULT_HORIZONTAL_FOV_DEGREES).toBe(68)
    expect(FALLBACK_FOCAL_RELATIVE_SIGMA).toBe(0.1)
    expect(MONTE_CARLO_SAMPLES).toBe(400)
    expect(MEASUREMENT_ENGINE).toBe('aruco-homography-v1')
  })

  test('o comentário "provisório até a validação (T15)" acompanha os dois limites', async () => {
    const source = await Bun.file(
      new URL('../../src/components/ui/boxDimension.constant.ts', import.meta.url),
    ).text()
    expect(source).toContain('T15')
    expect(source.toLowerCase()).toContain('provis')
  })
})

describe('measureBox', () => {
  test('pose sintética conhecida: erro abaixo de 1 mm nas três dimensões', () => {
    const result = measureBox(synthesize(buildPose()))
    expect(result.focalSource).toBe('homography')
    expect(Math.abs(result.focalPx - FOCAL)).toBeLessThan(1)
    expect(Math.abs(result.lengthMm - BOX.lengthMm)).toBeLessThan(1)
    expect(Math.abs(result.widthMm - BOX.widthMm)).toBeLessThan(1)
    expect(Math.abs(result.heightMm - BOX.heightMm)).toBeLessThan(1)
    expect(result.reprojectionErrorPx).toBeLessThan(0.01)
  })

  test('recoverPose devolve a rotação da pose sintética', () => {
    const pose = buildPose()
    const input = synthesize(pose)
    const homography = computeHomography(MARKER_OBJECT_POINTS, input.markerCorners)
    const recovered = recoverPose(homography, FOCAL, pose.principal)
    recovered.rotation.forEach((value, index) =>
      expect(value).toBeCloseTo(pose.rotation[index] ?? 0, 6),
    )
  })

  test('comprimento é sempre o maior lado e largura o menor', () => {
    const result = measureBox(synthesize(buildPose()))
    expect(result.lengthMm).toBeGreaterThanOrEqual(result.widthMm)
  })

  test('marcador degenerado (quatro cantos no mesmo ponto) lança, não devolve número plausível', () => {
    const input = synthesize(buildPose())
    const corner: Point = { x: 100, y: 100 }
    expect(() =>
      measureBox({ ...input, markerCorners: [corner, corner, corner, corner] }),
    ).toThrow()
  })

  test('focal fora da faixa física cai no FOV padrão, e a margem reflete isso', () => {
    const pose = buildPose()
    const input = synthesize(pose)
    // Marcador quase frontal: a homografia não observa perspectiva e a focal estimada não é física.
    const flat: readonly Point[] = MARKER_OBJECT_POINTS.map((point) => ({
      x: WIDTH / 2 + point.x,
      y: HEIGHT / 2 + point.y,
    }))
    const result = measureBox({ ...input, markerCorners: flat })
    expect(result.focalSource).toBe('defaultFov')
    expect(result.focalPx).toBeCloseTo(defaultFocalPx(WIDTH), 6)
  })

  test('estimateMarkerView devolve o ângulo de visão só com o marcador', () => {
    const input = synthesize(buildPose())
    const view = estimateMarkerView(input.markerCorners, WIDTH, HEIGHT)
    expect(view.focalSource).toBe('homography')
    expect(Math.abs(view.viewAngleDegrees - SYNTHETIC_TILT_DEGREES)).toBeLessThan(1)
  })
})

describe('estimateMargins', () => {
  const input = synthesize(buildPose())
  const nominal = measureBox(input)

  test('determinístico com a mesma semente injetada', () => {
    const first = estimateMargins(input, nominal, { random: createSeededRandom(7), samples: 200 })
    const second = estimateMargins(input, nominal, { random: createSeededRandom(7), samples: 200 })
    expect(first).toEqual(second)
  })

  test('determinístico sem semente injetada: a semente padrão é fixa', () => {
    const first = estimateMargins(input, nominal)
    const second = estimateMargins(input, nominal)
    expect(first).toEqual(second)
  })

  test('sementes diferentes não são o mesmo sorteio', () => {
    const first = estimateMargins(input, nominal, { random: createSeededRandom(7), samples: 200 })
    const second = estimateMargins(input, nominal, { random: createSeededRandom(8), samples: 200 })
    expect(first).not.toEqual(second)
  })

  test('margem nunca abaixo do piso de impressão e cresce com o toque impreciso', () => {
    const tight = estimateMargins(input, nominal, {
      random: createSeededRandom(1),
      samples: 200,
      touchSigmaPx: 0.5,
    })
    const loose = estimateMargins(input, nominal, {
      random: createSeededRandom(1),
      samples: 200,
      touchSigmaPx: 6,
    })
    expect(tight.lengthMarginMm).toBeGreaterThanOrEqual(printFloorMm(nominal.lengthMm))
    expect(loose.lengthMarginMm).toBeGreaterThan(tight.lengthMarginMm)
    expect(loose.heightMarginMm).toBeGreaterThan(tight.heightMarginMm)
  })

  test('piso de impressão é 2 mm mais 0,2% da aresta', () => {
    expect(printFloorMm(0)).toBeCloseTo(PRINT_FLOOR_MM, 10)
    expect(printFloorMm(1000)).toBeCloseTo(PRINT_FLOOR_MM + 2, 10)
  })
})

describe('classifyMargin', () => {
  test('fronteiras 10/30 mm', () => {
    expect(classifyMargin(10)).toBe('reliable')
    expect(classifyMargin(10.01)).toBe('imprecise')
    expect(classifyMargin(30)).toBe('imprecise')
    expect(classifyMargin(30.01)).toBe('unreliable')
  })

  test('as fronteiras saem das constantes, não de literal', () => {
    expect(classifyMargin(MARGIN_RELIABLE_MM)).toBe('reliable')
    expect(classifyMargin(MARGIN_UNRELIABLE_MM)).toBe('imprecise')
    expect(classifyMargin(MARGIN_UNRELIABLE_MM + 0.01)).toBe('unreliable')
  })
})

describe('classifyMeasurement', () => {
  test('tudo confiável: preenche as três e não pede confirmação', () => {
    const classification = classifyMeasurement({
      lengthMarginMm: 4,
      widthMarginMm: 6,
      heightMarginMm: 10,
    })
    expect(classification.length).toBe('reliable')
    expect(classification.height).toBe('reliable')
    expect(classification.worst).toBe('reliable')
    expect(classification.requiresConfirmation).toBe(false)
    expect(classification.filled).toEqual({ length: true, width: true, height: true })
  })

  test('faixa de aviso (10–30 mm): preenche, mas exige confirmação', () => {
    const classification = classifyMeasurement({
      lengthMarginMm: 4,
      widthMarginMm: 18,
      heightMarginMm: 9,
    })
    expect(classification.width).toBe('imprecise')
    expect(classification.worst).toBe('imprecise')
    expect(classification.requiresConfirmation).toBe(true)
    expect(classification.filled).toEqual({ length: true, width: true, height: true })
  })

  test('acima de 30 mm: aquela dimensão não é preenchida pela câmera', () => {
    const classification = classifyMeasurement({
      lengthMarginMm: 4,
      widthMarginMm: 9,
      heightMarginMm: 42,
    })
    expect(classification.height).toBe('unreliable')
    expect(classification.worst).toBe('unreliable')
    expect(classification.filled).toEqual({ length: true, width: true, height: false })
  })

  test('dimensão não confiável sozinha não vira pedido de confirmação', () => {
    const classification = classifyMeasurement({
      lengthMarginMm: 4,
      widthMarginMm: 4,
      heightMarginMm: 42,
    })
    expect(classification.requiresConfirmation).toBe(false)
  })
})

describe('detectWarnings', () => {
  const good = {
    width: 1280,
    height: 720,
    meanLuminance: 120,
    luminanceContrast: 50,
    laplacianVariance: 200,
    markerCorners: [
      { x: 500, y: 300 },
      { x: 700, y: 300 },
      { x: 700, y: 500 },
      { x: 500, y: 500 },
    ],
    viewAngleDegrees: 30,
  }

  test('quadro bom não tem motivo', () => expect(detectWarnings(good)).toEqual([]))
  test('sem marcador', () =>
    expect(detectWarnings({ ...good, markerCorners: [] })).toContain('markerNotFound'))
  test('marcador pequeno', () =>
    expect(
      detectWarnings({
        ...good,
        markerCorners: [
          { x: 500, y: 300 },
          { x: 550, y: 300 },
          { x: 550, y: 350 },
          { x: 500, y: 350 },
        ],
      }),
    ).toContain('markerTooSmall'))
  test('ângulo', () =>
    expect(detectWarnings({ ...good, viewAngleDegrees: 70 })).toContain('steepAngle'))
  test('luz', () => expect(detectWarnings({ ...good, meanLuminance: 30 })).toContain('lowLight'))
  test('contraste baixo também é pouca luz', () =>
    expect(detectWarnings({ ...good, luminanceContrast: 5 })).toContain('lowLight'))
  test('nitidez', () =>
    expect(detectWarnings({ ...good, laplacianVariance: 10 })).toContain('blurry'))
  test('marcador na borda (código interno)', () =>
    expect(
      detectWarnings({
        ...good,
        markerCorners: [
          { x: 2, y: 300 },
          { x: 200, y: 300 },
          { x: 200, y: 500 },
          { x: 2, y: 500 },
        ],
      }),
    ).toContain('markerAtEdge'))
  test('caixa fora do quadro', () =>
    expect(detectWarnings({ ...good, markedPoints: [{ x: 1275, y: 100 }] })).toContain(
      'boxOutOfFrame',
    ))
  test('instável', () =>
    expect(
      detectWarnings({
        ...good,
        previousMarkerCorners: good.markerCorners.map((corner) => ({
          x: corner.x + 10,
          y: corner.y,
        })),
      }),
    ).toContain('unstable'))

  test('cada motivo do domínio fechado da D9 é alcançável pelo motor', () => {
    const produced = new Set<string>([
      ...detectWarnings({ ...good, markerCorners: [] }),
      ...detectWarnings({
        ...good,
        markerCorners: [
          { x: 500, y: 300 },
          { x: 550, y: 300 },
          { x: 550, y: 350 },
          { x: 500, y: 350 },
        ],
      }),
      ...detectWarnings({ ...good, viewAngleDegrees: 70 }),
      ...detectWarnings({ ...good, meanLuminance: 30 }),
      ...detectWarnings({ ...good, laplacianVariance: 10 }),
      ...detectWarnings({ ...good, markedPoints: [{ x: 1275, y: 100 }] }),
      ...detectWarnings({
        ...good,
        previousMarkerCorners: good.markerCorners.map((corner) => ({
          x: corner.x + 10,
          y: corner.y,
        })),
      }),
    ])
    BOX_DIMENSION_DOMAIN_WARNINGS.forEach((code) => expect(produced.has(code)).toBe(true))
  })

  test('o mesmo quadro sempre devolve os mesmos motivos, na mesma ordem', () => {
    const frame = { ...good, meanLuminance: 30, laplacianVariance: 10, viewAngleDegrees: 70 }
    expect(detectWarnings(frame)).toEqual(detectWarnings(frame))
  })
})

describe('domínio de motivos', () => {
  test('os sete códigos da D9 são exatamente os do CHECK da API', () => {
    expect([...BOX_DIMENSION_DOMAIN_WARNINGS]).toEqual([
      'markerNotFound',
      'markerTooSmall',
      'steepAngle',
      'lowLight',
      'blurry',
      'boxOutOfFrame',
      'unstable',
    ])
  })

  test('markerAtEdge é interno do motor e fica fora do enum da API', () => {
    expect([...BOX_DIMENSION_INTERNAL_WARNINGS]).toEqual(['markerAtEdge'])
    expect([...BOX_DIMENSION_DOMAIN_WARNINGS]).not.toContain('markerAtEdge')
    expect([...BOX_DIMENSION_WARNINGS]).toContain('markerAtEdge')
  })

  test('selectDomainWarnings entrega só o que a API aceita gravar', () => {
    expect(selectDomainWarnings(['markerAtEdge', 'lowLight', 'blurry'])).toEqual([
      'lowLight',
      'blurry',
    ])
    expect(selectDomainWarnings(['markerAtEdge'])).toEqual([])
  })
})

describe('o motor é puro', () => {
  const MODULES = [
    'boxDimension.constant.ts',
    'boxDimension.service.ts',
    'boxDimensionGeometry.service.ts',
    'boxDimensionWarnings.service.ts',
  ] as const
  const FORBIDDEN = [
    'document',
    'window',
    'navigator',
    'fetch(',
    'console.',
    'localStorage',
    'Worker',
    'opencv',
    'cv.',
    'Math.random',
  ] as const

  MODULES.forEach((moduleName) => {
    test(`${moduleName}: sem I/O, sem DOM, sem OpenCV e sem aleatório não semeado`, async () => {
      const source = await Bun.file(
        new URL(`../../src/components/ui/${moduleName}`, import.meta.url),
      ).text()
      FORBIDDEN.forEach((token) => expect(source).not.toContain(token))
      expect(source).not.toMatch(/^import .*from '(?!\.\/boxDimension)/m)
    })
  })
})
