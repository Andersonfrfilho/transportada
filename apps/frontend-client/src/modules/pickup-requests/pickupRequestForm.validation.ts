/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  PickupRequestAddress,
  PickupRequestInput,
  PickupRequestKind,
  PickupRequestStatus,
} from '@/modules/shared/portal.types'

export type AddressForm = {
  city: string
  complement: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}

export type PickupRequestForm = {
  accessNotes: string
  cargoValue: string
  destinationContactName: string
  destinationContactPhone: string
  originContactName: string
  originContactPhone: string
  cargoDescription: string
  destination: AddressForm
  kind: PickupRequestKind
  note: string
  origin: AddressForm
  requesterEmail: string
  requesterName: string
  requesterPhone: string
  volumes: string
  weightKg: string
  windowEnd: string
  windowStart: string
}

export const EMPTY_ADDRESS: AddressForm = {
  city: '',
  complement: '',
  district: '',
  number: '',
  postalCode: '',
  state: '',
  street: '',
}

export const EMPTY_PICKUP_FORM: PickupRequestForm = {
  accessNotes: '',
  cargoValue: '',
  destinationContactName: '',
  destinationContactPhone: '',
  originContactName: '',
  originContactPhone: '',
  cargoDescription: '',
  destination: EMPTY_ADDRESS,
  kind: 'pickup',
  note: '',
  origin: EMPTY_ADDRESS,
  requesterEmail: '',
  requesterName: '',
  requesterPhone: '',
  volumes: '1',
  weightKg: '',
  windowEnd: '',
  windowStart: '',
}

const STATES = new Set(
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '),
)
const MAX_DAYS_AHEAD = 180

export type PickupFormErrors = Readonly<Record<string, string>>

function digits(value: string): string {
  return value.replace(/\D/gu, '')
}

function addressErrors(prefix: string, form: AddressForm, errors: Record<string, string>): void {
  if (digits(form.postalCode).length !== 8)
    errors[`${prefix}.postalCode`] = 'Informe o CEP com 8 dígitos.'
  if (form.street.trim() === '') errors[`${prefix}.street`] = 'Informe a rua.'
  if (form.number.trim() === '') errors[`${prefix}.number`] = 'Informe o número (ou S/N).'
  if (form.district.trim() === '') errors[`${prefix}.district`] = 'Informe o bairro.'
  if (form.city.trim() === '') errors[`${prefix}.city`] = 'Informe a cidade.'
  if (!STATES.has(form.state.trim().toUpperCase())) errors[`${prefix}.state`] = 'Informe a UF.'
}

function toAddress(form: AddressForm): PickupRequestAddress {
  return {
    city: form.city.trim(),
    cityIbgeCode: null,
    complement: form.complement.trim() === '' ? null : form.complement.trim(),
    district: form.district.trim(),
    number: form.number.trim(),
    postalCode: digits(form.postalCode),
    state: form.state.trim().toUpperCase(),
    street: form.street.trim(),
  }
}

/** Dia civil a partir de um relógio injetado, em texto `yyyy-mm-dd` (sem fuso do navegador). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Valida o formulário e monta o corpo. A API recobra tudo — isto só poupa uma ida e volta. O peso aceita vírgula
 * (`12,5`) e vira ponto; nada passa por `number`, para não virar float.
 */
