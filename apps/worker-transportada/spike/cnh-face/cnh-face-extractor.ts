/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spike 295 T4.1: protótipo da extração do rosto da CNH. Não é código de produção — fica fora do
 * `tsconfig` e do lint de propósito. Dependências: `pdfjs-dist` e `sharp` (já do worker) e
 * `onnxruntime-web` 1.23.2 (WASM: a imagem do worker é Alpine/musl e o `onnxruntime-node` só traz
 * binário glibc) + modelo UltraFace RFB-320 (ver `README.md` ao lado).
 */
import { readFile } from 'node:fs/promises'

import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { env as onnxEnvironment, InferenceSession, Tensor } from 'onnxruntime-web'
import sharp from 'sharp'

const DETECTOR_WIDTH = 320
const DETECTOR_HEIGHT = 240
const FACE_SCORE_THRESHOLD = 0.7
const NMS_IOU_THRESHOLD = 0.3
const MIN_SOURCE_IMAGE_SIDE = 200
export const MIN_USABLE_SHORT_SIDE = 120
const OUTPUT_MAX_SIDE = 512
const PDF_SIGNATURE = '%PDF'

export const CNH_FACE_OUTCOMES = {
  EXTRACTED: 'extracted',
  NO_FACE: 'no_face',
  MULTIPLE_FACES: 'multiple_faces',
  TOO_SMALL: 'too_small',
  UNSUPPORTED: 'unsupported',
} as const
export type CnhFaceOutcome = (typeof CNH_FACE_OUTCOMES)[keyof typeof CNH_FACE_OUTCOMES]

export const CNH_SOURCE_KINDS = {
  PDF_DIGITAL: 'pdf_digital',
  PDF_SCANNED: 'pdf_scanned',
  IMAGE: 'image',
  UNKNOWN: 'unknown',
} as const
export type CnhSourceKind = (typeof CNH_SOURCE_KINDS)[keyof typeof CNH_SOURCE_KINDS]

