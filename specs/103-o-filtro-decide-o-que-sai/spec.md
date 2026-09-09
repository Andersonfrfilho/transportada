# Feature 103 — O filtro decide o que sai

> Registrada em 2026-09-09, **depois da implementação** — ao contrário do processo. O defeito foi
> corrigido no mesmo turno em que foi relatado, e sete arquivos já citavam "Spec 103" antes deste
> documento existir. A dívida está paga aqui.

## Problema, medido

O operador selecionou um conjunto amplo de notas, estreitou o filtro para 21, leu **"21 notas
encontradas"** na tela e pediu a montagem de roteiro.

Foram **345 notas**. O solver as repartiu entre 6 veículos e criou **7 viagens** — uma com **207
notas**, outra vazia, num roteiro de 6.655 km e 150 horas.

`useNfeDocumentTable` nunca podou `selectedIds` contra o filtro. As marcações feitas antes
continuavam no `Set`, invisíveis, e o único sinal era um badge de contagem no botão de busca. Pior:
o botão ainda oferecia _"Selecionar as 21 do filtro"_, reforçando que só 21 estavam em jogo.

## D1 — A poda é derivação, nunca apagamento de estado

`scopeSelectionToFilter` devolve a interseção entre o marcado e o que o filtro deixa ver. O `Set`
bruto **continua no estado**.

Duas alternativas descartadas, e o motivo:

- **Podar por efeito** (`useEffect` reescrevendo o estado) reentraria a cada render — o `Set` troca
  de identidade e o efeito dispararia sozinho, para sempre.
- **Apagar o estado** faria quem só queria olhar outra faixa perder a escolha ao voltar o filtro.

O invariante que importa é o do **despacho**: nada que a tela não mostra pode sair. A derivação o
garante sem tocar no que o operador marcou.

⚠️ A poda é contra o **filtro**, nunca contra a **página**: seleção entre páginas do mesmo filtro é
legítima e continua valendo.

## D2 — A marcação escondida é dita, não sumida em silêncio

`countSelectionHiddenByFilter` alimenta um aviso: _"N notas marcadas estão fora do filtro atual e
não entram na viagem."_

Sem ele o operador estreita o filtro, vê a contagem cair e conclui que **perdeu a seleção** — e
refaz o trabalho. O número que desaparece sem explicação é o mesmo problema, com o sinal trocado.

## O que agravou, e não causou

A correção da spec 102 D0 (`findTripLinks` passando a esconder vínculo liberado) devolveu **324
notas** que estavam escondidas como "já em viagem". Elas passaram a ser selecionáveis, e a seleção
invisível saltou de dezenas para centenas.

⚠️ O defeito era anterior e latente. O que a 102 fez foi transformar uma viagem errada pequena em
sete viagens erradas — que foi o que tornou o problema visível.

## Aceite

1. Só o que o filtro mostra continua selecionado.
2. Seleção fora da página, dentro do filtro, é preservada.
3. A tela diz quantas marcações o filtro escondeu.
4. Filtro vazio não deixa sair seleção nenhuma.
