/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AssemblyMapNote } from './assemblyMap.service'
import type { ScannedNfeDocument } from './trip.types'

/**
 * A nota da listagem vira ponto no mapa da montagem.
 *
 * ⚠️ **Um mapeador só** para as duas telas (spec 110 D8): a criação manual e cada viagem da
 * proposta multi-veículo desenham o mesmo mapa, e uma segunda cópia divergiria calada — ela
 * compila igual, e só aparece no dia em que uma tela imprime o telefone e a outra não.
 */
export function toAssemblyMapNote(document: ScannedNfeDocument): AssemblyMapNote {
  return {
    address: document.recipientAddress,
    /**
     * ⚠️ `addressNumber` é o número do **endereço**, e `number` é o número da **nota**. Trocar os
     * dois faria a chave da parada nascer do número fiscal, e cada nota viraria uma parada própria.
     */
    addressNumber: document.recipientAddressNumber,
    cargoGrossWeight: document.cargoGrossWeight,
    cargoWeightSource: document.cargoWeightSource,
    city: document.recipientCity,
    cityCode: document.recipientCityCode,
    freightAmount: document.freightAmount,
    freightRuleName: document.freightRuleName,
    id: document.id,
    latitude: document.recipientLatitude,
    locationPrecision: document.recipientLocationPrecision,
    longitude: document.recipientLongitude,
    number: document.number,
    phone: document.recipientPhone,
    postalCode: document.recipientPostalCode,
    recipient: document.recipientName,
    state: document.recipientState,
    totalAmount: document.totalAmount,
  }
}
