import os
import uuid
import json
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI
from mangum import Mangum
from ariadne import (
    load_schema_from_path,
    make_executable_schema,
    QueryType,
    MutationType,
)
from ariadne.asgi import GraphQL
import boto3

## Config/init

# DynamoDB client
TABLE_NAME: str = os.environ.get("MATCHING_TABLE_NAME", "MatchingTable")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

# GraphQL schema
type_defs = load_schema_from_path("schema.graphql")
query = QueryType()
mutation = MutationType()


##DynamoDB helper function
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
    """Extract Cognito claims from Lambda/API Gateway context."""
    try:
        # Access raw ASGI scope
        scope = info.context["scope"]
        aws_event = scope["aws.event"]

        # Common path for Cognito Authorizer
        claims = aws_event["requestContext"]["authorizer"]["claims"]
        return claims
    except (KeyError, TypeError):
        return None


## GraphQL resolvers
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
        # TODO: GraphQL error
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
                    # TODO Improve match logic
                    match_score = 100
                    matches.append(
                        {"volunteer": profile_data, "matchScore": match_score}
                    )

        return matches

    except Exception as e:
        print(f"Error finding matches: {e}")
        raise Exception(f"Match query failed: {e}")


## FastAPI and GraphQL

executable_schema = make_executable_schema(type_defs, query, mutation)

app = FastAPI()

# GraphQL route
app.mount("/graphql", GraphQL(executable_schema, debug=True))

# AWS handler
handler = Mangum(app, lifespan="off")
