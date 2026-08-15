# Feature 038 — Custo por quilômetro derivado do preço do combustível

> Nasce de uma pergunta do operador durante a 035: _"custo por quilômetro não deve ser preenchido,
> deve ser automático do sistema, não?"_ Deve. Ele é o único campo de custo que hoje é chute
> digitado à mão, e o número vai direto para a formação do preço do frete.

## Problema

O cadastro de veículo tem seis campos de custo. Cinco são fatos que alguém tem no papel — valor de
aquisição, prestação, IPVA, seguro, consumo médio. O sexto, **custo por quilômetro**, não é fato de
lugar nenhum: é uma conta. E ele está lá como `<input>` de quatro casas decimais para a pessoa
adivinhar.

O produto já sabe fazer isso com o outro campo derivado. `monthlyFixedCost` **não existe como
coluna**: é `prestação + (IPVA + seguro) ÷ 12`, calculado pela mesma regra em dois lugares
(`api-transportada/src/fleet/domain/vehicle-cost.policy.ts:29` e
`frontend-transportada/src/modules/fleet/shared/fleetVehicleCost.service.ts:71`) e servido pelo
mapper. O resumo de custos da tela mostra os dois lado a lado — um calculado, o outro digitado.

O que falta para calcular R$/km é **o preço do combustível**. Ele não existe em nenhuma das quatro
apps:

```
$ rg -n 'fuelPrice|fuel_price|dieselPrice|precoCombustivel' apps/
(nenhum resultado)
```

Sem essa entrada, `costPerKilometer = preço do combustível ÷ consumo` não fecha, e é por isso que o
campo continua sendo digitado.

## Objetivo

Trazer o preço do combustível para dentro do produto com uma **referência pública semanal da ANP por
UF**, deixar a empresa sobrescrever esse valor, e transformar `costPerKilometer` em campo derivado e
somente-leitura — igual ao `monthlyFixedCost`.

## Fora do escopo

- **Série histórica navegável.** Guarda-se a última semana publicada por UF/produto; não há tela de
  histórico de preço nem gráfico.
- **Preço por posto ou por município.** A granularidade é UF, que é a do endereço fiscal da empresa.
- **Recalcular frete já calculado.** `freight-calculations` congela o que usou; mudança de preço do
  combustível vale para cálculo novo.
- **Pedágio e motorista.** São custo de viagem, não de veículo: dependem da rota e da jornada, não do
  quilômetro rodado por aquele cavalo. Entram no cálculo de frete, não no cadastro da frota.
- **Custo fixo mensal rateado por km.** Ratear prestação e IPVA por quilômetro exige uma quilometragem
  mensal prevista, que ninguém informa hoje. `monthlyFixedCost` continua sendo mensal.
- **Catálogo de custos por rubrica.** É **um** campo só, "outros custos por km", onde cabe manutenção,
  pneu e o que mais a transportadora contabilize. Discriminar rubrica é outra feature, com tabela
  própria — e só vale a pena quando alguém for usar a discriminação para decidir algo.

## Histórias priorizadas

### P1 — O operador vê o R$/km sem digitar nada

**Given** um veículo com combustível **diesel S-10** e consumo médio informado (12,00 km/l), e a
empresa em SP com referência ANP da semana **When** o operador abre o cadastro do veículo **Then** o
resumo de custos mostra o custo por quilômetro calculado, **qual combustível e qual preço do litro**
entraram na conta, a data da referência usada e a origem (ANP ou ajuste da empresa), e **não existe
campo editável de custo por quilômetro na tela**.

**Given** dois veículos na mesma empresa, um a diesel S-10 e outro a etanol hidratado **When** os
dois resumos são montados **Then** cada um usa o preço do **seu** combustível na UF da empresa — a
referência é por produto, não uma só para a frota inteira.

### P1 — A empresa corrige o preço que ela realmente paga

**Given** a referência ANP do diesel S-10 em SP em R$ 6,1230/l **When** o operador informa R$ 5,4800
nas configurações da empresa **Then** todo veículo **a diesel S-10** passa a usar 5,4800, a origem
daquele combustível passa a `manual`, a referência da ANP continua visível ao lado como comparação, e
os veículos de outro combustível não são afetados — o ajuste é por produto, porque o desconto de
contrato que a transportadora tem no diesel não é o que ela paga no etanol.

