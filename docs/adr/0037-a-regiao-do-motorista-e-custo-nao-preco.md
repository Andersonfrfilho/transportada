# ADR 0037 — A região do motorista é custo, e a tabela do cliente é cadastro

- Status: aceito
- Data: 2026-08-20
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

A spec 045 nasceu de um pedido curto: o cadastro de motorista precisa dizer **onde ele roda**, e as
regiões precisam ter **valor**, seguindo a tabela de frete impressa que o cliente usa hoje. A
planilha tem 29 rotas, cada uma com um código (`1.000`, `1.001`, …), um nome, uma zona, a lista de
cidades que atende e seis colunas de valor — uma por porte de veículo.

Duas coisas dessa planilha não são óbvias e decidem o desenho inteiro.

### O número da tabela não é o preço do frete

O valor impresso ao lado de cada rota é **o que a transportadora paga ao motorista ou ao agregado**
por viagem. Não é o que ela cobra do embarcador. Os dois números convivem na mesma operação, andam
juntos e nunca são iguais — a margem é a diferença.

O produto já tem o outro lado do caixa: `freight_rules` e `freight_calculations` decidem quanto o
cliente paga, e o resultado disso vai para o CT-e. Um número de custo entrando por ali viraria
receita sem ninguém decidir isso, e o erro só apareceria numa nota fiscal.

### A tabela é de uma transportadora, não do produto

O TransportAdA é genérico e a distribuição é instalação dedicada ([ADR-0021](0021-one-deployment-per-company.md)).
As 29 rotas são de Ribeirão Preto: elas não valem para a próxima transportadora, e não existe
"tabela padrão" a ser embutida. Seed em `src/` seria o dado de um cliente virando código do produto.

## Decisão

### 1. O valor mora em `freight_region_driver_rates.driver_amount`, e o nome diz de que lado do caixa ele está

Custo por `(empresa, região, classe de veículo)`, em `numeric(19,4)`. Ele **não** entra em
`freight-rules`, em `freight_calculations` nem no payload do CT-e. A separação é por tabela e por
nome, não por convenção de leitura: `driver_amount` não se confunde com tarifa nem por acidente de
autocomplete.

### 2. A zona é acumulativa dentro da família, e isso é regra de domínio, não coluna

`parseRegionCode('1.002')` devolve `{family: '1', zone: 3}`. Quem cobre a zona 3 de uma família cobre
a 1 e a 2 da mesma família; não cobre a 4, nem nada de outra família. A matriz (`0.001`, zona 0)
cobre só a si — ela é a saída, não uma zona.

O banco guarda a zona própria e nada mais; a acumulação vive em
`freight-regions/domain/region-coverage.policy.ts`, pura e sem I/O. Materializar a cobertura em
linhas tornaria toda mudança de zona uma reescrita, e a pergunta "este motorista atende esta cidade"
é barata de calcular.

### 3. A cobertura do motorista mistura granularidade de propósito

Uma lista só, com `scope: 'region'` para a zona inteira e `scope: 'city'` para a cidade solta. Duas
tabelas separadas dariam duas listagens para uma pergunta só, e a pergunta real do operador —
"quem atende Barrinha?" — atravessa as duas.

As duas metades do CHECK são ditas na fronteira HTTP, não só no banco: `city` sem cidade é
`FLEET_DRIVER_REGION_CITY_REQUIRED`, e zona **com** cidade é `FLEET_DRIVER_REGION_CITY_UNEXPECTED`.
Um 500 de constraint violada não diz ao operador o que corrigir.

### 4. A unicidade da cidade carrega `region_id`

`(company_id, region_id, city, state)`, **nunca** `(company_id, city)`. Na planilha real
`BARRINHA/SP` está em `1.000 Barretos Zona 1` e em `5.000 Jaboticabal Zona 1`, com preços
diferentes. A chave estreita é a que parece certa no diagrama e recusa a importação do cliente na
primeira linha.

Consequência aceita: a mesma cidade pode ser atendida por duas rotas, e o produto **não** escolhe
uma. Quem decide qual rota vale numa viagem é quem monta a viagem.

