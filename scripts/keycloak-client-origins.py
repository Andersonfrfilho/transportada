#!/usr/bin/env python3
"""
Copyright (c) 2026 Ada Technology. All rights reserved.

This source code is proprietary and confidential. Unauthorized copying,
modification, distribution, or use of this file, via any medium, is
strictly prohibited without prior written permission from Ada Technology.

Le e atualiza as origens do client `transportada-spa` no realm vivo, via admin API.

    ./scripts/keycloak-client-origins.py staging show
    ./scripts/keycloak-client-origins.py staging add-origin https://app.staging.<zona>

O `--import-realm` ignora realm ja existente, entao editar `deploy/keycloak/realm.json` nao muda o
que esta de pe, e atualizar `KEYCLOAK_FRONTEND_ORIGIN` sozinho tambem nao: o client vivo so muda
por aqui.

`add-origin` e **aditivo** — a origem antiga continua aceita. E de proposito: durante a virada as
duas precisam funcionar, e remover a antiga e um passo separado, depois da validacao.

A credencial sai das variaveis do Railway e nunca e impressa. Nao e o client de servico da API:
ele tem escopo enumerado, sem `realm-management`, e responde 403 ao ler clients (regra de
seguranca — nenhum token com permissao curinga). Aqui o token e o do admin de bootstrap, no realm
`master`, de vida curta e sem conceder privilegio permanente a client nenhum.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

RAILWAY_CONFIG = os.path.expanduser("~/.railway/config.json")
GRAPHQL_ENDPOINT = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "62de4c69-216a-4335-93a0-4942c6a95c54"

ENVIRONMENT_IDS = {
    "staging": "3cd99844-5712-40d2-aca7-75b25965419e",
    "production": "4e24a47a-1514-4106-9d38-52420bd4cef6",
}
API_SERVICE_ID = "6b1a144c-b02c-4ef6-b70e-728c0932cd61"
KEYCLOAK_SERVICE_ID = "ad34c958-05ef-4cca-a0a5-9937d36028f6"
CLIENT_ID = "transportada-spa"


def railway_variables(environment, service_id=API_SERVICE_ID):
    token = json.load(open(RAILWAY_CONFIG))["user"]["accessToken"]
    request = urllib.request.Request(
        GRAPHQL_ENDPOINT,
        data=json.dumps(
            {
                "query": """
                query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
                  variables(projectId: $projectId, environmentId: $environmentId,
                            serviceId: $serviceId)
                }
                """,
                "variables": {
                    "projectId": PROJECT_ID,
                    "environmentId": ENVIRONMENT_IDS[environment],
                    "serviceId": service_id,
                },
            }
        ).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            "User-Agent": "transportada/kc-client",
        },
    )
    with urllib.request.urlopen(request) as response:
        payload = json.load(response)
    if "errors" in payload:
        raise SystemExit(json.dumps(payload["errors"], indent=2))
    return payload["data"]["variables"]


def http(url, method="GET", data=None, token=None, form=False):
    headers = {"User-Agent": "transportada/kc-client"}
    body = None
    if form:
        body = urllib.parse.urlencode(data).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif data is not None:
        body = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise SystemExit(f"HTTP {error.code} em {method} {url}: {error.read().decode()[:400]}")


def main():
    environment, command = sys.argv[1], sys.argv[2]
    variables = railway_variables(environment)
    issuer = variables["KEYCLOAK_ISSUER"]
    base, realm = issuer.split("/realms/")

    # O client de servico da API tem escopo enumerado e nao inclui `realm-management` (403 ao ler
    # clients). Aqui o token e o do admin de bootstrap, no realm `master`, de vida curta e sem
    # conceder privilegio permanente a nenhum client.
    keycloak_variables = railway_variables(environment, KEYCLOAK_SERVICE_ID)
    token = http(
        f"{base}/realms/master/protocol/openid-connect/token",
        method="POST",
        form=True,
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": keycloak_variables["KC_BOOTSTRAP_ADMIN_USERNAME"],
            "password": keycloak_variables["KC_BOOTSTRAP_ADMIN_PASSWORD"],
        },
    )["access_token"]

    admin = f"{base}/admin/realms/{realm}/clients"
    found = http(f"{admin}?clientId={CLIENT_ID}", token=token)
    if not found:
        raise SystemExit(f"client {CLIENT_ID} nao encontrado no realm {realm}")
    client = found[0]

    if command == "show":
        print(json.dumps({key: client.get(key) for key in
                          ("id", "clientId", "redirectUris", "webOrigins", "attributes")}, indent=2))
        return

    if command == "add-origin":
        origin = sys.argv[3].rstrip("/")
        client["redirectUris"] = sorted(set(client["redirectUris"]) | {f"{origin}/auth/callback"})
        client["webOrigins"] = sorted(set(client["webOrigins"]) | {origin})
        attributes = client.setdefault("attributes", {})
        logout = attributes.get("post.logout.redirect.uris", "")
        parts = [p for p in logout.split("##") if p]
        attributes["post.logout.redirect.uris"] = "##".join(
            sorted(set(parts) | {f"{origin}/*", origin})
        )
        http(f"{admin}/{client['id']}", method="PUT", data=client, token=token)
        print(f"origem adicionada: {origin}")
        return

    raise SystemExit("comando invalido")


if __name__ == "__main__":
    main()
