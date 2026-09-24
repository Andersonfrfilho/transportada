# Plano técnico

## Contexto e premissas

Só frontend. A API já manda `isNoToll` por opção de rota, e a validação de resposta
(`tripResponse.validation.ts:1242`) já o normaliza para booleano. O que falta é levar esse booleano
da opção até a linha que o operador lê, e do lado do bloco de pedágio até a frase do zero.

## Arquitetura e arquivos afetados

- `src/modules/trip/shared/assemblyRouteOptions.service.ts` — `RouteOptionSummary` ganha `isNoToll`
  (RF1). A função já é pura e já recebe a opção inteira; é cópia de campo.
- `src/modules/trip/components/TripAssemblyMap.component.tsx` — o selo na lista (RF2, RF3), e a
  passagem de `isNoTollRoute` para o bloco de pedágio da opção selecionada (RF4).
- `src/modules/trip/components/RouteTollSummary.component.tsx` — nova prop `isNoTollRoute` e o
  ramo da frase quando `booths.length === 0` (RF4, RF5).
- `src/modules/trip/components/TripRouteMap.component.tsx` — passa `isNoTollRoute={false}`, porque
  a rota congelada não guarda a origem da opção.
- `src/modules/trip/locales/trip.locale.json` e `trip.en.locale.json` — `routeOptions.noToll` e
  `toll.avoided` (RF6).

## Contratos/API/eventos

Nenhuma mudança. Nenhum campo novo em requisição ou resposta.

## Dados, migration e rollback

Não há. Nenhuma tabela é tocada.

## Segurança e tenant

Sem efeito. Nada aqui lê ou escreve dado por empresa; o bloco de pedágio já é escopado pela rota
que a API devolveu para o contexto autenticado.

## Idempotência e concorrência

Não se aplica — render puro a partir do que a API devolveu.

## Observabilidade

Não se aplica.

## Estratégia de testes

Contrato antes da implementação, no molde das suítes de hoje:

- `test/trip/assembly-route-options.contract.ts` — CA01 e CA03 no cálculo puro. O helper `opcao`
  do arquivo já aceita `isNoToll`.
- `test/trip/route-toll-no-toll-route.contract.tsx` — CA04, CA05 e CA06 renderizando
  `RouteTollSummary`, no molde de `route-toll-without-charge-plural.contract.tsx`. ⚠️ Precisa
  entrar na lista explícita do `package.json` e no entrypoint `test/trip.contract.test.ts`, ou não
  roda.
- CA02 fica coberto pelo contrato do cálculo mais a leitura do componente: o selo é render direto
  de `summary.isNoToll`, sem ramo próprio a esconder defeito.

## Riscos

- **Selo demais.** Uma opção pode acumular três marcas ("mais rápida", "mais barata", "sem
  pedágio"). `isBestOfBoth` já resolve a redundância das duas primeiras; a terceira é informação
  nova e some quando não se aplica.
- **A frase do desvio virar mentira no detalhe da viagem.** Mitigado pela decisão de passar `false`
  ali — o dado não existe na rota congelada, e inventar seria pior que a frase genérica de hoje.
