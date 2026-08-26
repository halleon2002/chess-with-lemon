// Email/password auth via Firebase. Gates the app behind a login screen and
// exposes `currentUser` (Firebase User object) once signed in.

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

let currentUser = null;

const authScreen = document.getElementById("authScreen");
const appRoot = document.getElementById("appRoot");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authError = document.getElementById("authError");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authToggleBtn = document.getElementById("authToggleBtn");
const authTitle = document.getElementById("authTitle");
const userBadge = document.getElementById("userBadge");
const userEmailLabel = document.getElementById("userEmailLabel");
const logoutBtn = document.getElementById("logoutBtn");

let authMode = "login"; // "login" | "signup"

function setAuthMode(nextMode) {
  authMode = nextMode;
  authError.textContent = "";
  if (authMode === "login") {
    authTitle.textContent = t("authLoginTitle");
    authSubmitBtn.textContent = t("authLoginBtn");
    authToggleBtn.textContent = t("authToggleToSignup");
  } else {
    authTitle.textContent = t("authSignupTitle");
    authSubmitBtn.textContent = t("authSignupBtn");
    authToggleBtn.textContent = t("authToggleToLogin");
  }
}

authToggleBtn.addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "signup" : "login");
});

authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  authError.textContent = "";
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;

  authSubmitBtn.disabled = true;
  const action = authMode === "login"
    ? auth.signInWithEmailAndPassword(email, password)
    : auth.createUserWithEmailAndPassword(email, password);

  action
    .catch((err) => {
      authError.textContent = friendlyAuthError(err);
    })
    .finally(() => {
      authSubmitBtn.disabled = false;
    });
});

logoutBtn.addEventListener("click", () => {
  auth.signOut();
});

function friendlyAuthError(err) {
  switch (err.code) {
    case "auth/invalid-email": return t("authErrInvalidEmail");
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return t("authErrBadCredentials");
    case "auth/email-already-in-use": return t("authErrEmailInUse");
    case "auth/weak-password": return t("authErrWeakPassword");
    default: return err.message;
  }
}

auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    authScreen.classList.add("hidden");
    appRoot.classList.remove("hidden");
    userBadge.classList.remove("hidden");
    userEmailLabel.textContent = user.email;
    authForm.reset();
  } else {
    authScreen.classList.remove("hidden");
    appRoot.classList.add("hidden");
    userBadge.classList.add("hidden");
    setAuthMode("login");
  }
});
