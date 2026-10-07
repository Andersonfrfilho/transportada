# ADR 0098 — A NFS-e fala a Nota RP v3 (padrão nacional), com a versão gravada por tentativa

- Status: aceito (revisão `architect`/Opus em 2026-10-07, com ajustes incorporados)
- Data: 2026-10-07
- Decisores: mantenedor do projeto e revisão Opus
- Emenda: ADR-0029 (provedor v2) e ADR-0035 (um ambiente só — muda a semântica de `NFSE_PROVIDER_BASE_URL`)

## Contexto

A ADR-0029 escolheu a API v2 da Nota RP porque a v3 não atendia Ribeirão Preto, e deixou escrito que
_"quando a v3 passar a atender RP, a troca é do adaptador, atrás da porta que já existe"_. Em
06/10/2026 a emissão passou a falhar com `NOTA_RP_HTTP_403 — Esta empresa não é válida para esta
versão da API. Utilize a versão v3.` O suporte da Nota RP confirmou em 07/10/2026 que o município
passou ao padrão nacional e que a v3 é o caminho; a documentação pública ainda diz "exceto Ribeirão
Preto" e está desatualizada.

Fatos que delimitam a decisão (spec 250, `evidence.md`):

1. **O desenho assíncrono não muda; a porta e três pontos sim.** `emitir` devolve `id_nota`, o status
   vem por consulta e o webhook é opcional — outbox, consumidor, write-back e `nfse.status.pull`
   seguem. Mudam: (a) `issue` passa a receber a chave de idempotência do provedor (hoje só
   `{credential, payload}`); (b) `NfseCredentialAccess` ganha `taxId` (CNPJ), que a v3 exige em
   `X-Auth-CNPJ` e que os dois repositórios do worker ainda não carregam; (c) `GET nota/listar`
   **não devolve os erros** de uma nota em `Falha` — sem tradução, a política de reconciliação
   transforma recusa sem texto em `MALFORMED` para sempre.
2. A v3 exige campos que o payload congelado não tem: `codigo_tributacao_nacional` (cTribNac) e,
   no Simples Nacional, `tributos_aproximados.aliquota_simples_nacional`. O par fiscal aceito pela
   prefeitura é outro (`160201` + `160101`; na v2 era `1602` + `160107`).
3. Limite de taxa da Nota RP: 1 req/s, burst 3. Os dois gateways criam o cliente a cada chamada e
   são duas instâncias no `main.ts`: um limitador dentro do cliente não limitaria nada.
4. A distribuição é uma instalação por transportadora (ADR-0021): a versão do provedor é do
   ambiente, mas notas já emitidas pertencem à versão em que nasceram.
5. Não há sandbox (ADR-0035). **Staging não emite NFS-e** (o `cron-nfse` só roda em produção): a
   prova fiscal é a primeira emissão real, de valor mínimo, sob aprovação.

## Decisão

1. **A versão é gravada por tentativa; a variável escolhe só a versão das emissões novas.**
   `NFSE_PROVIDER_API_VERSION` (`v2` | `v3`, padrão `v2`) é lida pela **API** e pelo **worker**
   (o cron não fala com a Nota RP). A API grava `providerApiVersion` em `providerConfig` (jsonb que
   já existe por tentativa, sem migration). Consulta, cancelamento e documentos roteiam pela versão
   **da tentativa que emitiu a nota** (ausente = `v2`). Assim voltar a variável não faz a v2 consultar
   `id_nota` da v3, e a virada é reversível.
2. **O cliente v3 é um adaptador do transportada** (`nota-rp-v3.client.ts`) atrás de
   `NfseFiscalGateway`; o `NotaRpNfseProvider` do pacote fiscal segue rejeitado (nova versão
   publicada e cliente legado carregado por todo consumidor). A invariante da ADR-0029 §1 vale:
   **trata-se o corpo, não o status** — `200` com `success:false` é recusa.
3. **`NFSE_PROVIDER_BASE_URL` continua sendo a URL do provedor, e o cliente v3 usa só a origem.**
   A v2 concatena rotas sobre uma base que já contém `/api/v2`; o cliente v3 extrai `origin` da
   mesma variável e acrescenta `/api/v3`. A virada não troca a base e `/api/v2/api/v3/...` é
   impossível por construção.
4. **`cTribNac` é coluna do perfil** (`national_taxation_code`, 6 dígitos) e **a alíquota efetiva do
   Simples também** (`simples_national_rate`, 2,00% inicial, igual à nota aceita pelo portal;
   a v3 documenta mínimo de 4,50% e a primeira emissão real mede). **Ambos são congelados no
   payload** e corrigíveis na reemissão — o worker só lê o payload congelado (ADR-0029 §1). Na v3,
   a API recusa criar a nota sem eles (`409 NFSE_NATIONAL_TAXATION_CODE_MISSING`), e um payload
   antigo sem `nationalTaxationCode` chegando ao worker é **recusa fatal nomeada**, não
   `invalid_payload` recuperável (que gastaria cinco retentativas e terminaria em `failed`).
