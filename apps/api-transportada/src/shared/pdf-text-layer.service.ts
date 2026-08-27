/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Lê a camada de texto de um PDF — o que o gerador do documento gravou, não um palpite de OCR.
 * Cartão CNPJ, certificado RNTRC e CRLV-e digital trazem essa camada completa, e para eles a leitura
 * é exata. CNH-e e CDT não trazem: ali o documento é imagem embutida dentro do invólucro do Serpro,
 * a extração devolve quase nada, e quem lê continua sendo o OCR.
 *
 * Por que uma biblioteca, e não código nosso como a ADR-0033 fez com a planilha da ANP: estes PDFs
 * usam fonte `Type0` com `ToUnicode`, onde o código do caractere **não é** o caractere. Um leitor
 * ingênuo devolve a página inteira sem a placa e sem o RENAVAM — medido. Ler isso certo é rastrear a
 * fonte ativa pelo `Tf`, decodificar `bfchar`/`bfrange`, tratar CID de dois bytes e reconstruir
 * linha pela matriz de texto. XLSX é um formato pequeno; PDF não é, e o modo de falhar aqui é o pior
 * que existe — parece que leu, e leu o campo errado.
 */
import { extractText, getDocumentProxy } from 'unpdf'

/**
 * Documento ilegível é texto vazio, nunca exceção. O upload já foi salvo quando isto roda, e a
 * revisão manual continua funcionando: derrubar a leitura derrubaria o cadastro junto. Ausência
 * também é o resultado seguro — os parsers ancoram em rótulo, então texto que não veio vira campo
 * não preenchido, jamais valor errado (que viraria divergência contra um documento correto).
 */
export async function extractPdfTextLayer(bytes: Uint8Array): Promise<string> {
  try {
    // `verbosity: 0` cala o pdfjs: ele escreve avisos direto no console, e log fora do logger
    // estruturado é ruído que ninguém correlaciona (e aqui sairia por documento enviado).
    const document = await getDocumentProxy(bytes, { verbosity: 0 })
    const { text } = await extractText(document, { mergePages: true })
    return text
  } catch {
    return ''
  }
}
