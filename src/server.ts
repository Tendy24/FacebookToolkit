/// <reference types="node" />

import * as http from "http";

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
let requestCounter = 0;

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
	"/health": ["GET"],
	"/api/time": ["GET"],
	"/echo": ["POST"],
};

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

export const createServer = () =>
	http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
		const method = req.method || "GET";
		const pathname = getPathname(req);
		const requestId = nextRequestId();

		res.setHeader("X-Request-Id", requestId);
		attachRequestLogger(res, requestId, method, pathname);

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
					{ method: "GET", path: "/health" },
					{ method: "GET", path: "/api/time" },
					{ method: "POST", path: "/echo" },
				],
			});
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
