# Feature 147 — A carroceria que ninguém escolheu

## Problema e resultado

A ocupação da viagem e a planta de carga precisam saber quanto cabe no veículo. Quando a ficha não
tem as três medidas nem o m³ digitado, quem responde é `vehicle_volume_references`, procurada por
`(vehicle_type, body_type)`. Hoje metade da frota local não acha linha nenhuma, e a viagem sai sem
ocupação e sem planta.

A causa não é falta de catálogo. **`body_type = '00'` é o valor que ninguém escolheu.** Ele é o
default da coluna (`fleet.schema.ts:181`) e o valor com que o formulário nasce
(`fleetForm.service.ts:56`, `vehicleBrandDefaults.service.ts:38`). O select oferece "00 — Não
aplicável" para qualquer tipo, e o CHECK aceita `00` em toco e truck, que na vida real têm
carroceria. Hoje `00` quer dizer duas coisas diferentes:

- **Cavalo mecânico** (`tractor_unit`): não aplicável de verdade, porque quem tem carroceria é a
  carreta.
- **Truck, toco e os outros tipos que carregam:** "não informado". O caminhão tem baú, sider ou
  carroceria aberta, e o cadastro não diz qual.

O cavalo tem um segundo buraco: **a viagem não sabe qual carreta está atrelada.** `trips` tem um
`vehicle_id` só, `mdfe_manifests` também, e nenhuma tabela liga veículo a veículo.
`resolveVolumeReferenceKey` (`fleet/domain/vehicle-capacity.policy.ts:113`) já decide que a carreta
responde no lugar do cavalo, mas nenhum código de produção a chama. A ocupação
(`trips/infrastructure/trip-occupancy.support.ts:119-124`) monta a chave direto do veículo da
viagem.

**Resultado esperado:** os casos de capacidade desconhecida diminuem sem inventar número.

- Veículo que carrega deixa de nascer com `00`. O formulário pede a carroceria.
- Os cadastros antigos com `00` aparecem nomeados como "carroceria não informada", com o caminho
  até a ficha.
- A viagem com cavalo passa a olhar a carreta (se a decisão Q3 for tomada nesse sentido).

Essa redução é exatamente o que a spec 145 D15 adiou ("carroceria `00`, cavalo sem carreta"). Lá,
capacidade desconhecida faz a API não enfileirar o cálculo da planta. **Esta spec não mexe na D15,
só diminui quantas viagens caem nela.**

## O que foi medido

Banco local, em 2026-09-12, com consulta somente leitura:

| `role`   | `vehicle_type`                                | `body_type` | veículos | com m³ | com as 3 medidas | viagens (abertas) |
| -------- | --------------------------------------------- | ----------- | -------: | -----: | ---------------: | ----------------- |
| traction | toco                                          | 00          |        3 |      0 |                0 | 0                 |
| traction | truck                                         | 00          |        3 |      0 |                0 | 0                 |
| traction | tractor_unit                                  | 00          |        2 |      0 |                0 | 2 (0)             |
| traction | toco, truck, vuc, three_quarter, van, utility | 02          |        6 |      4 |                5 | 31 (1)            |

- **8 de 14** veículos saem com capacidade nula, e todos têm `00`.
- **Os 8 têm marca, modelo e ano vazios** e capacidade em kg redonda (4000/8000/0). Parecem cadastro
  de teste, não frota real. Por isso **a medição de produção é pré-requisito** (T0): sem ela não se
  sabe se o problema existe no cliente.
- **Não há nenhum veículo com `role = 'trailer'`.** A frota local não tem carreta para atrelar.
- `vehicle_volume_references` tem 18 linhas, todas com `body_type` `02` ou `05`:
  - os 7 tipos de tração que carregam;
  - `car`;
  - a carreta `('', 02|05)`, com 14,27 × 2,46 × 2,70 m.
  - Não há linha com `00`, `01`, `03` ou `04`, nem com `tractor_unit` (decisão da spec 093 P4 e da
    migration `20260910120000`).
- **O catálogo não precisa de mais tipos.** O que falta é o veículo dizer a carroceria.

**Produção, em 2026-09-12** (T0, leitura agregada por `railway ssh` no serviço `api`; o banco não
tem endpoint público):

- 1 empresa e **6 veículos**: 3 `utility` e 3 `van`, todos `02`, todos com m³ digitado e com linha
  de referência. **Nenhum `00` e nenhuma carreta.**
