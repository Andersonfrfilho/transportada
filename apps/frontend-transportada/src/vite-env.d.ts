/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Injetada só pelo build (`maplibreWorkerAssetsPlugin`); fora dele não existe — leia com `typeof`. */
declare const __MAPLIBRE_WORKER_URL__: string | undefined
