# Feature 075 — A carga tem cubagem estimada

## Problema e resultado

A capacidade do veículo é por **cubagem**: 3,5 m³ num Fiorino, 26 num VUC, 115 numa carreta
sider. É assim que a transportadora dimensiona a viagem, e é a conta que o simulador do cliente já
faz hoje, fora do produto.

**A NF-e não traz cubagem nenhuma.** O grupo `<vol>` tem `qVol`, `esp`, `marca`, `nVol`, `pesoL` e
`pesoB` — e `nfe_volumes` guarda exatamente isso: quantidade, espécie, peso bruto, peso líquido.
Nenhuma dimensão, nenhum metro cúbico.

Medido em produção em **2026-09-02**:

```
volumes            1808
com quantidade     1808
com peso           1804
com medida            0
```

Sem o numerador não existe ocupação, não existe mapa de carga e não existe 3D. A conta de "quanto
deste caminhão já está cheio" precisa dos dois lados, e o lado da carga não existe em lugar nenhum.

Ao fim desta feature: a carga de uma nota tem cubagem **estimada e marcada como tal**, o veículo
tem cubagem de referência por tipo, e a viagem mostra quanto da capacidade já foi ocupada — sempre
com a marca de estimativa visível, nunca um número que pareça medido.

## Esta spec é a irmã da 067, e reusa o que ela decidiu

A 067 resolveu o mesmo problema para **massa**: o emitente zerou o `pesoB`, e a saída foi
`quantidade de volumes × peso padrão da empresa`, marcada como estimativa. `resolveCargoWeight`
(`nfe-documents/domain/cargo-weight.policy.ts`) é o desenho a copiar, e a ADR-0052 é a decisão a
respeitar. Em particular:

- **Nulo é estimativa desligada, e é o padrão.** Zero é recusado pelo CHECK — zero declararia que a
  carga não ocupa espaço nenhum.
- **A estimativa entra por volume**, não como total colado na nota, para a soma continuar coerente
  com o `qVol`.
- **Nota sem `qVol` continua sem estimativa.** Sem quantidade não há de onde estimar.
- **A origem viaja com o valor**, e a tela imprime a marca.

⚠️ **Uma assimetria que não pode ser copiada sem pensar.** Para massa existe origem declarada: o
`pesoB` do XML vence a estimativa sempre. **Para cubagem não existe origem declarada alguma** — a
NF-e não tem o campo. Então `declarado` não é um estado alcançável hoje, e a política nasce com
duas origens (`estimated`, ausência), não três. Ver D3.

## Fora do escopo

- **O mapa 3D da carga dentro do baú e a ordem de retirada por parada.** É _bin packing_
  tridimensional com restrição LIFO, e depende de **dimensão por volume** — que nem estimada
  teremos: o fator dá o m³ **total**, não a caixa. O ganho operacional real começa em **2D por
  parada** (que fatia do baú é de cada destino, com cor por parada, na ordem inversa da entrega),
  e isso é spec própria, depois desta de pé.
- **Cubagem no CT-e ou no MDF-e.** O `infQ` transmitido não ganha volume estimado nesta spec:
  a ADR-0052 já pesou o custo de declarar à SEFAZ número que a transportadora calculou, e aquela
  decisão foi tomada para massa, com o gate de emissão como motivo. Aqui não há motivo equivalente.
- **Frete por cubagem.** Cobrar por m³ estimado é a mesma objeção da ADR-0052 §"o peso estimado não
  alimenta o frete": a transportadora não cobra por um número que ela mesma inventou.
- **Alterar o XML preservado.** Sempre imutável.

## Histórias priorizadas

### P1 — A nota tem cubagem estimada

**Given** uma nota com `qVol` preenchido e um fator de cubagem configurado
**When** a cubagem da carga é resolvida
**Then** ela vale `quantidade × fator da espécie`, com origem `estimated`.

### P2 — O veículo tem cubagem de referência

**Given** um veículo cujo `capacity_m3` está zerado
**When** a capacidade é consultada
**Then** vale a referência do tipo dele, marcada como referência — e o valor da ficha vence sempre
que existir.

### P3 — A viagem mostra a ocupação

**Given** uma viagem com notas vinculadas e um veículo
**When** o operador abre o detalhe
**Then** ele vê a ocupação (m³ da carga ÷ capacidade), **com a marca de estimativa ao lado** e sem
número que pareça medido.

### P4 — O tipo de veículo tem desenho

**Given** a ficha da frota ou o seletor de veículo
**When** um tipo é exibido
**Then** ele vem acompanhado da ilustração do tipo, vinda do design system.

## Requisitos funcionais

