// --- CONFIGURATION ---
const API_URL =
  "https://tcmnbo6vc4.execute-api.eu-west-2.amazonaws.com/prod/graphql/";
const USER_POOL_ID = "eu-west-2_MY3zfWvZN";
const CLIENT_ID = "4jfntis7unabhjg49dotvi0sga";

let globalIdToken = "";

const poolData = {
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
};
const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

// Auth functions
/** User registration using Cognito SDK. */
function registerUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!username || !password)
    return alert("Username and Password required for registration.");

  const attributeList = [
    new AmazonCognitoIdentity.CognitoUserAttribute({
      Name: "email",
      Value: username,
    }),
  ];

  userPool.signUp(username, password, attributeList, null, (err, result) => {
    if (err) {
      document.getElementById(
        "auth-status"
      ).textContent = `Registration Error: ${err.message}`;
      return;
    }
    document.getElementById(
      "auth-status"
    ).textContent = `User ${result.user.getUsername()} registered! Check email for verification.`;
    // TODO: Verification flow here
  });
}

/** User login and ID token. */
function loginUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!username || !password)
    return alert("Username and Password required for login.");

  const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(
    {
      Username: username,
      Password: password,
    }
  );

  const cognitoUser = new AmazonCognitoIdentity.CognitoUser({
    Username: username,
    Pool: userPool,
  });

  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: (result) => {
      globalIdToken = result.getIdToken().getJwtToken();
      document.getElementById("id-token").value = globalIdToken;
      document.getElementById(
        "auth-status"
      ).textContent = `Login Success! Token retrieved.`;
    },
    onFailure: (err) => {
      document.getElementById(
        "auth-status"
      ).textContent = `Login Error: ${err.message}`;
      globalIdToken = "";
    },
  });
}

/** GraphQL query/mutation. */
async function executeGraphQL(query, variables, requiresAuth = false) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (requiresAuth) {
    if (!globalIdToken) {
      document.getElementById("api-response").textContent =
        "Error: Authentication token required. Please log in first.";
      return;
    }
    // ID Token for API Gateway Authorizer
    headers["Authorization"] = globalIdToken;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();
    document.getElementById("api-response").textContent = JSON.stringify(
      data,
      null,
      2
    );
  } catch (error) {
    document.getElementById(
      "api-response"
    ).textContent = `Network Error: ${error.message}`;
  }
}

// API functions

/** registerVolunteer mutation (no token required)*/
function registerVolunteer() {
  const name = document.getElementById("reg-name").value;
  const location = document.getElementById("reg-loc").value;
  const skills = document
    .getElementById("reg-skills")
    .value.split(",")
    .map((s) => s.trim());
  const availability = document.getElementById("reg-avail").value;

  const mutation = `
        mutation RegisterVolunteer($name: String!, $location: String!, $skills: [String!]!, $availability: String!) {
            registerVolunteer(name: $name, location: $location, skills: $skills, availability: $availability) {
                id
                name
                skills
            }
        }
    `;
  const variables = { name, location, skills, availability };

  // Mutation secured by API Gateway Authorizer
  // fails if executed without a token.
  // Needs separate Lambda/API Gateway path
  // with no authorization/complex VTL mapping on API Gateway.
  // Treat as authenticated here for demo
  executeGraphQL(mutation, variables, true);
}

/** Protected findMatches mutation (token required)*/
function findMatches() {
  const skillRequired = document.getElementById("match-skill").value;
  const location = document.getElementById("match-loc").value;

  const mutation = `
        mutation FindMatches($skillRequired: String!, $location: String!) {
            findMatches(skillRequired: $skillRequired, location: $location) {
                volunteer {
                    name
                    location
                    skills
                }
                matchScore
            }
        }
    `;
  const variables = { skillRequired, location };

  // ID Token in header required
  executeGraphQL(mutation, variables, true);
}
