# Spec 244 — T4: prints da revisão de design (contra o HEAD `b1cd82f90`)

Capturados em 2026-10-03 no worktree `busy-jang-2057c9` (branch `work/spec-244-ajudante-resto`). Dados fictícios. Cada tela tem quatro arquivos: `375` (celular, `deviceScaleFactor` 2) e `1280` (desktop), em `escuro` e `claro`. Nomes: `NN-descricao-largura-tema.png`. São 6 telas e 24 PNG (não commitados).

## Como foram capturados

- **Painel**: Vite do worktree (`./node_modules/.bin/vite --host localhost`, porta 53010) com `VITE_SMOKE_AUTH_BYPASS=true`, `VITE_API_URL` para um mock em Bun (53912), `VITE_APP_URL` e `VITE_KEYCLOAK_*`. O mock (`mock-api-244.ts`, derivado do 239) tem duas diárias gerais (`0.0000` e `120.0000`), ajudante puro e motorista que ajuda com `0.0000`, e grava o corpo de cada `PATCH /fleet/drivers/:id`.
- **App do motorista**: Vite do worktree em `localhost:53112` (com `VITE_DRIVER_APP_URL`), login real no Keycloak local com `local-user`; `GET /me/trips/current` e o consentimento simulados com `page.route`.
- Chromium headless (Playwright), service worker bloqueado. Estado e medidas por localizador e `getComputedStyle`; screenshot só fecha a tela. Servidores parados no fim.

## Lista

| Nº  | Arquivos                                         | O que prova                                                                                                                                                                                                               |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01-app-motorista-perfil-ajudante-sem-cartao-*`  | Perfil de um ajudante, consentimento respondendo 403: **sem** o cartão "Posição durante a viagem", sem interruptor e sem alerta.                                                                                          |
| 02  | `02-app-motorista-perfil-motorista-com-cartao-*` | Perfil de motorista, consentimento 200: o cartão e o interruptor aparecem, para comparar.                                                                                                                                 |
| 03  | `03-frota-diaria-geral-zero-*`                   | Frota › Motoristas, "Diária do ajudante" com a diária geral `0.0000`: o campo mostra **`0,00`** (e não vazio).                                                                                                            |
| 04  | `04-frota-diaria-geral-120-*`                    | O mesmo painel com `120.0000`: mostra `120,00`.                                                                                                                                                                           |
| 05  | `05-ficha-ajudante-diaria-zero-*`                | Edição do ajudante puro (Bruno) com diária própria `0.0000`. **Corrigido (commit `b4adb8055`): o campo mostra `0,00`** (achado A1). Recorte do formulário (456 px de largura em ambas as larguras: é o diálogo da ficha). |
| 06  | `06-ficha-motorista-diaria-zero-*`               | Edição de motorista que ajuda (Marcos), `helperDailyRate` e `dailyAllowanceAmount` `0.0000`. **Corrigido: os dois campos mostram `0,00`** (A1).                                                                           |

## Medições

- **Overflow horizontal:** `scrollWidth == innerWidth` nas 24 capturas.
- **`pageerror`: 0.**
- **Console:** painel (03 a 06): nenhum erro. App do motorista: três 404 (`landing-logo` e dois `POST /login-hints`, como na 243, sem dublê) em 01 e 02; **em 01, mais dois 403** do `GET /me/location-consent` simulado, esperados. O 403 foi pedido duas vezes (duas instâncias do hook na tela, no Vite de dev) e **não houve nova tentativa** (`retry: false` para 403).
- **01:** 0 `role="switch"`, 0 `role="alert"`, título do cartão ausente do texto de `main`. **02:** 1 interruptor, 0 alertas.
- **Alvos de toque:** nenhum controle abaixo de 44 px em `main` nas telas 01 e 02; interruptor da 02: 309×48 (375) e 574×48 (1280), foco visível. Painel: campo da diária 265×48 (375) e 1082×48 (1280), "Salvar diária" 172×48; campos da ficha 227×48 (375) e 146×48 (1280), "Salvar" 105×48. Foco visível (`:focus-visible`, outline sólido de 2 px) em todos.
- **03:** valor do campo `0,00` nos 4 casos. **04:** `120,00` nos 4.

## PATCH da ficha (corpo enviado ao mock ao clicar em Salvar)

A edição do motorista é `PATCH /fleet/drivers/:id` (não PUT). Nos 4 casos de cada tela:

- **05 (ajudante puro):** `"helperDailyRate":"0.0000"` e `"dailyAllowanceAmount":null` (o ajudante puro não tem diária de motorista; `null` é o esperado por `fleetForm.service.ts:469-472`).
- **06 (motorista que ajuda):** `"helperDailyRate":"0.0000"` e `"dailyAllowanceAmount":"0.0000"`.

Nenhum dos dois campos de diária própria foi `null`. Corpo completo da 06 (trecho): `{"canActAsHelper":true,"helperDailyRate":"0.0000",...,"dailyAllowanceAmount":"0.0000",...,"expectedVersion":"1","status":"active"}`.

## 05 (API, sem print)

`GET /me/trips/current` sem `trip.report` devolve `pendingProofs: []`: `find-current-driver-trip.use-case.ts` (`canReportProofs`, `Promise.resolve([])`), ligado em `me-trip.routes.ts` por `context.scope.permissions.has(DRIVER_REPORT_POLICY.permission)`; contrato em `test/driver-trip/current-trip.contract.ts` e `me-routes.contract.ts` (commit `9ba3a096d`, T1).

## Achados

- **A1 (defeito, corrigido e verificado):** na ficha o estado do formulário guardava `0,00` (o PATCH sai com `0.0000`), mas o input mostrava vazio, porque `FleetMoneyField` exibia `maskTypedAmount`, que devolve `''` para zeros. Correção (commit `b4adb8055`, T3): opção `keepsZero` em `FleetMoneyField`, ligada só nos campos de diária (`helperDailyRate`, `dailyAllowanceAmount`), com a máscara de exibição `maskTypedAmountKeepingZero`; os campos de custo do veículo e do frete seguem iguais. Reverificado em 05 e 06 (375 e 1280, escuro e claro, 8 capturas refeitas): o `value` do input da diária é `0,00` nos dois campos; Salvar sem tocar envia `"0.0000"`; com o caret no fim, um Backspace leva a `0,0` → campo vazio, e Salvar envia `null`. `scrollWidth == innerWidth`, 0 `pageerror`, 0 erro de console.
- **A2:** o esqueleto do cartão "WhatsApp" no Perfil (01 e 02) é falta de dublê no mock, não defeito.
- **A3:** o subtítulo do Perfil mostra `company-admin` porque o Keycloak local entrega esse papel à `local-user`; as telas usam `crewRole` do mock da viagem.

## Pontos que o usuário deve decidir

Nenhum pendente: A1 foi corrigido e verificado.