- **RF1** — Tabela de fator de cubagem **por espécie, por empresa**, com linha de espécie vazia
  como padrão.
- **RF2** — `resolveCargoVolume` em `nfe-documents/domain/`, ao lado de `cargo-weight.policy.ts`,
  devolvendo valor **e origem**, e `null` para ausência — nunca zero.
- **RF3** — A capacidade do veículo é resolvida em três degraus, nesta ordem:
  **dimensões da ficha** (`comprimento × largura × altura`) → **`capacity_m3` da ficha** →
  **referência do tipo**. A origem viaja com o valor, e a tela distingue medida de referência.
- **RF4** — A ocupação da viagem é `soma da cubagem das notas ÷ capacidade do veículo`, e carrega a
  origem da pior parcela: se **qualquer** nota entrou estimada, o total é estimado.
- **RF5** — Ilustração por tipo de veículo em `@/components/ui/icon` — biblioteca de ícones,
  `currentColor`, tamanho por token, `aria-hidden` quando acompanha rótulo (`web.md` §9). Sem emoji.
- **RF6** — Medida é decimal em toda a cadeia; nunca float binário.

## Requisitos não funcionais

- **RNF1** — `companyId` do contexto autenticado, em toda consulta, com contrato negativo de
  isolamento.
- **RNF2** — `VEHICLE_TYPES` é cópia por valor entre API, frontend e worker: a referência de
  cubagem por tipo entra nos **três** contratos de paridade, ou nasce divergente.
- **RNF3** — Nenhum dado pessoal em log.

## Casos extremos e falhas

- **Nota sem `qVol`** — sem estimativa, e a ocupação diz isso em vez de contar zero.
- **Espécie preenchida sem linha na tabela** — cai na linha padrão, nunca em ausência.
- **Fator configurado e `qVol` zero** — ausência, não zero.
- **Veículo sem `capacity_m3` e sem referência para o tipo** — a ocupação não é exibida; um
  denominador ausente não vira 100%.
- **Ocupação acima de 100%** — é exibida como está. Passar do limite é informação operacional, não
  erro a esconder — e com estimativa, é sinal de que o fator precisa de ajuste.
- **Implemento (`vehicle_type` vazio)** — ver D2b.

## Critérios de aceite

- **CA1** — `quantidade × fator` com origem `estimated`. (P1/RF2)
- **CA2** — Sem `qVol`, sem fator, ou fator nulo ⇒ `null`, nunca zero. (RF2)
- **CA3** — Espécie sem linha própria cai no padrão. (Casos extremos)
- **CA4** — `capacity_m3` da ficha vence a referência do tipo. (P2/RF3)
- **CA5** — Uma nota estimada faz o total ser estimado. (RF4)
- **CA6** — A tela imprime a marca de estimativa junto do número. (P3)
- **CA7** — A referência por tipo está nos três contratos de paridade. (RNF2)
- **CA8** — Contrato negativo de isolamento nas consultas novas. (RNF1)
- **CA9** — Nenhum `<svg>` cru fora de `components/ui`; a ilustração sai do `icon`. (RF5)

## Decisões

- **D1 — A chave por espécie nasce atendendo uma linha só, e isso é esperado.**
  Medido: `species` está **vazio em 1808 de 1808** volumes em produção. A Zaragoza não preenche o
  `esp`, então **100% do dado de hoje cai na linha padrão**. A chave por espécie existe para o
  emitente que preencher `esp` — e está escrita aqui para ninguém, ao ver uma tabela de uma linha,
  concluir que o desenho está errado e "simplificar" para um fator único. Simplificar custaria a
  migration de volta no dia em que o primeiro emitente declarar espécie.

