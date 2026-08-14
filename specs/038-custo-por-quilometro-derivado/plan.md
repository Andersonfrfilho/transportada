# Plano técnico — 038

## Contexto e premissas

O produto já tem o padrão de campo derivado: `monthlyFixedCost` não é coluna, é conta feita duas
vezes à mão (`vehicle-cost.policy.ts` no domínio da API, `fleetVehicleCost.service.ts` no frontend) e
servida pelo mapper. Esta feature repete esse padrão para `costPerKilometer` e traz a entrada que
falta — o preço do combustível.

Duas premissas que decidem o desenho:

1. **A ANP publica preço de bomba, no varejo, com imposto.** Transportadora paga menos: contrato,
   volume, crédito de ICMS. Se o número da ANP entrar como verdade, o R$/km sai alto e o operador
   para de confiar nele. Então a referência é **sugestão sobrescrevível**, e a origem do valor é
   visível na tela.
2. **A ANP não tem API.** Tem arquivo. O resumo semanal por UF é **XLSX**; a série histórica é
   **CSV**. CSV significa nenhuma dependência nova e a agregação por UF feita no job; XLSX
   significaria um leitor de planilha no `cron-transportada` só para isso. Vai de CSV.

⚠️ A forma exata do arquivo (URL corrente, separador, encoding, nomes de coluna) **não está
verificada**. A Fase 0 sonda e cola o cabeçalho real na evidência antes de qualquer adaptador ser
escrito — é o mesmo cuidado que a 035 tomou com a FIPE depois de sondar com código inventado.

## Arquitetura e arquivos afetados

**`cron-transportada` — trilho novo `fuel-price-pull`**

```
src/fuel-price-pull/domain/fuel-price-pull.constant.ts     FUEL_PRICE_PULL_JOB = 'fuel.price.pull'
src/fuel-price-pull/domain/fuel.constant.ts                catálogo (cópia por valor da API)
src/fuel-price-pull/domain/fuel-reference.policy.ts        semana de referência, produto, UF válida
src/fuel-price-pull/application/run-cycle.ts               lock → coleta → agrega → grava
src/fuel-price-pull/application/pull-fuel-reference.use-case.ts
src/fuel-price-pull/application/fuel-reference.port.ts
src/fuel-price-pull/infrastructure/anp-series.client.ts    HTTP + CSV, Zod na fronteira
src/fuel-price-pull/infrastructure/drizzle-fuel-reference.gateway.ts
src/fuel-price-pull/infrastructure/drizzle-advisory-lock.ts   (cópia do trilho existente)
src/fuel-price-pull/fuel-price-pull.job.ts                 composição
src/database/fuel-reference.schema.ts                      cópia por valor da tabela
src/config/cron.constant.ts                                job no CRON_JOBS
src/config/environment.schema.ts                           bloco ANP gated por CRON_JOB
src/job-registry.ts                                        FUEL_PRICE_PULL_JOB → runner
```

**`api-transportada`**

```
src/shared/fuel.constant.ts                      FUEL_TYPES (catálogo) + FuelType
src/database/fuel-reference.schema.ts            fuel_price_references (sem company_id, de propósito)
src/database/company-fuel-prices.schema.ts       company_fuel_prices (PK companyId + product)
src/database/fleet.schema.ts                     + fuelType, + otherCostsPerKilometer,
                                                   − costPerKilometer
src/fleet/domain/vehicle-cost.policy.ts          + deriveCostPerKilometer; troca do campo em
                                                   FleetVehicleCostFields e hasInformedCosts
src/fleet/application/fleet.port.ts              preço efetivo por produto chega ao mapper
src/fleet/infrastructure/fleet.mapper.ts         costPerKilometer derivado + parcelas persistidas
src/fleet/presentation/fleet-request.schema.ts   costPerKilometer sai do corpo; fuelType e
                                                   otherCosts entram
src/companies/presentation/fuel-price.routes.ts  GET /company-settings/fuel-prices;
                                                   PUT/DELETE …/{produto}
src/companies/presentation/fuel-price.schema.ts
src/companies/application/{list,set,clear}-fuel-price.use-case.ts
src/companies/application/fuel-price.port.ts
src/companies/infrastructure/drizzle-fuel-price.repository.ts
src/companies/domain/fuel-price.policy.ts        preço efetivo por produto = manual ?? referência
```

**`frontend-transportada`**

