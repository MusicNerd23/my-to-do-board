const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const accounts = require("./accounts");
const { applyBoardAction } = require("./board");
const { RequestError, readJson, send, sendJson } = require("./http");

const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/styles.css", ["styles.css", "text/css"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/board-ui.js", ["board-ui.js", "text/javascript"]],
]);

function requireAccount(request, savedAccounts) {
  const account = accounts.getAccount(request, savedAccounts);
  if (!account) throw new RequestError(401, "Sign in to open your board.");
  return account;
}

const server = http.createServer(async (request, response) => {
  try {
    const host = request.headers.host ?? "";
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) {
      throw new RequestError(400, "Open the app using its local address.");
    }
    const origin = request.headers.origin;
    if (request.method === "POST" && origin && origin !== `http://${host}`) {
      throw new RequestError(403, "Open the app directly to make changes.");
    }

    const pathname = new URL(request.url, "http://localhost").pathname;
    const asset = assets.get(pathname);
    if (request.method === "GET" && asset) {
      const [filename, contentType] = asset;
      const file = fs.readFileSync(path.join(__dirname, filename), "utf8");
      send(response, 200, contentType, file);
      return;
    }

    switch (`${request.method} ${pathname}`) {
      case "GET /api/session": {
        const account = accounts.getAccount(request, accounts.readAccounts());
        sendJson(response, 200, { username: account?.username ?? null });
        return;
      }
      case "POST /api/register":
      case "POST /api/login": {
        const data = await readJson(request);
        const registering = pathname === "/api/register";
        const account = await (registering ? accounts.register(data) : accounts.signIn(data));
        accounts.startSession(request, response, account);
        sendJson(response, registering ? 201 : 200, { username: account.username });
        return;
      }
      case "POST /api/logout":
        accounts.endSession(request, response);
        sendJson(response, 200, {});
        return;
      case "GET /api/board": {
        const account = requireAccount(request, accounts.readAccounts());
        sendJson(response, 200, account.board);
        return;
      }
      case "POST /api/board": {
        const action = await readJson(request);
        const savedAccounts = accounts.readAccounts();
        // The session determines which board a request can change.
        const account = requireAccount(request, savedAccounts);
        applyBoardAction(account.board, action);
        accounts.saveAccounts(savedAccounts);
        sendJson(response, 200, account.board);
        return;
      }
      default:
        sendJson(response, 404, { error: "That page could not be found." });
    }
  } catch (error) {
    if (error instanceof RequestError) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: "Something went wrong. Try again." });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, "127.0.0.1", () => {
  console.log(`Open http://127.0.0.1:${server.address().port} in your browser.`);
});
