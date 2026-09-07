# Feature 093 — O baú vem preenchido, e a carga tem teto

## Problema e resultado

A spec 088 fez a ficha do veículo pedir comprimento, largura e altura do baú, e a planta em escala da
montagem só existe com os três. Medido em 2026-09-07, um dia depois de a 088 entrar: **3 de 12**
veículos têm as medidas — e os nove restantes incluem o `RTD-5J78`, que aparece em cinco das doze
viagens da primeira página. Para quem monta essas viagens a planta **nunca existiu**.

Preencher à mão doze fichas é trabalho de fita métrica, e ele não vai acontecer antes da próxima
viagem. O que falta não é o campo — é o campo **vir preenchido** com o melhor palpite disponível,
para o operador **conferir** em vez de medir do zero.

E há um segundo buraco ao lado, de outra natureza. ⚠️ **A carga máxima já existe e já está
preenchida**: `fleet_vehicles.capacity_kg` é o `capKG` que o MDF-e exige, e 11 dos 12 veículos a têm
(de 3.000 a 12.000 kg). O que falta não é a coluna — é **alguém lê-la fora da emissão fiscal**. A
montagem soma o peso das notas e não o compara com nada, e por isso o alerta de concentração da 085
consegue acusar desequilíbrio entre paradas e é incapaz de dizer "isto não pode sair assim".

Ao fim: nenhuma ficha nova nasce vazia, e o peso ganha o denominador que já estava no banco.

## Fora do escopo

- **A planta desenhada a partir da referência de mercado.** A spec 088 D2 recusou isso por escrito e
  a medição desta spec confirma o motivo: a van vai de 7,0 a 15,5 m³ dentro da mesma sigla, e ali o
  erro deixa de ser porcentagem e vira **metro** na tela de quem confere com fita. A sugestão entra
  no formulário, onde um humano a aceita; ela nunca alimenta o desenho por baixo.
- **Bloquear a viagem por excesso de peso.** Esta spec dá o teto; recusar despacho com base nele é
  decisão de operação com spec própria.
- **Carga máxima no documento fiscal.** Nem CT-e nem MDF-e leem estes campos.
- **Medir o baú por foto, catálogo FIPE ou CRLV.** O CRLV imprime peso (PBT, CMT, tara, lotação),
  nunca a medida interna do compartimento — a fita continua sendo o único caminho para a medida.

## Histórias priorizadas

### P1 — A ficha nova nasce com o baú preenchido

**Given** o operador cadastra um veículo e escolhe o tipo `vuc`
**When** o formulário resolve a sugestão
**Then** comprimento, largura e altura vêm preenchidos com a medida típica do tipo, editáveis, com a
faixa observada ao lado ("VUC vai de 13 a 26 m³ — confira com fita") e a origem impressa
**And** salvar grava os valores como medida da ficha, indistinguíveis de uma medição — porque a
partir do salvamento é isso que eles são: alguém assinou embaixo.

### P2 — O veículo igual manda mais que a sigla

**Given** a frota já tem um `MERCEDES-BENZ ACCELO 1016` com baú medido
**When** o operador cadastra outro `MERCEDES-BENZ ACCELO 1016`
**Then** a sugestão vem **daquele veículo**, não da média do tipo, com a origem dizendo de qual
**And** o par marca+modelo é casado pela dobra de `normalizeVehicleCatalogName`, senão `MERCEDES-BENZ`
e `Mercedes-Benz` seriam duas marcas.

### P3 — O teto que já estava no banco aparece na montagem

**Given** um veículo com `capacity_kg` cadastrada — o caso de 11 dos 12
**When** a montagem soma o peso das notas
**Then** a tela imprime quanto do teto foi ocupado, com a mesma marca de estimativa que o volume já
carrega
**And** sem teto cadastrado o percentual **não aparece** — nunca 0%, nunca 100%.

### P4 — O tipo sem dado não inventa número

**Given** o operador escolhe `car` ou `tractor_unit`
**When** o formulário resolve a sugestão
**Then** nada é preenchido, e o campo diz por quê — carro de passeio não tem compartimento de carga
publicado, e o cavalo mecânico não tem baú próprio (o volume é do implemento).

