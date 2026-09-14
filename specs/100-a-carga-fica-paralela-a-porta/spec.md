# Feature 100 — A carga fica paralela à porta

> Registrada em 2026-09-08, a partir de crítica do usuário olhando a planta da carga em `/trips`,
> logo depois de a 099 entrar. ⚠️ **Não implementada** — esta spec é anterior ao código, como o
> processo desta base manda, e ao contrário da 099.

## Problema

A 099 pôs a carga encostada na porta e resolveu o defeito que ela mirava. Ela não mexeu no **eixo**
das fatias, que continua sendo a profundidade: a parada 1 na porta, a 2 atrás dela, a 3 atrás da 2.

O usuário abriu a viagem de três paradas e apontou o que isso custa:

> se caso acontecer um problema na primeira ele deve ter de remover toda a primeira para acessar a
> segunda, e se der problema na 1 e na 2 precisa remover as duas para chegar a 3

O arranjo em profundidade só funciona enquanto **nada foge da ordem**. Cliente fechado, recusa de
mercadoria, endereço trocado, entrega remarcada por telefone no meio da rota — em qualquer um desses
a carga da parada seguinte está atrás de uma parede de caixas que não vão sair ali.

Medido na viagem real que gerou a crítica (`RTF7L01`, Fiorino, baú de 1,70 × 1,45 × 1,30 m):

| parada | notas                                             | faixa hoje    | acessível pela porta |
| -----: | ------------------------------------------------- | ------------- | -------------------- |
|      1 | 883599 · ECONÔMICO SUPERMERCADOS · AVENIDA 07     | 1,37 a 1,63 m | sim                  |
|      2 | 883598 · ECONÔMICO SUPERMERCADOS · AVENIDA 04     | 1,00 a 1,37 m | **não**              |
|      3 | 883605 · VICENTE SOBRINHO MAISZENA · ROD. PAOLINO | 0,63 a 1,00 m | **não**              |

Num baú de 1,70 m as três caberiam **lado a lado**, cada uma encostando na porta.

## Resultado esperado

Faixas paralelas à porta sempre que couberem: cada parada ocupa uma faixa ao longo da largura, e
todas tocam a porta. Onde não couberem, o arranjo continua o de hoje — e a tela diz qual dos dois
está desenhado.

## Decisões

### D1 — Faixa é a fatia em profundidade com o baú girado 90°

Empacotar num baú de `(comprimento ↔ largura)` trocados e trocar `x ↔ y` de volta reusa o
empacotador inteiro, com o mapa de apoio, o crescimento da fatia e a divisão de carga que já
existem. O empacotador já testa as duas orientações de cada caixa (`fitSlot`), então a rotação é
fisicamente honesta: uma caixa girada 90° em torno do eixo vertical é a mesma caixa.

No espaço girado, a varredura avança ao longo da **largura real** e quebra fileira ao longo da
**profundidade real** — cada faixa se enche a partir da porta para dentro, que é o comportamento
pedido, sem nenhuma regra nova.

⚠️ **A rotação não é só troca de rótulo em dois eixos.** Ela troca qual eixo é varredura e qual é
quebra de fileira, e três coisas foram escritas para o eixo antigo: o vão da 099 D2, o equilíbrio da
099 D3 e a busca de vão da carga dividida. Cada uma tem decisão própria abaixo.

### D2 — Faixa quando couber, profundidade quando não

Cabe quando, para **toda** parada, a menor dimensão de planta da caixa mais larga dela couber na
faixa proporcional (`bed.widthM × share`). A menor dimensão porque a caixa pode girar.

⚠️ **Sem exceção silenciosa.** Uma parada que não cabe derruba as faixas para a viagem **inteira** —
misturar faixa com profundidade na mesma carga produziria um desenho que ninguém consegue seguir.

⚠️ Uma parada só é sempre `depth`: com uma parada os dois arranjos são o mesmo desenho, e nomear um
arranjo que não muda nada só daria à tela uma distinção sem diferença.

### D3 — A ordem de entrega decide a faixa, e continua legível

A primeira entrega fica na faixa mais à mão e a última na oposta: a ordem deixa de ser profundidade
e vira lateral. Com porta lateral (`rear_and_side`), "mais à mão" é o lado da porta lateral; sem
ela, é um lado fixo, para o desenho não trocar de mão entre duas viagens parecidas.

⚠️ **`orderIsBinding` passa a ser falso com faixas**, inclusive em baú que só abre atrás — é o ponto
inteiro da mudança. Hoje ele é `access === 'rear'`, e deixá-lo assim faria a tela continuar dizendo
que a ordem obriga, ao lado de um desenho que mostra que não.

### D4 — Acima de metade do teto de massa, o peso vence e a tela diz por quê

