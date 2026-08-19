# Invalidação de consulta depois de uma mutação

Toda mutação que mexe num **vínculo** muda duas telas: a que executou a ação e a que lê o vínculo do
outro lado. O alcance dessa mudança é declarado **uma vez**, em
`src/modules/shared/mutationInvalidation.service.ts`, e disparado pelo hook:

```ts
onSuccess: async () => {
  await invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
}
```

Nenhum hook monta a lista de chaves na mão, e nenhum hook importa a chave de consulta de outro
módulo para invalidá-la. O contrato `test/shared/mutation-invalidation.contract.ts` reprova as duas
coisas.

## O bug que originou a regra

Descartar uma NFS-e solta a NF-e no banco — o vínculo passa a ter `cancelled_at` e sai do recorte
ativo. O hook do descarte invalidava só `nfse-invoices`. A tabela de notas continuava servindo a
página anterior, com o `cteBlockReason` que a API tinha resolvido **antes** do descarte, e o
checkbox seguia desabilitado (`isDocumentBlocked` lê o bloqueio que veio da API, não o recalcula).
Com `staleTime` de 30s e `retry: false`, a lista velha sobrevivia até remontar, ganhar foco ou
recarregar a página — e recarregar era exatamente o que "resolvia".

Não era caso isolado. Todo caminho que **cria** o vínculo invalidava os dois lados; todo caminho que
**solta** o vínculo nasceu invalidando só o seu — porque a lista de chaves era rederivada à mão em
cada hook, e quem escreveu o caminho de soltar não tinha onde ler o alcance. Foram quatro defeitos
da mesma forma: descarte e cancelamento de NFS-e (em lote e por linha), cancelamento de lote de
CT-e, remoção de item do lote, e o cancelamento de fatura, que devolve o CT-e à elegibilidade sem
que a lista de elegíveis soubesse.

## Os efeitos

| Efeito               | O que mudou no servidor                                          | Consultas refeitas                                                                                                                       |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `nfeDocumentLink`    | Uma NF-e entrou num lote ou numa NFS-e, ou voltou a ficar livre. | `nfe-documents`, `cte-emission-preview`, `nfse-emission-preview`                                                                         |
| `billingInvoiceItem` | Um CT-e foi reservado numa fatura, ou a fatura o devolveu.       | `billing-documents`, `billing-eligible-list`, `billing-invoice`, `billing-invoice-list`, `company-cte-items`, `company-cte-item-summary` |

As chaves são literais no registro **de propósito**: importá-las traria seis módulos para dentro do
grafo de `shared/`. O que garante que o literal não descolou é o contrato, que compara cada uma com
a constante exportada pelo módulo dono.

## Ao escrever uma mutação nova

1. A mutação muda alguma coisa que **outra tela** lê? Se muda, ela dispara um efeito.
2. O efeito já existe? Use-o. Não existe? Acrescente-o ao registro, com a lista de chaves e o
   comentário dizendo o que ele significa, e liste o produtor em `EFFECT_PRODUCERS` no contrato.
3. Chave que só a própria tela lê (detalhe por id, preferência de visualização) continua sendo
   invalidada localmente — efeito é para o que atravessa módulo.

O contrato cobra que cada produtor conhecido dispare o efeito dele, e que ninguém invalide chave
alheia por conta própria. O que ele **não** consegue é adivinhar que a mutação de amanhã também mexe
num vínculo — essa parte é esta regra, e a pergunta 1 acima é a verificação.