## Requisitos funcionais

- **RF1** `vehicle_volume_references` ganha `max_payload_kg` (nulo permitido) e passa a ter linha para
  `three_quarter` e `motorcycle`, hoje ausentes — é o buraco que faz `RTD-5J78` (`three_quarter`) não
  achar referência nenhuma.
- **RF2** ⚠️ **Nenhuma coluna nova na ficha.** `fleet_vehicles.capacity_kg` já é a carga máxima, já
  atravessa rota, formulário e MDF-e, e já está preenchida em 11 de 12 veículos. Esta spec a
  **sugere** no cadastro e a **lê** na montagem; criar `max_payload_kg` ao lado dela produziria dois
  campos de massa na mesma ficha, e a primeira pessoa a preencher o errado descobriria isso na
  rejeição do MDF-e.
- **RF3** Rota de leitura do catálogo de referência, para o formulário sugerir: `GET
/vehicle-references` sob `fleet.read` — quem cadastra veículo já a tem, e o catálogo não é dado de
  empresa.
- **RF4** `resolveVehicleSuggestion` (frontend, puro) decide a sugestão em precedência: **veículo da
  frota com mesmo marca+modelo medido → referência do tipo → ausência**, devolvendo sempre a origem
  junto do valor.
- **RF5** O formulário aplica a sugestão **só em campo vazio**, e só até o operador digitar. Campo
  tocado nunca é sobrescrito por troca de tipo.
- **RF6** A ocupação de peso da montagem publica `payloadRatio` e `maxPayloadKg`, nulos sem teto.

## Requisitos não funcionais

- A sugestão é resolvida no cliente, com dado que a tela já carrega (a lista da frota) mais uma
  consulta de catálogo por sessão — nenhuma consulta por veículo.
- A referência é **cópia por valor** de mais nada: ela mora no banco, e é a rota que a serve.
- Nenhuma mudança de comportamento em instalação que aplicar a migration: colunas aditivas com
  ausência como padrão.

## Casos extremos e falhas

- **Rota de catálogo indisponível** — o formulário abre sem sugestão e digitável, nunca travado nem
  em branco esperando. Cadastro não para por catálogo.
- **Marca+modelo com dois veículos medidos e discordantes** — vence o **mais recente**, e a origem
  nomeia a placa. Média entre dois baús é um terceiro baú que não existe.
- **Sugestão aceita sem conferência** — é o resultado esperado, e é por isso que ela nunca alimenta a
  planta sem passar pelo salvamento: a planta desenha o que a ficha afirma, e a ficha passou a
  afirmar isto porque alguém salvou.
- **Tipo trocado depois de medir** — campo preenchido não é sobrescrito (RF5); trocar `vuc` para
  `toco` com medidas dentro não apaga nada.
- **`three_quarter` e `vuc` são a mesma coisa em metade das fontes brasileiras** (TruckPad e bsoft
  chamam o VUC de "3/4"). O catálogo os separa, então a sugestão de um vai parecer errada a quem usa
  a outra sigla — o texto da faixa é o que evita a discussão.

## Critérios de aceite

1. Escolher `vuc` num cadastro novo preenche os três campos, com faixa e origem visíveis.
2. Escolher `car` ou `tractor_unit` não preenche nada, e diz por quê.
3. Cadastrar o segundo `ACCELO 1016` herda do primeiro, com a placa impressa na origem.
4. Digitar num campo e trocar o tipo não sobrescreve o que foi digitado.
5. `vehicle_volume_references` tem linha para os nove tipos com dado, e `three_quarter` deixa de ser
   o tipo sem referência.
6. O cadastro novo vem com a carga máxima sugerida do tipo, no campo `Capacidade (kg)` que já
   existe — sem coluna nova e sem segundo campo de massa.
7. A montagem imprime o percentual do teto quando ele existe, e o omite quando não existe.
8. Migration aplicada em base existente não muda o comportamento de nenhuma tela.

## Dúvidas

Nenhuma aberta.
