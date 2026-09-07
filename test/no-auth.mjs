// Behaviour test for the `noAuth` opt-out: `disableBrowserAuth` must drop the
// browser session gate (401) while leaving the Host/Origin fence (403) alone,
// and it must hand back a disposer that restores dsh's own behaviour.
//
// Dependency-free on purpose (the plugin ships no runtime dependencies): the
// connection service is faked, and `ctx.connection`'s tracing proxy is faked
// with a plain Proxy — the only thing the patch needs from it is that
// `Object.getPrototypeOf` forwards to the instance behind it.
//
// Run: node --test test/

import assert from "node:assert/strict";
import { test } from "node:test";
import { disableBrowserAuth, settingsSnapshot } from "../lib/index.js";

/** Stand-in for dsh's `HostConnectionService`: fence + cookie gate. */
class FakeConnection {
	trustedHosts = ["192.168.255.5:3080"];
	requestRejection(request) {
		if (!this.trustedHosts.includes(request.headers.host)) return 403;
		return request.headers.cookie === void 0 ? 401 : void 0;
	}
	authorizeIndex(request, response) {
		if (request.headers.cookie === void 0) {
			response.writeHead(401, {});
			response.end("authentication required");
			return false;
		}
		return true;
	}
	authenticatedUrl(baseUrl) {
		return `${baseUrl}/?token=launch-token`;
	}
}

/** Minimal stand-in for the service proxy `ctx.connection` hands out. */
function traceable(service) {
	return new Proxy(service, {
		get: (target, property, receiver) => Reflect.get(target, property, receiver)
	});
}

/** Collecting stand-in for a `ServerResponse`. */
function recordingResponse() {
	const written = [];
	return {
		written,
		writeHead(status, headers) { written.push({ status, headers }); },
		end() { written.push({ end: true }); }
	};
}

test("the shipped gate: fence rejects, cookie is required", () => {
	const connection = traceable(new FakeConnection());
	assert.equal(connection.requestRejection({ headers: { host: "evil.example" } }), 403);
	assert.equal(connection.requestRejection({ headers: { host: "192.168.255.5:3080" } }), 401);
	assert.equal(connection.requestRejection({ headers: { host: "192.168.255.5:3080", cookie: "dsh-auth-x=1" } }), void 0);
});

test("noAuth drops the 401 and keeps the 403", () => {
	const connection = traceable(new FakeConnection());
	const dispose = disableBrowserAuth(connection);
	assert.equal(typeof dispose, "function");
	assert.equal(connection.requestRejection({ headers: { host: "evil.example" } }), 403, "the Host/Origin fence must survive");
	assert.equal(connection.requestRejection({ headers: { host: "192.168.255.5:3080" } }), void 0, "a cookieless trusted host must pass");
	dispose();
	assert.equal(connection.requestRejection({ headers: { host: "192.168.255.5:3080" } }), 401, "the disposer must restore dsh's gate");
});

test("noAuth serves the index and bounces a stale token bookmark", () => {
	const connection = traceable(new FakeConnection());
	const dispose = disableBrowserAuth(connection);
	const plain = recordingResponse();
	assert.equal(connection.authorizeIndex({ url: "/", headers: { host: "192.168.255.5:3080" } }, plain), true);
	assert.deepEqual(plain.written, [], "a plain index request writes nothing");
	const stale = recordingResponse();
	assert.equal(connection.authorizeIndex({ url: "/?token=launch-token", headers: {} }, stale), false);
	assert.deepEqual(stale.written, [
		{ status: 303, headers: { "cache-control": "no-store", location: "/", "referrer-policy": "no-referrer" } },
		{ end: true }
	]);
	dispose();
});

test("noAuth prints a clean URL", () => {
	const connection = traceable(new FakeConnection());
	const dispose = disableBrowserAuth(connection);
	assert.equal(connection.authenticatedUrl("http://192.168.255.5:3080"), "http://192.168.255.5:3080");
	dispose();
	assert.equal(connection.authenticatedUrl("http://192.168.255.5:3080"), "http://192.168.255.5:3080/?token=launch-token");
});

test("patching is idempotent and repeatable", () => {
	const connection = traceable(new FakeConnection());
	const first = disableBrowserAuth(connection);
	assert.equal(disableBrowserAuth(connection), void 0, "a second patch must be a no-op");
	first();
	assert.equal(typeof disableBrowserAuth(connection), "function", "the gate can be removed again after disposal");
});

test("a connection without the gate is left alone", () => {
	assert.equal(disableBrowserAuth({}), void 0);
	assert.equal(disableBrowserAuth(void 0), void 0);
	assert.equal(disableBrowserAuth(null), void 0);
});

test("settings: noAuth is opt-in and survives normalization", () => {
	assert.equal(settingsSnapshot({ enabled: true, accessHosts: ["192.168.255.5"] }).noAuth, false);
	assert.equal(settingsSnapshot({ enabled: true, noAuth: true }).noAuth, true);
	assert.equal(settingsSnapshot(void 0).noAuth, false);
});
