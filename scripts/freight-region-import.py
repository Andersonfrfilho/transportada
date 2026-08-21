#!/usr/bin/env python3
"""
Copyright (c) 2026 Ada Technology. All rights reserved.

This source code is proprietary and confidential. Unauthorized copying,
modification, distribution, or use of this file, via any medium, is
strictly prohibited without prior written permission from Ada Technology.

Importa a tabela de frete do cliente pela rota da API.

    export TRANSPORTADA_TOKEN='<bearer do usuario com settings.manage>'
    ./scripts/freight-region-import.py local                # so confere os arquivos
    ./scripts/freight-region-import.py production --apply   # envia

A carga NAO e seed: ela entra por `POST /freight-regions/import`, autenticada, com a empresa
vindo do contexto do token. Seed em `src/` gravaria dado de um cliente no produto, que e generico.

Reimportar o mesmo arquivo e no-op: a chave natural e o codigo da rota, e o resumo volta
`{created: 0, updated: 0, deactivated: 0}`. Rota ausente do arquivo vai a `inactive`, nunca
some — por isso arquivo de rotas vazio e recusado pela API (`FREIGHT_REGION_IMPORT_EMPTY`).

O token nunca e impresso, nem em erro: ele vale por qualquer escrita de configuracao da empresa.
"""

import json
import os
import sys
import urllib.error
import urllib.request

ZONE = "fernandes-transportadora.com.br"
BASE_URLS = {
    "local": "http://127.0.0.1:53001",
    "staging": f"https://api.staging.{ZONE}",
    "production": f"https://api.{ZONE}",
}
DATA_DIRECTORY = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "specs",
    "045-a-regiao-do-motorista-tem-valor",
    "data",
)


def read_csv(name):
    path = os.path.join(DATA_DIRECTORY, name)
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def describe(regions, rates):
    region_lines = [line for line in regions.splitlines()[1:] if line.strip()]
    rate_lines = [line for line in rates.splitlines()[1:] if line.strip()]
    codes = {line.split(",", 1)[0] for line in region_lines}
    return f"{len(codes)} rotas, {len(region_lines)} cidades, {len(rate_lines)} linhas de valor"


def post(base_url, token, regions, rates):
    request = urllib.request.Request(
        f"{base_url}/freight-regions/import",
        data=json.dumps({"rates": rates, "regions": regions}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            "User-Agent": "transportada/freight-region-import",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        body = error.read().decode(errors="replace")
        raise SystemExit(f"HTTP {error.code} de {base_url}: {body}") from None


def main():
    arguments = sys.argv[1:]
    apply_changes = "--apply" in arguments
    positional = [argument for argument in arguments if not argument.startswith("--")]
    environment = positional[0] if positional else ""
    if environment not in BASE_URLS:
        raise SystemExit(f"uso: {sys.argv[0]} <{'|'.join(BASE_URLS)}> [--apply]")

    regions = read_csv("regioes.csv")
    rates = read_csv("valores.csv")
    print(f"{environment}: {describe(regions, rates)}")

    if not apply_changes:
        print("sem --apply: nada foi enviado")
        return

    token = os.environ.get("TRANSPORTADA_TOKEN", "")
    if not token:
        raise SystemExit("TRANSPORTADA_TOKEN ausente — precisa de um bearer com settings.manage")

    summary = post(BASE_URLS[environment], token, regions, rates)
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
