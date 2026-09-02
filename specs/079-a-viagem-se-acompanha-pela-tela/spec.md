# Feature 079 — A viagem se acompanha pela tela

## Problema e resultado

O detalhe da viagem hoje é uma **lista**: situação, paradas, notas e botões. Quem opera precisa
saber, olhando uma vez: **que caminhão é**, **quem dirige e como falar com ele**, **onde a carga
está**, **o que já foi entregue e com que prova**, e **quanto falta**. Hoje isso exige abrir a
frota, o rastreamento e cada nota — ou ligar para o motorista.

O resultado é uma tela em que a viagem se lê inteira, e a entrega concluída carrega a prova que a
sustenta.

⚠️ **O UUID do veículo já foi consertado** (spec anterior, `describeTripVehicle`): a linha mostra
placa, marca, modelo, ano e cor. Ele não faz parte desta spec.

## Fora do escopo

- **Reordenar paradas** — já existe, com arraste por `@dnd-kit` em `TripStopList`, escolhido por
  acessibilidade de teclado e pelo alvo de toque de 375px. Reimplementar é regressão.
- **Registrar ocorrência e comprovante** — o motorista já grava por `/me/current-trip/...`; esta
  spec **exibe**, não cria caminho de escrita.
- Alterar a política de peso (ver P6 e a dúvida sobre estimativa por item).

## Histórias priorizadas

### P1 — O caminhão e a carga se leem de longe

**Given** uma viagem com veículo e notas vinculadas
**When** o operador abre o detalhe
**Then** vê a identificação do veículo e **quanto do baú está ocupado**, com a origem do número
declarada quando ele for estimado.

### P2 — Quem dirige, e como falar com ele

**Given** uma viagem com motorista
**When** o operador abre o detalhe
**Then** vê nome e foto do motorista e um caminho de contato, **sem** que a tela exponha dado
pessoal que não sirva ao acompanhamento.

### P3 — Onde a carga está

**Given** uma viagem despachada, com motorista que consentiu com o rastro
**When** o operador abre o detalhe
**Then** vê o último ponto registrado e **quando** ele foi registrado.

**Given** motorista que **não** consentiu
**Then** a tela diz que não há rastro, e não insinua falha do sistema.

### P4 — O que já foi entregue e o que vem

**Given** uma viagem em curso
**When** o operador abre o detalhe
**Then** vê progresso em porcentagem, quais paradas foram atendidas, quais são as próximas na ordem
do roteiro, e uma previsão de término.

⚠️ **A barra de progresso já existe** (`TripProgressBar`, no detalhe da viagem), com segmento por
estado e porcentagem. Desta história ela só recebe a **animação da transição** e a **previsão** ao
lado — o resto é regressão esperando para acontecer.

### P5 — A entrega concluída carrega a prova

**Given** uma nota marcada como entregue com comprovante
**When** o operador abre aquela entrega
**Then** vê a prova (foto e assinatura, quando houver), o horário real, a ocorrência registrada se
houver, e os dados que identificam a entrega: número da nota, cliente, endereço e CEP.

### P6 — O peso deixa de ser chute quando os itens dizem

**Given** uma nota sem peso declarado, mas com itens
**When** a carga é somada
**Then** o peso sai dos itens em vez do fator por volume, e a tela diz de onde ele veio.

### P7 — A entrega abre, e cada produto aceita ocorrência

**Given** uma entrega da viagem
**When** o operador a expande
**Then** vê **os produtos da nota** que serão entregues, e **cada um** oferece registrar ocorrência
com o **tipo** dela — separação ou entrega.

⚠️ Hoje a ocorrência é só do **motorista**, por parada (`/me/current-trip/stops/:id/occurrences`), e
**não existe por produto**. Esta história cria caminho novo: quem separa e quem confere também
precisam registrar, e "faltou item 3 da nota" é diferente de "cliente ausente".

### P13 — O anexo da entrega se abre, e o ponto de cada estado fica registrado

**Given** uma entrega com comprovante
**When** o operador aciona "ver anexos"
**Then** vê as fotos do comprovante e **onde** cada mudança de estado aconteceu — a coordenada do
motorista no momento de separar, carregar e entregar.

