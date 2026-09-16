# Feature 143 — A diária paga o motorista

## Problema e resultado

Hoje o custo do motorista na viagem sai de dois lugares. O do agregado vem da **tabela de região**
(`freight_region_driver_rates`), cruzando a zona da parada com a classe do veículo. O do motorista da
casa é **custo do período** e entra na viagem com valor zero (061 D2b). A tabela é uma planilha que
alguém precisa manter: quando falta a célula, a conta fica com lacuna (`NO_DRIVER_RATE`,
`CITY_WITHOUT_REGION`, empate de rota — specs 086, 123, 124, 128, 129).

Não é assim que a transportadora paga: ela paga **diária**. Por padrão são **R$ 200,00 por dia**, e
um motorista pode ter um valor combinado só dele.

Os lançamentos manuais (`POST /trips/:id/costs`) já gravam quem lançou (`actorUserId`), mas **não há
tela para lançar**, nenhuma listagem os mostra, e pedágio e custo avulso somam juntos na parcela
`toll`.

O resultado desta feature:

1. **O custo do motorista na viagem é `diária × dias`**, para agregado e motorista da casa.
2. **A diária sai do cadastro do motorista; sem valor ali, do valor geral da empresa** (padrão R$
   200,00/dia). Os dois são configuráveis.
3. **Os dias vêm do tempo da viagem**, e quem cria a viagem pode corrigir o número.
4. **Toda parcela diz de onde veio o valor**: "R$ 250,00 × 3 dias · valor do motorista" ou "R$
   200,00 × 3 dias · valor geral".
5. **O painel da viagem lista todos os gastos**, com a viagem aberta ou fechada, e tem um campo para
   lançar valor adicional. Cada lançamento mostra **quem lançou e quando**.

## Decisões

### D1 — A diária substitui a tabela de região no custo do agregado

O custo do motorista `route_table` deixa de ler `freight_region_driver_rates`. As lacunas
`NO_DRIVER_RATE` por célula faltando, `CITY_WITHOUT_REGION` e o empate de rota **deixam de afetar o
custo do motorista**.

A tabela e seus dados **não são apagados**: nenhuma migration destrutiva. O módulo de regiões
(`src/freight-regions/**` — CRUD, importação, cobertura do motorista) continua inteiro.

⚠️ **Dentro do cálculo da viagem, porém, a região só serve ao custo do motorista.** A receita de
frete não passa por região nenhuma: `read-trip-valuation.use-case.ts` resolve preço por
`findApplicableRule` sobre `freight_rules`, chaveado por cidade/UF de destino, CNPJ do remetente e
data. Quem depender da frase antiga vai preservar código que ficou sem consumidor.
Esta decisão revoga parte da 061 D2b e da ADR-0038, e ganha a **ADR-0066**.

### D2 — A diária vale para agregado e para o motorista da casa

- **Agregado (`route_table`):** `diária × dias` é o custo inteiro do motorista na viagem.
- **Motorista da casa (`fixed`):** o salário **segue fora da viagem**, como custo do período e sem
  rateio (061 D2b vale). Na viagem, o motorista da casa entra **só com a diária** — é o que se paga
  por dia fora. Nada é somado ao salário dentro da parcela: ele nunca esteve lá. O ramo `period`
  devolvia `0.0000` e o congelamento zerava de qualquer forma, então a linha vai de
  "R$ 0,00 + lacuna" para "R$ diária × dias".

Com mais de um motorista na viagem, cada um tem a própria diária e a parcela `driver` soma todas.

### D3 — Valor do motorista, senão valor geral

- `fleet_drivers.daily_allowance_amount` (`numeric(19,4)`, pode ser nulo, `> 0` quando preenchido).
- `company_driver_allowance_settings.daily_allowance_amount` (`numeric(19,4)`, `> 0`), uma linha por
  empresa, com `updated_by_user_id`.
- **Sem linha da empresa:** vale a constante `DEFAULT_DAILY_ALLOWANCE_AMOUNT = '200.0000'`.

A origem é registrada por motorista: `driver` (valor do cadastro), `company` (configurado pela empresa)
ou `default` (padrão do sistema, sem configuração). A diária é resolvida **na hora do cálculo**, e o
congelamento (061) grava o valor e a origem na parcela. Mudar o cadastro depois não altera uma viagem
fechada.

### D4 — Os dias vêm do tempo da viagem e podem ser corrigidos na criação

- **Sugestão:** `ceil(duração estimada em segundos / 86400)`, **mínimo 1**. A duração é
  `route_suggestions.estimated_duration_seconds` da proposta ou, na viagem sem proposta, a soma de
  `trip_stops.duration_from_previous_seconds`.
- **Persistido:** `trips.daily_allowance_days` (`integer`, `>= 1`, pode ser nulo). `POST /trips`
  aceita `dailyAllowanceDays` opcional. Se não vier, grava a sugestão calculada.
- **Viagem antiga sem o campo:** usa a sugestão calculada na leitura e marca a parcela como
  `estimated`.
- Só se aceitam dias inteiros. Meia diária fica fora do escopo.

### D5 — A origem vai no `basis`, não no `source`

