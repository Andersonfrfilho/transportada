/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Injetada só pelo build (`maplibreWorkerAssetsPlugin`); fora dele não existe — leia com `typeof`. */
declare const __MAPLIBRE_WORKER_URL__: string | undefined

/**
 * O build próprio do OpenCV (ADR-0065) não traz `.d.ts` — o tipo real das exportações vem de
 * `opencv.types.ts`, lido depois de um cast em `boxDimension.worker.ts` (único importador).
 */
declare module '*vendor/opencv/opencv.js' {
  const namespace: unknown
  export default namespace
}