**Given** um preço manual informado **When** o operador limpa o ajuste daquele combustível **Then** o
valor volta a seguir a referência da ANP automaticamente, sem novo cadastro.

### P1 — O operador soma os outros custos ao R$/km, se quiser

**Given** um veículo com R$/km derivado de combustível **When** o operador informa R$ 0,5000/km em
"outros custos por quilômetro" **Then** o R$/km passa a ser a soma das duas parcelas, e o resumo
mostra **a composição** — quanto veio do combustível e quanto veio dos outros custos.

**Given** o campo em branco **When** o resumo é montado **Then** o R$/km é o de combustível puro, sem
parcela zerada aparecendo na composição — campo em branco é ausência, não zero.

### P2 — A referência se atualiza sozinha toda semana

**Given** o job semanal habilitado **When** a ANP publica o levantamento da semana **Then** o ciclo
grava a média por UF do diesel S-10 e o R$/km derivado de todo veículo acompanha, sem ninguém tocar
na tela.

**Given** a ANP indisponível ou com arquivo em formato inesperado **When** o ciclo roda **Then** ele
falha registrando a causa e **a referência anterior continua valendo** — nenhum R$/km vira zero por
causa de uma coleta que não voltou.

### P3 — Veículo sem consumo informado não inventa número

**Given** um veículo com consumo médio zerado **When** o resumo é montado **Then** o custo por
quilômetro aparece como não informado, do mesmo jeito que o custo fixo mensal aparece quando as três
entradas dele estão zeradas.

## Requisitos funcionais

1. Uma tabela de **referência de preço** guarda, por `(produto, uf, semana de referência)`, a média
   publicada pela ANP, a data de coleta e a origem do arquivo. É dado público de mercado, **não é
   dado de empresa**: não tem `company_id` e não tem PII.
2. Existe um **catálogo fechado de combustíveis** compartilhado pelas quatro apps — `diesel-s10`,
   `diesel-s500`, `gasolina-comum`, `etanol-hidratado`, `gnv` — em `varchar`, nunca enum nativo. É
   catálogo, não tabela: são os produtos que a ANP publica semanalmente e que uma frota rodoviária
   usa. **Cada entrada declara a unidade em que é vendida** — litro para os quatro líquidos, metro
   cúbico para o GNV —, e é dela que saem os rótulos de tela: "R$/litro" e "km/l" para um veículo a
   diesel, "R$/m³" e "km/m³" para um a gás. A unidade é atributo do combustível; nenhum rótulo do
   produto escreve "litro" literal.
3. Um **job one-shot semanal** em `cron-transportada` (`CRON_JOB=fuel.price.pull`) baixa a série da
   ANP, agrega por UF **e por produto do catálogo**, e grava uma referência por combinação.
   Reexecutar na mesma semana é no-op — a chave natural `(produto, uf, semana)` é única.
4. O veículo declara **qual combustível ele usa** — `fuelType`, obrigatório, do catálogo. É o campo
   que liga o veículo à referência de preço; sem ele o R$/km não teria de qual preço partir.
5. A empresa tem um **preço efetivo por unidade, por combustível**, com duas origens: `anp` (segue a
   referência daquele produto na UF do endereço fiscal) ou `manual` (valor informado pelo operador
   para aquele produto, que prevalece). O ajuste de um combustível não alcança os outros.
6. `GET /company-settings/fuel-prices` lista os cinco; `PUT` e `DELETE` em
   `/company-settings/fuel-prices/{produto}` sobrescrevem e removem o ajuste daquele produto. Tudo
   sob `settings.manage`, escopo `company` — a mesma forma de
   `/company-settings/scheduled-distribution`.
7. `costPerKilometer` **sai do corpo de requisição** de criação e atualização de veículo e passa a
   ser campo de resposta derivado, calculado por `deriveCostPerKilometer` no domínio e espelhado à
   mão no frontend, como já acontece com `deriveMonthlyFixedCost`.
8. O veículo ganha **um custo opcional por quilômetro** — `otherCostsPerKilometer`, "outros custos por
   km" — em `numeric(19,4)`, com o mesmo tratamento dos outros campos opcionais de custo: em branco
   vale `0.0000` e significa não informado, nunca zero de verdade.
