class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, "application/json", JSON.stringify(body));
}

async function readJson(request) {
  const contentType = request.headers["content-type"]?.split(";")[0].trim();
  if (contentType !== "application/json") {
    throw new RequestError(415, "Send the request as JSON.");
  }

  const chunks = [];
  const maxBytes = 8192;
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= maxBytes) chunks.push(chunk);
  }
  if (bytes > maxBytes) throw new RequestError(413, "The request is too large.");

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "The request contains invalid JSON.");
  }
}

module.exports = { RequestError, readJson, send, sendJson };
