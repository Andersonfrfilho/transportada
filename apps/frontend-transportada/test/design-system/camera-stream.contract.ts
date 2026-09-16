import { describe, expect, it } from 'bun:test'

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
    expect(hook.match(/openCameraStream\(/g)).toHaveLength(1)
    expect(hook.match(/stopCameraStream\(/g)).toHaveLength(2)
  })

  it('reabre só quando isActive muda — não a cada renderização', async () => {
    const hook = await readApplicationFile(CAMERA_STREAM_HOOK_PATH)
    expect(hook).toMatch(/\}, \[isActive\]\)/)
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
