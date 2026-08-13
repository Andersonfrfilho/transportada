# 035 — Marca, modelo e eixos no cadastro de veículo

## Problema

O cadastro de veículo (`fleet_vehicles`) guarda placa, RENAVAM, papel, tara, capacidade, rodado,
carroceria, UF e o bloco de proprietário. **Não guarda marca, modelo nem quantidade de eixos.**

Quem opera a frota identifica o veículo pela placa e pelo par marca/modelo — "a Scania R450" é como
o veículo é chamado no pátio, e "MDG-1234" é como ele é chamado no sistema. Sem marca e modelo, a
tela da frota é uma lista de placas, e conferir se o veículo certo foi escalado para a viagem exige
sair do produto.

A quantidade de eixos é o que determina a categoria de pedágio de um conjunto e é insumo de tabela
de frete em boa parte do mercado. Hoje ela não existe em lugar nenhum do sistema — `wheel_type`
(o `tpRod` do MDF-e) diz _tipo de rodado_ (truck, toco, cavalo mecânico), que não é número de eixos.

Três problemas menores aparecem junto, no mesmo formulário:

1. **A consulta por placa já devolve marca, modelo e ano, e nós jogamos os três fora.**
   `vehicle-lookup-payload.policy.ts` normaliza `marca`, `modelo`, `anomodelo` e até o campo
   combinado `"MARCA/MODELO"` que vários provedores mandam num campo só; o frontend descarta os três
   de propósito, em `VEHICLE_LOOKUP_FORM_KEYS`, porque não havia campo onde pousar.
2. **O botão de consulta está depois dos dez campos que ele preencheria.** Em
   `VehicleForm.component.tsx` o `<VehicleIdentityFields>` inteiro vem primeiro e o botão "consultar
   placa" só aparece embaixo. O operador digita a placa no primeiro campo, desce dez campos, aperta
   o botão, e sete deles são reescritos por cima do que ele acabou de digitar. A ordem da tela
   contraria a ordem do trabalho.
3. **Dá para salvar um veículo que não consegue emitir MDF-e.** O `wheel_type` é opcional no
   cadastro, mas o `mdfe-payload.builder.ts` lança `MdfePayloadMissingWheelTypeError` sem ele. O erro
   nasce no cadastro e explode semanas depois, na emissão, com a carga já na rua.

## Objetivo

Marca, modelo e quantidade de eixos passam a ser campos do veículo. Marca e modelo são escolhidos em
lista servida pela nossa API a partir da tabela FIPE, e são pré-preenchidos pela consulta por placa
quando ela responde. O formulário é reorganizado para que a consulta venha antes do trabalho manual,
e não depois. A quantidade de eixos é digitada — nenhuma fonte externa a informa.

## Decisões

1. **A FIPE é consultada ao vivo, e só pela nossa API.** O browser nunca fala com o provedor
   externo: a CSP do frontend recusaria, o cache precisa ser compartilhado entre todos os operadores
   da empresa, e um token futuro do provedor não pode viver no bundle. A porta é
   `FleetVehicleCatalogPort` (`listBrands` / `listModels`), no mesmo desenho de
   `FleetVehicleLookupPort`, que já existe e já é assim.
2. **O vocabulário da FIPE não vaza para fora do gateway.** A rota recebe `role` e `wheelType` — o
   que o nosso domínio já tem — e o gateway traduz para o tipo de veículo do provedor. Rodado `04`
   (VAN) e `05` (utilitário) são automóveis; `01`, `02`, `03` e `06` são caminhões. Se amanhã o
   provedor mudar de nome ou de esquema, muda o adaptador.
3. **Reboque não tem lista, e isso é comportamento declarado.** A FIPE cobre apenas veículo
   motorizado: semirreboque, carreta e implemento (Randon, Facchini, Librelato, Guerra) não existem
   lá. Para `role: 'trailer'` a rota responde lista vazia com um motivo explícito, e o formulário
   degrada para texto livre. Lista vazia sem motivo seria lida como falha, e o operador ficaria
   esperando um carregamento que nunca termina.
