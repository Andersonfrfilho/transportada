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

> O mesmo extract alimenta o `.pmtiles` do painel (ADR-0044 §6). Refez um, considere refazer o outro
> — eles descrevendo mapas de datas diferentes é como o mapa e a rota discordarem na tela.

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
curl -O https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf
```

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

`--algorithm mld` no `compose.yaml` tem de casar com `osrm-partition`/`osrm-customize` daqui. Rodar
`osrm-contract` (que é do algoritmo CH) e servir com `mld` faz o container subir e recusar toda
consulta.

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
