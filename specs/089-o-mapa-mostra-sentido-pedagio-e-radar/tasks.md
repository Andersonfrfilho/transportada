# Tasks

Fase 0 — a medição que decide o escopo

> 🤖 Modelo: `opus` 🧠 (nada abaixo começa antes; foi ela que partiu a spec em duas)

- [x] T001 🧠 ~~O que já vem nas telhas?~~ — **respondido 2026-09-06**: `oneway`, `toll` e
      `poi/toll_booth` presentes; `speed_camera` ausente, conferido nas 23 telhas que contêm cada um
      dos 70 radares do OSM. Números em `spec.md` § O que foi medido.
- [x] T002 🧠 ~~Perfil customizado ou arquivo separado?~~ — **arquivo separado**: o `generate-custom`
      não estende o perfil OpenMapTiles, e reassar o basemap arriscaria o mapa que hoje funciona.

Fase 1 — o que já está no arquivo

> 🤖 Modelo: `sonnet`

- [x] T100 Contrato: as três camadas existem, o estilo segue válido nos três temas, e a seta inverte
      em `oneway = -1` — `test/trip/vector-basemap.contract.ts` — vermelho antes da T102
- [x] T101 Conferir se a seta cabe num glifo da `Noto Sans Regular` embarcada; se não, `map.addImage`
      — decide o caminho da T102, e o risco está no `plan.md`. **Cabe** — `→` no bloco `8448-8703`.
- [x] T102 Camada `sentido-da-via` a partir do zoom 15, no sentido do traço — `vectorBasemap.service.ts` — T100 verde
- [x] T103 [P] Camada `via-com-pedagio`, tracejada sobre o traçado — `vectorBasemap.service.ts` — contrato
- [x] T104 [P] Camada `cabine-de-pedagio` sobre `poi/toll_booth` — `vectorBasemap.service.ts` — contrato
- [x] T105 Ordem no estilo: as três abaixo dos pinos da parada — `vectorBasemap.service.ts` — contrato de ordem
- [x] T106 Conferência em staging sobre rua de mão única conhecida — evidência com a medição repetida.
      **Rua Duque de Caxias** (centro): 2 feições, `oneway=1`. Cabine real na Rodovia Atílio Balbo:
      2 feições, batendo com os 2 nós `toll_booth` do OSM naquele ponto.

Fase 2 — o overlay do radar

> 🤖 Modelo: `sonnet` (T201 é 🧠 — mexe no build que só roda remoto)

- [x] T200 Contrato: o serviço serve os dois arquivos, recusa qualquer outro caminho e mantém `Range`
      — `test/deploy/` — vermelho antes da T202
- [x] T201 🧠 `deploy/map-tiles/overlay.yml` + `generate-custom` no mesmo estágio do `.pbf` já baixado
      — `deploy/map-tiles/Dockerfile` — build no Railway
- [x] T202 `server.ts` serve dois arquivos; overlay ausente **não** derruba o boot — T200 verde
- [x] T203 Segunda fonte no estilo + camada `radar`, degradando sem o overlay — `vectorBasemap.service.ts` — contrato
- [x] T204 [P] Sonda do overlay no componente, no molde da que já existe — `AssemblyVectorMap.component.tsx` — contrato
- [x] T205 Medição contra o overlay publicado, esperando os 70 radares da região — evidência.
      **72 feições `radar` nas 44 telhas que contêm os 70 radares medidos na Fase 0** — o overlay
      publicado (`23dc92da`, staging) bate. Achado de infraestrutura registrado em `evidence.md`: o
      `map-tiles` de staging tinha a fonte GitHub desconectada, fora do que `.railway/railway.ts`
      já registrava como decidido — reconectada durante esta task.

## Portões

- Teste de contrato **antes** da implementação em toda task que tem par (T100→T102, T200→T202).
- Task só fecha com evidência em `evidence.md`.
- A fase 2 não começa antes de a 1 estar em staging: ela mexe no serviço que serve o basemap, e
  misturar as duas faria um mapa quebrado ter duas causas possíveis.
- Nenhuma fase fecha por inspeção visual — a medição do `spec.md` é repetida e vai para a evidência.
