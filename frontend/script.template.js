const API_URL = "__API_URL__" + "/";
const USER_POOL_ID = "__USER_POOL_ID__";
const CLIENT_ID = "__CLIENT_ID__";
const AWS_REGION = "__AWS_REGION__";

const COGNITO_ISSUER = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}`;

const TOKEN_STORAGE_KEY = "volunteer_app_id_token";

let globalIdToken = localStorage.getItem(TOKEN_STORAGE_KEY) || "";

const LOCATIONS = [
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
];

const SKILL_OPTIONS = [
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
];

const AVAILABILITY_OPTIONS = ["WEEKDAYS", "WEEKENDS", "EVENINGS", "FULLTIME"];

const poolData = {
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
};
const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

/**
 * Decodes the JWT payload to extract the expiration time ('exp').
 * NOTE: This is a client-side *convenience* check (for UX) and MUST NOT replace
 * the essential server-side signature verification of the token's validity.
 */
function decodeJwtPayload(token) {
  try {
    const payloadBase64 = token.split(".")[1];
    const payload = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payload);
  } catch (e) {
    return null;
  }
}

/**
 * Checks if the stored token is present and has not expired.
 * @returns {boolean} True if the token is valid (not expired), false otherwise.
 */
function isTokenValid() {
  if (!globalIdToken) return false;

  const payload = decodeJwtPayload(globalIdToken);
  if (!payload || !payload.exp) return false;

  const expirationTimeMs = payload.exp * 1000;
  const nowTimeMs = Date.now();

  return expirationTimeMs > nowTimeMs;
}

/**
 * Populates a standard HTML <select> element with options.
 * This helper ensures a consistent default/placeholder option for single-select fields.
 * @param {string} selectId - The ID of the <select> element.
 * @param {Array<string>} options - Array of strings to populate the options.
 */
function addSelectOptions(selectId, options) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = `Select ${
    select.id.includes("loc")
      ? "Location"
      : select.id.includes("avail")
      ? "Availability"
      : "Skill"
  }`;
  defaultOption.disabled = true;
  defaultOption.selected = true;
  select.appendChild(defaultOption);

  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option;
    opt.textContent = option;
    select.appendChild(opt);
  });
}

/**
 * Renders the skill checkboxes within their designated container element.
 * This uses a Document Fragment to optimize DOM manipulation performance.
 */
function renderSkillCheckboxes() {
  const skillContainer = document.getElementById("reg-skills-container");
  if (!skillContainer) return;

  skillContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();

  SKILL_OPTIONS.forEach((skill) => {
    const id = `skill-${skill.replace(/[^a-zA-Z0-9]/g, "")}`;
    const divCol = document.createElement("div");
    divCol.className = "col-md-4 col-sm-6";
    const divCheck = document.createElement("div");
    divCheck.className = "form-check";
    const input = document.createElement("input");
    input.className = "form-check-input reg-skill-checkbox";
    input.type = "checkbox";
    input.value = skill;
    input.id = id;
    const label = document.createElement("label");
    label.className = "form-check-label small";
    label.htmlFor = id;
    label.textContent = skill;

    divCheck.appendChild(input);
    divCheck.appendChild(label);
    divCol.appendChild(divCheck);
    fragment.appendChild(divCol);
  });
  skillContainer.appendChild(fragment);
}

/**
 * Orchestrates the population of all form fields (dropdowns and checkboxes)
 * based on the elements present on the loaded HTML page.
 */
function populateDropdowns() {
  if (document.getElementById("reg-loc")) {
    addSelectOptions("reg-loc", LOCATIONS);
    addSelectOptions("reg-avail", AVAILABILITY_OPTIONS);
    renderSkillCheckboxes();
  }

  if (document.getElementById("match-loc")) {
    addSelectOptions("match-loc", LOCATIONS);
    addSelectOptions("match-skill", SKILL_OPTIONS);
  }
}

/**
 * Processes GraphQL match results and renders them into the results table.
 * It manages visibility for the table, raw API response, and error states.
 * @param {Object} data - The response object from the GraphQL server.
 */
function renderMatchTable(data) {
  const tableBody = document.getElementById("match-results-body");
  const tableContainer = document.getElementById("match-results-table");
  const apiResponsePre = document.getElementById("api-response");

  tableBody.innerHTML = "";
  apiResponsePre.style.display = "none";
  tableContainer.style.display = "none";

  if (data.errors) {
    apiResponsePre.textContent = JSON.stringify(data.errors, null, 2);
    apiResponsePre.style.display = "block";
    return;
  }

  const matches = data.data?.findMatches || [];

  if (matches.length === 0) {
    apiResponsePre.textContent =
      "Query successful, but no matches were found for the criteria.";
    apiResponsePre.style.display = "block";
    return;
  }

  tableContainer.style.display = "table";

  matches.forEach((match) => {
    const row = tableBody.insertRow();
    row.insertCell().textContent = match.volunteer.name;
    row.insertCell().textContent = match.volunteer.location;
    row.insertCell().textContent = match.volunteer.skills.join(", ");

    const scoreCell = row.insertCell();
    scoreCell.textContent = `${match.matchScore}%`;
    scoreCell.classList.add(
      match.matchScore >= 80
        ? "text-success"
        : match.matchScore >= 50
        ? "text-warning"
        : "text-danger"
    );
  });
}

/**
 * Handles user registration with Amazon Cognito.
 * Updates the status element but does not redirect, awaiting email verification.
 */
function registerUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const statusEl = document.getElementById("auth-status");
  statusEl.className = "text-info";

  if (!username || !password) {
    statusEl.textContent = "Username and Password required for registration.";
    statusEl.className = "status-error";
    return;
  }

  const attributeList = [
    new AmazonCognitoIdentity.CognitoUserAttribute({
      Name: "email",
      Value: username,
    }),
  ];

  userPool.signUp(username, password, attributeList, null, (err, result) => {
    if (err) {
      statusEl.textContent = `Registration Error: ${err.message}`;
      statusEl.className = "status-error";
      return;
    }
    statusEl.textContent = `User ${result.user.getUsername()} registered! Check email for verification.`;
    statusEl.className = "status-success";
  });
}

/**
 * Handles user login via Cognito. On success, stores the ID token and redirects to the application hub (index.html).
 * This establishes the required session for accessing protected resources.
 */
function loginUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const statusEl = document.getElementById("auth-status");
  statusEl.className = "text-info";

  if (!username || !password) {
    statusEl.textContent = "Username and Password required for login.";
    statusEl.className = "status-error";
    return;
  }

  const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(
    { Username: username, Password: password }
  );

  const cognitoUser = new AmazonCognitoIdentity.CognitoUser({
    Username: username,
    Pool: userPool,
  });

  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: (result) => {
      const idToken = result.getIdToken().getJwtToken();
      localStorage.setItem(TOKEN_STORAGE_KEY, idToken);
      globalIdToken = idToken;

      statusEl.textContent = `Login Success! Redirecting to application hub...`;
      statusEl.className = "status-success";

      setTimeout(() => {
        window.location.href = "index.html";
      }, 500);
    },
    onFailure: (err) => {
      statusEl.textContent = `Login Error: ${err.message}`;
      statusEl.className = "status-error";
      globalIdToken = "";
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    },
  });
}

/**
 * Clears the user's session token from local storage and redirects to the login page.
 * This is the mandatory procedure for a secure logout.
 */
function logoutUser() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  globalIdToken = "";
  alert("You have been logged out.");
  window.location.href = "login.html";
}

/**
 * General-purpose function for executing GraphQL queries or mutations against the backend API.
 * It automatically handles token inclusion for protected endpoints and manages basic error states.
 * @param {string} query - The GraphQL query/mutation string.
 * @param {Object} variables - The variables object for the query.
 * @param {boolean} requiresAuth - If true, adds the JWT token to the Authorization header.
 */
async function executeGraphQL(query, variables, requiresAuth = false) {
  const headers = { "Content-Type": "application/json" };

  const tableContainer = document.getElementById("match-results-table");
  const apiResponsePre = document.getElementById("api-response");

  if (requiresAuth) {
    if (!isTokenValid()) {
      return logoutUser();
    }
    headers["Authorization"] = globalIdToken;
  }

  if (apiResponsePre) {
    apiResponsePre.textContent = "Loading...";
    apiResponsePre.style.display = "block";
  }
  if (tableContainer) {
    tableContainer.style.display = "none";
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 401 || response.status === 403) {
      return logoutUser();
    }

    const data = await response.json();

    if (query.includes("findMatches")) {
      renderMatchTable(data);
    } else if (apiResponsePre) {
      apiResponsePre.textContent = JSON.stringify(data, null, 2);
      apiResponsePre.style.display = "block";
    }
  } catch (error) {
    if (apiResponsePre) {
      apiResponsePre.textContent = `Network Error: ${error.message}`;
      apiResponsePre.style.display = "block";
    }
    if (tableContainer) {
      tableContainer.style.display = "none";
    }
  }
}

/**
 * Executes the `registerVolunteer` GraphQL mutation.
 * Gathers data from the registration form fields, including all checked skills.
 */
function registerVolunteer() {
  const name = document.getElementById("reg-name").value;
  const location = document.getElementById("reg-loc").value;
  const availability = document.getElementById("reg-avail").value;

  const skills = Array.from(
    document.querySelectorAll(".reg-skill-checkbox:checked")
  ).map((checkbox) => checkbox.value);

  if (!name || !location || skills.length === 0 || !availability) {
    return alert(
      "Validation Error: Please ensure Name, Location, Availability are selected, and at least one Skill is checked."
    );
  }

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

  executeGraphQL(mutation, variables, true);
}

/**
 * Executes the protected `findMatches` GraphQL mutation.
 * Queries the backend for volunteers matching the specified single skill and location criteria.
 */
function findMatches() {
  const skillRequired = document.getElementById("match-skill").value;
  const location = document.getElementById("match-loc").value;

  if (!skillRequired || !location) {
    return alert(
      "Validation Error: Please select a required skill and location for matching."
    );
  }

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

  executeGraphQL(mutation, variables, true);
}

/**
 * Attaches necessary event listeners to buttons based on which elements are present on the current page.
 * This prevents runtime errors when switching between login.html and index.html.
 */
function attachEventListeners() {
  if (document.getElementById("login-btn")) {
    document
      .getElementById("register-user-btn")
      .addEventListener("click", registerUser);
    document.getElementById("login-btn").addEventListener("click", loginUser);
  }

  if (document.getElementById("register-volunteer-btn")) {
    document
      .getElementById("register-volunteer-btn")
      .addEventListener("click", registerVolunteer);
    document
      .getElementById("find-matches-btn")
      .addEventListener("click", findMatches);
    document.getElementById("logout-btn").addEventListener("click", logoutUser);
  }
}

/**
 * Enforces the access control rule on the application hub (index.html).
 * If no valid token is found in the session, the user is redirected to the login page.
 */
function checkAuthStatus() {
  const tokenEl = document.getElementById("id-token");
  const statusEl = document.getElementById("auth-status");
  const authAlert = document.getElementById("auth-alert");

  if (!tokenEl || !statusEl) return;

  if (isTokenValid()) {
    tokenEl.value = globalIdToken;
    statusEl.textContent =
      "Authenticated. Token successfully loaded from session.";
    statusEl.className = "status-success";
  } else {
    authAlert.style.display = "block";
    statusEl.textContent =
      "Authentication Failed: Session expired or not logged in. Redirecting to login...";
    statusEl.className = "status-error";

    localStorage.removeItem(TOKEN_STORAGE_KEY);
    globalIdToken = "";

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1500);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (USER_POOL_ID.startsWith("__")) {
    console.error(
      "CONFIGURATION ERROR: Environment variables were not substituted. Check CI/CD pipeline."
    );
    alert("CRITICAL CONFIGURATION ERROR: Please check deployment pipeline.");
    return;
  }
  populateDropdowns();
  attachEventListeners();

  if (document.getElementById("auth-alert")) {
    checkAuthStatus();
  }
});