- **Zero viagens** nos últimos 60 dias.
- **Conclusão:** hoje o defeito existe só no banco local. A spec continua valendo porque o cadastro
  segue aceitando `00` por padrão, e o primeiro toco ou cavalo cadastrado em produção cai nele. É
  prevenção, não correção: a prioridade é do usuário.

## Contexto histórico que esta spec respeita

- **075:** a capacidade segue ficha medida → `capacity_m3` → referência do tipo, com a origem
  viajando junto. A referência é piso, porque a dispersão dentro do tipo chega a 2×.
- **088 D2:** recusou a referência como **escala** da planta. O motivo: um erro de 2× vira erro de
  metro na tela de quem confere com fita. A **ocupação** pode usar referência.
- **088 critério 7:** `body_type = '00'` sem referência aparece nomeado, nunca some calado. É o que
  `TripCargoPanel.component.tsx:263-271` faz hoje.
- **093:** a ficha nasce preenchida pela sugestão (mesmo modelo → referência do tipo → ausência).
  `tractor_unit` e `other` não inventam número.
- ⚠️ **Divergência encontrada:** o commit `c02325b6` ("a planta desenha com a escala do catálogo,
  dizendo que é do catálogo") derrubou a 088 D2 no código. `toBedDimensions`
  (`trip-occupancy.support.ts:255-263`) devolve as dimensões da referência com
  `source: 'reference'`, e a tela marca `bedFromReference`. Quatro lugares ainda afirmam o
  contrário:
  - `docs/ai-context/api-transportada.md:473`;
  - o fora do escopo da 093;
  - o comentário em `trip-occupancy.support.ts:59-63`;
  - o comentário em `cargo-layout.policy.ts:332`.

  Esta spec **não** reabre a decisão. Ela registra qual das duas vale (Q5) e alinha texto e código.

## Fora do escopo

- Emitir `veicReboque` no MDF-e. O builder (`mdfe-payload.builder.ts`) não emite reboque, e fazê-lo
  é regra fiscal com spec própria. Aqui só se registra o risco.
- Capacidade no roteirizador multi-veículo (`route_suggestion_vehicles`). O solver tem teto de
  volume próprio (spec 140).
- Mudar a D15 da 145 ou o hash de planta da 145 D6. Só se declara a dependência (ver plan.md).
- Catálogo para `tractor_unit` e `other`. Continua sem linha (093 P4).
- Corrigir retroativamente o `tpCar` de MDF-e já emitido com `00`.
- **Medir baú e caixas pela câmera** (pedido do usuário em 2026-09-12). Vira spec própria, com
  estudo de viabilidade: precisão, WebXR/ARCore no PWA e o Safari do iPhone.

## Decisões (fechadas com o usuário em 2026-09-12)

### D1 — `00` só existe no cavalo (Q1)

- Para `tractor_unit`, `00` continua sendo o valor, e o cadastro nem pergunta: o cavalo não tem
  carroceria.
- **Todos os outros tipos** (`motorcycle · car · utility · van · vuc · three_quarter · toco · truck
· other`) e toda carreta (`role = 'trailer'`) são obrigados a escolher. O formulário **não traz
  valor inicial**, e moto e carro estão incluídos, por decisão do usuário.
- A API recusa `00` **em escrita nova** com `FLEET_VEHICLE_BODY_TYPE_REQUIRED` (400), que é
  validação de fronteira.
- **Sem CHECK retroativo no banco:** apertar o CHECK recusaria as linhas que já existem, e a
  migration não é destrutiva.
- Cadastros antigos com `00` num tipo que carrega **não são reescritos**. Escolher `02` por eles
  seria inventar baú.

### D2 — O caso antigo vira pendência, e a ocupação não inventa (Q2)

- Veículo que carrega, com `00` e sem ficha, recebe `capacitySource` ausente e um motivo novo:
  `bodyTypeMissing`.
- O painel de carga diz "carroceria não informada" e leva à ficha **daquele** veículo. Hoje ele diz
  "capacidade desconhecida" e leva à lista da frota.
- A ocupação **não** usa a referência do baú (`02`) como palpite. Um toco de carroceria aberta não
  tem o volume de um toco baú.
- **Página de pendências** (decisão do usuário): uma tela nova, `/pendencias`, que junta "o que o
  cadastro ainda deve". O primeiro tipo de pendência é _veículo sem carroceria_ (qualquer tipo que
  não seja cavalo, com `00`), e cada linha leva à ficha do veículo. A página nasce genérica, com um
  tipo só, para receber outros depois. Ela só mostra pendências que o usuário pode ver
  (`fleet.read`), e corrigir continua sendo `fleet.manage`, na ficha.

