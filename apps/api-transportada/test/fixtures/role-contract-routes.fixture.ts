/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As rotas que o contrato do ajudante enumera por extenso: a lista é exaustiva de propósito, e rota que
 * não entra aqui nunca é provada como inalcançável.
 */
import type { defineRoute } from '../../src/http/router.service'
import { createBillingRoutes } from '../../src/billing/presentation/billing.routes'
import { createBusinessCalendarSettingsRoutes } from '../../src/business-calendar/presentation/business-calendar-settings.routes'
import { createDayChecksRoutes } from '../../src/business-calendar/presentation/day-checks.routes'
import { createHolidayImportRoutes } from '../../src/business-calendar/presentation/holiday-import.routes'
import { createMunicipalHolidayRoutes } from '../../src/business-calendar/presentation/municipal-holiday.routes'
import { createMunicipalHolidayRuleRoutes } from '../../src/business-calendar/presentation/municipal-holiday-rule.routes'
import { createStateHolidayRoutes } from '../../src/business-calendar/presentation/state-holiday.routes'
import { createCteIssuanceRoutes } from '../../src/cte-issuance/presentation/cte-issuance.routes'
import { createCompanyCrewSettingsRoutes } from '../../src/fleet/presentation/crew-settings.routes'
import { createFleetRoutes } from '../../src/fleet/presentation/fleet.routes'
import { createNfeDocumentRoutes } from '../../src/nfe-documents/presentation/nfe-documents.routes'
import { createOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/occurrence-conversation.routes'
import { createQuickReplyRoutes } from '../../src/occurrence-conversation/presentation/quick-replies.routes'
import { createOccurrenceConversationUnassignedRoutes } from '../../src/occurrence-conversation/presentation/occurrence-conversation-unassigned.routes'
import { createPackageBoxMeasurementExportRoutes } from '../../src/nfe-documents/presentation/package-box-measurement-export.routes'
import { createPackageBoxRoutes } from '../../src/nfe-documents/presentation/package-box.routes'
import { createPendingItemsRoutes } from '../../src/pending-items/presentation/pending-items.routes'
import { createTripDocumentReviewRoutes } from '../../src/trips/presentation/trip-document-review.routes'
import { createTripFieldOfficeRoutes } from '../../src/trips/presentation/trip-field-office.routes'
import { createTripFieldOfficeOccurrenceRoutes } from '../../src/trips/presentation/trip-field-office-occurrence.routes'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes'
import { createDeliveryChargeRoutes } from '../../src/delivery-clients/presentation/delivery-charge.routes'
import { createMeOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/me-occurrence-conversation.routes'
import { createMeSubjectConversationRoutes } from '../../src/occurrence-conversation/presentation/me-subject-conversation.routes'

/** Dependência falsa: a rota só é montada para ler a política dela. */
export function buildRoleContractRoutes(
  dependencies: never,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    ...createTripRoutes(dependencies),
    ...createFleetRoutes(dependencies),
    ...createCompanyCrewSettingsRoutes(dependencies),
    ...createBillingRoutes(dependencies),
    ...createCteIssuanceRoutes(dependencies),
    ...createNfeDocumentRoutes(dependencies),
    ...createPackageBoxRoutes(dependencies),
    ...createPackageBoxMeasurementExportRoutes(dependencies),
    ...createPendingItemsRoutes(dependencies),
    ...createTripDocumentReviewRoutes(dependencies),
    // Spec 156 T8b (revisão do code-reviewer): as rotas do escritório com autoria precisam entrar
    // aqui para a lista exaustiva **provar** a ausência delas — sem elas no array, o separador
    // "não alcançar" field-delivery/field-return era verdade por elas nunca terem sido testadas,
    // não porque a permissão as barrasse.
    ...createTripFieldOfficeRoutes(dependencies),
    ...createTripFieldOfficeOccurrenceRoutes(dependencies),
    // Spec 183 T404 (143 T016): o separador lê a conversa (`fleet.read`, como a listagem) e marca
    // como lida, mas **não** escreve à contratante nem vê a prévia (`occurrences.resolve`).
    ...createOccurrenceConversationRoutes(dependencies),
    ...createOccurrenceConversationUnassignedRoutes(dependencies),
    // Spec 183 T701 (RF12): as respostas rápidas são cadastro (`settings.manage`) e leitura de quem
    // escreve na conversa (`occurrences.resolve`) — o separador não alcança nenhuma das duas.
    ...createQuickReplyRoutes(dependencies),
    // Spec 238 T1.3: o calendário de dias úteis. Regra, feriado estadual e sábado são configuração
    // (`settings.manage`, ler e escrever); só o `GET /municipal-holidays` é `fleet.read`, desde a spec 060.
    ...createMunicipalHolidayRoutes(dependencies),
    ...createMunicipalHolidayRuleRoutes(dependencies),
    ...createStateHolidayRoutes(dependencies),
    ...createBusinessCalendarSettingsRoutes(dependencies),
    ...createHolidayImportRoutes(dependencies),
    ...createDayChecksRoutes(dependencies),
    // Rotas do app do motorista: `trip.read` abre as de leitura, `trip.report` as de escrita.
    ...createMeTripRoutes(dependencies),
    ...createDeliveryChargeRoutes(dependencies),
    ...createMeOccurrenceConversationRoutes(dependencies),
    ...createMeSubjectConversationRoutes(dependencies),
  ]
}