type RawImage = { readonly width: number; readonly height: number; readonly rgb: Buffer }
type FaceBox = {
  readonly score: number
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

export type CnhFaceResult = {
  readonly outcome: CnhFaceOutcome
  readonly sourceKind: CnhSourceKind
  readonly candidateImages: number
  readonly facesFound: number
  readonly faceScore?: number
  readonly cropShortSide?: number
  readonly webp?: Buffer
}

export type CnhFaceExtractorParams = { readonly modelPath: string }

export async function createCnhFaceExtractor({ modelPath }: CnhFaceExtractorParams) {
  onnxEnvironment.wasm.numThreads = 1
  const session = await InferenceSession.create(new Uint8Array(await readFile(modelPath)), {
    executionProviders: ['wasm'],
    logSeverityLevel: 3,
  })

  async function detectFaces(image: RawImage): Promise<FaceBox[]> {
    const resized = await sharp(image.rgb, {
      raw: { width: image.width, height: image.height, channels: 3 },
    })
      .resize(DETECTOR_WIDTH, DETECTOR_HEIGHT, { fit: 'fill' })
      .raw()
      .toBuffer()
    const planeSize = DETECTOR_WIDTH * DETECTOR_HEIGHT
    const input = new Float32Array(3 * planeSize)
    for (let pixel = 0; pixel < planeSize; pixel += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        input[channel * planeSize + pixel] = ((resized[pixel * 3 + channel] ?? 0) - 127) / 128
      }
    }
    const output = await session.run({
      input: new Tensor('float32', input, [1, 3, DETECTOR_HEIGHT, DETECTOR_WIDTH]),
    })
    const scores = output.scores?.data as Float32Array
    const boxes = output.boxes?.data as Float32Array
    const candidates: FaceBox[] = []
    for (let index = 0; index < scores.length / 2; index += 1) {
      const score = scores[index * 2 + 1] ?? 0
      if (score < FACE_SCORE_THRESHOLD) continue
      candidates.push({
        score,
        x1: (boxes[index * 4] ?? 0) * image.width,
        y1: (boxes[index * 4 + 1] ?? 0) * image.height,
        x2: (boxes[index * 4 + 2] ?? 0) * image.width,
        y2: (boxes[index * 4 + 3] ?? 0) * image.height,
      })
    }
    return suppressOverlaps(candidates)
  }

  async function extract(bytes: Uint8Array): Promise<CnhFaceResult> {
    const { sourceKind, images } = await collectCandidateImages(bytes)
    const base = { sourceKind, candidateImages: images.length }
    if (images.length === 0)
      return { ...base, outcome: CNH_FACE_OUTCOMES.UNSUPPORTED, facesFound: 0 }

    const detections: { image: RawImage; faces: FaceBox[] }[] = []
    for (const image of images) {
      let best: { image: RawImage; faces: FaceBox[] } | undefined
      for (const rotated of await rotationsOf(image, sourceKind)) {
        const faces = await detectFaces(rotated)
        if ((faces[0]?.score ?? 0) > (best?.faces[0]?.score ?? 0)) best = { image: rotated, faces }
      }
      if (best) detections.push(best)
    }
    const facesFound = detections.reduce((total, detection) => total + detection.faces.length, 0)
    if (facesFound === 0) return { ...base, outcome: CNH_FACE_OUTCOMES.NO_FACE, facesFound }
    if (facesFound > 1) return { ...base, outcome: CNH_FACE_OUTCOMES.MULTIPLE_FACES, facesFound }

    const [{ image, faces }] = detections as [{ image: RawImage; faces: [FaceBox] }]
    const face = faces[0]
    const crop = portraitCropAround(face, image)
    const cropShortSide = Math.min(crop.width, crop.height)
    if (cropShortSide < MIN_USABLE_SHORT_SIDE) {
      return {
        ...base,
        outcome: CNH_FACE_OUTCOMES.TOO_SMALL,
        facesFound,
        faceScore: face.score,
        cropShortSide,
      }
    }
    const webp = await sharp(image.rgb, {
      raw: { width: image.width, height: image.height, channels: 3 },
    })
      .extract(crop)
      .resize(OUTPUT_MAX_SIDE, OUTPUT_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
    return {
      ...base,
      outcome: CNH_FACE_OUTCOMES.EXTRACTED,
      facesFound,
      faceScore: face.score,
      cropShortSide,
      webp,
    }
  }

  return { extract }
}

async function collectCandidateImages(
  bytes: Uint8Array,
): Promise<{ sourceKind: CnhSourceKind; images: RawImage[] }> {
  if (new TextDecoder().decode(bytes.subarray(0, 4)) === PDF_SIGNATURE)
    return collectPdfImages(bytes)
  try {
    const { data, info } = await sharp(bytes)
      .rotate()
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true })
    return {
      sourceKind: CNH_SOURCE_KINDS.IMAGE,
      images: [{ width: info.width, height: info.height, rgb: data }],
    }
  } catch {
    return { sourceKind: CNH_SOURCE_KINDS.UNKNOWN, images: [] }
  }
}

/** Só a primeira página: na CNH-e da CDT o rosto está dentro da imagem da frente do cartão, não num objeto próprio. */
async function collectPdfImages(
  bytes: Uint8Array,
): Promise<{ sourceKind: CnhSourceKind; images: RawImage[] }> {
  const loadingTask = getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    verbosity: 0,
  })
  const document = await loadingTask.promise
  try {
    const page = await document.getPage(1)
    const text = await page.getTextContent()
    const operators = await page.getOperatorList()
    const images: RawImage[] = []
    for (let index = 0; index < operators.fnArray.length; index += 1) {
      if (operators.fnArray[index] !== OPS.paintImageXObject) continue
      const name = operators.argsArray[index]?.[0] as string
      const store = name.startsWith('g_') ? page.commonObjs : page.objs
      const object = await new Promise<PdfImageObject>((resolve) => store.get(name, resolve))
      const image = toRgb(object)
      if (image && Math.min(image.width, image.height) >= MIN_SOURCE_IMAGE_SIDE) images.push(image)
    }
    const hasTextLayer = text.items.length > 0
    return {
      sourceKind: hasTextLayer ? CNH_SOURCE_KINDS.PDF_DIGITAL : CNH_SOURCE_KINDS.PDF_SCANNED,
      images,
    }
  } finally {
    await loadingTask.destroy()
  }
}

