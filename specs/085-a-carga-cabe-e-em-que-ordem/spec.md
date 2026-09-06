# Feature 085 — A carga cabe, e em que ordem ela entra

## Problema e resultado

Quem monta a viagem decide na tela **Nova viagem**: escolhe as notas, o veículo e os
motoristas. Nessa tela ele não sabe **se a carga cabe** nem **em que ordem ela entra no
baú** — as duas perguntas que o galpão faz logo em seguida.

O painel do baú da spec 076 já responde as duas, e está no lugar errado: ele vive no
**detalhe da viagem**, depois que ela nasceu. Pior, ele nunca desenha nada nesta base,
porque depende de um fator de cubagem que ninguém configurou — e que, como esta spec
mede, é dispensável para a parte que mais importa.

Ao fim desta feature, a tela Nova viagem mostra a silhueta do veículo escolhido, o baú
dividido em fileiras coloridas por parada na ordem de carregamento, e a carga que
sobrou. E o produto ganha um cadastro de caixa que **melhora sozinho conforme o galpão
mede**, sem exigir cadastro completo para começar a servir.

## O que foi medido

345 XMLs de NF-e reais desta operação (Zaragoza → interior de SP, 2026-08-24),
`~/Downloads/ID1010506_procNFe_parte1`. Todo número abaixo saiu de contagem, não de
estimativa.

| Fato                                | Medição                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Dimensão da caixa na NF-e           | **Não existe.** `<vol>` traz só `qVol`, `pesoL`, `pesoB` em **345 de 345** |
| `esp`, `marca`, `nVol`              | vazios em 345 de 345 — campos que o layout tem e ninguém preenche          |
| `qVol` = soma de `qCom` dos itens   | **345 de 345 (100%)**                                                      |
| Caixas distintas (`cProd` + `uCom`) | 663, em 6.321 volumes                                                      |
| Densidade por volume                | 0,41 a 20,76 kg — **51×** de diferença, mediana 5,97                       |
| GTIN-14 (código da **caixa**)       | 75 de 663 caixas (**11%**)                                                 |
| `cEAN` (código da **unidade**)      | preenchido em 2.775 itens                                                  |

⚠️ **`uCom` não identifica a caixa.** `CX12` cobre **151 produtos diferentes** — de
sachê de 700 g a vidro de 100 ml; `CX24` cobre 90. O código diz **quantas unidades vão
dentro**, nunca o tamanho da caixa. Calibrar por ele produziria um número com cara de
medida e conteúdo de chute.

⚠️ **O código de barras não resolve sozinho.** O que vem em quase toda linha é o
`cEAN` de 13 dígitos, que identifica a **unidade de venda**, não o volume transportado.
O GTIN-14, que identifica a caixa, aparece em **11%** delas.

## A descoberta que ordena o resto

**O fator de cubagem cancela na divisão do baú.** Se o volume de cada parada é
`fator × qVol`, o fator está no numerador e no denominador da fatia. Verificado sobre
uma viagem real de 26 paradas montada com estas notas:

```
f = 0,02  →  10,4%  9,9%  8,8%  7,2%
f = 0,05  →  10,4%  9,9%  8,8%  7,2%
f = 0,20  →  10,4%  9,9%  8,8%  7,2%
```

Disso decorre a espinha desta spec: **dividir o baú entre as paradas não precisa de
calibragem nenhuma**. Só o "quão cheio o caminhão está" precisa.

E confirma que peso não substitui espaço — na mesma viagem, ITUVERAVA é 4,0% do volume
e 0,3% do peso; AMERICO BRASILIENSE é 1,0% do volume e 3,2% do peso.

## Decisões

**D1 — A fatia sai do volume; sem caixa medida, ela sai do `qVol` e não pede
calibragem.** O volume da nota é `Σ (qCom × volume da caixa)`, usando a caixa medida
quando ela existe e um volume de reserva quando não. Com nada medido o reserva é
constante e cancela — a fatia vira a proporção de `qVol`, que é contagem real.

