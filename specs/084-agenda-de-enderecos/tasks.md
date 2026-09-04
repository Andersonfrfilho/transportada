# Feature 084 — Tarefas

## 🎯 GOAL ATIVO — medir a base, depois consertar com quem sabe

Reescrito depois que a `GOOGLE_MAPS_API_KEY` entrou e as primeiras consultas reais mudaram três
premissas. **Cada bloco fecha em algo que dá para olhar**, e a ordem é: o que não espera ninguém →
o que precisa de decisão → o que precisa de gente.

### Bloco 1 — fundação que não espera decisão nenhuma

- [ ] **G1 (= T1e)** — O `PATCH /geocoded-addresses/:key`, **já em produção** sob
      `TRIP_MANAGE_POLICY`, grava `geocoded_address_corrections` na mesma transação.
      ⚠️ Única task que conserta buraco existente: hoje o produto tem correção sem histórico e
      histórico sem correção.
- [ ] **G2 (= T05)** — Conferência de município. Resultado em `cityCode` diferente é **descartado**,
      e o CHECK de `address_comparisons` já afirma que descarte não vem com comparação junto.
- [ ] **G3 (= T3b)** — Ligar `resolveDeliveryCoordinate` a um chamador real e provar o aceite da T03
      **contra uma nota**. É o que tira o ⚠️ da T03.

### Bloco 2 — medir os 149, e olhar o resultado

- [x] **G4** — ✅ [ADR-0061](../../docs/adr/0061-o-lote-de-medicao-compra-precisao-uma-vez.md): o
      lote é **terceiro gatilho** do degrau 2 (decidido, escopo e custo declarados), não escalada
      automática. O adendo da **ADR-0044** e `paid-provider-never-called.contract.ts` seguem
      intactos, e a postura das **ADR-0037/0040** fica registrada em vez de herdada por silêncio.
- [x] **G5 (= B2)** — ✅ `google-address-lookup.gateway.ts`. Envia os seis campos, e ⚠️ **não filtra
      por CEP** — o filtro obrigaria o provedor a concordar com o nosso, apagando o achado de maior
      valor antes de medi-lo. Filtra o **lugar** (país e UF). `RANGE_INTERPOLATED` tem nível próprio;
      `not_found` é resultado e falha de chamada é `null`.
- [x] **G6** — ✅ Rodado nos 149 em 2026-09-04, por `scripts/address-comparison-batch.ts` (sem
      `--confirm` ele imprime escopo e custo e sai — é o gatilho que a ADR-0061 descreve).
      _Medido:_ 148 medidos, 1 pulado. **118 `rooftop`**, 17 `range_interpolated`, 13 `approximate`,
      **zero `not_found`**. 45 divergiam de rua, 3 de CEP (todos genérico → de rua), 1 caiu em outro
      município. A hipótese "o texto não existe" era rara: a escada grátis é que falhava.
      ⚠️ **Defeito corrigido no meio:** a primeira versão gravou a medição e jogou fora a
      coordenada. Reexecutado, **134 coordenadas novas**, e a base saiu de 149 endereços em centroide
      de município para **15**.
- [ ] **G7** — Estender aos 147 de precisão de CEP. A amostra confirmou custo (US$ 0,74 por 149) e
      formato; aqui está a informação **nova**, porque nenhum sinal grátis distingue esses 147 de um
      endereço bom.

### Bloco 3 — o relatório, que é o que dá para testar

- [x] **G8 (= T08/T09)** — ✅ `GET /address-report` (`settings.manage`), agrupado por contratante e
      ordenado por gravidade. ⚠️ **A separação grafia × lugar foi o achado da task:** das 45
      divergências de rua, **seis** eram lugar diferente; as outras 39 eram `DR`/`Doutor`,
      `7`/`Sete`, `MELLO`/`Melo`, `RUA RUA MINAS GERAIS`. Sem separar, o relatório ensina o
      contratante a fechar a página sem ler. **24 pedidos em 148 medições.**
      Bairro ficou de fora: diverge em 44 e é palpite do provedor (`CENTRO` → `Itobi`).
- [ ] **G9** — Os números da RF7 e da RF10: distribuição por origem, deslocamento das correções,
      quantos resultados pagos foram corrigidos por humano depois, e **se o pedido pegou**.
      ⚠️ **Sem dado ainda**, e de propósito: `geocoded_address_corrections` está vazia porque
      ninguém corrigiu nada, e os pedidos nasceram hoje. Construir agora entregaria uma tela de
      zeros — ela mede a eficácia do relatório, e o relatório precisa rodar antes.
