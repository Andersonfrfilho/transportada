/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import type { ReactNode } from 'react'

import { useCreatePickupRequest } from './queries/pickupRequest.query'
import {
  buildPickupRequestInput,
  EMPTY_PICKUP_FORM,
  type AddressForm,
  type PickupFormErrors,
  type PickupRequestForm,
} from './pickupRequestForm.validation'
import type { PortalClient } from '@/modules/shared/portalClient.service'

type PickupRequestFormProps = Readonly<{
  client: PortalClient
  onDone: () => void
  today: string
}>

type FieldProps = Readonly<{
  error: string | undefined
  label: string
  onChange: (value: string) => void
  type?: string
  value: string
}>

function Field({ error, label, onChange, type, value }: FieldProps): ReactNode {
  return (
    <label>
      <span className="panel__label">{label}</span>
      <input
        aria-invalid={error !== undefined}
        onChange={(event) => onChange(event.target.value)}
        type={type ?? 'text'}
        value={value}
      />
      {error !== undefined && <span className="panel__label">{error}</span>}
    </label>
  )
}

type AddressFieldsProps = Readonly<{
  errors: PickupFormErrors
  onChange: (next: AddressForm) => void
  prefix: string
  title: string
  value: AddressForm
}>

function AddressFields({ errors, onChange, prefix, title, value }: AddressFieldsProps): ReactNode {
  const set = (key: keyof AddressForm) => (next: string) => onChange({ ...value, [key]: next })
  return (
    <fieldset className="panel">
      <legend className="panel__label">{title}</legend>
      <Field
        error={errors[`${prefix}.postalCode`]}
        label="CEP"
        onChange={set('postalCode')}
        value={value.postalCode}
      />
      <Field
        error={errors[`${prefix}.street`]}
        label="Rua"
        onChange={set('street')}
        value={value.street}
      />
      <Field
        error={errors[`${prefix}.number`]}
        label="Número"
        onChange={set('number')}
        value={value.number}
      />
      <Field
        error={undefined}
        label="Complemento (opcional)"
        onChange={set('complement')}
        value={value.complement}
      />
      <Field
        error={errors[`${prefix}.district`]}
        label="Bairro"
        onChange={set('district')}
        value={value.district}
      />
      <Field
        error={errors[`${prefix}.city`]}
        label="Cidade"
        onChange={set('city')}
        value={value.city}
      />
      <Field
        error={errors[`${prefix}.state`]}
        label="UF"
        onChange={set('state')}
        value={value.state}
      />
    </fieldset>
  )
}

/**
 * Spec 339: o cliente pede coleta ou entrega. A chave de idempotência nasce com o formulário: reenviar (duplo toque, rede
 * ruim) devolve o mesmo pedido em vez de criar outro. Nenhuma consulta de CEP de terceiro (ADR-0050).
 */
export function PickupRequestFormComponent({
  client,
  onDone,
  today,
}: PickupRequestFormProps): ReactNode {
  const create = useCreatePickupRequest(client)
  const [form, setForm] = useState<PickupRequestForm>(EMPTY_PICKUP_FORM)
  const [errors, setErrors] = useState<PickupFormErrors>({})
  const [idempotencyKey] = useState(() => `portal-${crypto.randomUUID()}`)
  const update =
    <K extends keyof PickupRequestForm>(key: K) =>
    (value: PickupRequestForm[K]) =>
      setForm((current) => ({ ...current, [key]: value }))

  function submit(): void {
    const result = buildPickupRequestInput(form, { idempotencyKey, today })
    if (result.input === null) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    create.mutate(result.input, { onSuccess: onDone })
  }

  return (
    <article className="panel">
      <div className="nav">
        <button
          className={form.kind === 'pickup' ? '' : 'secondary'}
          onClick={() => update('kind')('pickup')}
          type="button"
        >
          Pedir coleta
        </button>
        <button
          className={form.kind === 'delivery' ? '' : 'secondary'}
          onClick={() => update('kind')('delivery')}
          type="button"
        >
          Pedir entrega
        </button>
      </div>
      <AddressFields
        errors={errors}
        onChange={update('origin')}
        prefix="origin"
        title="Onde retirar"
        value={form.origin}
      />
      <AddressFields
        errors={errors}
        onChange={update('destination')}
        prefix="destination"
        title="Onde entregar"
        value={form.destination}
      />
      <Field
        error={errors.cargoDescription}
        label="O que será transportado"
        onChange={update('cargoDescription')}
        value={form.cargoDescription}
      />
      <Field
        error={errors.volumes}
        label="Volumes"
        onChange={update('volumes')}
        value={form.volumes}
      />
      <Field
        error={errors.weightKg}
        label="Peso total (kg)"
        onChange={update('weightKg')}
        value={form.weightKg}
      />
      <Field
        error={errors.windowStart}
        label="A partir de"
        onChange={update('windowStart')}
        type="date"
        value={form.windowStart}
      />
      <Field
        error={errors.windowEnd}
        label="No máximo até"
        onChange={update('windowEnd')}
        type="date"
        value={form.windowEnd}
      />
      <Field
        error={errors.requesterName}
        label="Seu nome"
        onChange={update('requesterName')}
        value={form.requesterName}
      />
      <Field
        error={errors.requesterEmail}
        label="E-mail para o retorno"
        onChange={update('requesterEmail')}
        type="email"
        value={form.requesterEmail}
      />
      <Field
        error={errors.requesterPhone}
        label="WhatsApp para o retorno (com DDD)"
        onChange={update('requesterPhone')}
        value={form.requesterPhone}
      />
      <Field
        error={undefined}
        label="Observação (opcional)"
        onChange={update('note')}
        value={form.note}
      />
      {create.isError && (
        <p className="panel__label">
          Não foi possível enviar o pedido. Confira os dados e tente de novo.
        </p>
      )}
      <div className="nav">
        <button disabled={create.isPending} onClick={submit} type="button">
          Enviar pedido
        </button>
        <button className="secondary" onClick={onDone} type="button">
          Voltar
        </button>
      </div>
    </article>
  )
}
