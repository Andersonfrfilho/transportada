/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type ReactNode } from 'react'

import {
  getLandingApiBaseUrl,
  getLandingTurnstileSiteKey,
} from '@/modules/shared/landingEnvironment.config'
import type { LandingSettings } from '@/modules/shared/landingSettings.service'
import { formatPhone, PHONE_MASK_LENGTH, stripPhone } from '@/modules/shared/phone.service'
import {
  formatPixKey,
  pixKeyMaskLength,
  PIX_KEY_TYPE_OPTIONS,
} from '@/modules/shared/pixKey.service'
import { CNPJ_LENGTH, formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'
import { Combobox, type ComboboxOption } from '@/modules/shared/components/Combobox.component'
import { createAggregateApplicationClient } from '../shared/landingClient.service'
import { formatPostalCode } from '../shared/postalCode.service'
import styles from './PreRegistrationForm.module.css'
import { TurnstileWidget } from './TurnstileWidget.component'

const TAX_ID_MASK_LENGTH = CNPJ_LENGTH + 4 // 14 dígitos + 4 separadores do CNPJ mascarado
const POSTAL_CODE_MASK_LENGTH = 9
const STATE_MASK_LENGTH = 2
const PLATE_MASK_LENGTH = 7
const RNTRC_MASK_LENGTH = 9

/**
 * Mesmas categorias que a CNH imprime (CONTRAN) — replicadas aqui porque frontend-landing não
 * importa da API: são estáticas, e trazer um pacote compartilhado só por uma lista de dez valores
 * seria acoplamento maior que o problema. `<select>` nativo é proibido a partir de ~8 opções
 * (web.md §11) — por isso viram `Combobox`, não `<select>`.
 */
const LICENSE_CATEGORY_OPTIONS: readonly ComboboxOption[] = [
  'A',
  'B',
  'AB',
  'C',
  'AC',
  'D',
  'AD',
  'E',
  'AE',
].map((category) => ({ label: category, value: category }))
/** tpProp do MDF-e — 0 TAC agregado, 1 TAC independente, 2 outros. */
const ANTT_CATEGORY_OPTIONS: readonly ComboboxOption[] = [
  { label: 'TAC agregado', value: '0' },
  { label: 'TAC independente', value: '1' },
  { label: 'Outros', value: '2' },
]
const VEHICLE_TYPE_OPTIONS: readonly ComboboxOption[] = [
  { label: 'Utilitário', value: 'utility' },
  { label: 'Van', value: 'van' },
  { label: 'VUC', value: 'vuc' },
  { label: '3/4', value: 'three_quarter' },
  { label: 'Toco', value: 'toco' },
  { label: 'Truck', value: 'truck' },
  { label: 'Cavalo mecânico', value: 'tractor_unit' },
  { label: 'Outro', value: 'other' },
]
const PIX_KEY_TYPE_COMBOBOX_OPTIONS: readonly ComboboxOption[] = PIX_KEY_TYPE_OPTIONS

type SubmissionState = 'error' | 'idle' | 'submitted' | 'submitting'

type FormFields = Readonly<{
  anttCategory: string
  city: string
  companyId: string
  complement: string
  district: string
  email: string
  licenseCategory: string
  licenseNumber: string
  name: string
  number: string
  phone: string
  pixKey: string
  pixKeyType: string
  postalCode: string
  rntrc: string
  state: string
  street: string
  taxId: string
  vehicleBrand: string
  vehicleModel: string
  vehicleModelYear: string
  vehiclePlate: string
  vehicleType: string
}>

const EMPTY_FIELDS: FormFields = {
  anttCategory: '',
  city: '',
  companyId: '',
  complement: '',
  district: '',
  email: '',
  licenseCategory: '',
  licenseNumber: '',
  name: '',
  number: '',
  phone: '',
  pixKey: '',
  pixKeyType: '',
  postalCode: '',
  rntrc: '',
  state: '',
  street: '',
  taxId: '',
  vehicleBrand: '',
  vehicleModel: '',
  vehicleModelYear: '',
  vehiclePlate: '',
  vehicleType: '',
}

type PreRegistrationFormProps = Readonly<{ settings: LandingSettings }>

export function PreRegistrationForm({ settings }: PreRegistrationFormProps): ReactNode {
  const [fields, setFields] = useState<FormFields>(() => ({
    ...EMPTY_FIELDS,
    companyId: settings.units[0]?.companyId ?? '',
  }))
  const [state, setState] = useState<SubmissionState>('idle')
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileSiteKey = getLandingTurnstileSiteKey()

  const showUnitSelect = settings.units.length > 1

  function updateField<TField extends keyof FormFields>(
    field: TField,
    value: FormFields[TField],
  ): void {
    setFields((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const companyId = showUnitSelect ? fields.companyId : (settings.units[0]?.companyId ?? '')
    if (companyId === '') {
      setState('error')
      return
    }

    setState('submitting')
    const client = createAggregateApplicationClient({ apiBaseUrl: getLandingApiBaseUrl() })
    const accepted = await client.submit({
      companyId,
      declaredData: buildDeclaredData(fields),
      email: fields.email,
      name: fields.name,
      phone: stripPhone(fields.phone),
      taxId: normalizeTaxId(fields.taxId),
      ...(turnstileSiteKey === undefined ? {} : { turnstileToken }),
    })

    if (!accepted) {
      setState('error')
      return
    }

    setState('submitted')
    setFields({ ...EMPTY_FIELDS, companyId: fields.companyId })
    setTurnstileToken('')
  }

  if (state === 'submitted') {
    return (
      <section className={styles.section}>
        <div className={`${styles.feedback} ${styles.feedbackSuccess}`} role="status">
          Candidatura recebida. Obrigado! Nossa equipe vai analisar os dados e entrar em contato.
        </div>
      </section>
    )
  }

  const canSubmit =
    state !== 'submitting' && (turnstileSiteKey === undefined || turnstileToken !== '')

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Pré-cadastro do agregado</h2>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Dados pessoais</legend>
          <label className={styles.field}>
            <span className={styles.label}>Nome completo</span>
            <input
              className={styles.input}
              required
              type="text"
              value={fields.name}
              onChange={(event) => updateField('name', event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>CPF ou CNPJ</span>
            <input
              className={styles.input}
              inputMode="numeric"
              maxLength={TAX_ID_MASK_LENGTH}
              required
              type="text"
              value={fields.taxId}
              onChange={(event) => updateField('taxId', formatTaxId(event.target.value))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>E-mail</span>
            <input
              className={styles.input}
              required
              type="email"
              value={fields.email}
              onChange={(event) => updateField('email', event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Telefone</span>
            <input
              className={styles.input}
              inputMode="numeric"
              maxLength={PHONE_MASK_LENGTH}
              required
              type="text"
              value={fields.phone}
              onChange={(event) => updateField('phone', formatPhone(event.target.value))}
            />
          </label>
          {showUnitSelect ? (
            <label className={styles.field}>
              <span className={styles.label}>Unidade</span>
              <select
                className={styles.select}
                required
                value={fields.companyId}
                onChange={(event) => updateField('companyId', event.target.value)}
              >
                <option disabled value="">
                  Selecione
                </option>
                {settings.units.map((unit) => (
                  <option key={unit.companyId} value={unit.companyId}>
                    {unit.tradeName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Endereço</legend>
          <p className={styles.hint}>
            Usado no cadastro da ficha — não é obrigatório para enviar a candidatura.
          </p>
          <label className={styles.field}>
            <span className={styles.label}>CEP</span>
            <input
              className={styles.input}
              inputMode="numeric"
              maxLength={POSTAL_CODE_MASK_LENGTH}
              type="text"
              value={fields.postalCode}
              onChange={(event) => updateField('postalCode', formatPostalCode(event.target.value))}
            />
          </label>
          <div className={`${styles.fieldRow} ${styles.fieldRowTight}`}>
            <label className={styles.field}>
              <span className={styles.label}>Rua</span>
              <input
                className={styles.input}
                type="text"
                value={fields.street}
                onChange={(event) => updateField('street', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Número</span>
              <input
                className={styles.input}
                type="text"
                value={fields.number}
                onChange={(event) => updateField('number', event.target.value)}
              />
            </label>
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>Complemento</span>
              <input
                className={styles.input}
                type="text"
                value={fields.complement}
                onChange={(event) => updateField('complement', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Bairro</span>
              <input
                className={styles.input}
                type="text"
                value={fields.district}
                onChange={(event) => updateField('district', event.target.value)}
              />
            </label>
          </div>
          <div className={`${styles.fieldRow} ${styles.fieldRowTight}`}>
            <label className={styles.field}>
              <span className={styles.label}>Cidade</span>
              <input
                className={styles.input}
                type="text"
                value={fields.city}
                onChange={(event) => updateField('city', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>UF</span>
              <input
                className={styles.input}
                maxLength={STATE_MASK_LENGTH}
                type="text"
                value={fields.state}
                onChange={(event) => updateField('state', event.target.value.toUpperCase())}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>CNH e RNTRC</legend>
          <p className={styles.hint}>
            Sem isso a ficha aprovada não emite MDF-e — pode completar depois, mas acelera sua
            liberação.
          </p>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>Número da CNH</span>
              <input
                className={styles.input}
                inputMode="numeric"
                type="text"
                value={fields.licenseNumber}
                onChange={(event) =>
                  updateField('licenseNumber', event.target.value.replace(/\D/g, ''))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Categoria</span>
              <Combobox
                options={LICENSE_CATEGORY_OPTIONS}
                placeholder="Selecione"
                value={fields.licenseCategory}
                onChange={(value) => updateField('licenseCategory', value)}
              />
            </label>
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>RNTRC</span>
              <input
                className={styles.input}
                inputMode="numeric"
                maxLength={RNTRC_MASK_LENGTH}
                type="text"
                value={fields.rntrc}
                onChange={(event) => updateField('rntrc', event.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Regime junto à transportadora</span>
              <Combobox
                options={ANTT_CATEGORY_OPTIONS}
                placeholder="Selecione"
                value={fields.anttCategory}
                onChange={(value) => updateField('anttCategory', value)}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Recebimento</legend>
          <p className={styles.hint}>
            Chave Pix usada para o pagamento dos fretes — pode completar depois.
          </p>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>Tipo da chave Pix</span>
              <Combobox
                options={PIX_KEY_TYPE_COMBOBOX_OPTIONS}
                placeholder="Selecione"
                value={fields.pixKeyType}
                onChange={(value) => {
                  updateField('pixKeyType', value)
                  updateField('pixKey', formatPixKey(value, fields.pixKey))
                }}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Chave Pix</span>
              <input
                className={styles.input}
                disabled={fields.pixKeyType === ''}
                inputMode={fields.pixKeyType === 'email' ? 'email' : 'text'}
                maxLength={pixKeyMaskLength(fields.pixKeyType)}
                type="text"
                value={fields.pixKey}
                onChange={(event) =>
                  updateField('pixKey', formatPixKey(fields.pixKeyType, event.target.value))
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Veículo</legend>
          <p className={styles.hint}>
            Se você já roda com caminhão próprio, informe a placa — sem ela o operador cadastra o
            veículo depois.
          </p>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>Placa</span>
              <input
                className={styles.input}
                maxLength={PLATE_MASK_LENGTH}
                type="text"
                value={fields.vehiclePlate}
                onChange={(event) =>
                  updateField(
                    'vehiclePlate',
                    event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                  )
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Tipo</span>
              <Combobox
                options={VEHICLE_TYPE_OPTIONS}
                placeholder="Selecione"
                value={fields.vehicleType}
                onChange={(value) => updateField('vehicleType', value)}
              />
            </label>
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>Marca</span>
              <input
                className={styles.input}
                type="text"
                value={fields.vehicleBrand}
                onChange={(event) => updateField('vehicleBrand', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Modelo</span>
              <input
                className={styles.input}
                type="text"
                value={fields.vehicleModel}
                onChange={(event) => updateField('vehicleModel', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Ano</span>
              <input
                className={styles.input}
                inputMode="numeric"
                maxLength={4}
                type="text"
                value={fields.vehicleModelYear}
                onChange={(event) =>
                  updateField('vehicleModelYear', event.target.value.replace(/\D/g, ''))
                }
              />
            </label>
          </div>
        </fieldset>

        {turnstileSiteKey === undefined ? null : (
          <TurnstileWidget
            onExpire={() => setTurnstileToken('')}
            onVerify={setTurnstileToken}
            siteKey={turnstileSiteKey}
          />
        )}

        {state === 'error' ? (
          <div className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
            Não foi possível enviar agora. Tente novamente em instantes.
          </div>
        ) : null}
        <button className={styles.submitButton} disabled={!canSubmit} type="submit">
          {state === 'submitting' ? 'Enviando…' : 'Enviar candidatura'}
        </button>
      </form>
    </section>
  )
}

/** Campo de enum na API rejeita string vazia (`z.enum(...).optional()` só aceita ausente ou um valor válido). */
function optionalEnum(value: string): string | undefined {
  return value === '' ? undefined : value
}

/**
 * A API guarda a chave sem pontuação — a aleatória mantém hífen (é parte do UUID) e o CNPJ mantém
 * letra (base alfanumérica), então as duas usam `normalizeTaxId` em vez de `\D`.
 */
function stripPixKeyMask(type: string, value: string): string {
  if (type === 'email' || type === 'random') return value
  if (type === 'cnpj') return normalizeTaxId(value)
  return value.replace(/\D/g, '')
}

function buildDeclaredData(fields: FormFields): Record<string, unknown> {
  const address = {
    city: fields.city,
    complement: fields.complement,
    district: fields.district,
    number: fields.number,
    postalCode: fields.postalCode.replace(/\D/g, ''),
    state: fields.state,
    street: fields.street,
  }

  const driver = {
    address,
    anttCategory: optionalEnum(fields.anttCategory),
    licenseCategory: optionalEnum(fields.licenseCategory),
    licenseNumber: fields.licenseNumber,
    pixKey: stripPixKeyMask(fields.pixKeyType, fields.pixKey),
    pixKeyType: optionalEnum(fields.pixKeyType),
    rntrc: fields.rntrc,
  }

  const vehicle = {
    brand: fields.vehicleBrand,
    model: fields.vehicleModel,
    modelYear: fields.vehicleModelYear === '' ? undefined : Number(fields.vehicleModelYear),
    plate: fields.vehiclePlate,
    vehicleType: optionalEnum(fields.vehicleType),
  }

  return { driver, vehicle }
}