- [x] **G10 (= T10)** — ✅ Aba **Endereços** em `nfe-workspace`, verificada no navegador com dado
      real: badge 24, "24 de 148 endereços medidos", agrupado por emitente, os dois lados do endereço
      lado a lado e a distância por linha. O denominador aparece sempre — é o que separa um pedido de
      uma acusação.

### Bloco 4 — consertar com quem sabe (precisa de decisão)

- [ ] **G11 (D2)** — 🚧 Portal do contratante corrige texto e CEP.
      ⚠️ **T11 é pré-requisito duro**: esta API não tem limitador de taxa, e seria a primeira escrita
      externa que move caminhão.
- [ ] **G12** — Confirmação de quem entrega. ⚠️ **Sem pino que corrige**: a ADR-0057 §4 decidiu que
      o app não altera endereço. O relato vira ocorrência `wrong_address`, que já está no catálogo.
      ⚠️ **G12a não depende do D4 e vale sozinha**: aceitar "errado sem pino". Se a recusa exigir
      coordenada, o motorista responde "certo" para seguir adiante e a base piora.
- [ ] **G13** — As duas ações no relatório (apontar no mapa · pedir ao contratante), podendo as duas
      no mesmo endereço.

### Decisões que ainda travam

| #       | pergunta                                           | trava                                                                                          |
| ------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **D2**  | sugestão do contratante: manual ou automática?     | G11                                                                                            |
| **D3**  | termos do Maps: guardar coordenada ou só Place ID? | ⚠️ **contornado por desenho** — `address_comparisons` guarda a medição, não a coordenada deles |
| **D4**  | pino do motorista: aceito direto ou sugestão?      | G12                                                                                            |
| **T1c** | envelope do documento + coordenada                 | Bloco 4                                                                                        |
| **T1d** | correção humana escreve em `geocoded_addresses`?   | Bloco 4                                                                                        |

---

---

⚠️ **A spec tem três `[NEEDS CLARIFICATION]` abertos.** A regra do repositório é explícita: não se
implementa com eles em aberto. As tarefas marcadas **🚧 BLOQUEADA** só destravam depois da resposta,
e estão listadas assim de propósito — para o bloqueio ficar visível em vez de virar decisão tomada
por quem estiver com o teclado.

| #   | pergunta                                                                                             | trava |
| --- | ---------------------------------------------------------------------------------------------------- | ----- |
| D1  | ✅ **fechado — ADR-0061.** Roda nos 300, como terceiro gatilho do degrau 2.                          | —     |
| D2  | A sugestão do contratante é aceita à mão ou automaticamente quando a conferência de município passa? | T13   |
| D3  | Os termos do Maps Platform permitem guardar a coordenada, ou só o Place ID?                          | T04   |
| D4  | O pino do motorista é aceito direto ou entra como sugestão que o operador confirma?                  | T18b  |

---

## Fase 1 — Fundação: a correção precisa de onde morar

> 🤖 Modelo: `sonnet` (T02 é 🧠 — validar com `opus` antes)

Sem histórico, nada mais desta spec tem matéria-prima: o relatório não tem o que ordenar e a taxa de
erro do provedor é incalculável.

- [x] **T01** ✅ — Migration: `geocoded_address_corrections`, append-only, no padrão de
      `delivery_address_overrides`. Posição anterior e nova, origem, precisão, ator e data.
      _Verificação:_ `make migration-test` (migration + rollback em Postgres descartável).
      _Aceite:_ rollback devolve o schema sem a tabela.

- [x] 🧠 **T02** ✅ — Migration: o vínculo permanente `(cliente, endereço)`.
      ⚠️ **Nunca por CNPJ sozinho** — a parada agrupa por endereço normalizado de propósito, e
      _"a mesma rede em cinco lojas é cinco paradas"_. Colapsar as lojas seria defeito pior que o
      atual, porque teria cara de melhoria.
      _Aceite:_ contrato que reprova o colapso de duas lojas do mesmo cliente em números diferentes.

- [x] **T03** ⚠️ — `resolveDeliveryCoordinate`: a política de precedência (correção aceita → confirmado
      para cliente+endereço → CEP → provedor pago → centroide), no formato de
      `resolvePhysicalDestination`.
      _Aceite:_ teste que **falha se uma nota de cliente com endereço já corrigido disparar consulta
      a provedor**. É o teste que prova a economia.
      ⚠️ **Cumprida pela metade, e isso fica escrito.** O curto-circuito está provado contando
      chamadas — mas sobre closures fabricadas, não sobre nota. `resolveDeliveryCoordinate` **não tem
      chamador em `src/`**, e as duas tabelas não têm repositório. A economia que a spec manda medir
      ("medido, não presumido") só existe depois da T3b.

