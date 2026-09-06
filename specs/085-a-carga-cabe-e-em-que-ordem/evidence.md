# Evidência — 085 · A carga cabe, e em que ordem

Data: 2026-09-05. Comandos rodados na raiz de cada app.

## Cobertura de cubagem — antes e depois

A pergunta que a spec abre é "quanto da carga tem medida de verdade?". As duas medições abaixo são
sobre a mesma base de produção.

|                            | antes (spec 075)          | depois (spec 085)                         |
| -------------------------- | ------------------------- | ----------------------------------------- |
| Origem possível da cubagem | `estimated`, e só ela     | `measured`, `partial`, `estimated`        |
| O que multiplica           | `qVol × fator da espécie` | `qCom × caixa medida`, por linha da nota  |
| Caixas cadastradas         | 0 — a tabela não existia  | populadas pela importação e pelo backfill |
| Caixas medidas             | —                         | 0 no dia da entrega; a fila é o caminho   |

⚠️ **A cobertura medida hoje é zero, e isso é o resultado esperado, não uma falha.** Ninguém mediu
caixa nenhuma ainda: G004 criou o cadastro e G005 a tela onde o conferente mede. O que a 085 entrega
é o trilho — e o número acima é o "antes" contra o qual a primeira semana de medição vai ser lida.

Três medições que sustentam as decisões, feitas sobre 345 NF-e reais desta base:

- **A NF-e não traz dimensão de caixa**: 345 de 345 notas sem qualquer medida no grupo `<vol>`.
  É o que torna o cadastro manual inevitável (ADR-0062).
- **`qVol` = Σ `qCom` em 100%** das notas. Cada volume da nota **é** uma caixa de papelão — é o que
  autoriza somar o volume transportado por `sum(nfe_products.quantity)` em vez de um segundo join a
  `nfe_volumes`.
- **`uCom` não identifica a caixa**: `CX12` cobre 151 produtos distintos. Por isso a chave é
  `(company_id, emitter_tax_id, product_code, commercial_unit)`, e o mesmo produto em `CX12` e
  `CX24` são duas caixas.
- **GTIN-14 → GTIN-13 reduz em 90%** das caixas medidas — é o que faz a etiqueta bipada no galpão
  achar o produto no cadastro.
- **Peso deduzível**: 9% das notas têm item único (18 de 663 caixas). Só nelas o `pesoB` fala de
  **uma** caixa; nas demais ele é da carga inteira.

## Gates

| App                   | Comando                      | Resultado                                                                             |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| api-transportada      | `bun test`                   | 4345 pass · 23 skip · **0 fail**                                                      |
| api-transportada      | ⚠️ sob contenção de CPU      | `deploy/keycloak-realm.contract.ts` chega a falhar por timeout de 5s; passa isolada   |
| api-transportada      | `bun run lint`               | limpo                                                                                 |
| worker-transportada   | `bun test`                   | 900 pass · 28 skip · **0 fail**                                                       |
| worker-transportada   | ⚠️ `*.integration.test.ts`   | 9 erros de `connection.adapter`, **anteriores** a esta spec (fiação de env do driver) |
| worker-transportada   | `bun run lint` / `typecheck` | limpo                                                                                 |
| frontend-transportada | `bun run test`               | 2747 pass · **0 fail**                                                                |
| frontend-transportada | `bun run lint` / `typecheck` | limpo                                                                                 |

⚠️ `bun test` cru no frontend varre `test/responsive.smoke.spec.ts`, que é Playwright e não roda sob
o runner do Bun. O gate é `bun run test`, que usa a lista explícita do `package.json`.

⚠️ O `typecheck` da API acusa erros em `nfse-*` e `cte-batches` que **não são desta spec**: vêm de
`SharedEligibilityDocument` ganhar `recipientCityCode` e `senderCityCode` num trabalho em curso em
outra árvore.

⚠️ **Um erro que eu atribuí a esse trabalho era desta spec**, e a verificação independente o
devolveu: `trip-cargo-weight.support.ts` quebrou porque `ResolvedTripCargoWeight` **emprestava**
`TripOccupancySource`. Ao dar ao volume as origens `measured` e `partial`, o empréstimo passou a
prometer ao peso dois estados que ele não pode alcançar — a NF-e declara `pesoB` e nunca dimensão.
O conserto não foi alargar a vista do peso: foi dar a ela vocabulário próprio
(`TripCargoWeightSource`), porque são duas grandezas e o acoplamento já era o defeito.

