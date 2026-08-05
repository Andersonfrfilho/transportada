/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyProfileLookup, CompanySettingsUpdate } from './companySettings.types'

type Profile = CompanySettingsUpdate['profile']

export function mergeProfileLookup(profile: Profile, lookup: CompanyProfileLookup): Profile {
  return {
    ...profile,
    city: lookup.city || profile.city,
    cityIbgeCode: lookup.cityIbgeCode || profile.cityIbgeCode,
    cnpj: lookup.cnpj || profile.cnpj,
    complement: lookup.complement || profile.complement,
    district: lookup.district || profile.district,
    email: lookup.email || profile.email,
    legalName: lookup.legalName || profile.legalName,
    number: lookup.number || profile.number,
    phone: lookup.phone || profile.phone,
    postalCode: lookup.postalCode || profile.postalCode,
    state: lookup.state || profile.state,
    stateRegistration: lookup.stateRegistration || profile.stateRegistration,
    street: lookup.street || profile.street,
    tradeName: lookup.tradeName || profile.tradeName,
  }
}
