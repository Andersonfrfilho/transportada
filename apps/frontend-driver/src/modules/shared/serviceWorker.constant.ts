/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A página pede ao service worker em espera que assuma — e só pede com o registro de capturas vazio
 * (ADR-0075 §5). O valor é o que o `workbox-window` do `virtual:pwa-register` manda em
 * `updateSW(true)`, então o `sw.ts` e a página leem daqui, e não de dois literais.
 */
export const SKIP_WAITING_MESSAGE = 'SKIP_WAITING'