4. **A indisponibilidade da FIPE nunca impede cadastrar veículo.** O provedor é gratuito e sem SLA —
   na verificação desta spec o espelho da BrasilAPI respondeu `429` na primeira chamada. Timeout,
   `429` e `5xx` degradam o campo para texto livre com aviso, e o `POST`/`PUT` do veículo não
   consulta a FIPE em momento nenhum: ele aceita o texto que veio. O catálogo é conveniência de
   digitação, não autoridade sobre o dado.
5. **A consulta por placa manda mais que o catálogo.** Marca, modelo e ano vindos da placa são o
   dado mais fiel que temos — vêm do registro do veículo, não de uma escolha em tabela de referência
   — e já chegam normalizados. Eles preenchem o campo; a lista da FIPE serve para quem digita à mão.
6. **Quantidade de eixos é campo nosso, inteiro.** `0` significa "não informado" e é o default, para
   que a coluna nasça sem quebrar os veículos já cadastrados; informado, vale de `2` a `9`. Vale
   para os dois papéis: uma carreta tem eixos tanto quanto um cavalo.
7. **Eixos não vai para o documento fiscal, porque não há onde.** Conferido no
   `@adatechnology/fiscal-provider`: o `veicTracao` expõe `cInt`, `placa`, `RENAVAM`, `tara`,
   `capKG`, `capM3`, `tpProp`, `tpVeic`, `tpRod`, `tpCar` e `UF`, e o pacote não modela `valePed`
   nem `categCombVeic`. O campo do MDF-e que carrega essa informação hoje é o `tpRod`, que já está
   no cadastro. Inventar campo que o layout não tem vira rejeição na SEFAZ.

## Campos novos — o que entra e o que fica de fora

Além dos três pedidos, a varredura do formulário e do payload do MDF-e achou dois campos que se
pagam sozinhos:

| Campo                            | Entra? | Por quê                                                                                                                        |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `brand` — marca                  | ✅     | pedido; a consulta por placa já devolve                                                                                        |
| `model` — modelo                 | ✅     | pedido; a consulta por placa já devolve                                                                                        |
| `axle_count` — eixos             | ✅     | pedido; nenhuma fonte externa informa, é digitado                                                                              |
| `model_year` — ano do modelo     | ✅     | **a consulta já devolve e é descartado.** Custo de digitação zero, e é o que separa duas carretas iguais no pátio              |
| `fleet_number` — número de frota | ✅     | é o `cInt` do `veicTracao`, campo do layout do MDF-e que hoje sai vazio, e é o nome que o veículo tem na operação ("frota 42") |
| chassi                           | ❌     | nenhum documento nosso pede, nenhuma regra lê. Identidade única já é a placa, que tem `unique` por empresa                     |
| cor                              | ❌     | mesma razão; e não sabemos se o provedor de placa devolve — assumir que devolve é adivinhar                                    |
| vencimento de CRLV / seguro      | ❌     | é controle de vencimento, com alerta e histórico próprios. Feature inteira, não campo                                          |
| combustível                      | ❌     | só serviria para categoria de pedágio, que depende da decisão em aberto lá embaixo                                             |

## Comportamento

### Organização do formulário

Hoje são dois `fieldset`: "identidade" com dez campos num grid plano, e "proprietário", condicional.
Passa a haver quatro, na ordem em que o trabalho acontece:

1. **Identificação** — placa **com o botão de consulta ao lado**, RENAVAM, UF, número de frota.
   O botão sobe para junto do campo que ele lê: consulta-se primeiro, digita-se o que sobrou depois.
2. **Modelo** — marca, modelo, ano do modelo, eixos. Os três primeiros costumam vir prontos da
   consulta.
3. **Capacidade e operação** — papel, rodado, carroceria, tara, capacidade em kg, capacidade em m³.
4. **Propriedade** — o select de `ownership` **passa para dentro deste bloco**, encostado no
   `fieldset` de proprietário que ele mesmo mostra e esconde. Hoje ele está no meio do bloco 1, longe
   do efeito que produz.

Nenhum bloco inventa largura ou altura de campo: `--layout-width` e os tokens `--field-*` como
manda `docs/frontend/fields.md`.

### Aviso de campo exigido pelo MDF-e