### 5. Célula zerada não vira linha

São 29 × 6 = 174 células e 146 valores; as 28 zeradas ficam de fora, e o parser as descarta
explicitamente. Zero na planilha significa que aquela classe não atende aquela rota — a coluna
UTILITÁRIO é zero em toda rota fora da matriz. Uma linha `0.0000` diria que a transportadora paga
zero por aquela viagem, que é outra afirmação, e é a que apareceria num relatório de custo.

Ausência é a representação de "não atende". O CHECK continua tolerando `0` para a linha escrita à
mão pelo CRUD, porque recusá-la ali obrigaria a apagar em vez de zerar.

### 6. A classe de frete é do veículo que traciona, e o rodado só sugere

`fleet_vehicles.freight_class` sai do catálogo `FREIGHT_VEHICLE_CLASSES`, que é o cabeçalho da
tabela impressa: utilitário, van, VUC, 3/4, toco, truck. Implemento manda `''` — quem puxa frete é o
veículo de tração, e guardar a classe no reboque mentiria na hora de somar.

O tipo de rodado do MDF-e (`tpRod`) **sugere** a classe (`01→truck`, `02→toco`, `04→van`,
`05→utility`) e não a decide: VUC e 3/4 não existem no rodado, e `03` (cavalo mecânico) e `06`
(outros) não nomeiam classe nenhuma. Derivar a classe do rodado em tempo de leitura poria o veículo
na linha errada da tabela sem nunca falhar.

A sugestão corrige a que ela mesma pôs e nunca sobrescreve escolha manual
(`vehicleFreightClass.service.ts`) — senão trocar `01` por `02` deixaria "Truck" num toco, e o valor
pago sairia da linha errada.

### 7. A tabela do cliente entra por rota autenticada, nunca por seed

`POST /freight-regions/import` sob `settings.manage`, com `companyId` vindo do contexto — que é o
que impede a planilha de um cliente cair no ambiente de outro. `scripts/freight-region-import.py`
faz a chamada, com dry-run por padrão.

A reconciliação é por chave natural (o código da rota): reimportar o mesmo arquivo devolve
`{created: 0, updated: 0, deactivated: 0}` e não sobe nem versão. Rota ausente do arquivo vai a
`inactive`, **nunca** é apagada — motoristas estão ligados a ela, e apagar transformaria uma
correção de planilha em perda de cadastro. Arquivo de rotas vazio é recusado
(`FREIGHT_REGION_IMPORT_EMPTY`): ele inativaria a tabela inteira, e o caminho mais provável para um
arquivo vazio é erro de cópia, não decisão.

### 8. Ler região é `fleet.read`; escrever é `settings.manage`

A permissão de leitura desceu de propósito. A cobertura do motorista mora no formulário da frota, e
exigir `settings.manage` para listar deixaria o campo de região em branco justamente para o
`operator`, que é quem cadastra motorista. Escrever na tabela de rotas continua sendo configuração.

## Consequências

- O custo por região existe e é consultável, mas **não é aplicado a nada ainda**: nenhuma viagem lê
  `driver_amount` para pagar ninguém. A 045 entrega o cadastro; usar o número é escopo de outra
  spec, e essa fronteira é deliberada — aplicar sem decidir arredondamento, rota vencedora para
  cidade compartilhada e o que fazer com classe sem valor seria inventar regra de negócio.
- O catálogo de classes é **cópia por valor** entre API e frontend (`freight-class.constant.ts` e
  `freightClass.constant.ts`), como já acontece com `FUEL_TYPES`. As duas apps não importam código
  uma da outra; quem guarda a paridade é contrato de teste.
- A cidade em duas rotas é estado legítimo e permanente. Qualquer feature futura que precise de "a
  rota desta cidade" precisa de um critério de desempate explícito, e não vai encontrá-lo no banco.
- Se a tabela impressa do cliente ganhar uma sétima coluna de porte, ela entra no catálogo de
  classes — que é do produto, não da empresa. Uma classe por transportadora seria outra decisão, e
  esta ADR não a toma.