⚠️ **Assim que a primeira caixa é medida, o reserva deixa de cancelar** e passa a
influenciar a fatia. Por isso ele **não é um número digitado**: é a **mediana das
caixas já medidas** daquela empresa. Antes da primeira medição não há reserva, não há
volume absoluto, e a fatia sai do `qVol` puro.

**D2 — Fileiras discretas, não fatia contínua.** O baú é dividido em setores; cada
parada recebe as fileiras que a fatia dela pede. Ninguém lê "37,2% do baú"; lê "três
fileiras". A quebra da carga de uma parada em blocos da **mesma cor** é consequência da
quantização, não regra arbitrária — parada grande ocupa fileiras seguidas, parada
pequena divide uma fileira com a vizinha.

**D3 — 2D, nunca 3D.** O dado por parada é **um número**, e um número mapeia em **um
eixo**: o comprimento, do fundo até a porta. Um desenho 3D exigiria largura e altura por
parada e inventaria dois dos três eixos — precisão falsa num desenho que alguém segue
carregando caminhão de verdade.

**D4 — Não existe plano de estiva caixa a caixa, e não vai existir.** Empilhabilidade,
fragilidade e orientação não estão na NF-e; distribuição por eixo tem multa atrás dela.
Um plano 3% otimista faz as últimas caixas não entrarem, o conferente improvisa, e a
ferramenta perde a autoridade inteira na primeira vez que erra.

**D5 — O cadastro de caixa é progressivo e serve desde a primeira linha.** Não se exige
cadastro completo para começar: cada caixa medida melhora o número, e a ordem em que se
mede é escolhida pelo que mais roda.

Concentração medida, que é o que torna isto viável:

| medir         | cobre               |
| ------------- | ------------------- |
| **12 caixas** | **25% dos volumes** |
| **59 caixas** | **50%**             |
| 206 caixas    | 80%                 |
| 431 caixas    | 95%                 |

**D5.1 — A identidade da caixa é `(emitente, cProd, uCom)`, com o GTIN como alias.** O
`cProd` é o código **do emitente**, então sozinho ele não identifica nada; o par
emitente+código sim. O `uCom` entra na chave porque o mesmo produto vendido em `CX12` e
`CX24` são **duas caixas diferentes**. O GTIN-14, quando vem (11%), é alias global —
medir uma vez serve a qualquer emitente que mande a mesma caixa.

**D5.2 — Onde a medida mora: `@adatechnology/catalog-module`, estendido.**
⚠️ O pacote existe e **não tem dimensão nem peso** — ele modela catálogo **de venda**
(`priceInCents` obrigatório, estoque, seções, publicação na Meta Commerce). Duas coisas
decorrem disso:

- Dimensão e peso **são dado legítimo de catálogo** — um e-commerce precisa deles para
  cotar frete —, então acrescentá-los ao pacote serve o quickcart também, não é enxerto
  para atender a transportadora.
- `priceInCents` **obrigatório** é o obstáculo: a transportadora não vende a mercadoria
  do cliente, e escrever `0` seria mentir no campo. Torná-lo opcional é mudança no
  contrato de um pacote consumido por três produtos, e por isso é **decisão de ADR**,
  não escolha desta spec.

O que **não** sobe para o pacote: o par `(emitente, cProd, uCom)`. O código interno do
emitente é dado da relação de transporte, não do catálogo — ele vive em transportada,
apontando para a linha do catálogo.

**D6 — Peso é marca, nunca posição.** A fileira pesada ganha um sinal e o painel avisa
concentração ("70% do peso nas duas fileiras da porta"). É alerta, não instrução.

**D7 — Por onde o veículo carrega é campo da ficha, não dedução do tipo.** Fiorino abre
só atrás e van costuma abrir atrás e na lateral — mas **a mesma Sprinter existe com e
sem porta lateral**. Deduzir do `vehicle_type` erraria justamente no veículo que foge do
estereótipo, que é o caso que faz alguém parar de confiar na tela. O `body_type`
(`tpCar` do MDF-e) semeia o valor inicial na migration: `05` sider abre a lateral, `02`
baú não.

