# Spec 133 — O juiz da descarga não deixa a caixa se escorar nela mesma

## Contexto

A simulação de descarga (`api-transportada/test/cargo-placement/unloading-simulation.ts`, spec 118) é
o juiz de toda mudança no empacotador: ela confere apoio de toda caixa em cada passo da descarga. Em
`85cbb5fc` ela dizia **zero** caixas sem apoio nas quatro viagens reais.

O juiz tinha um defeito que só aparece medindo: carimbava a caixa pelo **centro** da célula de 1 cm e
sondava a primeira vez a **0,5 mm** da face. Quando a face fica depois do centro da célula dela, a sonda
cai na célula da própria caixa — e a caixa se escora nela mesma. Medido: a fileira do fundo do Accelo,
a 0,474 m da testeira (giro de 0,248 m), passava assim.

Uma conferência "exata face a face", escrita na rodada anterior no scratchpad, acusava muito mais
(Atego 84 contra 0), e não tinha sido validada.

## Decisão do usuário

> Consertar o juiz primeiro.

## Requisitos

- R1. A caixa nunca conta como vizinha dela mesma.
- R2. O apoio lateral é medido pelas **bordas reais** das caixas, sem grade, com **uma** tolerância de
  contato declarada (`CONTACT_TOLERANCE_M` = 1e-6 m).
- R3. O vazio não escora: sem caixa nem parede no vão, a face está solta — inclusive para a caixa no
  piso cuja contenção começa em zero (a grade devolvia altura 0 na célula vazia, e 0 ≥ 0).
- R4. A caixa inteira em cima da outra não a escora (ela é carregada, não segura).
- R5. A regra física é a mesma da 118: testeira e laterais apoiam dentro do vão `3b/√10`, a porta nunca;
  a vizinha precisa subir até a contenção; trecho sem contato menor que 5 cm é tolerado.
- R6. A conferência exata do scratchpad é comparada caso a caso com o juiz corrigido, e cada diferença
  é explicada e decidida.
- R7. As violações que o juiz corrigido acha no empacotador de `85cbb5fc` são **registradas por viagem**
  (`test/cargo-placement/known-unsupported.ts`) e o contrato cobra **não piorar** até a spec 134 zerá-las.
  Nada é escondido: o número está no arquivo, na doc e nesta evidência.

## Fora do escopo

O empacotador. A correção dele é a spec 134 (carga encostada na cabeceira).
