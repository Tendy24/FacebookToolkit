const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("../dist/server.js");

let server;
let baseUrl;

before(async () => {
	server = createServer();

	await new Promise((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to resolve test server address");
	}

	baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
	if (!server) {
		return;
	}

	await new Promise((resolve) => {
		server.close(resolve);
	});
});

const requestJson = async (path, options = {}) => {
	const response = await fetch(`${baseUrl}${path}`, options);
	let body = null;

	try {
		body = await response.json();
	} catch {
		body = null;
	}

	return { response, body };
};

test("GET / returns API index", async () => {
	const { response, body } = await requestJson("/");

	assert.equal(response.status, 200);
	assert.equal(typeof response.headers.get("x-request-id"), "string");
	assert.equal(body.name, "Sample HTTP API");
	assert.ok(Array.isArray(body.routes));
	assert.ok(body.routes.some((route) => route.path === "/echo" && route.method === "POST"));
});

test("GET /health returns status ok", async () => {
	const { response, body } = await requestJson("/health");

	assert.equal(response.status, 200);
	assert.equal(body.status, "ok");
	assert.equal(typeof body.timestamp, "string");
});

test("GET /api/time returns epoch and iso", async () => {
	const { response, body } = await requestJson("/api/time");

	assert.equal(response.status, 200);
	assert.equal(typeof body.epochMs, "number");
	assert.equal(typeof body.iso, "string");
});

test("POST /health returns 405 and allow header", async () => {
	const { response, body } = await requestJson("/health", { method: "POST" });

	assert.equal(response.status, 405);
	assert.equal(response.headers.get("allow"), "GET");
	assert.equal(body.error, "Method Not Allowed");
	assert.equal(typeof body.requestId, "string");
});

test("POST /echo returns echoed JSON body", async () => {
	const payload = { hello: "world", n: 42 };
	const { response, body } = await requestJson("/echo", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	assert.equal(response.status, 200);
	assert.deepEqual(body.echo, payload);
	assert.equal(typeof body.timestamp, "string");
});

test("GET /echo returns 405 and allow header", async () => {
	const { response, body } = await requestJson("/echo");

	assert.equal(response.status, 405);
	assert.equal(response.headers.get("allow"), "POST");
	assert.equal(body.error, "Method Not Allowed");
	assert.equal(typeof body.requestId, "string");
});

test("POST /echo with invalid JSON returns 400", async () => {
	const response = await fetch(`${baseUrl}/echo`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{bad json",
	});
	const body = await response.json();

	assert.equal(response.status, 400);
	assert.equal(body.error, "Invalid JSON body");
	assert.equal(typeof body.requestId, "string");
});

test("GET unknown route returns 404", async () => {
	const { response, body } = await requestJson("/nope");

	assert.equal(response.status, 404);
	assert.equal(body.error, "Not Found");
	assert.equal(typeof body.requestId, "string");
});