## Fase 1b — O que as revisões deixaram como bloqueio

> 🤖 Modelo: `sonnet` (T1c é 🧠 — decisão de dado pessoal)

Três revisões independentes (segurança, arquitetura, código) rodaram sobre a Fase 1. O que foi
corrigido no mesmo passe está no commit `feca7d9f`. O que sobra **bloqueia a Fase 2**:

- [ ] 🧠 **T1a** — **Autorização por objeto para `origin: 'contractor'`.** A FK composta prova que o
      ator é membro da empresa; ela **não** prova que aquele contratante tem direito àquele endereço.
      Sem `resolveContractorScope` na rota, um contratante autenticado corrige a coordenada de cliente
      alheio — e a correção é o degrau 1 da escada, então ela vence tudo e redireciona carga de
      outro. Não há nem coluna que ancore a correção ao vínculo para auditar depois.

- [ ] **T1b** — `tenant-safety.contract.ts` para as duas tabelas. O `CLAUDE.md` os torna obrigatórios
      em qualquer mudança de query; a Fase 1 não introduz query, então é bloqueio da T04, não
      violação de hoje.

- [ ] 🧠 **T1c** — **Decidir por escrito o envelope de `client_tax_id` + coordenada.** A linha junta
      documento identificável (que pode ser CPF) com posição de resolução de centímetro,
      permanentemente e em claro. A ADR-0039 decidiu envelope para os campos do motorista **porque
      não havia leitor** — que é exatamente a situação desta tabela agora, e deixa de ser depois da
      T04. Se a decisão for manter em claro, ela precisa ser ADR ou entrada datada em
      `docs/SECURITY.md`, não herança por silêncio.

- [ ] 🧠 **T1d** — **Decidir se correção humana escreve em `geocoded_addresses`.** Aquela tabela é
      ativo compartilhado sem `company_id`, por decisão declarada. Propagar uma correção aceita pela
      empresa A envenenaria a coordenada que serve a empresa B, que nunca aprovou nada. Combinado com
      a T1a, é caminho de ator externo de um tenant até o roteiro de outro.

- [ ] **T3b** — **Ligar a escada a um chamador real** e escrever o teste do aceite da T03 contra uma
      nota, não contra closures. Sem isso a economia da spec continua não medida.

- [ ] **T1e** — **O `PATCH /geocoded-addresses/:key` já existe e está em produção** sob
      `TRIP_MANAGE_POLICY` (`route-suggestion.routes.ts:162-185`), e grava coordenada **sem deixar
      trilha**. Hoje o produto tem correção sem histórico e histórico sem correção. Fazer o `PATCH`
      escrever em `geocoded_address_corrections` na mesma transação é o menor caminho para a RF7 nº 3
      ter dado real, sem esperar as fases 4 e 5.
      ⚠️ Isso também **desatualiza o "Fora do escopo" da spec**, que trata edição manual de coordenada
      como futura.

## Fase 2 — Medir a base

> 🤖 Modelo: `sonnet`

- [ ] 🚧 **T04 (D1, D3)** — Gateway de busca textual. Envia **estado, cidade, bairro, logradouro e
      número** (RF1). Sem cidade e UF o provedor devolve uma "Rua 7 de Setembro" de outro município
      que parece certa.

- [ ] **T05** — Conferência de município: resultado em `cityCode` diferente do da nota é
      **descartado, não comparado** (RF2). ⚠️ Esta task **não** depende de D1/D3 — escreva e teste
      antes, porque ela é a guarda que impede gravar `rooftop` na cidade errada, e é mais importante
      que a comparação em si.
      _Aceite:_ teste negativo com resultado em município vizinho.

- [ ] 🚧 **T06 (D1)** — Lote de comparação: resolve por CEP e por texto, grava a distância.
      ⚠️ **Comparar semelhante com semelhante** — `city` × `rooftop` é melhoria, não conflito; tratar
      como conflito faria os 149 inundarem o relatório.

- [ ] **T07** — Discordância **não** se resolve por regra automática (RF6): grava a mais específica,
      marca suspeito, manda ao humano. É a lição do `RUA 02` → `Rua 12`.

## Fase 3 — O relatório

> 🤖 Modelo: `sonnet`

- [ ] **T08** — Consulta do relatório: suspeitos agrupados por contratante, **ordenados por
      discordância** — não alfabeticamente. Sinais: conflito, precisão `city`, ocorrência do
      motorista, devolução.
      ⚠️ Só os dois primeiros têm dado hoje; ocorrência e devolução estão zeradas nesta base.

