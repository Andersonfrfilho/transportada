# Plano — 128

> 🤖 Modelo: `sonnet`

1. **Política de zona** (`trips/domain/trip-driver-zone.policy.ts`) — o empate deixa de ser lacuna
   sem valor: devolve `{ gap: DRIVER_ROUTE_TIE_HIGHEST_RATE, cityCount, tiedZones }`, com `regionId` e
   cobertura de cada faixa empatada. A política não conhece preço. A matriz sai da votação quando
   qualquer outra rota casa (`withoutHeadOfficeWhenRoutesMatch`, por `HEAD_OFFICE_FAMILY`).
2. **Escolha** (`trips/domain/trip-driver-tie.policy.ts`, novo) — `chooseTiedZone` recebe as faixas
   e o mapa de preços da classe e devolve a de maior valor (comparação em inteiro escalado; empate de
   valor → menor código de zona), mais a lista precificada que o detalhe imprime.
3. **Consulta** (`trips/infrastructure/trip-valuation.query.ts`) — `resolveCrew` precifica também as
   faixas empatadas numa consulta só; `priceTiedCrewMember` monta o condutor com o valor escolhido,
   ou com `DRIVER_RATE_MISSING_FOR_CLASS`/`NO_DRIVER_RATE` quando nenhuma tem preço.
4. **Parcela** (`trips/domain/trip-driver-cost.policy.ts`) — o aviso de empate vence o lembrete de
   ficha; o detalhe é `N cidades · código (cidade) R$ x | … · classe`.
5. **Vocabulário** — `DRIVER_ROUTE_TIE_HIGHEST_RATE` em `VALUATION_GAPS` e em `ADVISORY_GAPS` (API e
   cópia por valor no frontend); `DRIVER_ROUTE_AMBIGUOUS` fica, sem produtor, pelo congelado.
6. **Rótulos** — as quatro tabelas (trip e trip-financials, pt e en).

Ordem de deploy: indiferente. O frontend não valida a lacuna por lista fechada (o `t()` cai no
`defaultValue`), e a cópia de `ADVISORY_GAPS` só decide se o número aparece ao lado do aviso — com a
API nova e o frontend velho, a linha do empate mostraria o motivo sem o número por alguns minutos.
Subir o frontend junto ou logo depois da API.