```
src/modules/shared/fuel.constant.ts                      catálogo espelhado (cópia por valor)
src/modules/fleet/shared/fleetVehicleCost.service.ts     + deriveCostPerKilometer (espelho); troca
                                                         da chave em VEHICLE_COST_FIELD_SCALE
src/modules/fleet/components/VehicleCostFields.component.tsx   input do total sai; select de
                                                         combustível e campo de outros custos
                                                         entram; resumo ganha composição,
                                                         combustível, origem e semana
src/modules/company-settings/…                            preço por combustível, rotulado pela unidade
src/modules/fleet/locales/*.locale.json                   rótulos novos, acentuados, unidade por chave
```

**Deploy**

```
docs/spec/railway.md                              cron-fuel na tabela de build
.github/workflows/deploy.yml                      passo gated em staging, como cron-nfse
apps/api-transportada/test/deploy/service-naming.contract.ts   cron-fuel em INTERNAL_SERVICES
```

## Contratos/API/eventos

`GET /company-settings/fuel-prices` → `200`, uma entrada por produto do catálogo, sempre as cinco —
produto sem ajuste e sem referência aparece com os dois campos nulos, em vez de sumir da lista. O
`unit` viaja junto porque é o que a tela usa para rotular o valor; ele é constante do catálogo, e vem
no corpo para o frontend não ter de casar produto com unidade por conta própria:

```json
{
  "data": [
    {
      "product": "diesel-s10",
      "unit": "litre",
      "effectivePricePerUnit": "5.4800",
      "source": "manual",
      "updatedAt": "2026-08-14T12:00:00.000Z",
      "reference": {
        "state": "SP",
        "pricePerUnit": "6.1230",
        "weekEndingOn": "2026-08-08"
      }
    },
    {
      "product": "gnv",
      "unit": "cubic-metre",
      "effectivePricePerUnit": "4.0900",
      "source": "anp",
      "updatedAt": null,
      "reference": { "state": "SP", "pricePerUnit": "4.0900", "weekEndingOn": "2026-08-08" }
    }
  ]
}
```

`PUT /company-settings/fuel-prices/{produto}` recebe `{ "pricePerUnit": "5.4800" }` (regex de
dinheiro escala 4) e devolve a entrada daquele produto; produto fora do catálogo é `400`, não `404` —
o caminho existe, o valor é que é inválido. `DELETE` no mesmo caminho devolve `204` e aquele produto
volta a seguir a referência. `reference` é `null` quando a UF da empresa não tem linha coletada
daquele produto — e então, sem ajuste manual, `effectivePricePerUnit` é `null`, não zero.

Veículo: `costPerKilometer` **sai** de `vehicleFieldsSchema`; entram `otherCostsPerKilometer`, na
mesma regex de escala 4 que `COST_PER_KILOMETER_DECIMAL` já define — a constante fica, só muda de
consumidor —, e `fuelType`, um `z.enum` sobre o catálogo, obrigatório. Como os schemas são
`.strict()`, cliente antigo que mandar `costPerKilometer` recebe `400` — comportamento desejado e
assertado. Na resposta o campo continua, agora derivado, ao lado de `monthlyFixedCost`, acompanhado
da composição e da procedência do preço:

```json
{
  "fuelType": "diesel-s10",
  "otherCostsPerKilometer": "0.5000",
  "costPerKilometer": "0.9567",
  "costPerKilometerBreakdown": {
    "fuel": "0.4567",
    "otherCosts": "0.5000"
  },
  "fuelPrice": {
    "unit": "litre",
    "pricePerUnit": "5.4800",
    "source": "manual",
    "weekEndingOn": "2026-08-08"
  }
}
```

Parcela não informada é omitida do objeto — a ausência é a informação, e um `"0.0000"` ali diria que
a manutenção custa zero. `fuelPrice` é `null` quando não há preço para aquele combustível na UF: é o
que a tela usa para dizer _por que_ o R$/km não apareceu, em vez de mostrar um traço mudo.

Nenhum evento novo, nenhuma fila. O job escreve direto na tabela de referência: não há efeito externo
a coordenar.

## Dados, migration e rollback

