import os
import uuid
import json
import random
from datetime import datetime
from typing import List, Dict, Any

import boto3
from faker import Faker

TABLE_NAME = "VolunteerMatchingApp-Dev-MatchingTable"
REGION = "eu-west-2"
NUM_RECORDS = 250

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)
fake = Faker("en_GB")

SKILL_OPTIONS = [
    "Gardening",
    "Tutor",
    "Driving",
    "Cooking",
    "Web Design",
    "Social Media",
    "Elder Care",
    "First Aid",
    "Translation",
    "Mentoring",
    "DIY/Maintenance",
    "Admin/Clerical",
    "Fundraising",
    "Event Planning",
]

AVAILABILITY_OPTIONS = ["WEEKDAYS", "WEEKENDS", "EVENINGS", "FULLTIME"]
LOCATIONS = [
    "London",
    "Manchester",
    "Birmingham",
    "Edinburgh",
    "Cardiff",
    "Glasgow",
    "Leeds",
    "Bristol",
    "Liverpool",
    "Belfast",
    "Nottingham",
    "Sunderland",
    "Brighton",
    "Croydon",
    "Cambridge",
    "Auchterarder",
    "Aberdeen",
    "Stirling",
    "Dundee",
]


def generate_single_volunteer() -> Dict[str, Any]:
    """Generates a single volunteer item adhering to the DynamoDB structure."""
    item_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    name = fake.name()
    location = random.choice(LOCATIONS)
    skills = random.sample(SKILL_OPTIONS, k=random.randint(1, 4))
    availability = random.choice(AVAILABILITY_OPTIONS)

    volunteer_item = {
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
    return volunteer_item


def batch_put_items(items: List[Dict[str, Any]]):
    """Writes items to DynamoDB using batch_writer for efficiency."""
    print(f"Starting batch write of {len(items)} items to {TABLE_NAME}...")

    try:
        with table.batch_writer() as batch:
            for item in items:
                batch.put_item(Item=item)
        print("Batch write completed successfully.")

    except Exception as e:
        print(f"An error occurred during batch write: {e}")
        print(
            "Please ensure your AWS credentials are configured and your DynamoDB table is active."
        )


if __name__ == "__main__":

    print(f"Generating {NUM_RECORDS} dummy records...")
    dummy_items = [generate_single_volunteer() for _ in range(NUM_RECORDS)]

    batch_put_items(dummy_items)