⚠️ **Isto depende do consentimento do motorista**, como P3. A coordenada por estado é rastro do
trabalhador em outro formato: menos contínuo, igualmente identificável — e mais duradouro, porque
fica no histórico da entrega em vez de morrer com a viagem (ADR-0050 §5: `purgeByTrip`).

⚠️ **O ponto por estado não é gravado hoje.** `trip_documents` tem `delivered_at`, `loaded_at` e
`returned_at`, e nenhuma coordenada. Guardar exige migration e decisão: o rastro da viagem se apaga
no fechamento, e este **não se apagaria** — o que muda a promessa feita ao motorista.

### P8 — A entrega se identifica pelo que se lê, não por UUID

**Given** a listagem de entregas da viagem
**Then** cada linha traz **número da nota**, contato do cliente e, abaixo, o **contratante** da
entrega — nunca o identificador interno.

### P9 — A prontidão fiscal fala em nota, não em identificador

**Given** o painel de prontidão fiscal
**Then** cada linha traz **número da nota, valor e data**, com **ícones de estado**: CT-e emitido e
CT-e transmitido.

### P10 — O endereço errado se corrige à mão, e a rota recalcula

**Given** uma parada cujo ponto está errado
**When** o operador aciona a correção
**Then** pode **ajustar o ponto à mão** — não só pedir ao provedor — e **recalcular a rota** em
seguida.

⚠️ `POST /geocoded-addresses/:addressKey/refine` já existe e chama o Google. O que falta é a correção
**manual** (a rota `CorrectGeocodedAddressInput` já está no port) e o recálculo sem sair da tela.

### P11 — O roteiro sugerido se reordena antes de aceitar

**Given** um roteiro sugerido
**When** o operador discorda da ordem
**Then** reordena as paradas **na proposta**, antes de aceitar.

⚠️ Não confundir com o arraste que já existe: `TripStopList` reordena as paradas **da viagem**.
Aqui é editar uma **proposta** — o que muda o que é aceito, e precisa decidir se a distância
recalculada acompanha a edição ou se a proposta editada deixa de ter distância.

### P12 — O que se usa primeiro fica em cima

**Given** o detalhe da viagem
**Then** **vincular nota** e **ações da viagem** aparecem no topo, antes das listas.

## Requisitos funcionais

- **RF1** — O painel do veículo mostra ocupação com a **origem** do número (declarado × estimado).
- **RF2** — O painel do motorista mostra nome, foto e contato.
- **RF3** — O último ponto é exibido com data e hora, e **só** com consentimento vigente.
- **RF4** — O progresso é derivado do estado das notas, nunca digitado.
- **RF5** — Cada entrega concluída expõe comprovante, ocorrência e identificação da nota.
- **RF6** — A previsão de término declara que é estimativa e de onde saiu.
- **RF7** — Toda ocorrência registrada carrega **tipo** e o **produto ou parada** a que se refere.
- **RF8** — Nenhuma listagem desta tela imprime identificador interno como identificação.
- **RF9** — O mapa mora **dentro** do bloco de ocupação, não em seção separada.
- **RF10** — O desenho do veículo mostra a **posição das cargas por cor**.

## Requisitos não funcionais

- **RNF1** — Nenhum número derivado aparece sem dizer que é derivado. É a regra que a tela de
  roteiro já cumpre e que esta herda.
- **RNF2** — A tela abre em 375px sem rolagem horizontal, e é operada com uma mão.
- **RNF3** — Nenhum dado pessoal do motorista chega ao bundle além do necessário às histórias.
- **RNF4** — Nenhuma origem externa nova: mapa e animação são desenho nosso, como o mapa de zonas.

## Casos extremos e falhas

| caso                        | comportamento                                            |
| --------------------------- | -------------------------------------------------------- |
| veículo removido da frota   | cai no identificador, com rótulo dizendo que é isso      |
| motorista sem foto          | iniciais, como o cabeçalho já faz                        |
| sem consentimento de rastro | "sem rastro" explícito — nunca mapa vazio sem explicação |
| viagem em `draft`           | sem progresso e sem previsão: não há o que acompanhar    |
| entrega sem comprovante     | "sem comprovante" — não confundir com "não entregue"     |
| nota sem itens e sem peso   | mantém a estimativa por volume, marcada como estimada    |

