# Feature 084 — Tarefas

⚠️ **A spec tem três `[NEEDS CLARIFICATION]` abertos.** A regra do repositório é explícita: não se
implementa com eles em aberto. As tarefas marcadas **🚧 BLOQUEADA** só destravam depois da resposta,
e estão listadas assim de propósito — para o bloqueio ficar visível em vez de virar decisão tomada
por quem estiver com o teclado.

| #   | pergunta                                                                                             | trava    |
| --- | ---------------------------------------------------------------------------------------------------- | -------- |
| D1  | O lote de comparação roda nos 300 ou só nos 149? Nos 300 contradiz a ADR-0047 e exige ADR própria.   | T04, T05 |
| D2  | A sugestão do contratante é aceita à mão ou automaticamente quando a conferência de município passa? | T13      |
| D3  | Os termos do Maps Platform permitem guardar a coordenada, ou só o Place ID?                          | T04      |

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

## Fase 5 — O motorista

> 🤖 Modelo: `sonnet`

- [ ] **T16** — Uma pergunta, sim/não, na confirmação de entrega — **só onde a precisão é baixa**.
      Formulário no fim de cada parada para de ser respondido na terceira.

- [ ] **T17** — "Não era aqui" entra como **ocorrência**, nunca como sobrescrita da coordenada.
      Pode ser portaria fechada, cliente mudou, outro portão.

- [ ] 🧠 **T18** — A posição do celular vira `rooftop` — a única fonte que esteve na porta, de graça
      e sem licença de terceiro. ⚠️ Coordenada é dado pessoal: nada em log (`security.md` §1).

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