```sql
create table fuel_price_references (
  id uuid primary key,
  product varchar(20) not null,          -- 'diesel-s10' (varchar, nunca enum nativo)
  state char(2) not null,
  week_ending_on date not null,
  price_per_unit numeric(19,4) not null,   -- R$/litro, ou R$/m³ quando o produto é 'gnv'
  station_count integer not null,
  collected_at timestamptz not null default now(),
  constraint fuel_price_references_natural_unique unique (product, state, week_ending_on),
  constraint fuel_price_references_price_check check (price_per_unit > 0)
);

create table company_fuel_prices (
  company_id uuid not null references companies(id) on delete restrict on update cascade,
  product varchar(20) not null,
  price_per_unit numeric(19,4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_fuel_prices_pkey primary key (company_id, product),
  constraint company_fuel_prices_price_check check (price_per_unit > 0)
);

alter table fleet_vehicles
  add column other_costs_per_kilometer numeric(19,4) not null default 0;

alter table fleet_vehicles
  add column fuel_type varchar(20) not null default 'diesel-s10';

alter table fleet_vehicles
  drop column cost_per_kilometer;
```

`company_fuel_prices` é PK composta `(company_id, product)`, não uma linha por empresa com uma coluna
de preço: o ajuste é **por combustível**, e ausência de linha é ausência de ajuste — não precisa de
`null` para dizer "segue a ANP". Só existe linha para o produto que alguém sobrescreveu.

A **unidade não é coluna**. Ela é constante do produto — GNV é m³, o resto é litro — e guardá-la por
linha abriria a porta para duas linhas do mesmo produto discordarem entre si. Ela vive no catálogo,
ao lado do próprio produto, e viaja no corpo das respostas para a tela não ter de deduzi-la. As
colunas se chamam `price_per_unit` justamente por isso: `price_per_litre` guardando R$/m³ em uma
linha de cada cinco seria a mentira que esta feature existe para não contar.

O `default 'diesel-s10'` de `fuel_type` é o único chute da migration, registrado na spec: sem ele
toda a frota já cadastrada ficaria sem R$/km até ser editada uma a uma. O default fica na coluna
depois do backfill — veículo novo é obrigado a escolher pelo schema Zod, que não tem default.

`fuel_price_references` **não tem `company_id`** e isso é decisão, não esquecimento: é dado público de
mercado, idêntico para toda empresa da instalação, sem PII. Hoje a única tabela sem tenant é
`identity_user_profile`; esta é a segunda, e o contrato de isolamento a lista explicitamente como
referência compartilhada para que a ausência seja assertada em vez de passar batido.

A unicidade `(product, state, week_ending_on)` é a idempotência do job: reexecução na mesma semana
não grava linha nova. Não há necessidade de mexer em `CRON_MAX_CADENCE_MINUTES` (hoje 1440, um dia)
para uma cadência semanal — quem garante o no-op é a chave natural, não o guarda de cadência.

Quase tudo é aditivo — duas tabelas novas e duas colunas novas, ambas com `not null default`, que
dispensam backfill em passo separado: `0.0000` já é o "não informado" dos outros custos opcionais, e
`diesel-s10` é o default assumido do combustível. O **único passo destrutivo** é o
`drop column cost_per_kilometer`, decidido na spec e aprovado pelo dono do produto.

Ele é `drop` + `add`, nunca `rename`: a coluna antiga guardava o R$/km **total**, combustível
incluído. Renomear faria todo veículo já cadastrado herdar o combustível dentro de "outros custos", e
a soma passaria a contar o combustível duas vezes — erro silencioso, que ninguém percebe olhando a
tela. Perder o valor antigo é o comportamento correto aqui.

`rollback.sql` recria `cost_per_kilometer` (vazia — os valores **não voltam**), derruba a coluna nova
e as duas tabelas novas, e apaga a entrada do journal com o guarda de `ROW_COUNT` de sempre. O
`drop` fica isolado no fim do arquivo, para o contrato de migration conseguir apontar o passo
destrutivo em vez de reprovar o arquivo inteiro.

## Segurança e tenant

- `companyId` do contexto autenticado, nunca do corpo. A UF vem do perfil fiscal no servidor.
- `settings.manage`, escopo `company`, nas três rotas de preço.
- O job do cron não tem contexto de usuário e **não lê nada de empresa**: escreve só referência
  pública. É a razão de ele não precisar de tenant.
- Nada de segredo novo. A ANP é pública e anônima — nenhum token, nenhuma credencial.
- O CSV é entrada não confiável: Zod na fronteira, linha que não valida é descartada com contagem
  registrada, e cabeçalho fora do esperado aborta o ciclo em vez de gravar média torta.
- Nada de PII: o arquivo agregado por UF não carrega posto, CNPJ nem endereço. Se a série escolhida
  vier por posto, a agregação acontece **antes** de qualquer escrita, e nada por posto é persistido.

## Idempotência e concorrência

Advisory lock de sessão, conexão pinada em `max: 1`, exatamente como os trilhos existentes: uma
instância por janela. Quem não pega o lock sai limpo, sem código de erro. A escrita é
`insert … on conflict (product, state, week_ending_on) do nothing` — semana já coletada não é
reescrita, e coleta concorrente não duplica.

