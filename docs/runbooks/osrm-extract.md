# Runbook — reconstruir o extract do OSRM

O roteirizador (spec 058, ADR-0044 §2) lê a matriz de estrada de um OSRM que **nós hospedamos**. Ele
não baixa mapa em tempo de execução: sobe já com um `.osrm` pré-processado no volume. Este runbook é
como esse arquivo nasce e como ele é refeito.

Você precisa disto quando:

- o ambiente é novo e `deploy/osrm/data/` está vazio (o container sobe e o healthcheck nunca passa);
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

Suba e confira:

```bash
make up
```

```bash
curl 'http://localhost:53005/table/v1/driving/-46.6565,-23.5613;-46.6333,-23.5505?annotations=duration,distance'
```

Uma resposta com `"code":"Ok"` e duas matrizes 2×2 é o serviço pronto.

## Em staging e production

O serviço no Railway usa a mesma imagem e o mesmo dataset, montado num volume. **Trocar o dataset é
deploy**, não configuração em tempo real: o `.osrm` é lido na subida, e substituí-lo por baixo do
processo em execução não recarrega nada.

Enquanto o dataset novo não sobe, o antigo continua respondendo — o que é o comportamento desejado.
O modo de falha ruim é o serviço subir sem dataset nenhum: aí o healthcheck não passa, e a sugestão
vai a `failed` com `ROUTING_MATRIX_UNAVAILABLE` em vez de responder rota errada (ADR-0044 §1).

## Como saber que o extract está pequeno demais

Não é erro, e é justamente por isso que precisa ser procurado: paradas fora da área viram pares
inalcançáveis na matriz, e a sugestão as separa com aviso em vez de falhar. Um aumento de paradas
"inalcançáveis" numa região específica é o sintoma de o extract não cobrir mais a operação —
não de endereço errado.