`source` continua `measured | estimated | missing | period`: não muda o CHECK do banco. O `basis` da
parcela `driver` passa a levar:

```ts
{
  days: number
  daysOrigin: 'informed' | 'estimated'
  crew: ReadonlyArray<{
    driverId
    driverName
    dailyAmount: string
    rateOrigin: 'driver' | 'company' | 'default'
    subtotal: string
  }>
}
```

A frase legível ("R$ 200,00 × 3 dias · valor geral") é montada **no frontend** a partir do `basis`,
por `composeCostParcelDetail`. No congelamento, `note` recebe a mesma frase em texto, para a versão
fechada continuar legível sem o cadastro.

### D6 — Lançamento adicional aparece por linha, com autor, e pedágio deixa de engolir o avulso

- `GET /trips/:id/costs` lista os lançamentos: `id`, `kind`, `amount`, `description`, `createdAt`,
  `actor: { userId, name }`. O nome vem de `identity_user_profiles.name`, com fallback para o e-mail
  e, sem e-mail, para "usuário removido". Permissão: `trip.financials`.
- `readTollTotal` passa a somar **só `kind = 'toll'`**.
- Os lançamentos `other` entram na parcela **`manual`**, que já existe no enum e hoje não é usada.
- O painel da viagem (`TripFinancialPanel`) ganha:
  - **o ledger completo com a viagem aberta** (hoje mostra só totais), reaproveitando
    `ValuationLedger`, sem criar uma segunda implementação;
  - a **lista de lançamentos**: tipo, descrição, valor e "Lançado por Nome · 16/09/2026 14:32";
  - um **formulário**: valor, descrição e tipo (pedágio/outro), usando `recordCost`, com permissão
    `trip.manage`.
- Lançamento em viagem já fechada **não muda o resultado congelado**: pede recálculo com motivo,
  como já é hoje.

Editar ou apagar lançamento fica fora do escopo. Errou, lança um ajuste.

### D7 — Onde se configura

- **Motorista:** campo "Diária (R$/dia)" no `DriverForm`, opcional, com a dica "vazio usa o valor
  geral da empresa". Entra em `driverFieldsSchema` e na resposta HTTP da frota.
- **Empresa:** nova aba "Diária do motorista" em Configurações da empresa, no mesmo modelo de
  `FederalTaxPanel`: `GET/PUT/DELETE /company-settings/driver-allowance`. `DELETE` volta ao padrão de
  R$ 200,00. Permissão igual à das configurações fiscais.
- **Criação da viagem:** campo "Diárias" no `TripQuickCreateDialog`, preenchido com a sugestão e
  editável. A prévia (`/trips/valuation-preview`) aceita `dailyAllowanceDays` e recalcula na hora.

## Fora do escopo

- Meia diária e diária por fração de hora.
- Diária diferente por classe de veículo ou por região.
- Editar ou apagar lançamento manual.
- Apagar `freight_region_driver_rates` ou as telas da tabela de região.
- Exportação xlsx/csv do acumulado (061, ainda pendente).

## Premissas a confirmar com o usuário

Estas premissas não bloqueiam a execução; cada uma é uma linha para trocar se estiver errada.

- **"Acréscimo por agregado"** foi lido como **valor próprio que substitui o geral** (D3), não como
  valor geral + extra somado. Se for soma, muda só `resolveDailyAllowance`.
- **Motorista da casa recebe diária além do salário** (D2).

## Critérios de aceite

1. Agregado sem valor próprio, viagem de 50 horas, empresa sem configuração: parcela `driver` =
   **R$ 600,00**, basis `days: 3, daysOrigin: 'estimated'`, `rateOrigin: 'default'`.
2. Mesmo caso com `dailyAllowanceDays: 2` na criação: **R$ 400,00**, `daysOrigin: 'informed'`.
3. Motorista com diária de R$ 250,00 e empresa configurada com R$ 180,00: usa **R$ 250,00**, origem
   `driver`. Motorista sem valor, na mesma empresa: **R$ 180,00**, origem `company`.
4. Tripulação com um agregado (R$ 250,00) e um da casa sem valor (empresa sem configuração), 2 dias:
   parcela = **R$ 900,00** com duas linhas em `crew`.
5. Uma viagem com rota sem célula na tabela de região **não tem mais** lacuna no custo do motorista.
6. `POST /trips/:id/costs` `{kind: 'other', amount: '80.00'}` → parcela `manual` = R$ 80,00 e parcela
   `toll` inalterada. `GET /trips/:id/costs` devolve o lançamento com o nome de quem lançou.
7. Usuário sem `trip.financials` recebe **403** em `GET /trips/:id/costs`. Viagem de outra empresa
   recebe **404** (contrato negativo de tenant).
8. `daily_allowance_amount <= 0` e `daily_allowance_days < 1` são rejeitados pelo zod (400) e pelo
   CHECK do banco.
9. Painel da viagem aberta mostra o ledger, a linha do motorista com "R$ 200,00 × 3 dias · valor
   geral", a lista de lançamentos com autor e o formulário. Depois de lançar, a lista e o ledger se
   atualizam.
10. Viagem congelada antes da feature continua mostrando exatamente o que mostrava.