Do lado da API não há concorrência a tratar: `PUT` de preço é upsert por `company_id`, e a leitura é
derivação pura sobre o valor corrente.

## Observabilidade

Máscara padrão, com `correlationId` do ciclo. Do job: início, UF/produto coletados, linhas
descartadas na validação, semanas gravadas, semanas ignoradas por já existirem, duração. Da API: a
troca de origem `anp` ↔ `manual` é mudança de configuração — vai para a trilha de auditoria com ator,
alvo e timestamp, como as outras alterações de configuração.

Nada de logar o corpo do CSV.

## Estratégia de testes

| Alvo                                                           | Onde                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `deriveCostPerKilometer` (API)                                 | `apps/api-transportada/test/fleet-domain/vehicle-cost.contract.ts`   |
| Espelho no frontend, mesmo resultado                           | `apps/frontend-transportada/test/fleet/vehicle-cost.contract.ts`     |
| `costPerKilometer` fora do corpo, dentro da resposta           | `test/fleet-http/vehicles.contract.ts`                               |
| Rotas de preço por produto                                     | `test/companies/fuel-price.contract.ts`                              |
| Unidade do catálogo chegando ao rótulo (litro × m³)            | `apps/frontend-transportada/test/fleet/fuel-unit.contract.ts`        |
| Preço efetivo por produto = manual ?? referência               | `test/companies/fuel-price-policy.contract.ts`                       |
| Catálogo idêntico nas três apps                                | um contrato por app, sobre a mesma lista literal                     |
| Tabelas, checks, unicidade, ausência deliberada de tenant      | `test/fleet-schema/…` + `tenant-safety.contract.ts`                  |
| Migration aditiva e rollback guardado                          | `test/database-migration/static-migration.contract.ts`               |
| Parser do CSV da ANP, cabeçalho real da sondagem               | `apps/cron-transportada/test/fuel-price-pull/anp-series.contract.ts` |
| Ciclo: lock, no-op de semana repetida, falha preserva anterior | `apps/cron-transportada/test/fuel-price-pull/run-cycle.contract.ts`  |
| Sem `<input>` de R$/km na tela                                 | `apps/frontend-transportada/test/fleet/screen-standards.contract.ts` |
| `cron-fuel` declarado                                          | `apps/api-transportada/test/deploy/service-naming.contract.ts`       |

⚠️ Todo arquivo de teste novo entra na **lista literal** do `package.json` da app. Sem isso ele não
roda, e o gate passa verde sem ter executado nada.

## Riscos

- **A série da ANP muda de layout ou de endereço.** Mitigação: Zod na fronteira e falha limpa —
  referência anterior continua valendo, e o R$/km não vira zero. É o risco central e ele é aceito de
  olho aberto: fonte pública sem contrato de API não tem estabilidade prometida.
- **O `drop column` é porta de mão única.** O que estava digitado em `cost_per_kilometer` não volta
  pelo rollback. Mitigação: o valor perdido é chute manual que a feature substitui, e a decisão está
  registrada com data na spec. Se alguma instalação já usa aquele número para precificar hoje,
  exportar a coluna antes de aplicar é barato — vale citar no ADR.
- **Preço de varejo confundido com preço pago.** Mitigação: origem visível na tela e sobrescrita a um
  clique. Se isto for mal comunicado, a feature piora a decisão de preço em vez de melhorar.
- **Regra duplicada à mão nos dois lados** (`deriveCostPerKilometer`) — mesmo passivo que
  `deriveMonthlyFixedCost` já carrega. Mitigação: contrato espelhado com a mesma tabela de casos nos
  dois testes.
- **O catálogo de combustíveis vive em três cópias por valor** — API, cron e frontend, que não
  importam código um do outro, como já acontece com a política de elegibilidade da distribuição.
  Divergir é gravar referência de um produto que nenhum veículo consegue selecionar. Mitigação: os
  três contratos assertam a **mesma lista literal**, e o do cron assere que todo produto do catálogo
  tem tradução para a coluna de produto da ANP.
- **Terceira cópia de `drizzle-advisory-lock`** no cron. Aceito por consistência com os trilhos
  existentes; consolidar seria refactor de outra feature.
- **Quinto serviço de cron no deploy.** Cada trilho novo é um serviço a mais para observar. Vale
  registrar no ADR se a contagem justifica um único serviço com `CRON_JOB` por schedule.
