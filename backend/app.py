import os
import uuid
import json
import requests
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from ariadne import (
    load_schema_from_path,
    make_executable_schema,
    QueryType,
    MutationType,
)
from ariadne.asgi import GraphQL
import boto3

from jose import jwt
from jose.exceptions import JWTError

TABLE_NAME: str = os.environ.get("MATCHING_TABLE_NAME", "MatchingTable")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

JWKS_URL = os.environ.get("JWKS_URL")
if not JWKS_URL:
    print("FATAL: JWKS_URL environment variable is missing. Authentication will fail.")

JWKS_CACHE = None


def get_jwks():
    """Fetches and caches the JSON Web Key Set (JWKS) from the Cognito endpoint."""
    global JWKS_CACHE
    if JWKS_CACHE:
        return JWKS_CACHE

    if not JWKS_URL:
        raise Exception("JWKS URL not configured for secure token verification.")

    try:
        response = requests.get(JWKS_URL)
        response.raise_for_status()
        JWKS_CACHE = response.json()
        return JWKS_CACHE
    except Exception as e:
        print(f"Error fetching JWKS from {JWKS_URL}: {e}")
        raise Exception("Failed to retrieve public keys for security verification.")


type_defs = load_schema_from_path("schema.graphql")
query = QueryType()
mutation = MutationType()


def create_volunteer_item(
    name: str, location: str, skills: List[str], availability: str
) -> Dict[str, Any]:
    item_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    return {
        "PK": f"VOLUNTEER#{item_id}",
        "SK": f"PROFILE#{item_id}",
        "GSI1PK": f"LOCATION#{location.upper()}",
        "GSI1SK": f"AVAILABILITY#{availability.upper()}",
        "EntityType": "Volunteer",
        "Data": json.dumps(
            {
                "id": item_id,
                "name": name,
                "location": location,
                "skills": skills,
                "availability": availability,
                "createdAt": now,
            }
        ),
    }


def get_user_claims(info: Any) -> Optional[Dict[str, Any]]:
    """
    Extract Cognito claims from API Gateway event or Authorization header.
    Works with both Mangum context shapes.
    """
    try:
        aws_event = (
            info.context.get("aws_event")
            or info.context.get("scope", {}).get("aws.event", {})
            or {}
        )

        request_ctx = aws_event.get("requestContext", {})
        authorizer = request_ctx.get("authorizer", {})

        if isinstance(authorizer, dict) and authorizer:
            claims = authorizer.get("claims") or authorizer.get("jwt", {}).get("claims")
            if claims:
                return claims

        headers = aws_event.get("headers", {}) or {}
        auth_header = (
            headers.get("authorization")
            or headers.get("Authorization")
            or headers.get("AUTHORIZATION")
        )
        if auth_header:
            token = auth_header.split()[-1]

            try:
                public_keys = get_jwks()

                claims = jwt.decode(
                    token,
                    public_keys,
                    options={
                        "verify_aud": False,
                        "verify_signature": True,
                    },  # Explicitly set to True for clarity
                    algorithms=["RS256"],
                )

                if claims.get("token_use") in ("id", "access"):
                    return claims
                return claims
            except JWTError as e:
                print(f"SECURITY ERROR: Token verification failed: {e}")
                return None
            except Exception as e:
                print(f"Error during manual token verification: {e}")
                return None

        print("DEBUG: No claims or auth header found in event")
        return None

    except Exception as e:
        print(f"Error extracting claims: {e}")
        return None


@mutation.field("registerVolunteer")
def resolve_register_volunteer(
    obj: Any, info: Any, name: str, location: str, skills: List[str], availability: str
) -> Dict[str, Any]:
    try:
        volunteer_item = create_volunteer_item(name, location, skills, availability)

        table.put_item(Item=volunteer_item)

        return json.loads(volunteer_item["Data"])
    except Exception as e:
        print(f"Error registering volunteer: {e}")
        raise Exception(f"Database write failed: {e}")


@mutation.field("findMatches")
def resolve_find_matches(
    obj: Any, info: Any, skillRequired: str, location: str
) -> List[Dict[str, Any]]:

    claims = get_user_claims(info)
    if not claims:
        raise Exception("Authentication required to find matches")

    user_groups = claims.get("cognito:groups", [])
    if "Charity" not in user_groups:
        raise Exception(
            "Authorisation denied. Matching only available to charity users"
        )

    try:
        response = table.query(
            IndexName="GSI1",
            KeyConditionExpression="GSI1PK = :loc",
            ExpressionAttributeValues={":loc": f"LOCATION#{location.upper()}"},
        )

        matches: List[Dict[str, Any]] = []

        for item in response.get("Items", []):
            if item["EntityType"] == "Volunteer":
                profile_data = json.loads(item["Data"])

                if skillRequired in profile_data.get("skills", []):
                    match_score = 100
                    matches.append(
                        {"volunteer": profile_data, "matchScore": match_score}
                    )

        return matches

    except Exception as e:
        print(f"Error finding matches: {e}")
        raise Exception(f"Match query failed: {e}")


executable_schema = make_executable_schema(type_defs, query, mutation)

app = FastAPI()

origins = [
    "*",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def context_value_function(request):
    """
    Ensures AWS event and headers are available to resolvers.
    """
    aws_event = getattr(request, "scope", {}).get("aws.event", {})
    return {
        "request": request,
        "aws_event": aws_event,
        "headers": dict(request.headers),
    }


app.mount(
    "/graphql",
    GraphQL(executable_schema, debug=True, context_value=context_value_function),
)


def get_handler():
    return Mangum(app, lifespan="off")


handler = get_handler()
