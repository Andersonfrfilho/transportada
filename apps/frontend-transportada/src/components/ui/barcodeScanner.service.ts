/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Traseira é o padrão — é a câmera que enxerga a caixa, a etiqueta e o canhoto. A frontal existe
 * porque nem todo aparelho de galpão tem traseira funcionando, e porque tablet montado em bancada
 * costuma ter só a de cima.
 */
export const CAMERA_FACING_MODES = ['environment', 'user'] as const

export type CameraFacingMode = (typeof CAMERA_FACING_MODES)[number]

export const DEFAULT_CAMERA_FACING_MODE: CameraFacingMode = 'environment'

/**
 * ⚠️ `ideal`, nunca `exact`: com `exact` o aparelho de uma câmera só responde `OverconstrainedError`
 * e a tela cai no seletor de arquivo como se a câmera não existisse.
 */
export function buildCameraConstraints(
  facingMode: CameraFacingMode = DEFAULT_CAMERA_FACING_MODE,
): Readonly<{
  audio: false
  video: Readonly<{ facingMode: Readonly<{ ideal: CameraFacingMode }> }>
}> {
  return { audio: false, video: { facingMode: { ideal: facingMode } } }
}

export function nextCameraFacingMode(current: CameraFacingMode): CameraFacingMode {
  return current === 'environment' ? 'user' : 'environment'
}

export const CAMERA_CONSTRAINTS = buildCameraConstraints()

export type MediaStreamLike = Readonly<{
  getTracks: () => readonly Readonly<{ stop: () => void }>[]
}>

export type CameraStreamResult =
  | Readonly<{ status: 'denied' }>
  | Readonly<{ status: 'ready'; stream: MediaStreamLike }>
  | Readonly<{ status: 'unavailable' }>

type GetUserMedia = (constraints: unknown) => Promise<unknown>

const DENIED_ERROR_NAMES = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError']

function readGetUserMedia(source: unknown): GetUserMedia | undefined {
  if (typeof source !== 'object' || source === null) return undefined
  const { mediaDevices } = source as Readonly<{ mediaDevices?: unknown }>
  if (typeof mediaDevices !== 'object' || mediaDevices === null) return undefined
  const { getUserMedia } = mediaDevices as Readonly<{ getUserMedia?: unknown }>
  if (typeof getUserMedia !== 'function') return undefined
  return (getUserMedia as GetUserMedia).bind(mediaDevices)
}

function isMediaStreamLike(value: unknown): value is MediaStreamLike {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as Readonly<{ getTracks?: unknown }>).getTracks === 'function'
}

function isDeniedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name } = error as Readonly<{ name?: unknown }>
  return typeof name === 'string' && DENIED_ERROR_NAMES.includes(name)
}

export function isCameraCapable(source: unknown): boolean {
  return readGetUserMedia(source) !== undefined
}

/** Câmera impossível é resposta, nunca exceção: a tela cai no campo digitado. */
export async function openCameraStream(
  source: unknown,
  facingMode: CameraFacingMode = DEFAULT_CAMERA_FACING_MODE,
): Promise<CameraStreamResult> {
  const getUserMedia = readGetUserMedia(source)
  if (getUserMedia === undefined) return { status: 'unavailable' }
  try {
    const stream = await getUserMedia(buildCameraConstraints(facingMode))
    if (!isMediaStreamLike(stream)) return { status: 'unavailable' }
    return { status: 'ready', stream }
  } catch (error) {
    return isDeniedError(error) ? { status: 'denied' } : { status: 'unavailable' }
  }
}

export function stopCameraStream(stream: unknown): void {
  if (!isMediaStreamLike(stream)) return
  for (const track of stream.getTracks()) track.stop()
}

/** Só o que ligar a trilha ao elemento exige — o `<video>` real segue opaco aqui. */
export type VideoElementLike = {
  srcObject: unknown
  play: () => Promise<void>
}

/**
 * ⚠️ **O elemento só existe depois da renderização que o revela.** Ler `ref.current` no mesmo tick
 * do `setStatus` que faz o `<video>` aparecer devolve `null`, e a etapa fica com o quadro preto
 * para sempre (T14 item C2). Quem liga é, por isso, um callback ref ou um efeito com o elemento nas
 * dependências; a ligação em si mora aqui, fora do React, para poder ser exercitada por teste.
 */
