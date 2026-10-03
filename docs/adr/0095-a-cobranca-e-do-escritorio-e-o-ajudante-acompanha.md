# ADR 0095 — A cobrança é do escritório, e o ajudante acompanha

- **Status:** aceita
- **Data:** 2026-10-03
- **Nasce da spec 243**
- **Citações:** spec 243, ADR-0065, ADR-0093

## Contexto

A spec 235 (O ajudante é um perfil) saiu em staging com cinco pontas abertas, todas cobrando ação:

1. A cobrança de entrega vaza para o campo: `GET /delivery-charges` e `GET /delivery-clients/:id/charge-rules`
   pedem `trip.read` (permissão do ajudante desde 0093 D6) e devolvem cobranças e regras de toda a empresa
   — dados do escritório acessíveis ao campo. **Risco BOLA registrado em `docs/SECURITY.md` desde 2026-09-18.**
2. A diária geral do ajudante não tem interface: a rota da API (`/company-crew-settings`, `fleet.read`/`fleet.manage`)
   existe desde a spec 149 D2, mas o painel não oferece cliente nem painel. Sem ela, toda viagem de ajudante sem
   diária própria traz a lacuna `HELPER_DAILY_RATE_MISSING`.
3. O login só de ajudante é uma armadilha: com só `trip.read`, nenhum workspace do painel abre e a pessoa vê
   "nenhuma permissão foi atribuída" (falso — ele tem uma). O app do motorista abre, mas mostra botões que a API
   recusa com 403, porque a resposta de `/me/trips/current` não diz o papel.
   4-5. Três achados de design da 235 (README dos prints) ficaram pendentes: promessa de salvar sem `try/catch`,
   papel com ficha desenhado diferente do selo, e labels mostrando "motorista" para ajudante.

## Decisão

### D1 — Cobrança é leitura do escritório: `trip.financials`

`CHARGE_READ_POLICY` muda de `trip.read` para `{ permission: 'trip.financials', scope: 'company' }` em
`delivery-charge.routes.ts` das duas rotas (`GET /delivery-charges` e `GET /delivery-clients/:id/charge-rules`).
Escritas continuam `trip.manage`. A política segue o que já existe: `company-admin`, `finance` e `operator`
têm `trip.financials` e leem; `driver`, `aggregate`, `separator` e `helper` não o têm e recebem `403`.

**Consequências:** O campo (motorista, agregado, separador, ajudante) perde acesso a leitura de cobrança.
O escritório não perde nada — ele já recebia `403` porque nenhum papel de escritório tinha `trip.read`.
Nenhum consumidor de campo (PWA, worker, integração) usa as duas rotas; o único cliente é o painel do escritório.

**Limite conhecido:** Hoje o recorte é global (toda a empresa). Se um dia houver consumidor que precise ler
cobrança de apenas suas próprias viagens, a rota `/me` seria adicionada como nova — não é recorte desta.

### D2 — Diária geral do ajudante na aba de motoristas, sem registro de painéis

A aba de motoristas do painel ganha o painel "Diária do ajudante", ligado a `fleet.read`/`fleet.manage`
(a permissão da API). A permissão de visualização segue a API (quem tem `fleet.read` vê); edição segue
`fleet.manage`. Nenhuma entrada em `SETTINGS_PANEL_PLACEMENT`, divergindo da RF-2 da spec 149 que presumia
`settings.manage`. O padrão é o mesmo do `EnergySettingsPanel` — painel que não quer `settings.manage`.

**Consequências:** O operador de frota (role `operator-fleet`, que tem `fleet.manage`) acessa e edita;
não exige permissão separada de configuração. A lista de painéis em `settingsTabsOf('fleet')` não muda,
mantendo a compatibilidade com contratos existentes.

### D3 — Resposta do motorista diz o papel: `crewRole` por viagem

`GET /me/trips/current` passa a devolver, por viagem, `crewRole: 'driver' | 'helper'` — o papel da linha
de tripulação (`trip_drivers.role`) para aquela viagem e aquela pessoa. A política de leitura não muda:
quem pode ler a viagem já pode ler o papel. A função `findCrewRole` já existe; o repositório passa a
selecionar `tripDrivers.role` na mesma consulta.

**Consequências:** O cliente do app do motorista recebe o papel. Viagem sem o campo (snapshot antigo no
IndexedDB) lê como `driver` por padrão. Resposta inválida recusa `DRIVER_TRIP_RESPONSE_INVALID`.

### D4 — App do motorista trata o ajudante como acompanhante

Com `crewRole = 'helper'`, o app mostra um aviso fixo ("Você acompanha esta viagem como ajudante") e
não oferece os botões de ação que exigem `trip.report` (Cheguei, Iniciar rota, Cancelar rota, Registrar
entrega depois, nota, comprovante, ocorrência, atalho de despacho). Ficam a leitura (paradas, navegação,
manifesto, romaneio). A fila offline nunca recebe ação de ajudante: nenhum defeito de `403` cíclico.

**Limite conhecido:** O atalho "Fotos pendentes (N)" lê a raiz do snapshot sem filtro por papel.
Se a API devolver pendência de viagem em que ele é ajudante, o atalho aparece — conferir em operação.

### D5 — Painel manda quem só tem `trip.read` para o app do motorista

A tela de "sem acesso" ganha uma variante para conta com `trip.read` e sem workspace visível.
Texto próprio: "Sua conta acompanha viagens pelo app do motorista". Um botão (quando `VITE_DRIVER_APP_URL`
existe) abre o app. Sem `trip.read`, segue o texto atual ("Nenhuma permissão foi atribuída").

**Consequências:** O ajudante puro vê o destino certo, não um erro. A variante aparece no landing do painel.

## Consequências

- Rota de cobrança recusa 403 a quatro papéis de campo; `docs/SECURITY.md` fecha a entrada de 2026-09-18.
- Operador de frota tem acesso a editar a diária geral sem depender de permissão de configuração separada.
- Ajudante recebe o papel da viagem; app o respeita como acompanhante.
- Conta `trip.read` vê a saída certa no painel.

## Alternativas descartadas

| Alternativa                                                    | Por que não                                                                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Recortar cobrança pelo vínculo do motorista                    | Sem consumidor de campo que precise, mais seguro recusar à porta. Se um dia precisar, rota `/me` é adicionada.  |
| Permissão `charge.read` nova para o campo                      | Muda o modelo; cobrança é análise do escritório, não consumo de campo.                                          |
| Diária geral em `SETTINGS_PANEL_PLACEMENT`                     | Exigiria `settings.manage`, que é transversal; o operador de frota pode não ter — a permissão é `fleet.manage`. |
| Papel do ajudante no app como role `read-only` separada        | Simples demais; ajudante precisa de acesso a viagens (`trip.read` já existe) e recusa de ações (D4).            |
| Versão otimista da diária (com reconciliação por estado final) | Tabela é de uma linha por empresa, `last-write-wins` desde 149; otimismo custa mais que ordenação.              |

## Revisão da seção 5 do ADR-0093

Ver **ADR-0095 D1** para a política de cobrança: a leitura mudou de `trip.read` para `trip.financials`.
O papel `helper` continua com permissão `['trip.read']` isolada — lê a viagem, não a cobrança ou relatório.