5. **Idempotência: chave de provedor persistida na tentativa e reusada no caso ambíguo.**
   `flags.hash_pedido` = `provider_request_key` (nova coluna nuláveis em `nfse_issuance_attempts`),
   igual ao `attemptId` na primeira tentativa. Se a tentativa anterior terminou **ambígua** (sem
   `providerDocumentId` e com causa de transporte) e a nota foi a `failed`, a reemissão **copia** a
   chave — senão o timeout que criou a nota mas perdeu a resposta geraria uma segunda nota real.
   Um `409` com `id_nota` devolvido vale como `accepted`. **Risco residual:** a chave vale 24 h na
   Nota RP; depois disso o operador precisa conferir o portal antes de reemitir.
6. **Reemitir nota rejeitada que já tem `id_nota` da v3 envia `id_nota`** (a v3 reedita a nota em
   `Falha` em vez de deixar órfã). A combinação com `hash_pedido` é medida na T3.1 por fixture e na
   primeira emissão real.
7. **Classificação na consulta:** `Criada | Enviando | Pendente` → `pending`; `Sucesso` →
   `authorized` (exige número, data e `chave_acesso`); `Falha` → `rejected` com código sintético
   `NOTA_RP_FALHA` e mensagem fixa (o `listar` não traz o motivo; o painel da Nota RP o tem);
   `Cancelada` → `cancelled`; **`id_nota` inexistente (`not_found`) → `error` (adiamento), nunca
   `rejected`** — recusar libera reemissão e duplicaria uma nota talvez autorizada, o caso das notas
   que nasceram na v2.
8. **Limitador único por processo**, envolvendo o `fetch` injetado no composition root e
   compartilhado pelos dois gateways, com espaçamento ≥ 1 s. Assume **uma réplica do worker**;
   `429` é recuperável e consome orçamento de retry; escalar o worker exige limitador distribuído.
   O status pull faz até três chamadas por nota (`listar`, `pdf`, `xml`): um ciclo custa ~3N s.
9. **Cancelamento: o código do banco vira o nome da v3.** `'2'` (serviço não prestado) →
   `servico_nao_prestado`; `'4'` (nota duplicada, sem par direto) → `outros` com `descricao`
   "Nota duplicada". Só nota com `chave_acesso` é cancelável na v3.
10. **Princípio (desenho na T5.1):** a nota emitida fora do sistema se **vincula**, não se reemite.
    A via preferida é vincular pelo `id_nota` da Nota RP quando a nota nasceu no portal da Nota RP:
    o status pull traz número, chave, PDF e XML; digitar número e chave sem documento arquivado e
    sem caminho de cancelamento é a via de contingência.

## Consequências

- `NFSE_PROVIDER_API_VERSION` nasce em **worker e API**. O `NfseCredentialAccess` ganha `taxId`;
  `issue` ganha a chave do provedor.
- Migration aditiva: no perfil `national_taxation_code` e `simples_national_rate`; na tentativa
  `provider_request_key`; todas nuláveis, com `rollback.sql`.
- **Notas da v2 na virada:** a v2 já recusa a empresa, então não há "drenar". Nota v2 pendente ou
  autorizada vai a consulta (`not_found` adia), vínculo manual (decisão 10) ou portal; **cancelar
  nota v2 depois da virada é manual no portal**. A T0.2 mede quantas existem e se a consulta v2
  ainda responde.
- O perfil de Ribeirão Preto muda na virada: `municipal_taxation_code` `160107` → `160101`.
- A ADR-0035 permanece em tudo, exceto a semântica de `NFSE_PROVIDER_BASE_URL` (decisão 3).
- O motivo de uma `Falha` assíncrona não aparece no nosso painel (limitação da decisão 7);
  ler o corpo do webhook para exibi-lo fica como seguimento, fora da spec 250.

## Alternativas rejeitadas

- **Versão só pela variável de ambiente:** voltar à v2 quebraria as notas v3 e a virada deixaria as
  v2 sem caminho.
- **`hash_pedido = attemptId` puro:** duplica nota após `failed` ambíguo.
- **Throttle dentro do cliente:** o cliente nasce e morre a cada chamada.
- **Derivar o cTribNac do item da LC 116:** palpite que a prefeitura recusa.
- **Reemitir a nota rejeitada em vez de vincular a nota manual:** duplica nota e ISS.

## Segurança

Nenhum segredo novo. O token continua em `secret_envelope` (ADR-0004); CNPJ e IM já estão em claro
na credencial. O log do resultado da prefeitura redige sequências longas de dígitos
(`nfse_issuance_provider_outcome`).
