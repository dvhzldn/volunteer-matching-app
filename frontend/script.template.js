const API_URL = "__API_URL__" + "/";
const USER_POOL_ID = "__USER_POOL_ID__";
const CLIENT_ID = "__CLIENT_ID__";

let globalIdToken = "";

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

function populateDropdowns() {
  const addOptions = (selectId, options, isSkills = false) => {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = "";

    if (!isSkills && select.id !== "match-skill") {
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = isSkills
        ? "Select Skills"
        : "Select Location/Availability";
      defaultOption.disabled = true;
      defaultOption.selected = true;
      select.appendChild(defaultOption);
    }

    options.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option;
      opt.textContent = option;
      select.appendChild(opt);
    });
  };

  addOptions("reg-loc", LOCATIONS);
  addOptions("reg-skills", SKILL_OPTIONS, true);
  addOptions("reg-avail", AVAILABILITY_OPTIONS);

  addOptions("match-loc", LOCATIONS);
  addOptions("match-skill", SKILL_OPTIONS);
}

function renderMatchTable(data) {
  const tableBody = document.getElementById("match-results-body");
  const tableContainer = document.getElementById("match-results-table");
  const apiResponsePre = document.getElementById("api-response");

  tableBody.innerHTML = "";
  apiResponsePre.textContent = "";
  tableContainer.style.display = "none";

  if (data.errors) {
    apiResponsePre.textContent = JSON.stringify(data, null, 2);
    return;
  }

  const matches = data.data?.findMatches || [];

  if (matches.length === 0) {
    apiResponsePre.textContent =
      "Query successful, but no matches were found for the criteria.";
    return;
  }

  tableContainer.style.display = "table";

  matches.forEach((match) => {
    const row = tableBody.insertRow();

    row.insertCell().textContent = match.volunteer.name;
    row.insertCell().textContent = match.volunteer.location;
    row.insertCell().textContent = match.volunteer.skills.join(", ");
    row.insertCell().textContent = `${match.matchScore}%`;
  });
}

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
  });
}

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

async function executeGraphQL(query, variables, requiresAuth = false) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (requiresAuth) {
    if (!globalIdToken) {
      document.getElementById("api-response").textContent =
        "Error: Authentication token required. Please log in first.";
      document.getElementById("match-results-table").style.display = "none";
      return;
    }
    headers["Authorization"] = globalIdToken;
  }

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
      document.getElementById("api-response").textContent = JSON.stringify(
        data,
        null,
        2
      );
      document.getElementById("match-results-table").style.display = "none";
    }
  } catch (error) {
    document.getElementById(
      "api-response"
    ).textContent = `Network Error: ${error.message}`;
    document.getElementById("match-results-table").style.display = "none";
  }
}

function registerVolunteer() {
  const name = document.getElementById("reg-name").value;
  const location = document.getElementById("reg-loc").value;
  const availability = document.getElementById("reg-avail").value;

  const skillsSelect = document.getElementById("reg-skills");
  const skills = Array.from(skillsSelect.options)
    .filter((option) => option.selected)
    .map((option) => option.value);

  if (!name || !location || skills.length === 0 || !availability) {
    return alert(
      "Please fill out all volunteer registration fields and select at least one skill."
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

document.addEventListener("DOMContentLoaded", populateDropdowns);
