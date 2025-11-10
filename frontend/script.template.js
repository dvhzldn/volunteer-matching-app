// --- CONFIGURATION ---
const API_URL = "__API_URL__" + "/";
const USER_POOL_ID = "__USER_POOL_ID__";
const CLIENT_ID = "__CLIENT_ID__";

let globalIdToken = "";

// --- Data Lists (Must match backend data generation/querying logic) ---
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

// --- Cognito Initialization ---
const poolData = {
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
};
const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

// --- Utility Functions ---

/** Populates the select and checkbox elements with options on page load. */
function populateDropdowns() {
  // Helper to add options to standard selects
  const addSelectOptions = (selectId, options) => {
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
  };

  // Renders the skill checkboxes
  const skillContainer = document.getElementById("reg-skills-container");
  if (skillContainer) {
    skillContainer.innerHTML = "";
    SKILL_OPTIONS.forEach((skill) => {
      const id = `skill-${skill.replace(/[^a-zA-Z0-9]/g, "")}`;
      const checkboxHtml = `
                <div class="col-md-4 col-sm-6">
                    <div class="form-check">
                        <input class="form-check-input reg-skill-checkbox" type="checkbox" value="${skill}" id="${id}">
                        <label class="form-check-label small" for="${id}">
                            ${skill}
                        </label>
                    </div>
                </div>
            `;
      skillContainer.innerHTML += checkboxHtml;
    });
  }

  // Populate Select Dropdowns
  addSelectOptions("reg-loc", LOCATIONS);
  addSelectOptions("reg-avail", AVAILABILITY_OPTIONS);
  addSelectOptions("match-loc", LOCATIONS);
  addSelectOptions("match-skill", SKILL_OPTIONS);
}

/** Renders the match results into the HTML table. */
function renderMatchTable(data) {
  const tableBody = document.getElementById("match-results-body");
  const tableContainer = document.getElementById("match-results-table");
  const apiResponsePre = document.getElementById("api-response");

  // Clear previous results
  tableBody.innerHTML = "";
  apiResponsePre.style.display = "none";
  tableContainer.style.display = "none";

  if (data.errors) {
    // Show raw error response in PRE tag
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

  // Display the table
  tableContainer.style.display = "table";

  matches.forEach((match) => {
    const row = tableBody.insertRow();

    row.insertCell().textContent = match.volunteer.name;
    row.insertCell().textContent = match.volunteer.location;
    // Display skills as a comma-separated string
    row.insertCell().textContent = match.volunteer.skills.join(", ");
    // Use Bootstrap class for colored background on score
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

// --- Auth functions (Updated status class for visual feedback) ---

/** User registration using Cognito SDK. */
function registerUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const statusEl = document.getElementById("auth-status");
  statusEl.className = "text-info";

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
      statusEl.textContent = `Registration Error: ${err.message}`;
      statusEl.className = "status-error";
      return;
    }
    statusEl.textContent = `User ${result.user.getUsername()} registered! Check email for verification.`;
    statusEl.className = "status-success";
  });
}

/** User login and ID token. */
function loginUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const statusEl = document.getElementById("auth-status");
  statusEl.className = "text-info";

  if (!username || !password)
    return alert("Username and Password required for login.");

  const authenticationDetails =
    new AmazonCognitoIdentity.CognitoIdentity.AuthenticationDetails({
      Username: username,
      Password: password,
    });

  const cognitoUser = new AmazonCognitoIdentity.CognitoUser({
    Username: username,
    Pool: userPool,
  });

  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: (result) => {
      globalIdToken = result.getIdToken().getJwtToken();
      document.getElementById("id-token").value = globalIdToken;
      statusEl.textContent = `Login Success! Token retrieved.`;
      statusEl.className = "status-success";
    },
    onFailure: (err) => {
      statusEl.textContent = `Login Error: ${err.message}`;
      statusEl.className = "status-error";
      globalIdToken = "";
    },
  });
}

/** GraphQL query/mutation. */
async function executeGraphQL(query, variables, requiresAuth = false) {
  const headers = {
    "Content-Type": "application/json",
  };

  const tableContainer = document.getElementById("match-results-table");
  const apiResponsePre = document.getElementById("api-response");

  if (requiresAuth) {
    if (!globalIdToken) {
      apiResponsePre.textContent =
        "Error: Authentication token required. Please log in first.";
      apiResponsePre.style.display = "block";
      tableContainer.style.display = "none";
      return;
    }
    headers["Authorization"] = globalIdToken;
  }

  // Clear previous feedback
  apiResponsePre.textContent = "Loading...";
  apiResponsePre.style.display = "block";
  tableContainer.style.display = "none";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();

    if (query.includes("findMatches")) {
      renderMatchTable(data);
    } else {
      // Default JSON view for registration success or other responses
      apiResponsePre.textContent = JSON.stringify(data, null, 2);
      apiResponsePre.style.display = "block";
    }
  } catch (error) {
    apiResponsePre.textContent = `Network Error: ${error.message}`;
    apiResponsePre.style.display = "block";
    tableContainer.style.display = "none";
  }
}

// --- API functions (Updated to read from checkbox inputs) ---

/** registerVolunteer mutation (Updated to read checkbox values)*/
function registerVolunteer() {
  const name = document.getElementById("reg-name").value;
  const location = document.getElementById("reg-loc").value;
  const availability = document.getElementById("reg-avail").value;

  // Read selected skills from the checkboxes
  const skills = Array.from(
    document.querySelectorAll(".reg-skill-checkbox:checked")
  ).map((checkbox) => checkbox.value);

  if (!name || !location || skills.length === 0 || !availability) {
    return alert(
      "Please ensure Name, Location, Availability are selected, and at least one Skill is checked."
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

/** Protected findMatches mutation (Reads from selects)*/
function findMatches() {
  const skillRequired = document.getElementById("match-skill").value;
  const location = document.getElementById("match-loc").value;

  if (!skillRequired || !location) {
    return alert("Please select a required skill and location for matching.");
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

// --- Initial Setup ---
// Run on page load
document.addEventListener("DOMContentLoaded", populateDropdowns);
