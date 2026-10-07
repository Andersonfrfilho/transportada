# Evidência — 236

## Passo 0 — correção do texto antigo (2026-10-07, `541c1ec91`)

O architect `opus` achou texto do rascunho que contradizia as decisões do usuário. Corrigidos `spec.md`, `plan.md`,
`tasks.md`, `specs/237-…/spec.md` (linha da dúvida: "cidade do destinatário" → destino físico) e o ADR-0096 (Q2: o
**desvio manual** mora em `delivery_address_overrides`, um por `trip_document`, vale o mais recente; não é de
`resolvePhysicalDestination`, que só conhece `delivery` e `recipient`). **Nenhuma decisão do usuário mudou.**

- **Confirmação pendente em uma linha** (D5): o prazo que vale é o **copiado na chegada**
  (`cargo_arrivals.delivery_deadline_business_days`, ADR-0094), não o "perfil atual" que o rascunho dizia. É o que o
  usuário aprovou na 237; o usuário confirma em uma linha que a 236 segue a cópia.
- A janela de 24 h saiu da assinatura da política; `recipientCityIbge` saiu (quem chama resolve o IBGE do destino
  físico); o fuso virou fixo `America/Sao_Paulo`; o estado `open` virou `on_time` com `businessDaysRemaining`;
  `dueAt` virou `dueOn` (data civil); o detalhe da viagem não faz join com `contractors`; o `loadRules` da 238 faz
  quatro consultas e roda em série dentro da transação (T1.2a).

## T1.1 — `delivery-deadline.policy.ts` e a borda de datas (2026-10-07)

Executada com `sonnet` sobre o desenho validado pelo architect (`opus`). Worktree isolado
`agent-ae772c299d8346443`, branch `work/236-t11` a partir de `origin/staging` (`50908c1fd`).

- **Contrato antes** (`bff3c1a81`): `test/trip-domain/delivery-deadline.contract.ts` (tabela), `…-input.contract.ts`
  (a borda: instante de São Paulo → data civil), `…-isolation.contract.ts` (CA6 estático), tabelas em
  `delivery-deadline.cases.ts` e calendários em `test/fixtures/delivery-deadline-calendar.fixture.ts`, registrados
  pela entrada fina `test/trip-domain.contract.test.ts` (já na lista explícita do `package.json`). Vermelho por
  `Cannot find module '../../src/trips/application/delivery-deadline-input.service.js'`.
- **Implementação** (`499aa0305`): `src/trips/domain/delivery-deadline.{policy,types,constant}.ts` (pura: datas
  civis em texto, sem fuso, sem relógio, sem I/O) e `src/trips/application/delivery-deadline-input.service.ts`
  (`resolveDeliveryDeadlineFromInstants`: `toCivilDate` no fuso `America/Sao_Paulo`).
- **Verde:** `bun --env-file=<.env.test> test ./test/trip-domain.contract.test.ts` → 488 pass / 0 fail (421 antes;
  +67 novos). Suíte inteira de contratos da API: **10566 pass / 25 skip / 0 fail** (antes: 10499 / 25 / 0).
  `bun run typecheck` → 0; `bun run lint` → 0 (`--max-warnings=0`); `bun run format:check` na raiz → limpo.

### A tabela foi refeita por conta independente

As 46 linhas do architect foram refeitas por raciocínio próprio (dia da semana a partir de 01/01, Páscoa por
Meeus/Anônimo: 2028 = 16/04, logo Carnaval 28 e 29/02/2028) **e** por um script Python que não importa nada do
repositório. **Nenhuma divergência**. Observação: a fixture da 238 inventa um aniversário 29/02 em BH; a linha 36 (BH,
28/02/2024 + 1 → 29/02/2024) só vale com BH sem regra municipal, então a 236 tem a própria fixture.

### Mutações (CA4) — cada uma derrubou o contrato, e o arquivo foi restaurado (`git diff --quiet`)

| Mutação                                              | Arquivo                      | Falhas | Linhas / testes que derrubaram                            |
| ---------------------------------------------------- | ---------------------------- | -----: | --------------------------------------------------------- |
| somar 24 h à chegada                                 | `delivery-deadline-input`    |     12 | 1–11 (borda)                                              |
| contar sábado                                        | `business-calendar.policy`   |     25 | 4, 5, 9, 12, 13, 16, 18, 19, 22–26, 28, 30, 32–35, 37, 38 |
| ignorar o aniversário da cidade                      | `business-calendar-build`    |      3 | 20, 24, 26                                                |
| `<` no lugar de `≤` (entrega no dia)                 | `delivery-deadline.policy`   |      4 | 6, 10 (tabela e borda)                                    |
| `≤` no pendente (vence hoje vira no prazo)           | `delivery-deadline.policy`   |      7 | 2, 15, 16, 31, 32 e "23:30 de quinta"                     |
| data em UTC                                          | `delivery-deadline.constant` |      3 | 10, 11 e "23:30 de quinta"                                |
| dia 0 estilo `WORKDAY` do Excel                      | `delivery-deadline.policy`   |      6 | 12, 13, 14, 15, 16, 30                                    |
| UF errada (estadual de SP em BH)                     | `business-calendar-build`    |      1 | 23                                                        |
| `today` usado em nota entregue                       | `delivery-deadline.policy`   |     13 | 6–10, 37, 39 e "ignora o hoje"                            |
| precedência do `not_applicable` (desfecho × chegada) | `delivery-deadline.policy`   |      1 | "o desfecho que encerra a nota vence…"                    |
| precedência sem prazo × sem cidade                   | `delivery-deadline.policy`   |      1 | "sem chegada vence sem prazo…"                            |
| entrega medida pelo agora (chegada ao servidor)      | `delivery-deadline-input`    |      4 | 6, 8, 9, 10 (borda)                                       |
| import de `delivery-deadline` em `src/fleet/**`      | `driver-score.policy`        |      1 | isolamento (CA6)                                          |

### Divergências do desenho validado

- `BUSINESS_CALENDAR_TIME_ZONE` **não existe em `origin/staging`** (só na branch não publicada da 238). A borda usa
  `DELIVERY_DEADLINE_TIME_ZONE` em `delivery-deadline.constant.ts`; quando a 238 publicar, trocar pela constante dela
  é uma linha.
- `DeliveryOutcome.delivered` carrega `deliveredOn: CivilDate`; a borda aceita `DeliveryInstantOutcome` (com
  `deliveredAt: Date`) e converte. O nome da função da borda (`resolveDeliveryDeadlineFromInstants`) é nosso.
- O desenho dizia "`dueAt`" em alguns trechos; a política devolve `dueOn`.

### Não rodado

Integração contra Postgres, `make migration-test`, smoke e painel: esta task não tem consulta, rota, migration nem
tela (T1.2 em diante). `bun run lint` na raiz não se aplica (lint é por app).