## Critérios de aceite

- **CA1** — Nenhuma tela desta spec imprime UUID como identificação.
- **CA2** — Todo número estimado tem marca de estimado ao lado, com a origem.
- **CA3** — Ausência de consentimento e ausência de rastro produzem a **mesma** tela.
- **CA4** — 375px sem rolagem horizontal, verificado no smoke.
- **CA5** — Nenhum campo do motorista sob a ADR-0039 aparece sem a ADR estar executada.

## Dúvidas

### ✅ Resolvida — idade, telefone e e-mail do motorista

**Decisão (2026-09-02): a tela exibe `name`, `tax_id` e a foto de perfil.** Idade, telefone, e-mail e
endereço **ficam fora** desta spec.

A **foto entra** porque não está sob a ADR-0039 — ela cobre nascimento, telefone e endereço — e
porque a rota `/company-users/:id/picture` já existe e já é consumida pelo cabeçalho. Sem foto, as
**iniciais**, como o cabeçalho já faz. ⚠️ Foto de rosto é dado pessoal: ela aparece no painel
interno, para quem já vê o nome, e **nunca** no portal do contratante.

A **ADR-0039** decidiu criptografar `birth_date`, telefone e endereço, e o `CLAUDE.md` registra que
a decisão foi barata **porque não há leitor**. Exibi-los criaria o leitor e obrigaria a executar a
ADR antes — trabalho de backend com migration, que adiaria a tela inteira por um campo de conforto.

Consequências que a implementação herda:

- **P2 entrega "quem dirige", não "como falar com ele".** O caminho de contato depende da dúvida
  seguinte, e não pode passar pelo telefone do motorista.
- **Idade não entra por outro caminho.** Ela é derivada de `birth_date`: não existe exibi-la sem ler
  o campo criptografado, e não vale inventar aproximação.
- **A ADR-0039 continua não executada, e de propósito.** Quem for exibir qualquer um desses campos
  no futuro reabre esta decisão junto — é o que mantém a ADR barata.

### ✅ Resolvida — o contato, e o que a tela revela

**Decisão (2026-09-02):** a entrega oferece contato com **o destinatário da nota** e com **o
motorista**, e um bloco expansível com os dados do **contratante** (e-mail, telefone, CNPJ). Os
contatos ficam **ocultos por padrão**, atrás de um botão de exposição.

O botão de exposição não é enfeite: ele é o que separa "a tela mostra o dado" de "alguém pediu o
dado". Sem ele, todo telefone de destinatário fica à vista de qualquer operador que abrir a viagem —
e ninguém consegue dizer depois quem viu o quê.

O telefone do motorista **não é impresso** nem atrás do botão: o contato com ele passa por canal que
não expõe o número (o trilho de WhatsApp da spec 062), e por isso esta decisão **não reabre a
ADR-0039**.

⚠️ **O contato do destinatário precisa de ADR antes de ser implementado.** O telefone vem do XML da
NF-e: foi coletado para **fim fiscal**, e usá-lo para contato operacional é **finalidade nova** sob a
LGPD (art. 6º). A decisão de exibir está tomada; falta escrever _por que_ a finalidade é compatível,
quem pode revelar, e o que fica na trilha de auditoria. A ADR é pré-requisito da task, não sucessora
dela.

⚠️ Revelar contato é **ação sensível**: entra em `audit_logs` com ator, alvo e horário, como as
demais (`security.md` §10).

### ✅ Resolvida — o rastro, com consentimento informado

**Decisão (2026-09-02):** o motorista passa a dar consentimento **explícito, no primeiro acesso**,
numa tela com os termos de uso e de tratamento de informação, e o aceite é guardado do nosso lado.
Com ele, a posição aparece para o operador.

Isso resolve a tensão em vez de contorná-la: a ADR-0050 §5 garantia ao contratante ver coordenada
sem saber quem dirige, e o operador sabe. Reaproveitar aquele consentimento ampliaria em silêncio o
que o motorista aceitou. Perguntar de novo, com os termos à vista, é o que torna o alcance honesto.

