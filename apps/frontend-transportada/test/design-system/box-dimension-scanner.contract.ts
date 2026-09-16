/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const SCANNER_PATH = 'src/components/ui/box-dimension-scanner.tsx'
const HOOK_PATH = 'src/components/ui/useBoxDimensionScanner.hook.ts'
const WORKER_PATH = 'src/components/ui/boxDimension.worker.ts'
const VITE_CONFIG_PATH = 'vite.config.ts'

/**
 * `box-dimension-scanner` (spec 152 T8, ADR-0065) só existe em `src/components/ui/` — a mesma
 * regra do leitor de etiqueta (`apps/frontend-transportada/CLAUDE.md`). Sem renderer/jsdom nesta
 * base, a garantia é estrutural sobre o código-fonte, no mesmo estilo de
 * `barcode-scanner.contract.ts` e `camera-stream.contract.ts`.
 */
describe('o primitivo de medida de caixa pela câmera (spec 152 T8, ADR-0065)', () => {
  it('cria o worker por new URL, nunca por blob:', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).toMatch(
      /new Worker\(new URL\('\.\/boxDimension\.worker\.ts', import\.meta\.url\), \{ type: 'module' \}\)/u,
    )
    expect(hook).not.toContain('blob:')
    expect(await readApplicationFile(SCANNER_PATH)).not.toContain('blob:')
    expect(await readApplicationFile(WORKER_PATH)).not.toContain('blob:')
  })

  it('só o worker importa o OpenCV — o hook e o componente não', async () => {
    const worker = await readApplicationFile(WORKER_PATH)
    expect(worker).toMatch(/import\(\s*'\.\.\/\.\.\/\.\.\/vendor\/opencv\/opencv\.js'\s*\)/u)
    const hook = await readApplicationFile(HOOK_PATH)
    const scanner = await readApplicationFile(SCANNER_PATH)
    expect(hook).not.toContain('vendor/opencv')
    expect(scanner).not.toContain('vendor/opencv')
  })

  it('o chunk do OpenCV fica fora do precache e ganha CacheFirst próprio (T8)', async () => {
    const viteConfig = await readApplicationFile(VITE_CONFIG_PATH)
    expect(viteConfig).toContain('OPENCV_CHUNK_GLOB')
    expect(viteConfig).toMatch(/globIgnores:\s*\[[^\]]*OPENCV_CHUNK_GLOB/)
    expect(viteConfig).toContain('cacheName: OPENCV_CACHE_NAME')
    expect(viteConfig).toContain("handler: 'CacheFirst'")
    expect(viteConfig).toContain("const OPENCV_CACHE_NAME = 'transportada-opencv'")
  })

  it('o worker sai em ES module — sem isso o import() dinâmico não empacota (T8)', async () => {
    const viteConfig = await readApplicationFile(VITE_CONFIG_PATH)
    expect(viteConfig).toMatch(/worker:\s*\{\s*format:\s*'es',?\s*\}/)
  })

  it('o chunk do OpenCV é pré-comprimido no build (gzip e brotli), fora da CSP e do bundle inicial', async () => {
    const viteConfig = await readApplicationFile(VITE_CONFIG_PATH)
    expect(viteConfig).toContain('openCvCompressionPlugin')
    expect(viteConfig).toContain('gzipSync')
    expect(viteConfig).toContain('brotliCompressSync')
    expect(viteConfig).not.toContain("'unsafe-eval'")
  })

  it('o servidor serve o chunk pré-comprimido pelo Accept-Encoding, nunca a CSP nem os headers', async () => {
    const server = await readApplicationFile('server.ts')
    expect(server).toContain('OPENCV_CHUNK_PATTERN')
    expect(server).toContain('precompressedResponse')
    expect(server).toContain("'Content-Encoding'")
    expect(server).toContain("'Vary'")
    expect(server).not.toContain("'unsafe-eval'")
  })

  /**
   * T14 item M8: o quadro chega a cada 250 ms e o motivo trocava a cada quadro. R2 pede 500 ms, e
   * repetir a mesma frase no `aria-live` empilha fala sobre fala — mesmo remédio do
   * `REPEAT_ANNOUNCE_COOLDOWN_MS` do leitor de etiqueta.
   */
  it('M8: o indicador ao vivo respeita 500 ms e não repete o mesmo motivo', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    const scanner = await readApplicationFile(SCANNER_PATH)

    expect(hook).toContain('const LIVE_WARNING_ANNOUNCE_INTERVAL_MS = 500')
    expect(hook).toContain('if (liveWarning === announcedWarning) return')
    expect(hook).toContain(
      'LIVE_WARNING_ANNOUNCE_INTERVAL_MS - (Date.now() - lastAnnouncedAtRef.current)',
    )
    /** O `aria-live` fala o anunciado, nunca o motivo cru do último quadro. */
    const liveBlock = scanner.split('aria-live="polite"')[1]?.split('</p>')[0] ?? ''
    expect(liveBlock).toContain('announcedWarning')
    expect(liveBlock).not.toContain('liveWarnings[0]')
  })

  it('apaga o vídeo e encerra o worker ao desativar ou desmontar', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).toContain('detachStreamFromVideo(videoElement)')
    /** M6: worker emprestado pela pré-carga não é terminado aqui — quem empresta é quem termina. */
    expect(hook).toContain('if (ownsWorker) worker.terminate()')
  })

  /**
   * T14 item 1: `img-src` real não tem `data:` (só `'self' blob: <api>`) — `canvas.toDataURL`
   * quebra a foto congelada em produção, e só não pegava porque a CSP não é servida em dev. A
   * troca é para `canvas.toBlob` + `URL.createObjectURL`, com a URL revogada nos dois lugares em
   * que o stream é encerrado: `returnToLive()` e a limpeza do efeito.
   */
  it('a foto congelada usa blob:, nunca data: — img-src real não tem data:', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).not.toContain('toDataURL')
    expect(hook).toContain('canvas.toBlob(')
    expect(hook).toContain('URL.createObjectURL(')
    const scanner = await readApplicationFile(SCANNER_PATH)
    expect(scanner).not.toContain('DataUrl')
  })

  it('revoga a URL do blob da foto congelada ao voltar para o vivo e ao desmontar', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).toContain('function revokeSnapshotObjectUrl(): void {')
    expect(hook).toContain('URL.revokeObjectURL(')
    const returnToLiveBody = hook.split('function returnToLive')[1]?.split('\n\n')[0]
    expect(returnToLiveBody).toContain('revokeSnapshotObjectUrl()')
    const cleanupBody = hook.split('return () => {')[1]?.split('\n  }, [isActive, stream])')[0]
    expect(cleanupBody).toContain('revokeSnapshotObjectUrl()')
  })

  it('nunca manda a imagem para a rede — nem o hook, nem o componente, nem o worker chamam fetch', async () => {
    for (const path of [SCANNER_PATH, HOOK_PATH, WORKER_PATH]) {
      const source = await readApplicationFile(path)
      expect(source).not.toMatch(/\bfetch\s*\(/u)
    }
  })

  it('cai no digitado quando o WebAssembly não existe, o motor falha ou o quadro é lento demais', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).toContain("typeof WebAssembly === 'undefined'")
    expect(hook).toContain("onUnsupportedRef.current('noWasm')")
    expect(hook).toContain("fail('engineFailed')")
    expect(hook).toContain("fail('tooSlow')")
    expect(hook).toContain('ENGINE_LOAD_TIMEOUT_MS = 15_000')
  })

  it('as props de texto são obrigatórias — o primitivo não traduz nada sozinho', async () => {
    const scanner = await readApplicationFile(SCANNER_PATH)
    const propsBlock = scanner.split('export type BoxDimensionScannerProps')[1]?.split('}>')[0]
    expect(propsBlock).toBeDefined()
    for (const prop of [
      'captureLabel: string',
      'confirmLabel: string',
      'instructionLabel: string',
      'loadingLabel: string',
      'retryLabel: string',
      'title: string',
    ]) {
      expect(propsBlock).toContain(prop)
    }
  })

  it('a regra está documentada e referenciada no CLAUDE.md da app', async () => {
    const doc = await Bun.file(
      new URL('../../../../docs/frontend/box-dimension-scanner.md', import.meta.url),
    ).text()
    expect(doc).toContain('boxDimension.worker.ts')
    expect(doc).toContain('ADR-0065')
    const claudeMd = await readApplicationFile('CLAUDE.md')
    expect(claudeMd).toContain('docs/frontend/box-dimension-scanner.md')
  })

  it('usa o motor puro da T6 — pose e margem continuam fora do worker (ADR-0065 §1)', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).toContain("from './boxDimension.service'")
    expect(hook).toContain('measureBox(')
    expect(hook).toContain('estimateMargins(')
    /**
     * A classificação foi com a proposta para `boxDimensionProposal.service` (T14, 2ª revisão): é
     * lá que as seis grandezas são arredondadas antes de classificar, e é de lá que o contrato de
     * fronteira parte. O motor continua puro e fora do worker — que é o que este contrato guarda.
     */
    expect(hook).toContain('buildMeasuredProposal(')
    const proposal = await readApplicationFile('src/components/ui/boxDimensionProposal.service.ts')
    expect(proposal).toContain('classifyMeasurement(')
    const worker = await readApplicationFile(WORKER_PATH)
    expect(worker).not.toContain('measureBox')
    expect(worker).not.toContain('solvePnP')
  })

  /**
   * §16 do padrão de código: o teto do quadro vale para os dois leitores e era declarado duas vezes
   * (`boxDimensionFrame.service` e `useBarcodeScanner.hook`) — mudar num só deixaria a etiqueta e a
   * medida decidindo em espaços diferentes (2ª revisão, item B-c).
   */
  it('o teto do quadro é declarado uma vez só, e os dois leitores o importam', async () => {
    const constant = await readApplicationFile('src/components/ui/cameraFrame.constant.ts')
    const frame = await readApplicationFile('src/components/ui/boxDimensionFrame.service.ts')
    const barcode = await readApplicationFile('src/components/ui/useBarcodeScanner.hook.ts')

    expect(constant).toContain('export const MAXIMUM_FRAME_WIDTH = 720')
    for (const source of [frame, barcode]) {
      expect(source).toContain("from './cameraFrame.constant'")
      expect(source).not.toContain('MAXIMUM_FRAME_WIDTH = 720')
    }
  })

  /**
   * ⚠️ **Um símbolo, um caminho de import.** `MAXIMUM_FRAME_WIDTH` chegava a quem o usa em três
   * saltos (constante → serviço do quadro → hook do scanner) e `BoxDimensionMeasuredResult` tinha
   * dois endereços (o serviço que o declara e o hook que o reexportava): quem lê um `import` não
   * sabia qual dos dois é a declaração, e buscar por ela achava o reexporte (3ª revisão, itens
   * [BAIXO]). Cada um se importa de onde nasce.
   */
  it('nem o teto do quadro nem a proposta medida são reexportados por terceiros', async () => {
    const frame = await readApplicationFile('src/components/ui/boxDimensionFrame.service.ts')
    const hook = await readApplicationFile('src/components/ui/useBoxDimensionScanner.hook.ts')

    const reexports = [frame, hook].flatMap((source) =>
      source
        .split('\n')
        .filter((line) => line.startsWith('export {') || line.startsWith('export type {')),
    )

    for (const line of reexports) {
      expect(line).not.toContain('MAXIMUM_FRAME_WIDTH')
      expect(line).not.toContain('BoxDimensionMeasuredResult')
    }
  })
})
