/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S1): os tetos da thread que lê a planilha. O orçamento
 * do leitor (5 s) é cooperativo e para entre etapas; o teto da thread vale para o trecho síncrono que
 * não cede, e termina a thread.
 */
export const CARGO_PREVIEW_READ_THREAD_CEILING_MS = 10_000

/** O Bun 1.3.14 ainda ignora `resourceLimits` (medido): o teto real de memória são os do leitor. */
export const CARGO_PREVIEW_READ_THREAD_HEAP_MB = 256