**D8 — A origem viaja junto do número, sempre.** `measured` (todas as caixas medidas),
`partial` (algumas), `estimated` (nenhuma, só `qVol`). É a regra da ADR-0044 §1 e a
mesma que o peso já segue: número plausível sem aviso é o modo de falha.

## Fora do escopo

- Plano de estiva caixa a caixa e qualquer desenho 3D (D3, D4).
- Distribuição de peso por eixo, e qualquer afirmação sobre limite legal.
- Consulta a base externa de GTIN (GS1) para buscar medida.
- Cadastro de produto do emitente — só a **caixa** se mede, e só a que roda.
- Paletização. Se a operação virar paletizada, a unidade muda e é spec nova.

## Requisitos funcionais

### R1 — Cadastro de caixa

No pacote (`catalog-contracts` + `catalog-module`):

- `lengthMm`, `widthMm`, `heightMm` e `grossWeightGrams`, todos opcionais e inteiros —
  milímetro e grama evitam decimal binário em medida, como centavo já faz com dinheiro.
- Volume é **derivado** das três medidas, nunca digitado: m³ solto abre a porta para
  discordar das próprias medidas.
- CHECK de faixa (dedo no teclado: caixa de 15 m).

Em transportada:

- Tabela `nfe_package_boxes`: `(company_id, emitter_tax_id, product_code,
commercial_unit)` único, apontando para o produto do catálogo, mais `carton_gtin`
  opcional para o casamento global.
- A linha nasce **sozinha na importação da NF-e**, sem medida — o cadastro se popula com
  o que roda, e medir é preencher o que já está lá, nunca cadastrar do zero.
- `GET`/`PUT` sob `settings.manage`, escopo `company`.

### R2 — A fila de medição

Tela própria (aba **Cubagem**, em Notas), porque a medida é preenchida **à mão** e a
página é o instrumento de trabalho de quem vai medir — não um formulário de configuração
que se abre uma vez.

**A lista é das caixas que ainda não têm medida**, ordenada pelo volume que cada uma
transporta. Ela responde três perguntas, nessa ordem:

1. **O que medir agora.** A primeira da lista é a que mais roda. Nesta base:
   `MOLHO PREDIL SAC 300G` em `CX32`, 586 volumes — sozinha, 9,3% de tudo.
2. **Quanto isso rende.** Cada linha traz o quanto ela cobre e o **acumulado**, para a
   décima segunda linha dizer "até aqui, 25%".
3. **Onde parar.** ⚠️ A cauda é longa e o desenho tem de dizer isso: 12 caixas cobrem
   25%, 59 cobrem 50%, mas as últimas **232 caixas valem 15%**. Uma lista de 663 linhas
   sem esse sinal convida a medir tudo, e medir tudo não é o objetivo — é o desperdício.

Cada linha mostra o que a NF-e já sabe: descrição, emitente, embalagem (`uCom`), código
de barras quando veio, volumes transportados e em quantas notas. E os três campos de
medida, preenchíveis na própria linha; o m³ aparece calculado ao lado, nunca digitado.

Filtro por **pendentes · medidas · todas**, com pendentes como padrão — a tela existe
para o que falta.

### R2.1 — Quem mede é o conferente, com o celular na mão

A medição acontece no galpão, com fita métrica numa mão e telefone na outra. A tela é
**mobile-first de verdade**, não desktop encolhido: alvo de toque de 44px (`web.md` §10),
teclado numérico nos três campos, e o m³ calculado à vista enquanto se digita.

