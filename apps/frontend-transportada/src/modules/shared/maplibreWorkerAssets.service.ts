/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O worker do MapLibre 6 não é um arquivo só: `maplibre-gl-worker.mjs` abre com
 * `import … from "./maplibre-gl-shared.mjs"`. O `?url` do Vite copia apenas o worker para `assets/`,
 * e o shared ao lado dele nunca existiu no `dist` — o pedido caía no `index.html`, o navegador recusava
 * "MIME text/html" e o mapa não subia (staging e produção, 15/09/2026). Os dois saem juntos daqui.
 */
export const MAPLIBRE_WORKER_FILE_NAME = 'maplibre-gl-worker.mjs'
export const MAPLIBRE_SHARED_FILE_NAME = 'maplibre-gl-shared.mjs'
/** O nome da constante que o build injeta no bundle — o `vite.config.ts` e o mapa leem daqui. */
export const MAPLIBRE_WORKER_URL_DEFINE = '__MAPLIBRE_WORKER_URL__'

const ASSETS_DIRECTORY = 'assets'
/** O `.map` não é publicado: sem o comentário, o DevTools não pede um arquivo que cairia no 404. */
const SOURCE_MAP_COMMENT_PATTERN = /\n?\/\/# sourceMappingURL=.*\s*$/u
const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193
const HASH_SEEDS = [FNV_OFFSET_BASIS, 0x01000193 ^ FNV_OFFSET_BASIS] as const

export type MaplibreWorkerAsset = Readonly<{ fileName: string; source: string }>

export type MaplibreWorkerAssets = Readonly<{
  directory: string
  files: readonly MaplibreWorkerAsset[]
  workerUrl: string
}>

/**
 * A pasta leva o hash do conteúdo: `/assets/` é servido como imutável por um ano, e um shared de
 * nome fixo sobreviveria no cache a uma troca de versão do MapLibre, casado com um worker novo.
 */
export function buildMaplibreWorkerAssets(input: {
  readonly sharedSource: string
  readonly workerSource: string
}): MaplibreWorkerAssets {
  const workerSource = input.workerSource.replace(SOURCE_MAP_COMMENT_PATTERN, '\n')
  const sharedSource = input.sharedSource.replace(SOURCE_MAP_COMMENT_PATTERN, '\n')
  const directory = `${ASSETS_DIRECTORY}/maplibre-${hashContent(workerSource + sharedSource)}`

  return {
    directory,
    files: [
      { fileName: `${directory}/${MAPLIBRE_WORKER_FILE_NAME}`, source: workerSource },
      { fileName: `${directory}/${MAPLIBRE_SHARED_FILE_NAME}`, source: sharedSource },
    ],
    workerUrl: `/${directory}/${MAPLIBRE_WORKER_FILE_NAME}`,
  }
}

/** FNV-1a de 32 bits em duas sementes: sem API do Node, para rodar no build e no teste iguais. */
function hashContent(content: string): string {
  return HASH_SEEDS.map((seed) => {
    let hash = seed
    for (let index = 0; index < content.length; index += 1) {
      hash ^= content.charCodeAt(index)
      hash = Math.imul(hash, FNV_PRIME) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }).join('')
}