Veículo de tração sem rodado continua podendo ser salvo — bloquear quebraria o cadastro rápido por
placa, que é o fluxo comum. Mas o formulário passa a dizer, ao lado do campo, que sem ele o veículo
não emite MDF-e; e a listagem marca o veículo como incompleto. O erro passa a aparecer onde tem
conserto.

### Catálogo

- `GET /fleet/vehicle-catalog/brands?role=<papel>&wheelType=<rodado>` — `fleet.read`. Devolve
  `{ items: [{ code, name }], source }`. Para `role: 'trailer'`, `items` vazio e `source: 'none'`.
- `GET /fleet/vehicle-catalog/models?role=&wheelType=&brand=<code>` — `fleet.read`. Mesma forma.
- Resposta cacheada em memória por 24 h (a tabela FIPE muda uma vez por mês). Falha entra em cache
  negativo curto, de 60 s, para que uma indisponibilidade não vire enxurrada de chamadas.
- A capacidade aparece em `FleetCapabilities` como `vehicleCatalog`, no mesmo lugar onde
  `vehicleLookup` já aparece. Sem `FLEET_VEHICLE_CATALOG_URL` configurada, ela é `false` e o
  formulário mostra os campos como texto livre desde o primeiro render — sem piscar.

### Campos de marca e modelo

- **Marca**: select de `@/components/ui/select` alimentado pelo catálogo; aceita valor fora da lista
  quando o catálogo está indisponível ou o papel é `trailer`.
- **Modelo**: select dependente da marca, com a mesma degradação. Trocar a marca limpa o modelo —
  modelo de outra marca é dado errado com cara de certo.
- A consulta por placa preenche marca, modelo e ano, e prevalece sobre o que estiver escolhido.
  Não preenche eixos nem número de frota.

### Listagem da frota

Marca, modelo, ano e eixos entram como colunas da tabela de veículos, ocultáveis e persistidas como
as demais (`docs/frontend/data-tables.md`). Marca e modelo entram visíveis; ano e eixos, ocultos por
padrão.

## Fora de escopo

- **Preço de frete por eixo.** Fica registrado como decisão em aberto abaixo; nada nesta feature lê
  a quantidade de eixos para calcular valor.
- Catálogo editável pelo operador (marcas próprias de implemento cadastradas à mão).
- Qualquer campo novo no XML fiscal — o `cInt` que o `fleet_number` alimenta já existe no layout.
- Os campos recusados na tabela acima.

## Decisão em aberto — frete por eixo

Para a quantidade de eixos alimentar o cálculo de frete falta responder **o que conta como "os eixos
do transporte"**: o conjunto rodoviário tem cavalo mecânico e uma ou duas carretas, cada um com o seu
número, e a tabela de pedágio cobra pela soma do conjunto que efetivamente toca o solo. Enquanto
isso não estiver decidido, implementar é adivinhar.

Isso é uma feature própria, dependente desta: sem a coluna, não há o que somar.

## Critérios de aceite

- [ ] `fleet_vehicles` tem `brand`, `model`, `model_year`, `axle_count` e `fleet_number`, com
      migration e `rollback.sql` escrito à mão ao lado.
- [ ] Contrato de tenant-safety do schema de frota continua verde, incluindo as colunas novas.
- [ ] `GET /fleet/vehicle-catalog/brands` e `/models` respondem com `fleet.read` e recusam sem ela.
- [ ] `role: 'trailer'` responde lista vazia com motivo, e não erro.
- [ ] Timeout, `429` e `5xx` do provedor não derrubam a rota nem impedem salvar o veículo.
- [ ] Salvar veículo nunca chama o provedor externo.
- [ ] A consulta por placa preenche marca, modelo e ano no formulário.
- [ ] Trocar a marca limpa o modelo.
- [ ] O formulário tem os quatro blocos na ordem descrita, com o botão de consulta junto da placa e
      `ownership` no bloco de propriedade.
- [ ] Veículo de tração sem rodado aparece como incompleto no formulário e na listagem.
- [ ] `fleet_number` chega ao `cInt` do `veicTracao` no payload do MDF-e.
- [ ] Nenhum outro campo novo no payload do MDF-e ou do CT-e.
- [ ] `make check` verde.