O caminho principal é **ler o código de barras da caixa**, não procurar numa lista de 663
linhas. O leitor já existe: `@/components/ui/barcode-scanner` (ADR-0042), o mesmo que o
separador usa para bipar nota, com `BarcodeDetector` no Android e o decodificador em
worker no iPhone. A câmera já está liberada para a própria origem
(`Permissions-Policy: camera=(self)`).

⚠️ **O código impresso na caixa não é o que guardamos.** A caixa traz o GTIN-14 (ITF-14)
e o que a NF-e nos deu na maioria dos itens é o GTIN-13 **da unidade**. Medido: o GTIN-14
**reduz ao GTIN-13 em 90%** dos casos — tira-se o indicador de agrupamento e o dígito
verificador, recalcula-se o DV:

```
27896096013546  ->  7896096013542   CHANTY MIX AMELIA 200ML
17896028014491  ->  7896028014494   LEITE COCO MENINA 200ML
```

Casar só pelo código lido, sem essa redução, faria a leitura falhar na maioria das caixas
e o conferente concluir que o leitor não presta. A busca por texto continua ao lado, para
os 10% e para caixa sem código.

⚠️ **Código lido que não está em nota nenhuma não vira cadastro.** A tela avisa
("esta caixa não aparece em nenhuma nota importada") em vez de criar linha: medir o que
não se transporta é trabalho jogado fora, e o cadastro existe para se popular do que roda.

Depois de gravar, a tela volta ao leitor — quem está medindo mede várias seguidas, e
voltar para a lista a cada caixa dobra o tempo do trabalho.

### R2.2 — A permissão é nova, e isso não é detalhe

⚠️ Quem tem a fita métrica é o **separador**, e ele tem exatamente quatro permissões:
`invoices.read`, `fleet.read`, `trip.read`, `trip.manage`. A fila de medição está sob
`settings.manage` — dar isso a ele entregaria de carona preço de combustível, perfis
fiscais, tabela de frete e a busca automática de notas.

É o mesmo caso que criou `trip.manage`: _"as rotas de escrita da viagem pediam
`fleet.manage` — quem montava a viagem ganhava de carona o cadastro da frota inteira"_.
Então nasce **`cargo.measure`**, concedida a `separator`, `operator` e `admin`, e é ela
que guarda a fila e o `PUT` da medida. `settings.manage` continua guardando o fator de
reserva, que é configuração.

`test/separator-role.contract.test.ts` lista as rotas alcançáveis por extenso: as duas
novas entram lá por decisão escrita.

No topo, a cobertura: **"38% dos volumes desta base já têm caixa medida"**. É o número
que diz se a feature está ganhando terreno, e é o mesmo que a origem `partial`/`measured`
publica nas telas de viagem.

⚠️ Uma linha é uma **caixa**, não um produto: o mesmo item vendido em `CX12` e `CX24` são
duas medidas diferentes e aparecem separados. A tela diz isso no cabeçalho, senão parece
duplicata.

### R3 — Volume da nota

`resolveCargoVolume` passa a somar por item (`qCom × volume da caixa`), com o volume de
reserva (mediana das medidas da empresa) para item sem caixa medida, devolvendo o total
e a origem (D8). Sem nenhuma medida, devolve `null` para o absoluto e a contagem de
`qVol` para a proporção.

### R4 — Fileiras

`resolveCargoLayout` devolve **fileiras**, não fatias contínuas: cada fileira aponta a
parada dona, e uma parada pode aparecer em fileiras não contíguas com a mesma cor.
`overflowM3` continua fora do baú. Parada sem volume continua nomeada à parte.

### R5 — A ordem de carregamento lê a porta

`fleet_vehicles.loading_access` (`rear` · `rear_and_side` · `open`), semeado do
`body_type`, editável na ficha. Com `rear`, LIFO estrito como hoje. Com
`rear_and_side`, a ordem continua sugerida mas o desenho marca as fileiras alcançáveis
pela lateral. Com `open`, a ordem deixa de ser recomendação e o painel diz isso.

### R6 — Prévia na tela Nova viagem

