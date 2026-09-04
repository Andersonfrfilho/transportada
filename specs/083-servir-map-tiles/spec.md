# Feature 083 — Servir as telhas do mapa (`/map-tiles`)

> Registrada em 2026-09-03. Estado: **pendente** — nenhuma implementação começou.

## Problema e resultado

O mapa de montagem da viagem (`TripAssemblyMap`) pede telhas raster de `/map-tiles/{z}/{x}/{y}.png`
(`tileMap.service.ts`, `TILE_ORIGIN`) — caminho relativo à própria origem, por decisão da ADR-0044
§6: coordenada de parada é dado pessoal e não viaja na URL de um servidor de tiles de terceiro
(`security.md` §1). **Nenhum servidor atende esse caminho hoje**: não há rota na API, não há handler
no `server.ts` do frontend e não há proxy no Vite. Toda telha responde 404.

Desde 2026-09-03 a tela degrada com aviso (sonda `resolveTileAvailability` + contorno do IBGE como
reserva), então isso deixou de parecer defeito — mas o mapa de rua prometido pela ADR continua não
existindo. O resultado desta spec é o endpoint que serve as telhas.

O painel de roteirização tem o irmão vetorial do mesmo problema: `ROUTE_MAP_TILES_PATH`
(`/route-map/area.pmtiles`) também não é servido por ninguém — ali a degradação com motivo já
existia (`routeMapTiles.service.ts`).

## Fora do escopo

- Gerar o `.pmtiles` — já coberto pelo runbook `docs/runbooks/osrm-extract.md` (o mesmo extract OSM
  do OSRM alimenta o arquivo; refez um, considere refazer o outro).
- Tile server clássico (PostGIS + renderizador) — descartado pela ADR-0044 §6: nenhum serviço novo.
- Trocar o desenho de reserva do frontend — ele fica, para ambiente onde o arquivo ainda não foi
  gerado.

## Requisitos funcionais

- `GET /map-tiles/{z}/{x}/{y}.png` servido do nosso domínio, lendo por HTTP Range o PMTiles do
  bucket (MinIO local, bucket do Railway em produção). Decidir onde mora o handler: API
  (`api-transportada`) ou `server.ts` do frontend — a API já tem storage e autenticação; a telha,
  porém, é `<img>` sem header `Authorization`, o que pesa para o `server.ts` ou para rota pública
  com recorte de origem.
- `GET /route-map/area.pmtiles` com suporte a Range, para o painel de roteirização (mapa vetorial).
- Em dev, proxy no `vite.config.ts` para o mesmo destino.
- Arquivo ausente responde 404 limpo — é o que a sonda do frontend espera para degradar.

## Requisitos não funcionais

- Nenhuma coordenada em log (a URL da telha revela a área consultada — `security.md` §1 vale para o
  nosso log também: registrar rota sem `{x}/{y}`).
- Cache: telha é imutável por versão do arquivo — `Cache-Control` longo + `ETag` do PMTiles.
- PMTiles raster exige conversão prévia (o extract gera vetorial); alternativa: servir vetorial e
  desenhar no cliente, o que muda o frontend — decidir na fase de plano.

## Critérios de aceite

- Mapa de montagem com fundo de rua carregando em staging.
- Painel de roteirização com mapa vetorial disponível quando o arquivo existe.
- Sem o arquivo no bucket, as duas telas degradam com aviso (comportamento de hoje preservado).

## Dúvidas

- [NEEDS CLARIFICATION: handler na API ou no server.ts do frontend? A telha é `<img>` sem token.]
- [NEEDS CLARIFICATION: raster no servidor (conversão prévia) ou vetorial no cliente?]