export function buildPickupRequestInput(
  form: PickupRequestForm,
  context: { readonly idempotencyKey: string; readonly today: string },
):
  | { readonly errors: PickupFormErrors; readonly input: null }
  | { readonly errors: null; readonly input: PickupRequestInput } {
  const errors: Record<string, string> = {}
  addressErrors('origin', form.origin, errors)
  addressErrors('destination', form.destination, errors)
  if (form.requesterName.trim() === '') errors.requesterName = 'Informe o nome de quem pede.'
  if (form.cargoDescription.trim() === '') errors.cargoDescription = 'Descreva a carga.'
  const email = form.requesterEmail.trim()
  const phone = digits(form.requesterPhone)
  if (email === '' && phone === '')
    errors.requesterEmail = 'Informe um e-mail ou um WhatsApp para o retorno.'
  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    errors.requesterEmail = 'E-mail inválido.'
  if (phone !== '' && (phone.length < 10 || phone.length > 15))
    errors.requesterPhone = 'Telefone inválido.'
  const originPhone = digits(form.originContactPhone)
  const destinationPhone = digits(form.destinationContactPhone)
  if (originPhone !== '' && (originPhone.length < 10 || originPhone.length > 15))
    errors.originContactPhone = 'Telefone inválido.'
  if (destinationPhone !== '' && (destinationPhone.length < 10 || destinationPhone.length > 15))
    errors.destinationContactPhone = 'Telefone inválido.'
  const cargoValue = form.cargoValue.trim().replace(/\./gu, '').replace(',', '.')
  if (cargoValue !== '' && !/^\d{1,15}(\.\d{1,2})?$/u.test(cargoValue))
    errors.cargoValue = 'Valor inválido (ex.: 1500,00).'
  const volumes = Number(form.volumes)
  if (!Number.isInteger(volumes) || volumes <= 0)
    errors.volumes = 'Informe os volumes (inteiro maior que zero).'
  const weight = form.weightKg.trim().replace(',', '.')
  if (!/^\d{1,9}(\.\d{1,3})?$/u.test(weight) || Number(weight) <= 0)
    errors.weightKg = 'Informe o peso em kg.'
  if (form.windowStart === '') errors.windowStart = 'Informe o primeiro dia possível.'
  else if (form.windowStart < context.today) errors.windowStart = 'O dia não pode ser passado.'
  if (form.windowEnd === '') errors.windowEnd = 'Informe o último dia possível.'
  else if (form.windowStart !== '' && form.windowEnd < form.windowStart)
    errors.windowEnd = 'O último dia vem depois do primeiro.'
  else if (form.windowEnd > addDays(context.today, MAX_DAYS_AHEAD))
    errors.windowEnd = `No máximo ${MAX_DAYS_AHEAD} dias à frente.`

  if (Object.keys(errors).length > 0) return { errors, input: null }
  return {
    errors: null,
    input: {
      accessNotes: form.accessNotes.trim() === '' ? null : form.accessNotes.trim(),
      cargoValue: cargoValue === '' ? null : cargoValue,
      destinationContactName:
        form.destinationContactName.trim() === '' ? null : form.destinationContactName.trim(),
      destinationContactPhone: destinationPhone === '' ? null : destinationPhone,
      originContactName:
        form.originContactName.trim() === '' ? null : form.originContactName.trim(),
      originContactPhone: originPhone === '' ? null : originPhone,
      cargoDescription: form.cargoDescription.trim(),
      destination: toAddress(form.destination),
      idempotencyKey: context.idempotencyKey,
      kind: form.kind,
      note: form.note.trim() === '' ? null : form.note.trim(),
      origin: toAddress(form.origin),
      requesterEmail: email === '' ? null : email,
      requesterName: form.requesterName.trim(),
      requesterPhone: phone === '' ? null : phone,
      volumes,
      weightKg: weight,
      windowEnd: form.windowEnd,
      windowStart: form.windowStart,
    },
  }
}

const STATUS_LABEL: Readonly<Record<PickupRequestStatus, string>> = {
  accepted: 'Aceito, aguardando a data',
  canceled: 'Cancelado',
  done: 'Concluído',
  expired: 'Encerrado sem resposta',
  refused: 'Não aceito',
  requested: 'Aguardando resposta',
  scheduled: 'Confirmado',
}

export function pickupStatusLabel(status: PickupRequestStatus): string {
  return STATUS_LABEL[status]
}

export function canCancelPickup(status: PickupRequestStatus): boolean {
  return status === 'requested'
}

export function formatPickupDay(value: string): string {
  const [year, month, day] = value.split('-')
  return day === undefined ? value : `${day}/${month}/${year}`
}
