/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CHAVE_PATTERN, CNPJ_PATTERN, normalizeTaxId } from '@adatechnology/fiscal-provider'

/**
 * Ponto único do worker para o vocabulário de documento fiscal. A regra do CNPJ alfanumérico é do
 * pacote — reescrever o padrão aqui seria a segunda cópia, e é sempre a cópia que envelhece.
 */
export { CHAVE_PATTERN, CNPJ_PATTERN, normalizeTaxId }
