/// <reference types="node" />

import * as http from "http";
import * as fs from "node:fs";
import * as path from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 60;
let requestCounter = 0;

type RateLimitEntry = {
	count: number;
	windowStartMs: number;
};

const rateLimitByClient = new Map<string, RateLimitEntry>();

const writeJson = (
	res: http.ServerResponse,
	statusCode: number,
	payload: Record<string, unknown>
) => {
	res.writeHead(statusCode, { "Content-Type": "application/json" });
	res.end(JSON.stringify(payload));
};

const nextRequestId = () => {
	requestCounter += 1;
	return `req-${Date.now()}-${requestCounter}`;
};

const attachRequestLogger = (
	res: http.ServerResponse,
	requestId: string,
	method: string,
	pathname: string
) => {
	const startedAt = Date.now();
	res.on("finish", () => {
		const durationMs = Date.now() - startedAt;
		console.log(
			JSON.stringify({
				level: "info",
				message: "request_completed",
				requestId,
				method,
				path: pathname,
				statusCode: res.statusCode,
				durationMs,
				timestamp: new Date().toISOString(),
			})
		);
	});
};

const getPathname = (req: http.IncomingMessage) => {
	const parsedUrl = new URL(req.url || "/", `http://${HOST}:${PORT}`);
	return parsedUrl.pathname;
};

const ROUTE_METHODS: Record<string, string[]> = {
	"/": ["GET"],
	"/favicon.ico": ["GET"],
	"/health": ["GET"],
	"/api/time": ["GET"],
	"/echo": ["POST"],
};

const getFaviconPath = () => {
	const candidates = [
		path.join(process.cwd(), "favicon.ico"),
		path.join(__dirname, "favicon.ico"),
		path.join(__dirname, "..", "favicon.ico"),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
};

const faviconPath = getFaviconPath();
const faviconBuffer = faviconPath ? fs.readFileSync(faviconPath) : null;

const readJsonBody = async (req: http.IncomingMessage): Promise<unknown> => {
	const chunks: Buffer[] = [];

	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	if (chunks.length === 0) {
		return null;
	}

	const rawBody = Buffer.concat(chunks).toString("utf8");
	return JSON.parse(rawBody);
};

const isJsonContentType = (req: http.IncomingMessage) => {
	const contentType = req.headers["content-type"];
	if (!contentType) {
		return false;
	}

	const value = Array.isArray(contentType) ? contentType[0] : contentType;
	return value.toLowerCase().startsWith("application/json");
};

const getClientKey = (req: http.IncomingMessage) => {
	return req.socket.remoteAddress || "unknown";
};

const checkRateLimit = (clientKey: string, nowMs: number) => {
	const current = rateLimitByClient.get(clientKey);
	if (!current || nowMs - current.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
		rateLimitByClient.set(clientKey, { count: 1, windowStartMs: nowMs });
		return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, retryAfterMs: 0 };
	}

	if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
		const retryAfterMs = RATE_LIMIT_WINDOW_MS - (nowMs - current.windowStartMs);
		return { allowed: false, remaining: 0, retryAfterMs };
	}

	current.count += 1;
	return {
		allowed: true,
		remaining: RATE_LIMIT_MAX_REQUESTS - current.count,
		retryAfterMs: 0,
	};
};

export const createServer = () =>
	http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
		const nowMs = Date.now();
		const method = req.method || "GET";
		const pathname = getPathname(req);
		const requestId = nextRequestId();
		const clientKey = getClientKey(req);
		const limitResult = checkRateLimit(clientKey, nowMs);

		res.setHeader("X-Request-Id", requestId);
		res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT_MAX_REQUESTS));
		res.setHeader("X-RateLimit-Remaining", String(limitResult.remaining));
		attachRequestLogger(res, requestId, method, pathname);

		if (!limitResult.allowed) {
			const retryAfterSeconds = Math.ceil(limitResult.retryAfterMs / 1000);
			res.setHeader("Retry-After", String(retryAfterSeconds));
			writeJson(res, 429, {
				error: "Too Many Requests",
				requestId,
				path: pathname,
				retryAfterSeconds,
			});
			return;
		}

		const allowedMethods = ROUTE_METHODS[pathname];

		if (allowedMethods && !allowedMethods.includes(method)) {
			res.setHeader("Allow", allowedMethods.join(", "));
			writeJson(res, 405, {
				error: "Method Not Allowed",
				requestId,
				method,
				path: pathname,
			});
			return;
		}

		if (method === "GET" && pathname === "/") {
			writeJson(res, 200, {
				name: "Sample HTTP API",
				routes: [
					{ method: "GET", path: "/" },
					{ method: "GET", path: "/favicon.ico" },
					{ method: "GET", path: "/health" },
					{ method: "GET", path: "/api/time" },
					{ method: "POST", path: "/echo" },
				],
			});
			return;
		}

		if (method === "GET" && pathname === "/favicon.ico") {
			if (!faviconBuffer) {
				writeJson(res, 404, {
					error: "Not Found",
					requestId,
					method,
					path: pathname,
					timestamp: new Date().toISOString(),
				});
				return;
			}

			res.writeHead(200, {
				"Content-Type": "image/x-icon",
				"Cache-Control": "public, max-age=86400",
			});
			res.end(faviconBuffer);
			return;
		}

		if (method === "GET" && pathname === "/health") {
			writeJson(res, 200, {
				status: "ok",
				timestamp: new Date().toISOString(),
			});
			return;
		}

		if (method === "GET" && pathname === "/api/time") {
			writeJson(res, 200, {
				epochMs: Date.now(),
				iso: new Date().toISOString(),
			});
			return;
		}

		if (method === "POST" && pathname === "/echo") {
			if (!isJsonContentType(req)) {
				writeJson(res, 415, {
					error: "Unsupported Media Type",
					requestId,
					path: pathname,
					expectedContentType: "application/json",
				});
				return;
			}

			try {
				const body = await readJsonBody(req);
				writeJson(res, 200, {
					echo: body,
					timestamp: new Date().toISOString(),
				});
			} catch {
				writeJson(res, 400, {
					error: "Invalid JSON body",
					requestId,
					path: pathname,
				});
			}
			return;
		}

		writeJson(res, 404, {
			error: "Not Found",
			requestId,
			method,
			path: pathname,
			timestamp: new Date().toISOString(),
		});
	});

if (require.main === module) {
	const server = createServer();

	server.listen(PORT, HOST, () => {
		console.log(`Server listening on http://${HOST}:${PORT}`);
	});

	const shutdown = (signal: string) => {
		console.log(`${signal} received. Shutting down...`);
		server.close(() => {
			process.exit(0);
		});
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
}
