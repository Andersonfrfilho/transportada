# ADR 0104 — A parada sem ponto no mapa é resolvida no provedor ao planejar a rota

- **Status:** proposta (2026-10-13). Autorizada pelo Anderson no chat do projeto ("autorizo"); falta a aprovação do PR.
- **Data:** 2026-10-13
- **Nasce da viagem ef64efdd:** duas paradas com nota viva (Rua Osvaldo Valerini, 80 e Rua General Osório, 971) não tinham
  linha em `geocoded_addresses`; "Liberar para separação" respondia só que o roteirizador não devolveu rota.
- **Emenda:** o adendo de 2026-09-01 da ADR-0044 ("o provedor pago é escalada, só quando um humano marca a parada").
- **Citações:** ADR-0044 §3 (correção humana vence), ADR-0062 (teto de gasto da janela), spec 153 T704 M4.

## Decisão

1. **Ao planejar a rota**, cada endereço de parada viva ainda sem coordenada passa pelo degrau 2 da escada
   (`createRefineAddressUseCase`, provedor Google), antes do congelamento. No máximo 10 endereços por planejamento.
2. **O teto não muda.** O gasto conta nos mesmos registros da marca humana (`GEOCODING_REFINEMENT_WINDOW_LIMIT`, ADR-0062).
   Atingido o teto, o planejamento segue sem chamar o provedor e registra `trip_stop_point_quota_reached`.
3. **A correção humana continua vencendo:** quem decide é o `refine`, que não toca em linha `manual`.
4. **A chave fica só no servidor** (`GOOGLE_MAPS_API_KEY`). Sem ela o resolvedor nem é montado e o planejamento é o de antes.
5. **Sem rota HTTP nova** que dispare o provedor: o gatilho é o planejamento de quem já tem `trip.manage`.
6. Se a cascata falhar, a parada segue sem ponto: a rota sai com as demais (spec 153 T704 M4 revista no #190) e o 422
   `TRIP_ROUTE_STOPS_WITHOUT_LOCATION` nomeia os endereços quando nenhuma rota é possível.

## Consequências

- O provedor pago ganha um gatilho automático. O custo é limitado pelo teto e por 10 endereços por planejamento.
- **Fora desta ADR (pendente):** a mesma resolução ao vincular nota/criar parada e na rotina `geocoding.backfill`; o
  centroide marcado como aproximado como último degrau; e a validação de que o ponto cai no município do endereço.