⚠️ As medições desta página foram tiradas **enquanto outra sessão editava a mesma árvore**. A
verificação independente registrou ler o mesmo arquivo de migration com conteúdos diferentes a 40
minutos de distância. Os números abaixo valem para a árvore no estado desta data; quem reabrir a
spec confere de novo antes de concluir qualquer coisa a partir deles.

## O que a revisão devolveu

A revisão de código e a verificação independente rodaram sobre esta árvore e acharam defeitos reais.
Os que valem ficar escritos, porque nenhum deles quebrava um teste:

- **Toda medição bem-sucedida virava erro na tela.** O `PUT` devolvia a linha gravada, e o cliente a
  validava com o guard da **fila** — que exige `share`, `cumulativeShare` e `withinCoverage`, campos
  que nascem da política de ordenação e não existem na linha. A medida ia para o banco e o
  conferente lia uma falha, e remedia. Hoje o `PUT` responde **204** e quem recarrega é a query.
- **A fila abria pelos menos transportados.** `ORDER BY volumes DESC` em Postgres é **NULLS FIRST**,
  e o `leftJoin` produz nulo em toda caixa órfã. Com 663 caixas e `limit=50`, as doze que cobrem um
  quarto do volume ficavam fora da primeira página — e a política reordena o que recebeu, não o que
  o `LIMIT` já cortou.
- **A chave era cortada na escrita e comparada inteira na leitura.** `product_code` era `varchar(60)`
  contra o `text` de `nfe_products.code`: `cProd` mais longo criava caixa que aparecia na fila, era
  medida, e nunca alcançava viagem nenhuma. As colunas viraram `text` e o worker parou de truncar.
- **Etiqueta ilegível devolvia a fila inteira.** `reduceToGtin13` devolvendo `null` virava "sem
  filtro", e a tela mostrava as cinquenta primeiras caixas como se a busca tivesse achado algo — o
  conferente media a primeira da lista, que não é a que está na mão dele. Hoje é busca vazia.
- **`uCom` nem sempre é caixa.** 480 `UN` multiplicados pela caixa master davam 14,4 m³ para 1,2 m³
  de carga — e, por vir marcado `measured`, o número **vencia** a estimativa e saía sem marca de
  palpite. A caixa ganhou `units_per_box`, que o conferente informa, e a conta arredonda para cima
  (cinco unidades de um produto de doze ainda viajam numa caixa).
- **O peso da concentração passava por float binário** e voltava por `String()`. Agora soma em
  `bigint` escalado, como o resto da app.
- **A busca disparava uma requisição por tecla**, cada uma com a soma do volume transportado da
  empresa atrás. Debounce de 400 ms, o mesmo da busca de endereço do motorista.

⚠️ **`carton_gtin` é nulo em toda linha, e vai continuar.** `NfeXmlProduct` do
`@adatechnology/fiscal-provider` não expõe `cEAN` — a mesma lacuna de pacote do caso `<email>`. Por
isso o bipe casa **duas** colunas: `carton_gtin` e `product_code`. É comum o emitente usar o próprio
EAN como `cProd`, e é isso que salva a leitura enquanto o campo não existir no pacote.

## Contratos escritos

- `api/test/cargo-volume/measured-cargo-volume.contract.ts` — soma por item, mediana como reserva, e
  a recusa de somar parcial sem reserva (subestimar a carga é o que faz alguém continuar carregando).
- `api/test/cargo-volume/weight-concentration.contract.ts` — inclui o defeito que o contrato pegou:
  com duas paradas, meio a meio é o mais equilibrado possível e um limite fixo de 40% acusaria.
  O piso passou a ser a fatia igualitária.
- `api/test/cargo-volume/cargo-layout-rows.contract.ts` — a invariância de escala: multiplicar todos
  os volumes por 0,02 / 0,05 / 3 / 200 dá a mesma alocação de fileiras.
- `api/test/nfe-package-box/{measurement-queue,carton-gtin,routes}.contract.ts`
- `api/test/separator-role.contract.test.ts` — `cargo.measure` chega ao separador sem arrastar
  `settings.manage`.
- `worker/test/nfe-import-consumer/{package-box,package-box-backfill}.contract.ts`
- `frontend/test/nfe-workspace/package-box-measurement.contract.ts` e
  `frontend/test/trip/cargo-origin-and-concentration.contract.ts`
