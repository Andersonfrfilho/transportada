# Evidência — 075

## Fase A — A cubagem da nota (T002–T005, 2026-09-02)

**T002** `test/cargo-volume/cargo-volume.contract.ts`, escrito primeiro e falhando
(`Cannot find module cargo-volume.policy`). Sete casos: `quantidade × fator` com origem
`estimated`; **a origem tem um valor só** (afirmado por `Object.values`, para o dia em que alguém
acrescentar `declarado` sem o campo que o produz); sem fator ⇒ `null`; sem quantidade ⇒ `null`;
quantidade zero ⇒ `null`; fator zero ⇒ `null`; um volume vale um fator; e a multiplicação em
decimal sem erro binário.

**T003** `src/nfe-documents/domain/cargo-volume.policy.ts`, espelhando `cargo-weight.policy.ts` —
escala em `bigint`, `divideHalfUp`, `formatScaledDecimal`. Escala 6, contra 4 do peso: 0,05 m³
precisa de casas que o peso não precisa.

**T004** `drizzle/20260902140000_cargo_volume_factors/`, com `rollback.sql`.

⚠️ Dois tropeços, os dois de paridade — e os dois pegos por contrato que já existia:

1. `test/database-migration/static-migration.contract.ts` lista os diretórios de migration **por
   extenso**. O meu não estava lá, e o contrato reprovou. É exatamente o padrão que a skill
   `contrato-de-paridade` descreve.
2. O `rollback.sql` apagava a linha do journal por `hash`; a coluna é `name`. As migrations vizinhas
   ainda conferem `ROW_COUNT = 1` e levantam exceção se não for — copiei isso também, porque um
   rollback que apaga zero linhas silenciosamente deixa a migration marcada como aplicada sobre uma
   tabela que não existe mais.

```
make migration-test   90 pass · 0 fail   (aplica, restringe, volta e reaplica)
```

**T005** Porta, repositório, três casos de uso e rotas em `settings.manage` / escopo `company`,
ligados no `main.ts`. `PUT`/`GET`/`DELETE` em `/company-settings/cargo-volume-factors`.

**Desligar é apagar a linha, nunca gravar zero** — o CHECK do banco recusa zero, e o schema Zod
recusa antes. É a mesma decisão da ADR-0052 para massa, com uma diferença: lá o nulo mora na
coluna; aqui mora na **ausência da linha**, porque a chave é composta com a espécie.

Contrato de isolamento em `test/cargo-volume/tenant-safety.contract.ts`: `company_id` obrigatório
com FK restritiva, **chave `(company_id, species)`** — fosse só `species`, o `onConflictDoUpdate` de
uma empresa sobrescreveria o fator da outra —, CHECK presente, e varredura por texto de fonte
afirmando que toda consulta filtra por empresa.

```
bun test ./test/cargo-volume.contract.test.ts   11 pass · 0 fail
bun test (API)                                  3926 pass · 23 skip · 0 fail
```

---

## Fase B — A capacidade do veículo (T006–T008, 2026-09-02)

**T006** Contrato de `resolveVehicleCapacity`, falhando antes: dimensões vencem e o m³ sai delas;
sem dimensões vale o `capacity_m3` da ficha; sem os dois cai na referência; sem os três é `null`;
dimensão pela metade não estima; dimensão zerada é ausência de medida, não baú de volume zero.

**T007 (🧠)** Migration com as três colunas de dimensão em `fleet_vehicles` e
`vehicle_volume_references` — chave `(vehicle_type, body_type)`, **sem `company_id`**, semeada com
as dimensões pesquisadas.

⚠️ **A spec estava errada sobre o `body_type`, e o código me corrigiu antes de virar SQL.** Eu havia
escrito baú `03` e sider `04`; a tabela `tpCar` do MDF-e, em `fleet.schema.ts`, diz
`02 fechada/baú` e `05 sider` — `03` é **granelera** e `04` é **porta container**. Com os códigos
errados, a carreta buscaria a linha errada e os seis veículos de produção, todos `02`, não achariam
referência nenhuma. Corrigido nas duas specs (075 e 076).

