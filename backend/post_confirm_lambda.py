import json
import os
import boto3

# Initialize the Cognito Identity Provider client
# It's best practice to initialize outside the handler if possible,
# but Boto3 handles reuse well within a warm Lambda container.
client = boto3.client("cognito-idp")

# Name of the group to which all new users should be added
CHARITY_GROUP_NAME = os.environ.get("CHARITY_GROUP_NAME", "Charity")


def handler(event, context):
    """
    AWS Lambda handler for the Cognito Post Confirmation trigger.
    Automatically adds the newly confirmed user to the designated group.
    """
    print(f"Post Confirmation Trigger received event: {json.dumps(event, indent=2)}")

    # Check if the user is confirmed; this should always be true for this trigger
    if event["request"]["userAttributes"]["email_verified"] != "true":
        print("User is not confirmed. Skipping group addition.")
        return event

    try:
        user_pool_id = event["userPoolId"]
        username = event["userName"]

        # Add the user to the specified group
        response = client.admin_add_user_to_group(
            UserPoolId=user_pool_id, Username=username, GroupName=CHARITY_GROUP_NAME
        )

        print(
            f"Successfully added user {username} to group {CHARITY_GROUP_NAME}. Response: {response}"
        )

    except Exception as e:
        # Log the error but still return the event to allow the process to continue
        print(f"Error adding user to group: {e}")
        # NOTE: A failure here will not stop the user from being logged in,
        # but they will fail the authorization check later. This should be monitored.

    # Always return the event object
    return event
