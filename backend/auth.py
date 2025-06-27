from fastapi import Depends, HTTPException, Request
from jose import jwt
import requests
import os

COGNITO_REGION = "ap-south-1"
USERPOOL_ID = "ap-south-1_PiRQYrDB1"
APP_CLIENT_ID = "2mgl2q0crrj8a9eva5sbj1bi12"

COGNITO_ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{USERPOOL_ID}"
JWKS_URL = f"{COGNITO_ISSUER}/.well-known/jwks.json"

jwks = requests.get(JWKS_URL).json()

def get_public_key(token):
    headers = jwt.get_unverified_header(token)
    kid = headers['kid']
    key = next((k for k in jwks['keys'] if k['kid'] == kid), None)
    return key

def verify_token(token: str):
    key = get_public_key(token)
    if not key:
        raise HTTPException(status_code=401, detail="Public key not found.")
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=APP_CLIENT_ID,
            issuer=COGNITO_ISSUER
        )
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = auth_header.split(" ")[1]
    return verify_token(token)
