# ADR-0057 — O endereço errado é ocorrência, e ela conserta o cadastro

- **Data:** 2026-09-03
- **Estado:** aceita
- **Contexto:** acrescenta um tipo a `TRIP_STOP_OCCURRENCE_KINDS` e fecha a ponta que a **ADR-0045 §6**
  deixou aberta ao chamar a ocorrência de "matéria-prima". Usa o desvio de endereço que a spec 056
  já criou (`delivery_address_overrides`) e o papel do contratante da **ADR-0050**.

## Contexto

O motorista chega ao endereço da nota e não é ali. Hoje ele tem cinco motivos de parada — cobrança
não prevista, espera longa, doca fechada, exige agendamento, outro — e nenhum diz _"o endereço está
errado"_. Ele escolhe `other`, digita o relato, e o fato mais acionável que o campo produz vira texto
livre num campo que ninguém consulta por endereço.

E o defeito **se repete**: o endereço errado não é da entrega, é do **cadastro do contratante**. A
próxima nota da mesma loja sai com o mesmo endereço, e o próximo motorista roda os mesmos 4 km. O
produto tem a peça que conserta a entrega de hoje — `delivery_address_overrides`, append-only, com
rota no painel — e não tem nada que feche o ciclo até quem emite a nota.

Duas assimetrias que decidem o desenho, e que só apareceram desenhando a tela:

1. **Nesta ocorrência o motorista nunca está no lugar certo.** Qualquer trava de proximidade que
   valha para as outras a mataria — é a única em que estar longe é o conteúdo do relato.
2. **`latitude` e `longitude` da parada são nulas no contrato de hoje** (`DriverTripStop`). Parada sem
   geocodificação não tem distância a medir, e tratar isso como recusa deixaria a ocorrência
   impossível para sempre em algumas paradas.

## Decisão

### 1. `wrong_address` entra no catálogo da parada, não no da nota

`TRIP_STOP_OCCURRENCE_KINDS` ganha um sexto valor. **Não** entra em `TRIP_OCCURRENCE_TYPES`: aquele
catálogo é do que aconteceu com a **carga** (recusa, avaria, ausência) e cada tipo dele dispara aviso
ao embarcador por template. Endereço errado é da **parada** — vale para as cinco notas que param ali,
não para uma —, e o aviso que ele dispara é outro, com outro destinatário e outro texto.

O CHECK do banco encolhe e cresce junto do catálogo, como já aconteceu quando três valores saíram em
2026-09-03. E o relato continua em `description`, curto de propósito: é campo digitado com uma mão.

### 2. A permissão bloqueia; a falta de sinal não

Esta é a linha, e ela não é a mesma dos outros dois casos:

- **Localização negada bloqueia a ocorrência**, e a tela leva aos ajustes do aparelho com o caminho
  escrito. Ocorrência é o relato que vira cobrança, desconto e conversa com o cliente; sem posição
  nenhuma ela é palavra contra palavra, e quem a abre de casa não pode ser indistinguível de quem a
  abre na porta do galpão.
- **Sem sinal não bloqueia nada.** A ocorrência é gravada, entra na fila, e o app **continua
  procurando a posição** para completá-la quando o aparelho fixar. Falta de rede é o caso normal onde
  o problema acontece; falta de permissão é uma escolha.
- **Sem coordenada da parada** — ou posição que nunca fixou — a ocorrência sobe marcada como **não
  aferida**. Isso é um estado, não um erro: o escritório vê que a distância não pôde ser medida em vez
  de ver uma distância inventada.

**O raio é de 5 km.** Ele não é um palpite de precisão de GPS: é a distância a partir da qual estar
longe deixa de ser margem de erro e passa a ser outro lugar. Um raio apertado recusaria posição
legítima o tempo todo — a ADR-0045 §4 já registrou que precisão de quilômetro é o caso normal num
galpão de laje, e é justamente ali que o motorista está quando abre ocorrência.

⚠️ **Isto não alcança a entrega.** A ADR-0045 §3.1 decidiu que a recusa de GPS **não** bloqueia a
confirmação de entrega, e continua valendo: um motorista com a permissão negada segue entregando, e
só não abre ocorrência. Aplicar a trava aos dois teria transformado uma permissão negada em campo
parado.

### 3. Longe da parada avisa e registra a distância — não impede

Fora do caso de permissão, a distância é **informação, não porteiro**. Perto registra calado; longe
imprime a distância na tela, grava-a junto e deixa seguir. Quem decide se 4,2 km invalidam o relato é
o escritório, com a ADR-0045 §6.1 na mão: _o motorista descreve o que viu, quem decide é quem tem o
contrato_.

