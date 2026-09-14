# 095 — Onde cada caixa cabe, em 3D e sem desmontar a pilha

## Por que

A planta 2D da 088/094 foi recusada por quem ia usá-la, e o empacotador tinha um defeito que o
desenho escondia: ele **ordenava** por parada em vez de **proibir** a mistura. A última parada
_tendia_ ao fundo, e bastava a fileira virar para duas paradas dividirem a mesma camada — quem abria
a porta na primeira entrega tirava caixa de outra parada de cima.

O comportamento desta spec foi fixado num preview navegável antes de qualquer linha de produto, a
pedido do cliente: _"antes crie uma preview antes de implementar para testarmos o comportamento"_.

## Decisões

1. **Fatia por parada (wall-building), como proibição.** Uma faixa do comprimento do baú por parada,
   na ordem inversa de entrega, dimensionada pelo **volume** da parada — nunca pela contagem de
   caixas. É a restrição LIFO do 3L-CVRP, e ela vale **sem nenhum dado de empilhamento cadastrado**,
   que é a situação de hoje: `is_stackable`, `max_stack_count`, `is_fragile` e `keep_upright` estão
   vazios em **663 de 663** caixas.
2. **Ordem dentro da fatia:** frágil e não empilhável no topo de tudo, depois a presumida, e a base
   pela maior pegada. A medição precede a pegada porque toda caixa presumida herda o mesmo fallback:
   ordenar só por pegada as agrupava numa faixa contígua no meio da fatia — efeito colateral que
   ninguém decidiu.
3. **Carga dividida tem lugar certo.** A sobra sobe para o topo da região das paradas entregues
   depois, encostada na própria fatia, com o motivo `splitCargo`. O sentido contrário — sobra para o
   lado da porta — é proibido.
4. **O desenho é isométrico e gira.** Faces escolhidas pelo ângulo (não as três fixas), ordenação por
   profundidade na direção de visão, três faces sempre em cor sólida, presumida como a mesma cor
   lavada.
5. **Manipulação:** arrasto com mãozinha que some no primeiro uso, botoeira de girar/mover/zoom,
   atalhos de vista e restaurar.
6. **Isolar parada com multisseleção**, com as demais em fantasma cinza sólido — nunca escondidas.
7. **A tela nomeia o que sabe e o que presume**, e distingue "algo é presumido" de "quase nada foi
   medido" (15 de 345 notas hoje).
8. **Modo de impressão**, para o agregado que carrega a van sozinho, longe da tela.

## Fora de escopo, por decisão

**Peso por eixo.** Sem `fleet_vehicle_axles` preenchido, distribuir massa por eixo seria inventar
exatamente o número que gera multa. A linha do `promise` continua dizendo que a planta não promete
isso.