### D3 — O vínculo cavalo↔carreta mora nos dois lugares, e o cavalo não carrega sozinho (Q3, Q1b)

- `trips.trailer_vehicle_id`: `uuid` anulável, FK composta `(company_id, trailer_vehicle_id)` →
  `fleet_vehicles(company_id, id)`.
- Só é aceito quando o veículo da viagem é `tractor_unit` e o apontado é `role = 'trailer'` ativo.
- Escrever o vínculo segue `checkTripAcceptsLinkage`: depois de `dispatched`, `409
STATE_TRANSITION_NOT_ALLOWED`, como vincular nota.
- Com a carreta presente, a ocupação passa a usar `resolveVolumeReferenceKey({traction, trailer})`,
  e **a ficha da carreta** (medidas, `capacity_m3`) vence a referência `('', 02|05)`.
- Cavalo sem carreta continua sem capacidade, nomeado como `trailerMissing`.
- **Na frota:** cada cavalo pode ter uma **carreta padrão** (`fleet_vehicles.default_trailer_vehicle_id`,
  anulável, FK composta com `company_id`). Ela só serve de sugestão: a viagem nova de um cavalo
  nasce com a carreta padrão já escolhida. Uma mesma carreta pode ser a padrão de vários cavalos.
- **Na viagem:** a carreta escolhida vence a padrão e pode ser trocada até o despacho.
- **O cavalo não carrega sozinho** (Q1b: "ele não pode carregar apenas com o cavalo"). Viagem de
  cavalo sem carreta pode ser montada e planejada, mas **não despacha**: `409
TRIP_TRAILER_REQUIRED`.
- **Uma carreta por vez** ("pode carregar um por vez"): a mesma carreta não entra em duas viagens
  abertas (nem `completed`, nem `cancelled`). Tentar dá `409 TRIP_TRAILER_IN_USE`.

### D4 — A ocupação sempre passa por `resolveVolumeReferenceKey`

Isso vale independentemente de Q3. Hoje o seam existe e ninguém o usa, e a próxima pessoa que
tocar a ocupação vai reimplementar a chave. Sem carreta, a função devolve a chave do próprio veículo
e o comportamento não muda.

### D5 — Catálogo ganha `01`, `03` e `04` com fonte; `00` nunca (Q4)

- `00` é ausência de informação, e qualquer linha com `00` seria número inventado. Não entra.
- Linhas para `01` (aberta), `03` (granelera) e `04` (porta container) **entram**, por decisão do
  usuário, com a fonte citada na migration, como a 093 fez com a Guia Log.
- Os números **não** são decididos nesta spec. A T-cat (🧠) levanta as fontes e propõe os valores
  (e a altura de carga convencionada da aberta, que não tem teto). A migration **só é escrita depois
  que o usuário aprovar a tabela**.