E em `wrong_address` a distância deixa de ser suspeita e vira **prova**: ela é a medida do erro.

### 4. O ponto de atenção é da parada, e ele não corrige nada

O relato do campo abre um **ponto de atenção** na parada, visível a quem opera. Ele não altera o
endereço, não dispara aviso e não some sozinho: é uma pendência com dono no escritório.

A separação é a mesma da ADR-0053 e da spec 071 — **quem lê de fora propõe, quem responde decide**.
Deixar o app corrigir o endereço da nota poria o cadastro do cliente na mão de quem está com o
caminhão parado na rua errada, e o primeiro relato equivocado viraria endereço oficial.

### 5. A correção é o desvio que já existe, e o aviso ao contratante é novo

Aplicar a correção é gravar em `delivery_address_overrides` — **append-only**, com o `enderDest`
original preservado ao lado. Nada disso é inventado aqui: é a mecânica da spec 056, com as duas
identidades que ela já guarda (`requestedBy` em texto livre e `actorUserId` da membership).

**O desvio é por nota, e a tela diz isso.** `delivery_address_overrides.tripDocumentId` amarra a
correção a um documento, e é assim que fica: endereço de entrega é atributo da **nota**, não da parada
— a parada é um agrupamento derivado dela. A consequência tem de estar visível ao operador: uma parada
com cinco notas pede cinco desvios, e aplicar em quatro **parte a parada em duas** no próximo
`buildStopAddressKey`. O painel aplica em lote sobre as notas da parada e mostra quantas foram, nunca
esconde a contagem — correção pela metade é pior que nenhuma, porque cria uma parada fantasma no
roteiro do dia seguinte.

O que nasce é a **segunda metade**: avisar o contratante para o endereço sair certo na **próxima**
nota. Sem ela, a correção conserta uma entrega e o defeito volta na semana seguinte — que é
exatamente o que a ADR-0045 dizia sobre o WhatsApp: o fato existe, é dito, e morre onde foi dito.

**Quem recebe é o contratante que gerou a nota** — o embarcador, em `contractors`, e não o
`delivery_client` que recebe a carga. O endereço errado está no cadastro de quem **emite**, e avisar
quem recebe seria contar à loja que o endereço dela está errado na base de outra empresa.

O aviso é **ação do operador, nunca automática**. Endereço divergente às vezes é o correto — armazém
que recebe pelo fundo, loja com dois acessos —, e um aviso disparado por relato de campo estaria
errado com frequência suficiente para o cliente parar de lê-los.

### 6. As ocorrências ganham painel próprio

O ponto de atenção não vive só dentro da parada em que nasceu: existe uma tela de **ocorrências** no
painel, onde o escritório vê as abertas de todas as viagens, com tipo, distância aferida, viagem e
nota. Sem ela, achar a ocorrência exige saber de antemão em qual viagem ela está — e quem chega ao
painel por causa de um telefonema do cliente é justamente quem não sabe.

## Consequências

- O endereço errado deixa de ser texto livre em `other` e vira um fato consultável, com distância.
- A correção de endereço passa a ter origem no campo, sem tirar a decisão do escritório.
- O ciclo fecha no cadastro do contratante: o mesmo erro deixa de voltar em toda nota da mesma loja.
- **O que não se ganha:** correção automática. E, deliberadamente, nada disso alcança a entrega — a
  trava de permissão é da ocorrência, e só dela.
- **O custo que se assume:** um tipo novo no CHECK, a coluna de distância e o estado "não aferida", o
  ponto de atenção na parada e o aviso ao contratante. As duas últimas não existem hoje.

## Alternativas descartadas

| Alternativa                                 | Por que não                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Continuar em `other` com o relato em texto  | O fato mais acionável do campo fica invisível para qualquer consulta, e o ciclo nunca chega ao cadastro.         |
| Entrar em `TRIP_OCCURRENCE_TYPES`           | Aquele catálogo é da carga e dispara aviso ao embarcador por template. Endereço é da parada, e o aviso é outro.  |
| Exigir proximidade também nesta ocorrência  | É a única em que estar longe é o conteúdo. A trava mataria justamente o relato que ela deveria proteger.         |
| Bloquear ocorrência sem sinal               | O problema acontece onde o sinal é ruim. Bloquear ali é não ter o dado.                                          |
| O app corrigir o endereço direto            | Põe o cadastro do cliente na mão de quem está na rua errada; o primeiro relato equivocado vira endereço oficial. |
| Avisar o contratante automaticamente        | Endereço divergente às vezes é o correto. Aviso errado com frequência é aviso que o cliente para de ler.         |
| Editar o endereço da nota em vez de desviar | A nota é documento fiscal recebido. O desvio append-only existe por isso, desde a spec 056.                      |