type PdfImageObject = {
  width: number
  height: number
  kind?: number
  data?: Uint8ClampedArray | Uint8Array
}

/** pdf.js entrega `kind` 1 (1 bpp), 2 (RGB) ou 3 (RGBA); o QR de 1 bpp é descartado. */
function toRgb(object: PdfImageObject | undefined): RawImage | undefined {
  if (!object?.data || !object.kind || object.kind === 1) return undefined
  const { width, height, data, kind } = object
  if (kind === 2)
    return { width, height, rgb: Buffer.from(data.buffer, data.byteOffset, data.byteLength) }
  const rgb = Buffer.alloc(width * height * 3)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgb[pixel * 3] = data[pixel * 4] ?? 0
    rgb[pixel * 3 + 1] = data[pixel * 4 + 1] ?? 0
    rgb[pixel * 3 + 2] = data[pixel * 4 + 2] ?? 0
  }
  return { width, height, rgb }
}

/**
 * Foto de celular pode vir deitada e sem EXIF; PDF digital nunca gira. O detector acha rosto deitado
 * e de cabeça para baixo com nota 0,96–0,99, então vence a rotação de maior nota, nunca a primeira.
 */
async function rotationsOf(image: RawImage, sourceKind: CnhSourceKind): Promise<RawImage[]> {
  if (sourceKind === CNH_SOURCE_KINDS.PDF_DIGITAL) return [image]
  const rotations: RawImage[] = [image]
  for (const angle of [90, 270, 180]) {
    const { data, info } = await sharp(image.rgb, {
      raw: { width: image.width, height: image.height, channels: 3 },
    })
      .rotate(angle)
      .raw()
      .toBuffer({ resolveWithObject: true })
    rotations.push({ width: info.width, height: info.height, rgb: data })
  }
  return rotations
}

/** Retrato 3:4 com folga para cabelo e ombro, recortado ao limite da imagem. */
function portraitCropAround(face: FaceBox, image: RawImage) {
  const faceWidth = face.x2 - face.x1
  const faceHeight = face.y2 - face.y1
  const width = Math.min(image.width, faceWidth * 1.7)
  const height = Math.min(image.height, width * (4 / 3))
  const centerX = (face.x1 + face.x2) / 2
  const centerY = face.y1 + faceHeight * 0.45
  const left = Math.max(0, Math.min(image.width - width, centerX - width / 2))
  const top = Math.max(0, Math.min(image.height - height, centerY - height / 2))
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.floor(width),
    height: Math.floor(height),
  }
}

function suppressOverlaps(candidates: FaceBox[]): FaceBox[] {
  const kept: FaceBox[] = []
  for (const candidate of [...candidates].sort((first, second) => second.score - first.score)) {
    if (kept.every((face) => intersectionOverUnion(face, candidate) < NMS_IOU_THRESHOLD))
      kept.push(candidate)
  }
  return kept
}

function intersectionOverUnion(first: FaceBox, second: FaceBox): number {
  const width = Math.max(0, Math.min(first.x2, second.x2) - Math.max(first.x1, second.x1))
  const height = Math.max(0, Math.min(first.y2, second.y2) - Math.max(first.y1, second.y1))
  const intersection = width * height
  const area = (box: FaceBox) => (box.x2 - box.x1) * (box.y2 - box.y1)
  return intersection / (area(first) + area(second) - intersection)
}