`POST /trips/cargo-preview` (`trip.manage`), nos moldes de `/trips/valuation-preview`:
recebe `nfeDocumentIds` e `vehicleId`, devolve ocupação, fileiras e alerta de peso, sem
viagem existir. As paradas saem do mesmo `buildStopAddressKey` que o vínculo usa.

### R7 — Silhueta

O caminhão genérico dá lugar ao ícone do tipo do veículo escolhido (`VEHICLE_TYPE_ICONS`,
já existente), no painel da Nova viagem e no do detalhe.

## Casos extremos e falhas

- **Nenhuma caixa medida** — o mais comum hoje: fileiras saem do `qVol`, ocupação
  absoluta não aparece, e o painel diz por quê, com atalho para a aba Cubagem.
- **Uma caixa medida** — o reserva passa a existir (mediana de uma), a fatia passa a
  depender dele, e a origem vira `partial`.
- **Veículo sem `capacity_m3`** — sem denominador não há ocupação; as fileiras continuam,
  porque a proporção entre paradas não depende da capacidade.
- **Carga acima da capacidade** — o excedente é desenhado **fora** do baú, nunca
  comprimido para caber.
- **Nota sem `qVol`** (1 em 345 sem `pesoB`; prever o análogo) — parada nomeada à parte.
- **Caixa medida com dimensão absurda** (dedo no teclado: 15 m) — CHECK de faixa no banco.

## Critérios de aceite

1. Com zero caixas medidas, a Nova viagem desenha as fileiras a partir do `qVol` e
   **não** mostra percentual de ocupação — mostra o convite a medir.
2. As fatias não mudam quando o volume de reserva muda, enquanto nada estiver medido.
3. Medir uma caixa muda a origem para `partial` e o painel diz isso.
4. Parada grande aparece em fileiras seguidas da mesma cor; parada pequena divide fileira.
5. Veículo `rear_and_side` marca as fileiras de acesso lateral; `rear` mantém o LIFO.
6. A fila de medição abre nas **pendentes**, ordenadas por volume transportado, com
   acumulado e com o aviso de onde a cauda deixa de compensar.
7. Medir uma caixa na fila a tira das pendentes e move a cobertura do topo.
8. Ler o GTIN-14 da caixa acha o produto cujo cadastro só tem o GTIN-13 da unidade.
9. Código lido fora de qualquer nota avisa, e não cria linha.
10. O separador alcança a fila de medição e **não** alcança nenhuma outra rota de
    `settings.manage`.
11. Nenhuma superfície publica volume sem a origem ao lado.
12. `make check` verde; contratos novos em API e frontend.

## Dúvidas

- [NEEDS CLARIFICATION: quantas fileiras tem o baú no desenho? Fixo (12) ou derivado do
  comprimento do veículo — que hoje está `0,000` em todos os veículos cadastrados?]
  **Fechada em 2026-09-05 pela ADR-0062 — a medida mora em transportada.** O `catalog-module` não é
  alterado nem consumido: ele é catálogo **de venda**, e a caixa que medimos é produto de **outra**
  empresa, sob o código dela. Reverter é derrubar uma tabela.
  **Fechada em 2026-09-05 — a operação é caixa a caixa.** A unidade transportada é a
  **embalagem de papelão em que os produtos vêm**, confirmado pelo operador. Isso bate com
  o que o dado já dizia: `qVol` = Σ `qCom` em 345/345, e `qCom` é contado em `CX24`, `FD6`,
  `FR12` — cada volume **é** uma caixa de papelão.

Consequências, todas mantendo o desenho de pé:

- D2 (fileiras) e D3 (2D) ficam como estão. Paletização mudaria a unidade e o teto de
  precisão; não é o caso.
- O que se mede é a caixa **por fora** — é o lado de fora que ocupa espaço no baú. Numa
  medição manual feita por várias pessoas, metade medindo por dentro produz dado
  sistematicamente errado sem ninguém notar, então a tela diz isso no campo.
