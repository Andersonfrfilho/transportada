import tesseractCorePackage from 'tesseract.js-core/package.json'

/**
 * Spec 156 T14, ADR-0069 §2 (R1) — a versão do caminho servido (`public/canhoto-ocr/<versão>/`)
 * é a **instalada**, nunca digitada: lida do `package.json` do `tesseract.js-core` em tempo de
 * build (o Vite resolve o JSON do pacote, que não entra no bundle além do campo usado). O
 * contrato `static-canhoto-ocr-path.contract.ts` confere que este valor bate com o diretório que
 * `scripts/fetch-canhoto-ocr.ts` gerou.
 */
export const CANHOTO_OCR_VERSION: string = tesseractCorePackage.version
export const CANHOTO_OCR_BASE_PATH = `/canhoto-ocr/${CANHOTO_OCR_VERSION}/`