export function attachStreamToVideo(
  video: VideoElementLike | null | undefined,
  stream: MediaStreamLike | undefined,
): boolean {
  if (video === null || video === undefined || stream === undefined) return false
  video.srcObject = stream
  void Promise.resolve(video.play()).catch(() => undefined)
  return true
}

export function detachStreamFromVideo(video: VideoElementLike | null | undefined): void {
  if (video === null || video === undefined) return
  video.srcObject = null
}

/** `RGBLuminanceSource` lê um byte por pixel: RGBA cru entraria três vezes mais largo. */
export function toLuminance(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const luminance = new Uint8ClampedArray(rgba.length / 4)
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 4
    luminance[pixel] =
      ((rgba[offset] ?? 0) + 2 * (rgba[offset + 1] ?? 0) + (rgba[offset + 2] ?? 0)) / 4
  }
  return luminance
}

export type NativeBarcodeDetector = Readonly<{
  detect: (source: CanvasImageSource) => Promise<readonly Readonly<{ rawValue: string }>[]>
}>

type NativeBarcodeDetectorConstructor = Readonly<{
  getSupportedFormats?: () => Promise<readonly string[]>
}> &
  (new (options: Readonly<{ formats: readonly string[] }>) => NativeBarcodeDetector)

/**
 * Lineares primeiro — Code-128 (chave da DANFE) é o mais comum, ITF cobre a caixa de papelão
 * (DUN-14) — e o QR por último. `createNativeBarcodeDetector` ainda filtra esta lista pelo que
 * `BarcodeDetector.getSupportedFormats()` devolve: pedir um formato que o navegador não suporta
 * lança na construção e derrubaria o detector inteiro.
 */
export const NATIVE_BARCODE_FORMATS = [
  'code_128',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'code_39',
  'qr_code',
] as const

async function resolveSupportedFormats(
  Detector: NativeBarcodeDetectorConstructor,
): Promise<readonly string[]> {
  if (typeof Detector.getSupportedFormats !== 'function') return NATIVE_BARCODE_FORMATS
  try {
    const supported = await Detector.getSupportedFormats()
    return NATIVE_BARCODE_FORMATS.filter((format) => supported.includes(format))
  } catch {
    return NATIVE_BARCODE_FORMATS
  }
}

export async function createNativeBarcodeDetector(
  scope: unknown,
): Promise<NativeBarcodeDetector | undefined> {
  if (typeof scope !== 'object' || scope === null) return undefined
  const { BarcodeDetector } = scope as Readonly<{ BarcodeDetector?: unknown }>
  if (typeof BarcodeDetector !== 'function') return undefined
  const Detector = BarcodeDetector as NativeBarcodeDetectorConstructor
  const formats = await resolveSupportedFormats(Detector)
  if (formats.length === 0) return undefined
  try {
    return new Detector({ formats })
  } catch {
    return undefined
  }
}

/**
 * Quantas câmeras o aparelho tem. Só isso decide mostrar o botão de virar: oferecer a troca em
 * aparelho de uma câmera só é botão que não faz nada, e esconder a troca em celular é a queixa.
 *
 * ⚠️ Antes da permissão, o navegador devolve a lista sem rótulo — mas **com** uma entrada por
 * dispositivo, que é o que se conta aqui. Falha de enumeração responde `0`, nunca exceção.
 */
export async function countVideoInputDevices(source: unknown): Promise<number> {
  if (typeof source !== 'object' || source === null) return 0
  const { mediaDevices } = source as Readonly<{ mediaDevices?: unknown }>
  if (typeof mediaDevices !== 'object' || mediaDevices === null) return 0
  const { enumerateDevices } = mediaDevices as Readonly<{ enumerateDevices?: unknown }>
  if (typeof enumerateDevices !== 'function') return 0
  try {
    const devices = await (enumerateDevices as () => Promise<unknown>).call(mediaDevices)
    if (!Array.isArray(devices)) return 0
    return devices.filter(
      (device) =>
        typeof device === 'object' &&
        device !== null &&
        (device as Readonly<{ kind?: unknown }>).kind === 'videoinput',
    ).length
  } catch {
    return 0
  }
}
