const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const usernameInput = document.querySelector("#auth-username");
const passwordInput = document.querySelector("#auth-password");
const authHeading = document.querySelector("#auth-heading");
const authSubmit = document.querySelector("#auth-submit");
const authSwitch = document.querySelector("#auth-switch");
const passwordHint = document.querySelector("#password-hint");
const accountBar = document.querySelector("#account-bar");
const accountName = document.querySelector("#account-name");
const signOutButton = document.querySelector("#sign-out");
const boardScreen = document.querySelector("#board-screen");
const pageStatus = document.querySelector("#app-status");
const pageError = document.querySelector("#app-error");
let registering = false;
let viewVersion = 0;

async function requestApi(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error);
    error.status = response.status;
    throw error;
  }
  return data;
}

function jsonRequest(data) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function showMessage(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

const boardView = createBoardView({
  save: (action) => requestApi("/api/board", jsonRequest(action)),
  showError: (message) => showMessage(pageError, message),
  sessionExpired: () => showSignIn("Your session ended. Sign in to open your board."),
});

function setAuthMode(createAccount) {
  registering = createAccount;
  const button = createAccount ? "Create account" : "Sign in";
  authHeading.textContent = button;
  authSubmit.textContent = button;
  authSwitch.textContent = createAccount ? "Back to sign in" : "Create an account";
  passwordHint.hidden = !createAccount;
  passwordInput.autocomplete = createAccount ? "new-password" : "current-password";
  passwordInput.minLength = createAccount ? 15 : 0;
  passwordInput.value = "";
}

function showSignIn(message = "") {
  viewVersion += 1;
  accountBar.hidden = true;
  boardScreen.hidden = true;
  accountName.textContent = "";
  boardView.clear();
  showMessage(pageStatus);
  showMessage(pageError, message);
  setAuthMode(false);
  authPanel.hidden = false;
}

async function showBoard(username) {
  const version = ++viewVersion;
  authPanel.hidden = true;
  authForm.reset();
  accountName.textContent = username;
  accountBar.hidden = false;
  showMessage(pageError);
  showMessage(pageStatus, "Loading your board…");

  try {
    const board = await requestApi("/api/board");
    if (version !== viewVersion) return;
    boardView.load(board);
    boardScreen.hidden = false;
    showMessage(pageStatus);
  } catch (error) {
    if (version !== viewVersion) return;
    if (error.status === 401) {
      showSignIn("Your session ended. Sign in to open your board.");
      return;
    }
    showMessage(pageStatus);
    showMessage(pageError, "Could not load your board. Refresh to try again.");
  }
}

authSwitch.addEventListener("click", () => {
  showMessage(pageError);
  setAuthMode(!registering);
  usernameInput.focus();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (authSubmit.disabled) return;
  showMessage(pageError);
  authSubmit.disabled = true;
  authSwitch.disabled = true;

  try {
    const { username } = await requestApi(registering ? "/api/register" : "/api/login", jsonRequest({
      username: usernameInput.value,
      password: passwordInput.value,
    }));
    await showBoard(username);
  } catch (error) {
    showMessage(pageError, error.message);
    passwordInput.focus();
  } finally {
    authSubmit.disabled = false;
    authSwitch.disabled = false;
  }
});

signOutButton.addEventListener("click", async () => {
  signOutButton.disabled = true;
  try {
    await requestApi("/api/logout", { method: "POST" });
    showSignIn();
    usernameInput.focus();
  } catch (error) {
    showMessage(pageError, error.message);
  } finally {
    signOutButton.disabled = false;
  }
});

async function restoreSession() {
  try {
    const { username } = await requestApi("/api/session");
    if (username) {
      await showBoard(username);
      return;
    }
    showSignIn();
  } catch {
    showSignIn("Could not reach the server. Try again once the server is running.");
  }
}

restoreSession();