⚠️ **Isso é feature própria, não uma task desta spec.** Ela envolve identidade (tela de primeiro
acesso), o texto jurídico dos termos, e persistência do aceite. P3 **depende** dela e não começa
antes.

Quatro coisas que a feature de consentimento precisa decidir, e que esta spec não decide:

- **versão dos termos** — texto novo obriga novo aceite, senão o registro diz que a pessoa aceitou
  algo que ela nunca leu;
- **retirada** — a ADR-0050 §5 já apaga o rastro na mesma transação em que o consentimento cai; a
  tela precisa oferecer o caminho de retirar;
- **o que acontece sem aceite** — o motorista opera normalmente e só o rastro fica desligado, ou há
  bloqueio? (Recomendação: só o rastro. Bloquear o trabalho por causa de consentimento é coagir o
  consentimento, e consentimento coagido não vale sob a LGPD.)
- **trilha** — aceite e retirada são ação sensível e entram em `audit_logs`.

### ✅ Resolvida — peso por item

**Decisão (2026-09-02): a soma nunca mistura origens.** Se **todos** os itens da nota declaram peso,
o peso sai dos itens; se **algum** não declara, a nota inteira cai na estimativa por volume.

O caso que decide é a nota parcial — dez produtos, seis com peso. Somar os seis e estimar os quatro
daria número mais próximo, e um número que precisa de uma frase inteira para não parecer preciso:
_"52 kg, sendo 40 declarados e 12 estimados"_. Com origem única, _"45 kg, estimado por volume"_ se
explica numa linha, e a coerência com o `qVol` que a **ADR-0052** protegeu continua de pé.

A ordem passa a ser: **`pesoB` do XML → soma dos itens (só se completa) → `qVol` × peso médio →
ausência**.

⚠️ Ausência continua sendo ausência, e zero continua recusado pelo CHECK: zero declararia que a
carga não pesa nada.

⚠️ A tela diz **qual** das três origens produziu o número — não basta marcar "estimado". Duas notas
com o mesmo peso e origens diferentes merecem conferência diferente.

### ✅ Resolvida — mapa e animação

**Decisão (2026-09-02): os dois entram.** Um mapa com as paradas já atendidas e as próximas, e o
desenho do veículo mostrando ocupação e movimento.

Ambos são **SVG nosso**, como o mapa de zonas da frota e o do portal do contratante: não há
biblioteca de mapa no painel, e a ADR-0037 já tirou `iframe` e imagem remota da tela — a CSP declara
`frame-src 'none'`. Isso não muda aqui.

⚠️ **A malha do mapa vem do IBGE, e o payload decide o que é possível.** O mapa de zonas recorta por
município porque tem a UF na mão; um mapa de rota precisa de coordenada, que vem de
`geocoded_addresses`. Parada sem coordenada precisa aparecer **nomeada fora do mapa**, nunca sumir —
é a mesma regra da cidade sem polígono na aba Regiões.

⚠️ **A animação precisa dizer algo que a barra de ocupação não diga.** Se ela repetir a mesma
informação em outra forma, é enfeite com custo de manutenção. A task que a implementar declara, por
escrito, o que ela comunica — e um contrato guarda que `prefers-reduced-motion` a desliga.

✅ **Nenhuma dúvida em aberto.** As cinco foram fechadas em 2026-09-02 e estão registradas acima com
a consequência que cada uma impõe.

⚠️ **Duas dependências saíram dessas decisões, e não são tasks desta spec:**

- **ADR do contato do destinatário** — o telefone vem do XML fiscal, e usá-lo para contato
  operacional é finalidade nova sob a LGPD. É pré-requisito da task de contato.
- **Feature de consentimento do motorista** — tela de primeiro acesso com termos, aceite persistido e
  caminho de retirada. **P3 não começa antes dela.**

Ordem que isso impõe: **P1, P5 e P6 primeiro** (não dependem de nada), **P4** em seguida (mapa e
progresso), e **P2/P3 por último**, cada uma atrás da sua dependência.
