/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import bwipjs from 'bwip-js/node'

/**
 * O leitor do fiscal lê o código de barras, não o número impresso: gerar o desenho à mão falha
 * em silêncio — o papel parece certo e o scanner não devolve nada.
 */
const BARCODE_SCALE = 3
const BARCODE_HEIGHT = 12
const QR_CODE_SCALE = 4

/**
 * O item 6 da NT Conjunta DF-e 2025.001 diz que o CODE-128C não é compatível com a chave
 * alfanumérica e publica as regras de alternância de Code Set. O `code128` do bwip-js já alterna
 * sozinho — desenha em C enquanto a chave é numérica e passa para B nas letras do CNPJ. Quem prova
 * isso é `test/cte-issuance-infrastructure/dacte-barcode.contract.ts`, que decodifica o símbolo.
 */
export const ACCESS_KEY_SYMBOLOGY = 'code128'

export type DacteBarcodeGateway = {
  readonly renderAccessKey: (accessKey: string) => Promise<Buffer>
  readonly renderQrCode: (url: string) => Promise<Buffer>
}

export function createDacteBarcodeGateway(): DacteBarcodeGateway {
  return {
    renderAccessKey: async (accessKey) =>
      bwipjs.toBuffer({
        bcid: ACCESS_KEY_SYMBOLOGY,
        height: BARCODE_HEIGHT,
        includetext: false,
        scale: BARCODE_SCALE,
        text: accessKey,
      }),
    renderQrCode: async (url) =>
      bwipjs.toBuffer({
        bcid: 'qrcode',
        includetext: false,
        scale: QR_CODE_SCALE,
        text: url,
      }),
  }
}