`payloadRatio > 0,5` volta ao arranjo em profundidade, com o bloco no meio do baú — a regra da
099 D3, intacta. Massa concentrada numa faixa junto da porta alivia o eixo dianteiro do mesmo jeito
que a carga colada na traseira, e faixa não é motivo para desfazer física.

⚠️ **A troca é anunciada.** Sem dizer que o acesso foi trocado por estabilidade, quem viu faixas na
viagem de ontem e profundidade na de hoje conclui que o desenho é aleatório.

⚠️ `payloadRatio` nulo é teto desconhecido e **não** força profundidade: ausência de denominador não
é motivo para afirmar peso, é a mesma regra da 099 D3.

### D4b — A tela não deduz o motivo da troca

A API publica `stopArrangementReason`. Deduzir "foi o peso" de `depth` mais carga pesada afirmava o
mesmo na viagem de uma parada só, na carroceria aberta e quando as faixas não caberiam de todo jeito
— e nos três o operador conclui que aliviar a carga devolveria as faixas, e não devolve.

### D5 — A tabela de carregamento acompanha, ou ela mente

`distanceFromDoorM` é zero para toda faixa — é a definição do arranjo. O cabeçalho "da testeira para
a porta" descreve profundidade e precisa de outro texto, e a coluna "Faixa do baú", que hoje imprime
o intervalo de profundidade, passa a imprimir o intervalo de largura.

⚠️ **O desenho e a tabela saem de políticas separadas** (`resolveCargoPlacement` e
`resolveCargoLayout`) e precisam migrar juntos. Uma migrar sem a outra produz uma tela em que a
planta mostra faixas e a tabela descreve profundidade — as duas plausíveis, uma delas errada, e nada
falha.

### D5b — A pilha tem teto de estabilidade, e ele é geométrico

Sem `max_stack_count` cadastrado o limite era infinito. A altura da pilha não passa de **três vezes**
a menor dimensão da base — 0,33 g de inclinação equivalente, que cobre frenagem normal e curva forte.

⚠️ **A massa não entra, e é física.** Ela cancela na condição de tombamento; o peso importaria pela
distribuição e pelo esmagamento, e `gross_weight_grams` existe em **4 de 663** caixas desta base.

⚠️ **2:1 foi medido e recusado**: derruba o arranjo para profundidade e leva a última parada a 1,66 m
— pior acesso que antes desta spec.

### D6 — Em faixas a sobra não se divide

A carga dividida da 099 sobe para a região das paradas entregues **depois**, mais fundo no baú. Em
faixas essa região não existe: a faixa é limitada só na largura, então a parada que estoura a própria
faixa já encheu o baú, e o único lugar que sobraria é em cima da faixa de outra parada — o que a
fatia veio proibir. A sobra sai como `bedFull`.

⚠️ Isto **reduziu** a T3, que previa mover a busca de vão para o outro eixo. O ramo foi escrito e
desfeito: sem sobra possível ele era código morto guardando uma regra que nunca rodaria.

### D7 — O que esta spec não faz

Não confere peso por eixo: `axleNotChecked` continua no vocabulário, e a 098 registra por que
(`fleet_vehicle_axles` está vazia, e não há referência de entre-eixos por tipo).

Não decide empilhabilidade, fragilidade nem ordem dentro da faixa além do que a 099 já decidiu.

## Contratos de aceite

Antes da implementação, e é por eles que a task fecha:

1. Três paradas num baú que comporta as três faixas saem em faixas, e as três têm
   `distanceFromDoorM` zero.
2. Uma parada com caixa mais larga que a faixa dela derruba a viagem inteira para profundidade.
3. Uma parada só sai em profundidade, sempre.
4. `payloadRatio > 0,5` sai em profundidade mesmo com as faixas cabendo, e o arranjo publicado diz
   que foi o peso.
5. `payloadRatio` nulo com faixas cabendo sai em faixas.
6. Com faixas, `orderIsBinding` é falso mesmo com `loadingAccess: 'rear'`.
7. Com `rear_and_side`, a primeira entrega fica na faixa do lado da porta lateral.
8. O arranjo publicado pela planta e o descrito pela tabela são o mesmo em toda combinação — o
   contrato que impede as duas políticas de divergirem.
9. A tela imprime qual arranjo desenhou, e nunca o percentual de ocupação sem a marca de origem que
   a 075 já exige.

## 🤖 Modelo recomendado

| etapa                                                      | modelo    |
| ---------------------------------------------------------- | --------- |
| Decidir o eixo, o critério de cabimento e o corte com peso | `opus` 🧠 |
| Implementar a rotação, a tabela e o desenho                | `sonnet`  |
| Ajustar rótulo, texto e constante já decidida              | `haiku`   |
