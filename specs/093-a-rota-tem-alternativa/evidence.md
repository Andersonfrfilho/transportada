# Evidência — 093

## T5 — O radar com a velocidade permitida (2026-09-07)

### O dado, medido no `.pbf` real

`osmium tags-filter n/highway=speed_camera` sobre `ribeirao.osm.pbf`:

```
radares: 527
com maxspeed: 438 (83%)
valores: 40 (110×), 60 (108×), 110 (61×), 50 (52×), 90 (42×), 80 (30×), 100 (19×), 70 (11×)
outras tags: maxspeed 438, direction 49, maxspeed:hgv 12, ref 9
```

### O overlay reassado, e o que ele passou a carregar

`overlay.yml` ganhou `maxspeed`, `maxspeed_hgv` e `direction`. Reassado **localmente**, pelo caminho
que a evidência da 089b registrou (jar do planetiler extraído por `docker cp`, sem build remoto):

```
planetiler generate-custom --schema=overlay.yml --osm_path=ribeirao.osm.pbf
5 s, 112 kB
```

Metadados do PMTiles gerado:

```
radar -> class, direction, maxspeed, maxspeed_hgv
```

Contagem de feições nas telhas (z ≤ 12), decodificando o MVT:

```
feições radar: 631 | com maxspeed: 522 (82,7%) | com maxspeed:hgv: 12
```

Os 631 contra 527 são a duplicação de borda entre telhas e zooms que a 089b já havia registrado (lá
foram 72 feições para 70 radares). A proporção — **82,7% contra os 83% do `.pbf`** — e os **12 de
`maxspeed:hgv`, idênticos**, são o que prova que o atributo atravessou o pipeline sem perda.

### O estilo

```
bun test test/trip.contract.test.ts        → 445 pass, 0 fail
bun test test/design-system.contract.test.ts → 247 pass, 0 fail
```

Dois contratos novos, sobre as duas regras que a medição impôs:

- **`maxspeed:hgv` vence `maxspeed`** — asserta a ordem dos ramos do `case`, porque em rodovia
  brasileira o limite do caminhão é menor e quem lê este mapa opera frota.
- **Radar sem velocidade fica só com o triângulo** — asserta que o último ramo do `case` é o glifo
  sozinho. São 89 de 527, e imprimir "60" porque é o mais comum seria inventar o número que o
  motorista obedece.

### ⚠️ Ordem invertida, e por quê

Aqui o contrato veio **depois** da implementação, ao contrário da regra da spec. O motivo é que o
estilo referencia campos da telha, e **não havia como contratar um campo antes de provar que o
`generate-custom` o produz**: um contrato escrito primeiro estaria afirmando sobre `maxspeed_hgv` sem
nenhuma evidência de que aquele nome existiria na saída. A ordem foi: medir o `.pbf` → mudar o
schema → reassar → conferir os metadados e contar as feições → só então escrever estilo e contrato.

### O que ficou de fora

- **`direction` está na telha e não é usado pelo estilo.** 49 radares dizem o sentido em que
  fiscalizam, e desenhar isso é decisão de arte (seta? rotação do glifo?) que não foi tomada. O dado
  está lá para quando for.
- **O overlay publicado ainda é o antigo.** Este foi reassado localmente para medir; publicar exige o
  build remoto do `map-tiles`, que é passo de deploy e não desta task.
