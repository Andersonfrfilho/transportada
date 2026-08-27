/* Copyright (c) 2026 Ada Technology. MIT License. */
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs'

import type { PdfGetDocument } from '@adatechnology/document-intake'

/**
 * O build `legacy/` é obrigatório fora do navegador: o normal quebra em Node com
 * `DOMMatrix is not defined`. O bundle usa o normal — é o `pdfjsLoader.service.ts` que o carrega.
 */
export const getLegacyDocument = pdfjsLegacy.getDocument as unknown as PdfGetDocument

export * from './pdf-fixture.helper'
