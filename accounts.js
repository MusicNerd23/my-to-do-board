const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, randomUUID, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const { createBoard } = require("./board");
const { RequestError } = require("./http");

const hashPassword = promisify(scrypt);
// This scrypt setting uses 32 MiB with three passes.
const hashOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dataDirectory = path.join(__dirname, "data");
const accountsFile = path.join(dataDirectory, "accounts.json");
const legacyTasksFile = path.join(__dirname, "tasks.json");
const sessions = new Map();
const sessionSeconds = 8 * 60 * 60;
const unusedSalt = randomBytes(16).toString("hex");
const unusedHash = Buffer.alloc(64);
let passwordWindow = { expires: 0, attempts: 0 };

function readList(filename) {
  try {
    const data = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (!Array.isArray(data)) throw new Error(`Expected a list in ${path.basename(filename)}.`);
    return data;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function readAccounts() {
  return readList(accountsFile);
}

function saveAccounts(accounts) {
  fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const temporaryFile = `${accountsFile}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600 });
  // Replace the previous copy after the new data has been written.
  fs.renameSync(temporaryFile, accountsFile);
}

function accountName(data) {
  return typeof data?.username === "string" ? data.username.trim() : "";
}

function findByName(accounts, username) {
  return accounts.find((account) => account.username.toLowerCase() === username.toLowerCase());
}

function limitPasswordAttempts() {
  const now = Date.now();
  if (now >= passwordWindow.expires) passwordWindow = { expires: now + 60000, attempts: 0 };
  if (passwordWindow.attempts >= 20) throw new RequestError(429, "Wait a minute and try again.");
  passwordWindow.attempts += 1;
}

async function register(data) {
  const username = accountName(data);
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/i.test(username)) {
    throw new RequestError(400, "Use 3–32 characters for your username. Letters, numbers, _ and - are allowed.");
  }
  if (typeof data.password !== "string" || data.password.length < 15 || data.password.length > 128) {
    throw new RequestError(400, "Use a password between 15 and 128 characters.");
  }

  limitPasswordAttempts();
  const salt = randomBytes(16).toString("hex");
  const hash = await hashPassword(data.password, salt, 64, hashOptions);
  const accounts = readAccounts();
  if (findByName(accounts, username)) throw new RequestError(409, "That username is already taken.");

  const priorTasks = accounts.length === 0 ? readList(legacyTasksFile) : [];
  const account = {
    id: randomUUID(),
    username,
    salt,
    passwordHash: hash.toString("hex"),
    board: createBoard(priorTasks),
  };
  accounts.push(account);
  saveAccounts(accounts);
  return account;
}

async function signIn(data) {
  limitPasswordAttempts();
  const failure = new RequestError(401, "The username or password is incorrect.");
  if (typeof data?.password !== "string" || data.password.length > 128) throw failure;

  const account = findByName(readAccounts(), accountName(data));
  const expected = account ? Buffer.from(account.passwordHash, "hex") : unusedHash;
  const actual = await hashPassword(data.password, account?.salt ?? unusedSalt, 64, hashOptions);
  if (!timingSafeEqual(expected, actual) || !account) throw failure;
  return account;
}

function sessionToken(request) {
  const cookie = request.headers.cookie ?? "";
  return /(?:^|;\s*)todo_session=([\w-]{43})(?:;|$)/.exec(cookie)?.[1];
}

function startSession(request, response, account) {
  sessions.delete(sessionToken(request));
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expires <= now) sessions.delete(token);
  }
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, { accountId: account.id, expires: now + sessionSeconds * 1000 });
  response.setHeader("Set-Cookie", `todo_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionSeconds}`);
}

function endSession(request, response) {
  sessions.delete(sessionToken(request));
  response.setHeader("Set-Cookie", "todo_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
}

function getAccount(request, accounts) {
  const token = sessionToken(request);
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return accounts.find((account) => account.id === session.accountId) ?? null;
}

module.exports = { endSession, getAccount, readAccounts, register, saveAccounts, signIn, startSession };