O teste que a task 🧠 exigia está em `resolveVolumeReferenceKey`: cavalo mecânico com carreta
acoplada, e quem responde é a **carreta** — `('', '02')` ou `('', '05')`. O implemento tem
`vehicle_type` vazio porque o tipo pertence a quem traciona; indexar por `vehicle_type` sozinho
faria o cavalo responder pela capacidade de uma carga que ele não leva.

**T008 — a task virou outra.** Ela pedia paridade nos "três contratos de `VEHICLE_TYPES`". Duas
coisas falsas: o worker **não tem** `VEHICLE_TYPES` (a cópia em três apps é do `FUEL_TYPES`), e a
referência é **dado de servidor** que o frontend não carrega. O contrato que de fato faltava é o de
**cobertura do catálogo** — tipo sem linha e sem estar nomeado como exceção faz a ocupação sumir
para aquele veículo, sem erro. As cinco exceções estão por extenso e são conferidas contra a
semente da migration.

⚠️ Dois contratos existentes me pararam, os dois listando coisas por extenso, os dois certos: os
diretórios de migration e as colunas de `fleet_vehicles`.

```
make migration-test   90 pass · 0 fail
bun test (API)        3941 pass · 0 fail
```

## Fase C — A ocupação na viagem (T009–T011)

**T009/T010** `resolveTripOccupancy` e `loadTripOccupancy`, em três consultas — veículo, fatores da
empresa e volumes das notas. Nunca uma por nota: o detalhe da viagem já é a tela mais pesada do
módulo, e o N+1 multiplicaria por vinte.

Decisões que o contrato trava: **uma nota estimada torna o total estimado** (quem carrega decide
pelo pior caso); denominador ausente é `null`, **nunca 100% nem zero**; viagem sem nota é 0% de
verdade; nota sem cubagem é contada à parte e não somada como zero; estouro acima de 100% sai como
está.

⚠️ **A chave `occupancy` quase quebrou a tela.** O guard do frontend usa `hasExactKeys`: campo novo
no corpo da API sem estar declarado em `TRIP_DETAIL_KEYS` reprova a validação inteira e o detalhe
da viagem para de abrir. As duas pontas foram ligadas no mesmo passo.

**T011** `test/trip/occupancy.contract.ts`, sete casos — o contrato **de tela**, que existe porque o
defeito não aparece em teste de domínio: a política sabe que o valor é estimado e a interface pode
imprimir o número sem dizer. Ele exige a marca, **proíbe segunda condição escondendo-a** (um `&&` a
mais — permissão, aba, tamanho de tela — é como ela desaparece), exige a distinção entre capacidade
medida e referência, e afirma que o painel está montado no detalhe — senão o contrato protegeria
código morto.

```
bun run test (frontend)   2255 pass · 0 fail
bun test (API)            3950 pass · 0 fail
```

---

## Fase D — O desenho do veículo (T012–T013)

Dez ícones em `components/ui/icon.tsx`, um por tipo do catálogo, em silhueta lateral com as
distinções que a operação usa: comprimento do baú, cabine destacada e número de eixos — o toco tem
dois, o truck tem três, e é isso que os separa no olho. O cavalo mecânico tem quinta roda e **não
tem baú**, porque quem traciona não carrega.

`VEHICLE_TYPE_ICONS` é `Record<VehicleType, IconName>`: **tipo novo no catálogo não compila sem
desenho**. Mas o contrato cobre o que o tipo não alcança — nome mapeado **sem caminho** no
`icon.tsx` renderiza um SVG vazio, que some da tela sem erro nenhum — e afirma também que nenhum
tipo divide desenho com outro: dois tipos com o mesmo ícone não são ilustração, são ruído.

⚠️ **O contrato do design system me pegou pelo comentário.** Escrevi na tela um comentário dizendo
"nunca `<svg>` no módulo", e `test/design-system/icon.contract.ts` varre por `<svg` em texto de
fonte — a menção literal reprovou junto com o que ela proibia. Reescrito sem a string.

```
bun run test (frontend)   2260 pass · 0 fail
```

⚠️ **O build pegou o que os testes não pegam.** `TripOccupancy.component.tsx` importava
`./TripDetail.module.css`, que eu supus e não existe — o módulo é `../styles/trip.module.css`. Teste
de contrato não resolve CSS; só `vite build` reprovou.
