import { describe, expect, it } from 'bun:test'

import {
  attachStreamToVideo,
  detachStreamFromVideo,
  openCameraStream,
  stopCameraStream,
  type MediaStreamLike,
  type VideoElementLike,
} from '@/components/ui/barcodeScanner.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const CAMERA_STREAM_HOOK_PATH = 'src/components/ui/useCameraStream.hook.ts'
const BARCODE_SCANNER_HOOK_PATH = 'src/components/ui/useBarcodeScanner.hook.ts'

/**
 * ⚠️ D19: hoje o leitor abre e fecha o próprio `getUserMedia` a cada ativação — o painel reabre o
 * leitor (stream novo) depois de gravar. `useCameraStream` vira o dono único da sessão de câmera
 * para que a etiqueta e, depois, a medida (spec 152) compartilhem o mesmo `MediaStream` sem pedir
 * permissão de novo. Sem stream renderer/jsdom nesta base, a garantia é estrutural: só um ponto de
 * chamada a `openCameraStream`/`stopCameraStream` por ciclo de ativação, e testado por
 * `barcode-scanner.contract.ts` no nível dos serviços puros.
 */
describe('useCameraStream é o dono único da sessão de câmera (D19)', () => {
  it('abre e fecha pelo mesmo serviço do leitor, sem duplicar o getUserMedia', async () => {
    const hook = await readApplicationFile(CAMERA_STREAM_HOOK_PATH)
    expect(hook).toContain("from './barcodeScanner.service'")
  })

  /** Comportamento, não texto: uma permissão pedida, uma trilha parada, e nada além disso. */
  it('abre uma vez e para exatamente as trilhas que abriu', async () => {
    let calls = 0
    let stopped = 0
    const stream: MediaStreamLike = { getTracks: () => [{ stop: () => (stopped += 1) }] }
    const navigatorLike = {
      mediaDevices: {
        getUserMedia: () => {
          calls += 1
          return Promise.resolve(stream)
        },
      },
    }

    const result = await openCameraStream(navigatorLike)
    expect(result).toEqual({ status: 'ready', stream })
    expect(calls).toBe(1)

    stopCameraStream(result.status === 'ready' ? result.stream : undefined)
    expect(stopped).toBe(1)
  })

  it('permissão negada e navegador sem câmera são resposta, nunca exceção', async () => {
    const notAllowed = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    const denied = { mediaDevices: { getUserMedia: () => Promise.reject(notAllowed) } }
    expect(await openCameraStream(denied)).toEqual({ status: 'denied' })
    expect(await openCameraStream({})).toEqual({ status: 'unavailable' })
  })
})

/**
 * T14 item C2: o `<video>` da etapa Medida nascia sem trilha nenhuma — o hook lia `ref.current` no
 * mesmo tick do `setStatus` que revelava o elemento, e achava `null`. A ligação é um serviço puro
 * justamente para ser exercitada aqui, sem renderer.
 */
describe('a trilha chega ao elemento de vídeo (C2)', () => {
  function fakeVideo(): VideoElementLike & { readonly plays: readonly number[] } {
    const plays: number[] = []
    return {
      plays,
      play: () => {
        plays.push(1)
        return Promise.resolve()
      },
      srcObject: null,
    }
  }

  it('anexa o stream e começa a tocar', () => {
    const video = fakeVideo()
    const stream: MediaStreamLike = { getTracks: () => [] }
    expect(attachStreamToVideo(video, stream)).toBe(true)
    expect(video.srcObject).toBe(stream)
    expect(video.plays).toHaveLength(1)
  })

  it('sem elemento ou sem stream não inventa ligação', () => {
    expect(attachStreamToVideo(null, { getTracks: () => [] })).toBe(false)
    expect(attachStreamToVideo(fakeVideo(), undefined)).toBe(false)
  })

  it('play que rejeita (autoplay bloqueado) não derruba a ligação', () => {
    const video: VideoElementLike = {
      play: () => Promise.reject(new Error('blocked')),
      srcObject: null,
    }
    expect(attachStreamToVideo(video, { getTracks: () => [] })).toBe(true)
    expect(video.srcObject).not.toBeNull()
  })

  it('soltar o elemento limpa a trilha dele', () => {
    const video = fakeVideo()
    attachStreamToVideo(video, { getTracks: () => [] })
    detachStreamFromVideo(video)
    expect(video.srcObject).toBeNull()
  })

  it('o hook da medida liga por callback ref, nunca lendo ref.current no tick do setStatus', async () => {
    const hook = await readApplicationFile('src/components/ui/useBoxDimensionScanner.hook.ts')
    expect(hook).toContain('attachStreamToVideo')
    expect(hook).toMatch(/\}, \[stream, videoElement\]\)/)
    const attachAndStart = hook.split('async function attachAndStart()')[1]
    expect(attachAndStart ?? '').not.toContain('srcObject')
  })

  /** Reabrir a cada renderização pisca a câmera e pede permissão de novo; a escolha de câmera é a
   * única entrada nova que **deve** reabrir a sessão. */
  it('reabre só quando isActive ou a câmera escolhida mudam — não a cada renderização', async () => {
    const hook = await readApplicationFile(CAMERA_STREAM_HOOK_PATH)
    expect(hook).toMatch(/\}, \[facingMode, isActive\]\)/)
  })

  it('expõe status e o MediaStream para quem hospeda etiqueta e medida', async () => {
    const hook = await readApplicationFile(CAMERA_STREAM_HOOK_PATH)
    expect(hook).toContain('CameraStreamController')
    expect(hook).toContain('status: CameraStreamStatus')
    expect(hook).toContain('stream: MediaStreamLike | undefined')
  })

  it('fecha a trilha aberta quando desativa ou desmonta', async () => {
    const hook = await readApplicationFile(CAMERA_STREAM_HOOK_PATH)
    expect(hook).toContain('stopCameraStream(openedStream)')
  })
})

/**
 * ⚠️ O leitor precisa aceitar o stream do `useCameraStream` sem mudar o comportamento dos outros
 * usos (spec 055): sem `stream`, continua abrindo e fechando a própria câmera.
 */
describe('o leitor aceita stream injetado sem reabrir permissão (D19)', () => {
  it('declara o stream como opcional, mantendo o contrato antigo sem ele', async () => {
    const hook = await readApplicationFile(BARCODE_SCANNER_HOOK_PATH)
    expect(hook).toContain('stream?: MediaStreamLike | undefined')
  })

  it('só chama getUserMedia quando é dono do próprio stream', async () => {
    const hook = await readApplicationFile(BARCODE_SCANNER_HOOK_PATH)
    expect(hook).toContain('const ownsStream = stream === undefined')
    const startFunction = hook.split('async function start()')[1]
    expect(startFunction).toBeDefined()
    expect(startFunction).toMatch(/if \(ownsStream\) \{[\s\S]*?openCameraStream/)
  })

  it('não fecha o stream injetado ao sair — só o que abriu sozinho', async () => {
    const hook = await readApplicationFile(BARCODE_SCANNER_HOOK_PATH)
    expect(hook).toMatch(/if \(ownsStream\) stopCameraStream\(openedStream\)/)
  })

  it('com stream do pai, anexa direto ao vídeo sem passar por openCameraStream', async () => {
    const hook = await readApplicationFile(BARCODE_SCANNER_HOOK_PATH)
    expect(hook).toMatch(/\} else if \(!\(await attachStream\(stream\)\)\)/)
  })
})
