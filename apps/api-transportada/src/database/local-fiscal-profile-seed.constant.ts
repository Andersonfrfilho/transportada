/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanySettingsInput } from '../companies/application/company-settings.port.js'

/**
 * Sem perfil fiscal a importação de NF-e falha com `NFE_IMPORT_MISSING_FISCAL_PROFILE` e **recicla
 * para sempre**: a fila mostra "na fila", a tela mostra zero notas, e a razão fica só em
 * `processed_messages.result`. É por isso que o perfil entra na semente, e não num passo manual.
 *
 * O CNPJ é o da transportadora que aparece em `<transp>` nos XML de exemplo — é ele que decide se a
 * nota é da empresa ou de terceiro.
 */
export const LOCAL_FISCAL_PROFILE_SETTINGS: CompanySettingsInput = {
  activation: { channel: 'email' },
  billing: {
    bankAccount: '',
    bankBranch: '',
    bankCode: '',
    bankName: '',
    observations: '',
    pixKey: '',
  },
  cte: { environment: 'homologation', nextNumber: 1n, series: 1n },
  cteRetry: { backoffSeconds: [60, 300, 900], maxAttempts: 3 },
  expectedVersion: null,
  mdfe: {
    bankBranch: '',
    bankCode: '',
    insurancePolicy: '',
    insuranceResponsibility: '',
    insurerName: '',
    insurerTaxId: '',
    pixKey: '',
  },
  profile: {
    city: 'Ribeirão Preto',
    cityIbgeCode: '3543402',
    cnpj: '61156864000191',
    complement: '',
    district: 'Distrito Industrial',
    email: 'operacao@transportada.local',
    legalName: 'AFR FERNANDES TRANSPORTES E SERVICOS LTDA',
    municipalRegistration: '',
    number: '1000',
    phone: '1633330000',
    postalCode: '14056680',
    rntrc: '12345678',
    state: 'SP',
    stateRegistration: '123456789012',
    street: 'Avenida do Café',
    taxRegime: '3',
    tradeName: 'AFR Fernandes Transportes',
  },
}
