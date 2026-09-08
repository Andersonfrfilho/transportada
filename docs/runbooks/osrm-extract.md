# Runbook — reconstruir o extract do OSRM

O roteirizador (spec 058, ADR-0044 §2) lê a matriz de estrada de um OSRM que **nós hospedamos**. Ele
não baixa mapa em tempo de execução: sobe já com um `.osrm` pré-processado no volume. Este runbook é
como esse arquivo nasce e como ele é refeito.

Enquanto o extract não existir, o serviço simplesmente não sobe, e a sugestão de roteiro falha com
`ROUTING_MATRIX_UNAVAILABLE` — que é o comportamento correto (ADR-0044 §1), não um defeito.

Você precisa disto quando:

- quer usar o roteirizador pela primeira vez nesta máquina;
- **a operação passou a entregar numa região que o extract atual não cobre** — a matriz responde, mas
  as paradas de fora viram pares inalcançáveis, e a sugestão as separa com aviso;
- o mapa envelheceu a ponto de a rota divergir da rua (uma via nova, um binário que inverteu).

> O mesmo extract alimenta o `.pmtiles` do painel (ADR-0044 §6), e nos serviços implantados os dois
> leem a **mesma** constante `OSM_EXTRACT_URL`. Em produção, refazer é `make map-refresh CONFIRM=1`,
> que reconstrói os dois juntos — mapa e rota descrevendo datas diferentes é a tela e o roteirizador
> discordando de onde a rua está, e isso não dá erro nenhum.

## O que é preciso

- Docker.
- Espaço em disco: **cerca de 10× o tamanho do `.pbf`** durante o processamento. Sudeste inteiro
  (~500 MB de `.pbf`) pede uns 6 GB livres; São Paulo sozinho, bem menos.
- Memória: o `osrm-partition` é a etapa que consome mais. Numa região metropolitana, 4 GB bastam.

## Escolher a área — e escolher pequeno

Os extracts regionais do Geofabrik são a fonte:
`https://download.geofabrik.de/south-america/brazil.html`

**Pegue a menor área que cobre a operação, não o Brasil inteiro.** O país todo processa por horas e
ocupa dezenas de GB para responder sobre ruas onde ninguém entrega. Um estado — ou a região
metropolitana recortada — processa em minutos e responde igual onde importa.

```bash
mkdir -p deploy/osrm/data && cd deploy/osrm/data
curl -O https://download.geofabrik.de/south-america/brazil/sudeste-260903.osm.pbf
```

⚠️ **Use o arquivo datado, nunca `-latest`.** `-latest` não quer dizer "se atualiza": quer dizer
"seja qual for o arquivo do dia em que alguém baixar". Com ele, duas máquinas — ou dois builds da
mesma máquina em semanas diferentes — produzem mapas diferentes, e nada registra qual está rodando.
A data em uso pelos serviços implantados é a constante `OSM_EXTRACT_URL` de `.railway/railway.ts`, e
é dela que este comando deve copiar. O Geofabrik mantém os datados por cerca de 90 dias.

Para recortar uma área menor que o estado, use `osmium extract` com uma bbox antes do passo abaixo.

## Processar

As três etapas do pipeline MLD, em ordem. Cada uma lê a saída da anterior:

```bash
docker run --rm -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend:v6.0.0 \
  osrm-extract -p /opt/car.lua /data/sudeste-latest.osm.pbf
```

```bash
docker run --rm -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend:v6.0.0 \
  osrm-partition /data/sudeste-latest.osrm
```

```bash
docker run --rm -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend:v6.0.0 \
  osrm-customize /data/sudeste-latest.osrm
```

O perfil é `car.lua` porque é o que descreve veículo motorizado em via pública. Existe perfil de
caminhão em fork do OSRM (com restrição de altura, peso e via proibida); ele **não** é o padrão, e
adotá-lo é decisão de produto, não passo de runbook.

## O que o roteiro respeita, e o que ele não sabe

Medido com `osmium` sobre `deploy/osrm/data/ribeirao.osm.pbf` em 2026-09-06, em **487.735** vias com
`highway`:

| sinal                                           | vias marcadas | o roteiro usa?               |
| ----------------------------------------------- | ------------- | ---------------------------- |
| `oneway`                                        | 131.094       | ✅ sim                       |
| restrição de conversão (`type=restriction`)     | 12.313        | ✅ sim                       |
| `hgv`                                           | 244           | ⚠️ só com perfil de caminhão |
| `maxheight`                                     | 200           | ⚠️ idem                      |
| `maxweight`                                     | 105           | ⚠️ idem                      |
| `maxlength`                                     | 5             | ⚠️ idem                      |
| `maxaxleload`                                   | 0             | —                            |
| `motor_vehicle:conditional` · `hgv:conditional` | 0             | ❌ não existe no dado        |
| `maxspeed:conditional`                          | 78            | ❌ o `car.lua` ignora        |

Três conclusões, e elas decidem o que vale a pena tentar:

