# Viagem ef64efdd: o que aprendemos e o que corrigir

Causa real: duas paradas com nota viva (Osvaldo Valerini, 80 e General Osório, 971) sem linha em
`geocoded_addresses`. `listTripStopCoordinates` devolve `null` e o `plan-route` responde 422
`TRIP_ROUTE_UNAVAILABLE`. A nota desvinculada (907064) NÃO era a causa: não havia parada órfã.
Evidência: logs `trip_route_geometry_stops_gap` (`missing_coordinate`) e consulta somente leitura
às paradas da viagem em produção (13/10/2026).

| # | Aprendizado | Correção proposta | Onde |
|---|---|---|---|
| 1 | O erro diz "o roteirizador não devolveu rota", mas a causa era endereço sem coordenada. A pessoa não sabe o que fazer. | Erro 422 traz a lista dos endereços sem ponto (parada, endereço) e um link/ação "Corrigir ponto" para cada um. | `plan-trip-route.use-case.ts`, `trip.error.ts`, tela de erro da viagem |
| 2 | Nada geocodifica na hora de planejar. O backfill só usa CEP e recusa o centroide do município. | Ao planejar, resolver as paradas sem ponto pela cascata (CEP, depois centroide do município marcado como aproximado) antes de falhar. | `freeze-trip-planned-route.use-case.ts`, `geocode-address.use-case.ts` |
| 3 | Não existe botão para buscar a coordenada. A correção manual exige digitar latitude e longitude. | Botão "Buscar ponto" por endereço, que roda a cascata e mostra o resultado para confirmar. | `TripRouteMap.component.tsx`, rota nova de busca |
| 4 | Uma parada sem ponto derruba a rota inteira (`trip-stop-coordinates.support.ts:39`). | Rota sai com as paradas que têm ponto; as sem ponto ficam marcadas e fora do traçado, com aviso. Status só avança se a política aceitar rota parcial. | `trip-stop-coordinates.support.ts`, `freeze-trip-planned-route.use-case.ts` |
| 5 | Nota desvinculada/liberada continua na viagem com ações e entra nos cálculos; a parada fica sem nota viva. | Nota liberada sem botões e fora dos cálculos (exceto viagem cancelada); parada sem nota viva fora da conta da rota. | `trip-valuation.query.ts` (linhas 461, 947, 1066), `listTripStopCoordinates` |
| 6 | O formulário "Corrigir ponto" abre sempre no primeiro endereço (`stops[0]`), não confirma onde salvou e fecha. Isso gravou o ponto do Ramachotti na Petri. | Seletor começa vazio e obriga a escolher; depois de salvar mostra "Ponto salvo em <endereço>"; limpa os campos. | `TripRouteMap.component.tsx:216` |
| 7 | O `PATCH /geocoded-addresses` deu 400 sem explicação visível (provável vírgula decimal). | Aceitar vírgula, mostrar a recusa por campo e validar que o ponto cai perto da cidade da parada. | frontend + `geocoded-addresses` route |
| 8 | Três paradas (3, 4, 8) ficaram com o ponto do centro do município e ninguém sabe. | Marcar na tela e na rota "ponto aproximado" quando `precision = 'city'`. | `TripRouteMap`, leitura da viagem |
| 9 | O log `trip_route_geometry_stops_gap` diz só `missing_coordinate`, sem quais paradas. | Logar sequência das paradas sem ponto e a contagem (sem endereço completo). | `main.ts` ~2000 |
| 10 | O hotfix do PR #188 não cobre este caso (a parada tinha nota viva). | Teste de contrato com dois cenários: parada sem nota viva e parada com nota viva sem ponto. | `test/trip*` |
| 11 | Diagnóstico exigiu acesso a produção e foi bloqueado várias vezes. | Registrar scripts somente leitura (`trip-stops-check.sh`) e regra de permissão para eles; rota de diagnóstico da viagem na API para quem tem `fleet.read`. | tooling / runbook |