- Pesquisa preliminar (2026-09-12), insuficiente para decidir:
  - Carroceria aberta: só achei limites legais (14 × 2,6 × 4,4 m), não medida de carga útil
    ([TruckPad](https://www.truckpad.com.br/blog/caminhao-toco-conheca-tudo-sobre-esse-veiculo/)).
  - Granelera: as fontes eram de carreta agrícola, fora do domínio.
  - Porta container: o volume útil é o do contêiner, cerca de 33 m³ no de 20 pés e cerca de 67 m³
    no de 40 pés ([Camp Containers](https://campcontainers.com.br/blog/container-20-pes-ou-40-pes-qual-tamanho-escolher)).
    Falta decidir qual dos dois é a referência.

### D6 — A escala da planta segue o commit `c02325b6` (Q5)

Sem ficha, a planta usa a escala do catálogo, marcada como catálogo (`bedSource: 'reference'`). A
088 D2 fica superada **por escrito**. A doc e os comentários que ainda a repetem são corrigidos na
Fase de documentação. Consequência aceita: as linhas novas da D5 também passam a desenhar planta à
escala do catálogo, sempre marcada.

## Histórias priorizadas

### P1 — Veículo que carrega não nasce com carroceria "não aplicável"

Quem cadastra um toco precisa escolher a carroceria. O select não vem preenchido com `00`, e sem
escolha o formulário não salva. Para cavalo, `00` continua disponível e é o sugerido.

### P2 — O cadastro antigo com `00` diz o que falta

Quem abre uma viagem de um truck cadastrado com `00` lê "carroceria não informada", com link para a
ficha daquele veículo. Escolhida a carroceria, a ocupação passa a sair (pela referência ou pela
ficha) sem outra ação.

### P3 — A viagem de cavalo olha a carreta

Quem monta a viagem com um cavalo recebe a carreta padrão dele já escolhida e pode trocá-la. A
ocupação e a planta passam a ser as da carreta. Sem carreta escolhida, a tela diz "carreta não
informada", e o botão de despachar explica que o cavalo não sai sem carreta.

### P4 — As pendências ficam num lugar só

Quem administra a frota abre `/pendencias` e vê os veículos sem carroceria. Cada linha leva à ficha
do veículo, e a linha some depois que a ficha é salva.

## Requisitos funcionais

- **RF1:** `POST`/`PUT` de veículo recusam `bodyType = '00'` sempre que o veículo não é
  `tractor_unit`, carreta inclusive (D1). Erro `400 FLEET_VEHICLE_BODY_TYPE_REQUIRED`.
- **RF2:** o formulário da frota não traz `bodyType` inicial nesses casos. Para `tractor_unit`, o
  campo não aparece e o valor gravado é `00`. `vehicleBrandDefaults` não propaga `bodyType` por
  herança de marca.
- **RF3:** a ocupação da viagem calcula a chave da referência só por `resolveVolumeReferenceKey`
  (D4).
- **RF4:** a ocupação publica o **motivo** da capacidade ausente:
  - `bodyTypeMissing`: tipo que carrega com `00`;
  - `trailerMissing`: `tractor_unit` sem carreta;
  - `referenceMissing`: tipo sem linha de catálogo, como `other`.

  O painel imprime um texto por motivo e liga à ficha certa.

- **RF5:** `trips.trailer_vehicle_id`, a escrita dele e a leitura no detalhe. A ocupação lê a
  carreta nesta ordem: ficha da carreta → m³ da carreta → referência `('', body)`.
- **RF6:** a documentação viva e os comentários descrevem a regra da D6.
- **RF7:** `fleet_vehicles.default_trailer_vehicle_id`, editável na ficha do cavalo. A viagem nova
  de um cavalo nasce com a carreta padrão preenchida.
- **RF8:** despachar viagem de cavalo sem carreta dá `409 TRIP_TRAILER_REQUIRED`. Carreta já
  presente em outra viagem aberta dá `409 TRIP_TRAILER_IN_USE`.
- **RF9:** `GET /pending-items` devolve as pendências que o chamador pode ver (hoje só o tipo
  `vehicleBodyTypeMissing`, sob `fleet.read`). O frontend ganha a página `/pendencias`.
- **RF10:** migration de dados aditiva com `01`, `03` e `04` no catálogo, com os valores aprovados
  pelo usuário e a fonte citada (D5).

## Requisitos não funcionais

- **Tenant:** a carreta é da mesma empresa por FK composta, e carreta de outra empresa é `404`, não
  `403`. Contrato novo em `test/trip-schema/tenant-safety.contract.ts`.
- **Consulta:** a ocupação continua com uma consulta ao veículo e uma à referência por viagem, e a
  carreta entra no mesmo `select`, sem N+1.
- **Migration:** só aditiva (coluna anulável), com `rollback.sql` ao lado.
- **Nada disso vai para documento fiscal** (RNF herdado da 075).

## Casos extremos e falhas

- Carreta desativada depois de vinculada: a viagem guarda o vínculo, e a ocupação continua lendo a
  ficha dela.
- Trocar o veículo da viagem de cavalo para truck: o vínculo da carreta é limpo na mesma escrita,
  senão fica uma carreta pendurada num truck.
- Carreta com `body_type = '00'`: não pode acontecer em escrita nova (RF1). Se for linha antiga,
  cai em `bodyTypeMissing`, com o nome da carreta.
- Veículo com as três medidas e `00`: a ficha vence. O motivo não aparece, porque a capacidade é
  conhecida.
- MDF-e de toco com `00`: continua emitindo `tpCar 00`. É risco fiscal registrado, não resolvido
  aqui.
- Carreta sem `capacity_kg` preenchido: a coluna é `NOT NULL DEFAULT '0'` — "sem teto" chega a
  `loadTripOccupancy` como zero cru, nunca como `null`; o teto **não herda** o do cavalo, e é só na
  borda de exibição (`resolvePayloadCeiling`/`parseCeiling`) que zero e ausência viram a mesma coisa.

## Testes (segunda revisão, T18)

Cobertura acrescentada em `apps/api-transportada/test/integration/trip-cargo-carrier.integration.ts`,
contra Postgres real (roda com `DRIZZLE_TEST_DATABASE_URL` ou `--env-file ../../.env.test`):
`loadTripOccupancy` lê `maxPayloadKg`/`loadingAccess` da carreta quando ela existe, nunca do cavalo
(achado 5 da revisão); a carreta sem teto conhecido não herda o do cavalo (o valor é o zero cru da
coluna, não `null`, neste nível); `readCargoPreviewContext` só usa a carreta padrão quando ela é
ativa, tem papel de carreta, e não está numa viagem aberta (achado 12); e a criação de viagem nunca
herda uma carreta padrão cujo papel virou tração — estado só alcançável escrevendo direto no banco,
já que a rota de frota nunca aceita um cavalo como carreta padrão (achado 12b).

## Critérios de aceite

1. Criar qualquer veículo que não seja `tractor_unit` (moto, carro e carreta inclusive) com
   `bodyType: '00'` responde `400 FLEET_VEHICLE_BODY_TYPE_REQUIRED`. Com `tractor_unit`, responde
   `201`.
2. O formulário da frota abre sem carroceria para toco e com `00` para cavalo, com contrato em
   `test/fleet/`.
3. `trip-occupancy.support.ts` não monta mais a chave `(vehicleType, bodyType)` à mão. Um contrato
   por texto de fonte cobra que `resolveVolumeReferenceKey` seja o único construtor da chave.
4. Viagem de truck `00` sem ficha: `capacityM3: null` e motivo `bodyTypeMissing`. Depois de trocar
   a ficha para `02`, `capacitySource: 'reference'`.
5. (Q3) Viagem de cavalo com carreta `02` sem ficha: `capacitySource: 'reference'` com a chave
   `('', '02')`. Sem carreta: motivo `trailerMissing`.
6. Os três comentários e a seção da doc listados na divergência dizem a mesma coisa que o código.
7. Nenhuma linha antiga de `fleet_vehicles` muda de `body_type` pela migration.
8. Viagem de cavalo sem carreta: `POST /trips/:id/dispatch` → `409 TRIP_TRAILER_REQUIRED`. A mesma
   carreta em duas viagens abertas → `409 TRIP_TRAILER_IN_USE`.
9. Viagem nova de um cavalo com carreta padrão nasce com `trailer.id` igual à padrão.
10. `GET /pending-items` lista o truck `00` e deixa de listá-lo depois que a ficha é salva com `02`.
    Sem `fleet.read`, a lista vem sem esse tipo.
11. As linhas `01`/`03`/`04` do catálogo citam a fonte no comentário da migration, e nenhum valor
    entra sem aprovação registrada em `evidence.md`.

## Dúvidas

Todas fechadas com o usuário em 2026-09-12. As respostas estão nas decisões D1 a D6:

- **Q1:** todos informam a carroceria, menos o cavalo, que não carrega sozinho.
- **Q2:** os antigos vão para a página de pendências.
- **Q3:** o vínculo fica nos dois lugares, frota e viagem.
- **Q4:** o catálogo ganha `01`, `03` e `04`, com fonte e valores aprovados pelo usuário.
- **Q5:** vale a regra do commit `c02325b6`.

Uma interpretação precisa ser confirmada na revisão: onde fica o bloqueio do cavalo sem carreta. Foi
posto **no despacho**, e não na criação da viagem, para que o planejamento continue possível antes
da escala do engate.

## 🤖 Modelo recomendado

Desenho e decisões: `opus`. Execução: `sonnet`, e a doc em `haiku`. Detalhe por fase em
`tasks.md`.