9. A fórmula é `preço efetivo do combustível do veículo ÷ consumo médio` **mais** outros custos por
   km, escala 4, meio-para-cima, com a divisão arredondada antes da soma. As duas grandezas estão na
   mesma unidade por construção — R$/unidade e km/unidade, a unidade sendo a do combustível do
   veículo —, então a conta é a mesma para diesel e para gás. Sem consumo e sem outros custos, o
   resultado é não informado.
10. O resumo mostra **a composição do R$/km** — combustível e outros custos como parcelas —, e parcela
    não informada não aparece. Um número que não se explica não é usado para precificar.
11. O `<input>` de custo por quilômetro **total** sai de `VehicleCostFields.component.tsx`; entram no
    lugar o select de combustível e o campo de outros custos. O resumo passa a mostrar, além do
    valor, **qual combustível, de onde veio o preço e de que semana**. O rótulo do consumo médio
    acompanha o combustível escolhido, em vez de dizer "km/l" para todo mundo.
12. A UF usada é a do perfil fiscal da empresa, resolvida no servidor. Nunca vem do cliente.

## Requisitos não funcionais

- O job não sobe sem a configuração dele: o bloco de env da ANP é resolvido **somente** quando
  `CRON_JOB` é `fuel.price.pull`, como o bloco de NFS-e faz hoje. O deploy dos outros jobs não passa
  por ali.
- Nenhuma dependência nova. A série da ANP é consumida em CSV; o resumo semanal é XLSX e exigiria um
  leitor de planilha só para isso.
- Dinheiro em `numeric`/`Decimal` nos dois lados, nunca float binário.
- A referência é **imutável por semana**: coleta nova não reescreve semana já gravada.
- O serviço novo é interno (`*.railway.internal`), sem domínio público, e entra na tabela de build de
  `docs/spec/railway.md` — sem isso `test/deploy/service-naming.contract.ts` reprova o pipeline.

## Casos extremos e falhas

| Situação                                     | Comportamento                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| ANP fora do ar ou 5xx                        | ciclo falha com código 1, referência anterior intacta                              |
| Arquivo com cabeçalho diferente do esperado  | ciclo falha na validação Zod da fronteira, sem gravar linha parcial                |
| UF da empresa sem linha na referência        | preço efetivo fica não informado; R$/km aparece como não informado, não como zero  |
| Combustível do veículo sem linha naquela UF  | só aquele veículo fica sem parcela de combustível; os outros seguem normais        |
| Empresa sem perfil fiscal completo (sem UF)  | mesmo caminho: não informado                                                       |
| Ajuste manual só no diesel                   | veículo a etanol continua na referência da ANP; origens convivem na mesma frota    |
| Consumo médio zerado, sem outros custos      | R$/km não informado                                                                |
| Consumo zerado, mas outros custos informados | R$/km é só a parcela de outros custos; combustível fica fora da composição         |
| Outros custos informados sem preço na semana | mesma coisa: soma o que existe, omite a parcela que não existe                     |
| Veículo a GNV                                | preço em R$/m³ e consumo em km/m³; a tela troca os dois rótulos, a conta é a mesma |
| Preço manual em zero                         | é ausência de ajuste, não preço zero — cai de volta na referência                  |
| Duas instâncias do cron na mesma janela      | advisory lock de sessão; quem não pega o lock é no-op limpo                        |
| Semana já coletada                           | no-op pela unicidade da chave natural                                              |

## Critérios de aceite

- [ ] Nenhum `<input>` de custo por quilômetro **total** em `src/**/*.tsx`, garantido por contrato; o
      campo de outros custos existe e é opcional.
- [ ] `costPerKilometer` rejeitado no corpo de `POST`/`PUT` de veículo (`strict()` já reprova campo
      desconhecido) e presente na resposta; `otherCostsPerKilometer` e `fuelType` aceitos no corpo e
      persistidos, com `fuelType` fora do catálogo recusado em `400`.
- [ ] Select de combustível na tela vindo de `@/components/ui/select` — `<select>` nativo é reprovado
      por contrato —, e o resumo nomeia o combustível que entrou na conta.
- [ ] `deriveCostPerKilometer` com o mesmo resultado nas duas implementações para a mesma entrada,
      incluindo arredondamento na quarta casa e a composição parcela a parcela.
- [ ] `GET /company-settings/fuel-prices` devolve os cinco produtos, cada um com origem, unidade,
      valor efetivo, referência e data; ajuste em um produto não altera os outros.