**Sentido de via e conversão proibida já valem hoje**, e valem bem: 131 mil vias com `oneway` e 12,3
mil relações de restrição. Vale para o traço (`/route`) e para a ordem das paradas, porque o solver
lê `/table` do mesmo grafo direcionado. Conferido medindo ida e volta entre dois pontos do centro de
Ribeirão: 562,9 m contra 649,2 m — a assimetria **é** a mão única.

⚠️ **Restrição de caminhão existe no dado, e é rala demais para confiar.** As quatro chaves somam
**554 vias em 487.735 — 0,11%**. Trocar para um perfil de caminhão é barato (refazer o extract com
outro `-p`, sem fonte de dado nova) e passa a respeitar essas 554; o teto é a cobertura do
mapeamento, não o roteirizador. Quem adotar isso precisa dizer, na tela, que a restrição é **melhor
esforço** — prometer "rota de caminhão" com 0,11% de cobertura é o modo de falha da ADR-0044 §1.

⚠️ **Trânsito e hora do dia não existem aqui, e não é questão de perfil.** O OSRM aceita velocidade
por segmento (`osrm-customize --segment-speed-file`), então o encanamento existe; o que falta é a
**fonte**, que é dado de trânsito ao vivo e é pago. Sem ela a velocidade é a nominal da via, e o
tempo previsto não conhece pico, obra nem acidente. `maxspeed:conditional` (78 vias) é limite que
muda por horário, não trânsito, e o `car.lua` nem o lê.

⚠️ **Rodízio e zona de restrição urbana não estão no dado**: `motor_vehicle:conditional` e
`hgv:conditional` deram **zero**. Não há o que ligar — seria cadastro próprio, com fonte municipal e
manutenção nossa.

`--algorithm mld` no `compose.yaml` tem de casar com `osrm-partition`/`osrm-customize` daqui. Rodar
`osrm-contract` (que é do algoritmo CH) e servir com `mld` faz o container subir e recusar toda
consulta.

## Carregar as praças de pedágio do mesmo `.pbf` (spec 090)

O catálogo de praças sai do **mesmo arquivo** que alimenta o roteirizador — nunca de uma consulta em
tempo de execução. Reconstruiu o extract? recarregue as praças, ou o mapa e a tarifa passam a
descrever regiões diferentes.

```bash
bun run --cwd apps/api-transportada scripts/toll-booth-extract.ts \
  --pbf deploy/osrm/data/<dataset>.osm.pbf --out /tmp/pracas.json
```

Ele imprime as três contagens, e são elas que dizem se o extract cobre a operação:

```
praças              166
com tarifa          163
com tarifa por eixo 162
```

⚠️ **Praça sem `charge` entra com tarifa nula, e isso é de propósito** — ela existe na estrada, e
descartá-la faria a rota parecer sem pedágio ali. ⚠️ E **`0.00` é tarifa declarada em 4 das 166,
nem sempre significando isenção**: duas da SP-291 têm nome de praça de rodovia e zero em tudo, que é
campo não mapeado. Por isso a tela imprime quantas praças estão sem tarifa conhecida ao lado do
total.

O seed é idempotente por `osm_node_id` — rodar duas vezes deixa as mesmas linhas —, e `observed_on`
é a data que **você** informa (`--observed-on`, padrão hoje), não a do arquivo: o extrator não sabe
quando foi rodado, e reajuste de pedágio é anual.

## Reassar o overlay do radar (spec 096)

Mesma regra: o overlay sai do mesmo `.pbf`. Ele carrega `maxspeed`, `maxspeed:hgv` e `direction`, e
**não** precisa de build remoto para ser conferido — o jar do planetiler se extrai uma vez:

```bash
docker create --name planetiler-extract ghcr.io/onthegomap/planetiler:latest
docker cp planetiler-extract:/app ./app && docker rm planetiler-extract

java -cp "app/resources:app/classes:app/libs/*" com.onthegomap.planetiler.Main generate-custom \
  --schema=deploy/map-tiles/overlay.yml --output=overlay.pmtiles --force \
  --osm_path=deploy/osrm/data/<dataset>.osm.pbf
```

⚠️ Exige **Java 21+** (o jar é class file 65). E ⚠️ **sem o `@` no classpath**: `-cp "@caminho"` faz o
Java ler o argumento como argfile e falhar com uma mensagem que não parece ter nada a ver.

Medido em 5 s sobre `ribeirao.osm.pbf`, 112 kB: 527 radares, 438 com velocidade, 12 com limite
próprio de caminhão.

## Apontar o serviço para o dataset

O nome do arquivo, sem `.osrm`, é o que o `compose.yaml` lê:

```bash
# .env
OSRM_DATASET=sudeste-latest
```

`OSRM_MAX_TABLE_SIZE` limita quantos pontos o `/table` aceita numa consulta. O padrão do `compose` é
2000 — bem acima das centenas de paradas do caso real, e é de propósito: o corte por tamanho é do
solver (que trunca por orçamento de tempo), não do transporte.

