/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripConferenceSheetLabels } from './tripConferenceSheet.service'

/** Os textos da folha, resolvidos uma vez e entregues à impressão e ao PDF. */
export function buildTripConferenceSheetLabels(
  translate: (key: string) => string,
): TripConferenceSheetLabels {
  return {
    checkedBy: translate('conference.sheetCheckedBy'),
    city: translate('conference.sheetCity'),
    client: translate('conference.sheetClient'),
    createdBy: translate('conference.sheetCreatedBy'),
    date: translate('conference.sheetDate'),
    deliveredAt: translate('conference.sheetDeliveredAt'),
    deliveryStatus: translate('conference.sheetDeliveryStatus'),
    driver: translate('conference.sheetDriver'),
    driverSignature: translate('conference.sheetDriverSignature'),
    invoice: translate('conference.sheetInvoice'),
    issuedAt: translate('conference.sheetIssuedAt'),
    notes: translate('conference.sheetNotes'),
    printedAt: translate('conference.sheetPrintedAt'),
    quantity: translate('conference.sheetQuantity'),
    routeCities: translate('conference.routeCities'),
    title: translate('conference.sheetTitle'),
    total: translate('conference.sheetTotal'),
    trip: translate('conference.sheetTrip'),
    value: translate('conference.sheetValue'),
    vehicle: translate('conference.sheetVehicle'),
    volumes: translate('conference.sheetVolumes'),
  }
}
