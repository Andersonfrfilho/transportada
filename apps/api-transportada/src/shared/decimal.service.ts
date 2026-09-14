/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** O serviço decimal mora no pacote do empacotador; a app só mantém o caminho antigo. */
export {
  applyRate,
  divideHalfUp,
  FISCAL_MONEY_SCALE,
  formatDecimalAtScale,
  formatFiscalMoney,
  formatScaledDecimal,
  isDecimalString,
  MEASURE_SCALE,
  MONEY_SCALE,
  normalizeDecimal,
  parseScaledDecimal,
  PERCENTAGE_FACTOR,
  PERCENTAGE_SCALE,
  rescaleHalfUp,
  roundDecimalToInteger,
} from '@adatechnology/cargo-placement'
