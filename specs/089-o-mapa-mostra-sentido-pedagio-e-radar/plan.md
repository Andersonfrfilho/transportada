# Plano — 089

## Onde o trabalho cai

| arquivo                                                                                  | fase  | o quê                                       |
| ---------------------------------------------------------------------------------------- | ----- | ------------------------------------------- |
| `apps/frontend-transportada/src/modules/trip/shared/vectorBasemap.service.ts`            | 1 e 2 | camadas novas no estilo; segunda fonte na 2 |
| `apps/frontend-transportada/test/trip/vector-basemap.contract.ts`                        | 1 e 2 | contratos das camadas                       |
| `apps/frontend-transportada/src/modules/trip/components/AssemblyVectorMap.component.tsx` | 2     | sonda do overlay e degradação               |
| `deploy/map-tiles/Dockerfile`                                                            | 2     | `generate-custom` sobre o mesmo `.osm.pbf`  |
| `deploy/map-tiles/overlay.yml`                                                           | 2     | esquema YAML do radar (novo)                |
| `deploy/map-tiles/server.ts`                                                             | 2     | servir dois arquivos                        |
| `apps/api-transportada/test/deploy/osm-extract.contract.ts`                              | 2     | o contrato de deploy que já existe          |

Um consumidor só usa esse estilo: `AssemblyVectorMap`. Nenhuma outra tela muda.

## Fase 1 — estilo, sem tocar em pipeline

Três camadas, todas sobre a fonte `basemap` que já existe, inseridas **antes** dos pinos da parada na
ordem do estilo.

- `sentido-da-via` — `type: 'symbol'`, `source-layer: 'transportation'`, filtro `['has','oneway']`,
  `symbol-placement: 'line'`, `minzoom` no patamar de conferência de endereço (o nome da rua entra em
  13, o número da porta em 16 — a seta fica em 15, para não disputar com o nome).
  A inversão sai de `['case', ['==', ['get','oneway'], -1], 180, 0]` em `icon-rotate` (sprite) ou de
  `text-rotate` (glifo).
- `via-com-pedagio` — `type: 'line'`, filtro `['has','toll']`, tracejado sobre o traçado da via, na
  cor de rodovia do tema. Tracejado e não cor nova: o alto contraste não colore, e ali a distinção
  precisa sobreviver mesmo assim.
- `cabine-de-pedagio` — `type: 'symbol'`, `source-layer: 'poi'`, filtro
  `['==', ['get','subclass'], 'toll_booth']`.

**Risco conhecido:** o glifo da seta pode não existir na faixa embarcada de `Noto Sans Regular`. A
T101 confere isso contra o arquivo de fonte antes de a T102 escolher o caminho — glifo ausente faz o
MapLibre pedir uma faixa que não existe, e o tratador derruba o mapa inteiro, que é exatamente o
incidente do `glyphs` apontando para lugar nenhum.

## Fase 2 — o overlay do radar

`deploy/map-tiles/overlay.yml`, esquema `generate-custom`:

```yaml
sources:
  osm: { type: osm, local_path: /data/area.osm.pbf }
layers:
  - id: enforcement
    features:
      - source: osm
        geometry: point
        include_when: { highway: speed_camera }
        attributes:
          - { key: class, value: speed_camera }
          - { key: maxspeed, tag_value: maxspeed }
```

O `Dockerfile` roda o `generate-custom` **no mesmo estágio** que já baixou o `.pbf`, antes do `rm` —
baixar o arquivo duas vezes seria minutos de build e centenas de MB por nada.

O `server.ts` passa de um caminho fixo para um mapa de dois, mantendo `Range`, `Cache-Control` e a
recusa de qualquer outro caminho. Overlay ausente **não derruba o boot**: o basemap é o que justifica
o serviço existir, o overlay é acréscimo — e é por isso que a checagem de existência dele não é
`throw`, ao contrário da do `area.pmtiles`.

## Verificação

- Fase 1: `bun run --cwd apps/frontend-transportada test` (contratos) + conferência em staging com
  `VITE_MAP_TILES_URL` apontando para lá, sobre rua de mão única conhecida.
- Fase 2: build da imagem `deploy/map-tiles` (só roda no Railway — o planetiler não cabe no laptop,
  e foi onde a geração local morreu com `No space left on device`), e o mesmo script de medição desta
  spec rodado contra o overlay publicado, esperando 70 radares na região.
- As duas fases fecham com a medição repetida, não com inspeção visual: foi olhar o mapa que produziu
  o "zero pedágio" errado registrado no `spec.md`.
