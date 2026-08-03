# ADR-0017: Manifesto rejeitado é descartado, não corrigido — e devolve o CT-e

## Contexto

O E2E da `T028` (feature 013) emitiu MDF-e de verdade na SVRS e levou três rejeições seguidas
(745, 301, 699), todas por dado do manifesto. Cada uma revelou o mesmo beco sem saída:

- não existe rota de edição nem de descarte de manifesto — só `preview`, `list`, `create`, `detail`,
  `issue`, `close` e `cancel`;
- `checkCancel` só aceita manifesto `authorized`, então um `rejected` não cancela;
- `mdfe_manifest_items.released_at` **não é escrito por nenhum caminho de código**, apesar de
  `specs/013-fleet-and-mdfe/evidence.md` afirmar que cancelar o manifesto devolveria o CT-e;
- o unique parcial `mdfe_manifest_items` sobre `cte_document_id where released_at is null` então
  prende o CT-e para sempre no manifesto morto.

Resultado prático: cada rejeição custou um CT-e novo. Os manifestos `4ef75fa1` e `4da262d0` seguram
dois CT-es autorizados que nunca poderão ser manifestados.

## Decisão

### 1. Um novo estado terminal `discarded`, em vez de editar o manifesto

`MDFE_MANIFEST_STATUSES` ganha `discarded`. `POST /mdfe-manifests/:id/discard` (permissão
`mdfe.manage`) aceita **apenas** `draft` e `rejected` e é idempotente sobre um manifesto já
descartado.

Editar um manifesto rejeitado seria mais cômodo e é o que rejeitamos. A tentativa já reservou e
queimou número de série — o `mdfe_issuance_attempts` e o `mdfe_issuance_events` daquele número são
histórico fiscal e o princípio 5 da constituição diz que histórico não se sobrescreve. Reemitir
exige número novo de qualquer forma, então corrigir em cima do mesmo agregado só embaralharia o
rastro sem economizar nada além de uma tela de recadastro. Descartar e recriar mantém cada tentativa
legível: este manifesto foi rejeitado por 699, aquele outro foi autorizado.

`authorized` e `closed` não descartam — para esses o caminho legal é o evento 110111. `issuing`
também não: há uma mensagem em voo, e liberar o CT-e enquanto a SEFAZ decide abriria janela para o
mesmo documento entrar em dois manifestos.

### 2. `released_at` é escrito em toda saída do vínculo — descarte e cancelamento

Descartar carimba `released_at` em todo `mdfe_manifest_items` do manifesto. Cancelar um manifesto
autorizado passa a fazer o mesmo, no efeito do worker que confirma o 110111 — hoje não faz, e essa
é a diferença entre o que o `evidence.md` promete e o que o código entrega.

O carimbo é o que libera o unique parcial e devolve o CT-e para um manifesto novo. A linha do
vínculo continua lá: quem manifestou o quê, e quando saiu.

### 3. A rejeição da SEFAZ é persistida por inteiro

`mdfe_issuance_attempts` guarda hoje só `last_error_code`. Passa a guardar também a mensagem da
SEFAZ, exposta no detalhe do manifesto. Sem ela o operador vê `rejected` e um número, e o
diagnóstico das três rejeições desta task só foi possível lendo o stdout do worker.

Na mesma linha, a falha de `decode` do envelope deixa de morrer calada: hoje o Zod estoura dentro do
`provider.consume`, antes do handler, e a mensagem vai para a dead queue sem log e sem
`markDeadLettered`. Foi exatamente o que escondeu o defeito do envelope sem `status` por dias.

## Consequências

- Migration de check constraint em `mdfe_manifests.status` mais coluna de motivo em
  `mdfe_issuance_attempts`, com rollback ao lado.
- O frontend ganha a ação de descarte na página de manifestos e passa a mostrar o motivo da recusa.
- Um CT-e volta a ser manifestável depois do descarte — o teste de contrato do agrupamento precisa
  cobrir esse retorno, senão o unique parcial silencia a regressão.
- Os dois manifestos rejeitados que hoje seguram CT-es em homologação serão descartados por esta
  rota, e não por `UPDATE` manual.
