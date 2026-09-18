import type * as Tesseract from 'tesseract.js'

import { CANHOTO_OCR_BASE_PATH } from './canhotoOcrVersion.constant'
import type { CanhotoOcrWord } from './canhotoOcr.service'

/**
 * ADR-0069 §2: `tesseract.js` só entra por `import()` dinâmico, dentro deste serviço — nada de
 * Tesseract no bundle inicial (a T14 mede o bundle antes e depois no `evidence.md`). O motor é um
 * singleton por aba: a primeira leitura carrega o worker (~4,5 MB na primeira vez por aparelho,
 * depois em cache pelo service worker), as seguintes reaproveitam.
 */
let workerPromise: Promise<Tesseract.Worker> | undefined

async function loadWorker(): Promise<Tesseract.Worker> {
  const { createWorker } = await import('tesseract.js')
  return createWorker('eng', 1, {
    /** Sonda da ADR-0069: o padrão cria worker `blob:`, que `worker-src 'self'` recusa. */
    cacheMethod: 'none',
    corePath: CANHOTO_OCR_BASE_PATH,
    gzip: true,
    langPath: CANHOTO_OCR_BASE_PATH,
    workerBlobURL: false,
    workerPath: `${CANHOTO_OCR_BASE_PATH}worker.min.js`,
  })
}

/** Baixos (T15): falha de carga ou de leitura também encerra o worker — reaproveitar um worker
 * que quebrou no meio da leitura anterior faria a próxima tentativa herdar o mesmo estado ruim. */
async function terminateWorker(): Promise<void> {
  const previous = workerPromise
  workerPromise = undefined
  if (previous === undefined) return
  try {
    const worker = await previous
    await worker.terminate()
  } catch {
    // worker já inválido — nada a encerrar
  }
}

function flattenWords(page: Tesseract.Page): readonly CanhotoOcrWord[] {
  return (page.blocks ?? []).flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.flatMap((line) =>
        line.words.map((word) => ({ confidence: word.confidence, text: word.text })),
      ),
    ),
  )
}

/**
 * R8 — erro de carga do motor ou de leitura vira `undefined` (escolha manual), nunca trava o
 * passo: a foto do canhoto já está capturada, e o resto do assistente segue funcionando sem OCR.
 */
export async function recognizeCanhotoWords(
  image: Tesseract.ImageLike,
): Promise<readonly CanhotoOcrWord[] | undefined> {
  try {
    if (workerPromise === undefined) workerPromise = loadWorker()
    const worker = await workerPromise
    /** tesseract.js 7 desliga `blocks` por padrão (`output = { text: true }`) — sem isto,
     * `data.blocks` nunca existe e `flattenWords` sempre devolve lista vazia. */
    const { data } = await worker.recognize(image, {}, { blocks: true })
    return flattenWords(data)
  } catch {
    await terminateWorker()
    return undefined
  }
}
