# Volunteer Matching App

## Project Summary

The Volunteer Matching Application is a proof-of-concept full-stack solution
designed to streamline the process of connecting volunteer skills with the
specific, evolving needs of a charity. It features a complete Continuous
Integration and Continuous Delivery (CI/CD) pipeline that automatically deploys
a secure, serverless architecture on AWS. The system replaces manual matching
processes, improving resource allocation efficiency.

### Live Demo

[Link](https://d1mk4a8t69qmye.cloudfront.net/)

**Note on Access**: Self-registration is currently **disabled** for this public
demo to maintain the integrity and security of the AWS backend resources.
Visitors will be restricted to the log in / sign-up page.

## Key features

### Security and Authentication

- **Secure sign-up**: Utilises AWS Cognito for robust user authentication.

- **User lifecycle management**: Features a Cognito User Pool and User Group
  (`charity`) to manage access control.

- **Verification workflow**: New users are validated via a verification email
  containing a six-digit confirmation code.

- **Post-confirmation hook**: A dedicated AWS Lambda function
  (`post_confirm_lambda.py`) automatically assigns the Charity group to newly
  confirmed users, enforcing security policies.

### Matching Functionality

- **GraphQL API**: The core matching logic is exposed via a GraphQL endpoint
  built with FastAPI and Ariadne.

- **Volunteer Registration**: A secure, signed-in user interface allows
  registration of volunteer details, including:

  - Name and contact details.
  - Availability and location.
  - Specific skill selection.

Find Matches Tool: A front-end utility featuring `location to search` and
`skill required` dropdowns that query the back-end data in DynamoDB via the
GraphQL API to find the best volunteer candidates.

### Architecture and Development

- **Session Management**: Implements and debugs session token handling for
  authenticated GraphQL calls.

- **Log Out Functionality**: Provides a secure mechanism for user session
  termination.

### Technical Architecture

#### Back-end

| Component      | Technology                                                          | Role                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework      | Python (3.11), FastAPI                                              | Main application logic for the GraphQL API.                                                                                                              |
| GraphQL        | Ariadne, `ariadne-graphql-modules`                                  | Schema definition and resolver handling.                                                                                                                 |
| Deployment     | AWS SAM, Docker                                                     | Defines and deploys the entire stack, including the Lambda function.                                                                                     |
| API Gateway    | AWS Serverless API                                                  | Securely exposes the GraphQL endpoint.                                                                                                                   |
| Database       | AWS DynamoDB                                                        | Highly-available, performant NoSQL data store for volunteer and charity records, configured with a Global Secondary Index (GSI) for optimised searching. |
| Authentication | AWS Cognito                                                         | Manages user identity, sign-up, and access tokens.                                                                                                       |
| Requirements   | `fastapi`, `uvicorn`, `ariadne`, `boto3`, `python-jose`, `requests` | Python dependencies.                                                                                                                                     |

#### Front-end / Delivery

| Component    | Technology                      | Role                                                                                                                                     |
| ------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend     | HTML, JavaScript (Vanilla), CSS | Client-side application for user interaction and data presentation.                                                                      |
| Distribution | AWS CloudFront                  | Global Content Delivery Network (CDN) to serve the static frontend assets securely and with low latency via Origin Access Control (OAC). |
| Storage      | AWS S3                          | Secure bucket used to host the static front-end assets.                                                                                  |

### CI/CD Pipeline (GitHub Actions)

The project uses a complete CI/CD pipeline defined in
`.github/workflows/deploy.yml` that executes on every push to the `main` branch.

#### Pipeline Steps

1. Checkout and Setup: Clones the repository and sets up Python 3.11 and the AWS
   SAM CLI.

2. AWS Credentials: Configures authentication using GitHub Secrets
   (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).

3. SAM Build and Validate: Executes `sam build` to package the Python
   dependencies and validates the `sam/template.yaml`.

4. Backend Deployment: Uses `sam deploy` to provision and update all AWS
   resources (DynamoDB, Cognito, Lambda, API Gateway).

5. Output Retrieval: Fetches the dynamically generated AWS resource identifiers
   (API URL, User Pool ID) from the CloudFormation stack outputs.

6. Frontend Generation: Uses `sed` to inject the dynamic AWS identifiers into
   `frontend/script.template.js`, creating the functioning `frontend/script.js`
   file.

7. Frontend Deployment: Synchronises the generated front-end files to the S3
   bucket hosting the site.

8. Cleanup: Deletes temporary S3 deployment buckets.

### Licence

This project is open-sourced under the MIT Licence.