Suba e confira. O OSRM **não** sobe no `make up`: ele é opt-in por profile, porque exigir centenas
de MB de extract de toda máquina nova (e do CI) seria hostil.

```bash
make routing-up
```

```bash
curl 'http://localhost:53005/table/v1/driving/-46.6565,-23.5613;-46.6333,-23.5505?annotations=duration,distance'
```

Uma resposta com `"code":"Ok"` e duas matrizes 2×2 é o serviço pronto.

## Em staging e production

⚠️ **Este serviço não existia até 2026-09-01.** O runbook descrevia um volume no Railway que nunca
foi provisionado: não havia `deploy/osrm/Dockerfile`, não havia `railway.json` e não havia serviço.
O que segue é o mecanismo real.

O dataset é **assado na imagem** (`deploy/osrm/Dockerfile`), não montado num volume. A razão é que o
`.osrm` é lido na subida e substituí-lo por baixo do processo em execução não recarrega nada — então
**trocar o dataset é deploy** de qualquer jeito, e um volume só acrescentaria o problema de como
empurrar centenas de MB para dentro dele.

O build recebe a área por variável, e ele **falha em voz alta sem ela**:

```
OSRM_PBF_URL=https://download.geofabrik.de/south-america/brazil/sudeste/sao-paulo-latest.osm.pbf
```

Um default silencioso assaria o mapa errado, e mapa errado não erra: ele responde com número
plausível (ver "extract pequeno demais" acima).

Duas armadilhas que só aparecem no deploy:

- **A rede privada do Railway é IPv6.** O `CMD` passa `-i ::`; sem isso o OSRM sobe, responde no
  contêiner e fica inalcançável por `osrm.railway.internal`. É o mesmo motivo do `127.0.0.1` no
  healthcheck do `compose.yaml`.
- **O build roda as três etapas do pipeline MLD**, e o `osrm-partition` é a que consome memória.
  Área grande demais estoura o builder — que é mais um motivo para pegar a menor que cobre a
  operação.

O worker aponta para ele por `ROUTING_MATRIX_URL=http://osrm.railway.internal:${PORT}`. **Sem essa
variável o consumidor de roteiro não sobe** (`route_optimization_consumer_disabled`) e a sugestão
fica na fila em silêncio — sem erro e sem timeout, que é pior que falhar.

Enquanto o dataset novo não sobe, o antigo continua respondendo — o que é o comportamento desejado.
O modo de falha ruim é o serviço subir sem dataset nenhum: aí o healthcheck não passa, e a sugestão
vai a `failed` com `ROUTING_MATRIX_UNAVAILABLE` em vez de responder rota errada (ADR-0044 §1).

## Como saber que o extract está pequeno demais

⚠️ **Corrigido em 2026-08-27, medido contra o serviço** (`worker-transportada/test/osrm-routing-matrix.integration.test.ts`).
Este runbook afirmava que parada fora da área vira par **inalcançável**. **Não vira.** O OSRM
_encaixa_ a coordenada na rua mais próxima que o dataset conhece e devolve a distância entre os
pontos encaixados: uma parada a mil quilômetros da área volta com a distância de uma parada vizinha,
plausível e errada. Medido com a grade sintética — o ponto no meio do Atlântico voltou com a mesma
distância do canto oposto da grade.

Não há aviso, e é por isso que precisa ser procurado ativamente:

- **rota curta demais para o endereço**: a sugestão propõe cinco minutos para uma entrega em outra
  região. O sintoma é o número _baixo_, não o alto;
- **paradas distintas com distâncias idênticas** entre si — o encaixe colapsa coordenadas diferentes
  no mesmo nó da borda do extract.

`radiuses=` no `/table` faria o OSRM recusar o ponto distante em vez de encaixá-lo — mas ele responde
`400` para a **matriz inteira**, derrubando a sugestão por causa de um único endereço fora da área.
Escolher entre "número plausível e errado" e "sugestão inteira falha" é decisão de produto, e está
registrada como risco aberto em `specs/058-o-roteiro-se-sugere-sozinho/tasks.md` — não resolvida
aqui.

## O dataset sintético do E2E

O extract real não cabe no repositório, e sem _algum_ dataset o roteirizador nunca era exercitado
contra o serviço de verdade. `deploy/osrm/fixtures/ribeirao-grid.osm` é uma grade de três por três em
Ribeirão Preto — seis ruas, 2,7 KB — que `make routing-fixture` processa em segundos:

```bash
make routing-fixture
OSRM_DATASET=fixture make routing-up
ROUTING_MATRIX_URL=http://localhost:53005 bun run --cwd apps/worker-transportada test:integration
```

Ela **não** prova qualidade de rota — prova contrato de transporte: formato do `/table`, distância de
rua em vez de linha reta, e o encaixe descrito acima. Sem `ROUTING_MATRIX_URL` os testes pulam.