- [ ] **T09** — Os quatro números da RF7. O terceiro — **quantos resultados do provedor pago foram
      corrigidos depois por um humano** — é o que decide se vale continuar pagando.

- [ ] **T10** — Tela do relatório no painel, com a ação de enviar ao contratante.

## Fase 4 — O portal do contratante

> 🤖 Modelo: `opus` 🧠 — primeira escrita externa que afeta operação

- [ ] 🧠 **T11** — ⚠️ **PRÉ-REQUISITO: limitador de taxa.** Esta API não tem nenhum, achado já
      registrado em `docs/SECURITY.md`. Abrir escrita externa que influencia roteirização sem limite
      é convite. **Não subir T12–T14 sem isto.**

- [ ] 🧠 **T12** — Permissão `deliveries.address.suggest`, separada de `deliveries.track` pelo mesmo
      motivo que `charges.decide` é separada.
      _Aceite:_ o contrato de autorização lista por extenso as rotas que ela alcança.

- [ ] 🚧 **T13 (D2)** — `POST /client/me/deliveries/:accessKey/address-suggestion`. Nomeada por
      **chave de acesso**, nunca por id interno.
      _Aceite:_ chave de outro contratante responde igual a chave inexistente.

- [ ] **T14** — Tela de correção no portal: CEP e escrita.
      ⚠️ **Precisa dizer que CEP `-000` já está certo** — cidade de CEP único tem um CEP só, e quem
      tentar corrigi-lo vai concluir que o sistema está quebrado.

- [ ] **T15** — ADR: a primeira escrita do portal que move caminhão, junto da decisão de D2.

## Fase 5 — Quem entrega diz se o ponto está certo

> 🤖 Modelo: `sonnet` (T18 é 🧠 — a decisão de aceitar o pino direto)

- [ ] **T16** — Uma pergunta, sim/não, na confirmação de entrega — **só onde a precisão é baixa**.
      Formulário no fim de cada parada para de ser respondido na terceira.

- [ ] **T17** — "Não era aqui" entra como **ocorrência**, nunca como sobrescrita da coordenada.
      Pode ser portaria fechada, cliente mudou, outro portão.

- [ ] **T18a** — **O pino é opcional, e "errado sem pino" tem de ser aceito.**
      ⚠️ É o que faz o resto funcionar: se a recusa **exigir** o pino, o motorista no fim do turno
      responde "estava certo" para seguir adiante, e a base fica pior do que se ninguém perguntasse.
      _Aceite:_ contrato que **falha** se a confirmação exigir coordenada para registrar a recusa.

- [ ] 🧠 **T18b (D4)** — O pino vira `rooftop`. ⚠️ Decidir antes se ele é aceito direto ou entra como
      sugestão que o operador confirma: é a fonte que esteve na porta, mas também é um toque numa
      tela pequena, e pino errado é indistinguível de pino certo.
      ⚠️ Coordenada é dado pessoal: nada em log (`security.md` §1).

## Fase 6 — O operador conserta e cobra, da mesma tela

> 🤖 Modelo: `sonnet`

- [ ] **T19** — Apontar no mapa a partir do relatório. Conserta **onde**, com efeito imediato no
      roteiro e sem depender de ninguém responder.

- [ ] **T20** — Pedir correção ao contratante a partir do relatório. Conserta **como se chama** — é o
      caminho quando o defeito é de **nomenclatura ou CEP**, que o motorista não sabe e o pino não
      resolve.
      ⚠️ **As duas ações se somam, não se substituem.** Um pino conserta uma nota; a correção do
      texto conserta todas as seguintes, porque é ela que faz a próxima nota casar. O relatório tem
      de deixar pedir as duas no mesmo endereço.
      _Aceite:_ o pedido carrega o texto e o CEP **como vieram**, mais a razão da suspeita. Pedir
      "confira este endereço" sem dizer o que está errado devolve o mesmo endereço de volta.

---

## Como saber que funcionou

Não é "as telas existem". É:

1. A base publica **quantos por cento está confirmado por duas fontes independentes** — número que
   hoje não existe.
2. Nota nova de cliente já corrigido **não** consulta provedor. Medido, não presumido.
3. O relatório mostra a taxa de erro do provedor pago **nas suas rotas** — e é com ela que se decide
   cortar o gasto, não com opinião.

## O que esta spec não vai fazer

Está em "Fora do escopo" e vale repetir aqui, porque é o que costuma ser feito por engano:

- **Nenhuma correspondência automática por semelhança de nome de rua.** Testada, 14%, com falsos
  positivos. Não é ajuste de limiar — é o dado de entrada que não permite.
- **Nenhum mapa ou roteirizador de terceiro.** Telha e rota continuam nossas.