- [ ] Nenhum rótulo de tela com "litro" ou "km/l" escrito literalmente onde o combustível é variável:
      a unidade sai do catálogo, e um veículo a GNV mostra "R$/m³" e "km/m³".
- [ ] Contrato de isolamento: o preço efetivo de uma empresa não vaza para outra; a tabela de
      referência é lida por todas e não tem `company_id` — e isso é assertado de propósito.
- [ ] Migration com `rollback.sql` guardado, diretório na lista literal de
      `test/database-migration/static-migration.contract.ts`; o `drop column` de
      `cost_per_kilometer` é o **único** passo destrutivo, e está isolado dele.
- [ ] `cron-fuel` declarado na tabela de build e em `INTERNAL_SERVICES`, com o contrato de nome de
      serviço verde.
- [ ] `make check` verde nas quatro apps.

## Decisões fechadas

Decisões do dono do produto em 14/08/2026.

- **O R$/km não é só combustível, e o que entra é um campo só.** Um custo opcional por quilômetro,
  `other_costs_per_kilometer`, onde cabe manutenção, pneu e o que mais a transportadora contabilize —
  não duas colunas nomeadas, como cheguei a escrever. O resumo passa a mostrar a composição; sem ela
  o operador vê um número maior e não sabe de onde veio, que é o que faz a conta ser abandonada.
- **`fleet_vehicles.cost_per_kilometer` é removida agora**, contra a minha recomendação de
  expansão/contração. É o único passo destrutivo da migration e ele é assumido de olho aberto: o
  `rollback.sql` devolve a coluna, **não os valores**. O que se perde é chute digitado à mão, que é
  justamente o que a feature substitui.
- **A coluna nova não é a antiga renomeada.** `cost_per_kilometer` guardava o R$/km **total**, com o
  combustível dentro; herdar aquele valor como "outros custos" somaria o combustível duas vezes, em
  silêncio, em todo veículo já cadastrado. Por isso: `drop` de uma, `add` da outra.
- **O veículo declara o combustível dele**, o que estava fora do escopo até aqui. Deixa de existir "a
  frota roda diesel S-10" como suposição do código: vira campo obrigatório do catálogo, e a
  referência de preço passa a ser lida por `(produto, uf, semana)` — a chave já era essa, só não
  tinha quem a usasse por veículo. Consequência que não é óbvia: o **ajuste manual da empresa também
  vira por combustível**, senão o desconto de contrato do diesel apareceria como preço do etanol.
- **GNV entra no catálogo**, revertendo a exclusão que eu tinha escrito. O motivo que eu dei para
  deixá-lo fora — preço em metro cúbico contra um campo rotulado litro — não é motivo para excluir o
  combustível, é motivo para **a unidade virar atributo do catálogo**. É mais barato fazer isso agora,
  com a tabela ainda inexistente, do que descobrir depois que `price_per_litre` guarda R$/m³ para uma
  linha em cinco. A ANP publica GNV na mesma pesquisa semanal, então a referência sai de graça.
- **O combustível é escolhido pelo operador, não buscado.** Nenhuma fonte pública sabe responder: a
  BrasilAPI que já usamos para marca e modelo devolve só `{nome, valor}` e `{modelo, valor}`, sem o
  campo `combustivel` — ele vive no endpoint de preço, que pede um `codigoFipe` que a listagem de
  modelos não entrega. E ainda que entregasse, o vocabulário da FIPE é o de fábrica (Gasolina, Álcool,
  Diesel): ele não separa S-10 de S-500, que é escolha de bomba e não atributo do veículo, e não
  enxerga kit de GNV, que é conversão de oficina — justamente o caso que acabou de entrar no catálogo.

Uma escolha que eu fiz sozinho ao escrever isto, dita em voz alta porque muda dado de cliente:

- **Veículo já cadastrado nasce `diesel-s10`** no `default` da coluna. É o único ponto onde a
  migration chuta, e é chute assumido: a alternativa — coluna anulável — deixaria toda a frota
  existente sem R$/km até alguém editar veículo por veículo, que é o oposto do que a feature promete.
  O chute está na tela, a um select de ser corrigido.

## Dúvidas

- [NEEDS CLARIFICATION: qual a janela do CronJob semanal — a ANP publica na sexta-feira; rodar
  sábado de manhã, ou domingo? Não é bloqueante para o código, é valor de `schedule` no deploy, mas
  precisa ser escolhido antes de subir o serviço.]