- **D2 — A dimensão é o dado primitivo; o m³ é derivado.**
  Pesquisado em 2026-09-02 (frota publicada da Frilog, cruzada com a tabela de capacidade da
  Bsoft), com a aritmética conferida:

  | tipo     | L×A×H (m)       | m³ calculado | m³ publicado | tabela do cliente | razão     |
  | -------- | --------------- | ------------ | ------------ | ----------------- | --------- |
  | Fiorino  | 1,70×1,30×1,40  | 3,09         | 3,09         | 3,5               | 1,13×     |
  | Sprinter | 3,20×1,65×1,90  | 10,03        | 10,03        | 15                | **1,50×** |
  | VUC      | 3,15×1,90×2,20  | 13,17        | 13,16        | 26                | **1,97×** |
  | Toco     | 7,00×2,50×2,40  | 42,00        | 42,00        | 44                | 1,05×     |
  | Truck    | 8,90×2,50×2,40  | 53,40        | 53,40        | 55                | 1,03×     |
  | Carreta  | 14,27×2,46×2,70 | 94,78        | 97,76        | 105               | 1,11×     |

  Três fatos saem daí, e juntos decidem o desenho:
  1. **O m³ publicado erra contra as próprias dimensões** — a carreta destoa 3,1%. Copiar m³ de
     tabela é copiar o erro de quem digitou.
  2. **A dispersão por tipo chega a 2×.** Sprinter e VUC existem em versões muito diferentes
     (entre-eixos longo, baú maior), e é por isso que a tabela do cliente destoa justamente neles.
     Um número por tipo faria a ocupação de um VUC errar pela metade.
  3. **O 3D precisa da dimensão de qualquer forma** (spec 076): não se desenha caixa dentro de um
     número.

  Então `fleet_vehicles` ganha `cargo_length_m`, `cargo_width_m` e `cargo_height_m`, e
  `capacity_m3` passa a ser **derivado** delas quando existirem — a coluna continua, porque veículo
  antigo tem o valor e não tem as medidas. A referência por tipo desce a **último recurso**, e a
  tela diz que é referência, não medida.

- **D2b — A referência por tipo não é indexada por `vehicle_type` sozinho.**
  A tabela do cliente mistura três coisas, e cada uma cai num lugar diferente do nosso modelo:

  | cliente                    | o que é aqui                                                        |
  | -------------------------- | ------------------------------------------------------------------- |
  | Fiorino, Sprinter          | **modelos**, não tipos — mapeiam para `utility` e `van`             |
  | VUC, Toco, Truck           | ✅ batem com `vuc`, `toco`, `truck`                                 |
  | Carreta Baú, Carreta Sider | **implemento**, distinguido por `body_type` (`03` baú / `04` sider) |

  ⚠️ Implemento tem `vehicle_type` **vazio** no nosso modelo: o tipo é de quem traciona
  (`tractor_unit`). A carreta de 105 m³ é a linha do **baú**, não a do cavalo — então a chave é
  **`(vehicle_type, body_type)`**, com `body_type` opcional. `three_quarter` existe no nosso
  catálogo e não está na lista do cliente: entra sem referência, e sem referência a ocupação
  simplesmente não aparece.

  Com a D2, isso perde urgência — a dimensão da ficha resolve o caso normal, e a referência é o
  último degrau. Mas a chave precisa nascer certa: mudá-la depois é migration com dados.

- **D3 — A origem tem dois estados, não três.**
  A 067 tem `xml` e `estimated` porque o `pesoB` existe. **Não há campo de cubagem na NF-e**, então
  `declarado` não é alcançável e não entra no tipo — um estado que nunca ocorre é código morto que
  parece cobertura. Quando existir declaração manual por nota (o caminho que a ADR-0052 descartou
  para massa), ela acrescenta a origem junto com o campo que a produz.

- **D4 — A ilustração é do design system, não do módulo.**
  `web.md` §9 e o contrato `test/design-system/icon.contract.ts`: `<svg>` cru é proibido fora de
  `components/ui/`. O desenho por tipo entra como ícone nomeado, herda `currentColor` e escala pelo
  token — é o que faz ele funcionar em lista, em seletor e em estado desabilitado sem três versões.

- **D5 — O fator padrão é 0,05 m³ por volume.** Decidido em 2026-09-02, e é conhecimento da
  operação: a NF-e não tem de onde derivá-lo. Uma caixa de ~37 cm de lado, coerente com
  distribuição de alimento, e com a média de 20 volumes por nota dá **1 m³ por nota**.

  ⚠️ **Medido no mesmo dia, e não fecha no total do dia.** Um dia normal em produção — 180 notas,
  3.143 volumes — dá **157 m³** a esse fator, contra **38 m³** de toda a frota (seis veículos, de
  3 a 12 m³). São 4,1× a capacidade.

  Por nota o número é sólido; é o dia que não fecha. Ou a frota faz várias viagens por veículo, ou
  parte dessas notas não anda nela (subcontratada, ou com CT-e sem carregamento próprio). Isso
  **não bloqueia esta spec** — a ocupação é por **viagem**, contando só as notas vinculadas, e não
  pelo movimento do dia. Mas fica escrito porque decide como ler a tela: se a viagem típica levar
  poucas notas, a ocupação será baixa e o fator estará confirmado; se estourar 100% com três notas,
  o fator está alto e é aqui que se ajusta.

## Dúvidas

Nenhuma bloqueante. O fator padrão foi respondido: **0,05 m³ por volume** (ver D5, com a
ressalva medida do total do dia).
