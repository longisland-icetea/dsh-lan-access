// @ts-check
// dsh-lan-access — open the DeepSeek Harness Web GUI's LAN access fences.
//
// The browser surface keeps three access fences:
//   1. The webserver binds loopback by default (`127.0.0.1`).
//   2. The CLI refuses `--host 0.0.0.0` (a deliberate safety guardrail).
//      The composition config path — a patch layer, not the CLI — is not
//      covered by that guardrail, so this bundle binds all interfaces
//      through config when enabled.
//   3. Every `/api` request passes a Host/Origin browser-trust fence
//      (`client-connection` `trustedHosts`): non-loopback authorities are
//      refused unless declared.
//
// The plugin configures the LAN host the user wants to reach the GUI with
// (a settings tab writes the `lan-access` namespace) and then:
//   - binds `0.0.0.0` so every interface serves (the host-webserver schema
//     accepts only `127.0.0.1` / `0.0.0.0`; a specific IP is expressed as
//     bind-all + trust-that-IP),
//   - extends the browser-trust fence with the configured host(s),
//   - prints the authenticated LAN URL at boot and serves the facts to the
//     settings tab through one small Remote (`lanAccess/overview`).
//
// Upgrade resilience (see also cordis.patch.yml): everything that touches
// shipped dsh rows is a patch by id; a missing id warns and skips instead
// of failing the boot, and this plugin verifies at startup whether its two
// patches actually took effect and logs the result. New upstream guardrails
// (for example the webserver schema rejecting `0.0.0.0`) are expected to
// win; the plugin then reports the drift instead of silently pretending.
//
// Runtime dependencies: none. This module imports no package — the Typert
// Gateway discovers Remote services by duck-typed bindings/markers, and the
// settings domain treats the schema as a callable with `toJSON`. Keeping the
// host half import-free makes the plugin survive any install form (registry,
// tarball, or a `link:` checkout like this one).
//
// @module dsh-lan-access

import { networkInterfaces } from "node:os";

/** Stable Cordis plugin name. */
export const name = "dsh-lan-access";
/** Services required before the plugin can compute its configuration. */
export const inject = ["settings"];
/** Settings namespace owned by this plugin. */
const SETTINGS_NAMESPACE = "lan-access";
/** Wire namespace of the Remote this plugin exposes to the browser. */
const REMOTE_NAMESPACE = "lanAccess";
/** Cable service key under which the Remote is provided. */
const REMOTE_SERVICE_KEY = "lanAccessRemote";
/** Prototype marker key the Typert gateway reads for Remote methods (same string the decorator writes). */
const REMOTE_METHODS_KEY = "@deepseek-ai/dsh-typert-protocol/remote-methods";

/**
 * Normalize and validate a `lan-access` settings section: boolean `enabled`
 * plus an array of bare-authority `accessHosts`. The settings domain calls
 * the schema with the merged (defaults + user) section and stores what it
 * returns, so this is also the single full-ownership normalize pass.
 * @param input - merged section from storage (any JSON value).
 * @returns the normalized, frozen-safe plain value.
 */
function validateLanAccessSettings(input) {
	const record = input !== null && typeof input === "object" && !Array.isArray(input) ? input : {};
	const enabled = record["enabled"] === true;
	const rawHosts = Array.isArray(record["accessHosts"]) ? record["accessHosts"] : [];
	if (rawHosts.some((host) => typeof host !== "string")) {
		throw new TypeError("lan-access: accessHosts must be an array of strings");
	}
	return {
		enabled,
		accessHosts: [...new Set(rawHosts.filter((host) => isValidBareAuthority(host)))],
		/** Client-side settings-layer rescue for remote visits; on unless explicitly off. */
		rescueSettings: record["rescueSettings"] !== false
	};
}
/**
 * Schema description the settings wire surfaces serialize. Only the
 * settings domain's `toJSON` call and optional redaction walkers read this;
 * the plugin's own tab renders a fixed form, so a minimal object schema is
 * enough. Field nodes carry just `type`/`dict`, which both consumers accept.
 */
const SettingsSchema = Object.assign(validateLanAccessSettings, {
	toJSON() {
		return {
			type: "object",
			dict: {
				enabled: { type: "boolean" },
				accessHosts: { type: "array", inner: { type: "string" } },
				rescueSettings: { type: "boolean" }
			}
		};
	}
});

/**
 * Canonical form of a bare authority, or `undefined` when unparsable.
 * Mirrors the shipped `assertTrustedAuthority` semantics (WHATWG parse
 * round-trip), so only entries the fence itself would accept are advertised.
 * @param entry - the raw configured value.
 * @returns canonical `host` or `host:port`, or undefined.
 */
export function canonicalAuthority(entry) {
	try {
		const url = new URL(`http://${entry}`);
		const port = url.port !== "" ? url.port : new URL(`https://${entry}`).port;
		return port === "" ? url.hostname : `${url.hostname}:${port}`;
	} catch {
		return void 0;
	}
}

/**
 * Whether one configured entry is a bare authority in canonical form.
 * @param entry - the raw configured value.
 * @returns true when the fence would accept it as a trusted host entry.
 */
export function isValidBareAuthority(entry) {
	if (typeof entry !== "string" || entry === "") return false;
	const canonical = canonicalAuthority(entry);
	return canonical !== void 0 && canonical === entry.toLowerCase();
}

/**
 * Resolve the boot-time snapshot from the live settings value.
 * @param values - the resolved `lan-access` namespace value.
 * @returns the frozen snapshot service-consumers read.
 */
export function settingsSnapshot(values) {
	const enabled = values !== null && typeof values === "object" && values["enabled"] === true;
	const rawHosts = Array.isArray(values?.["accessHosts"]) ? values["accessHosts"] : [];
	const accessHosts = [...new Set(rawHosts.filter((host) => typeof host === "string" && isValidBareAuthority(host)))];
	const rescueSettings = values === null || typeof values !== "object" || values["rescueSettings"] !== false;
	return Object.freeze({
		enabled,
		accessHosts: Object.freeze(accessHosts),
		/** Whether the browser half may repair the client settings layer on a remote visit. */
		rescueSettings,
		/** webserver bind: 0.0.0.0 while enabled, undefined = delegate to the CLI/default. */
		bindHost: enabled ? "0.0.0.0" : void 0,
		/** fence entries owned by the plugin; empty while disabled. */
		trustedHosts: Object.freeze(enabled ? accessHosts : [])
	});
}

/**
 * Enumerate this host's IPv4 interfaces as the settings tab's candidate list.
 * @returns sorted, non-internal-first candidates.
 */
export function lanCandidates() {
	const candidates = [];
	for (const [name, interfaces] of Object.entries(networkInterfaces())) {
		for (const iface of interfaces ?? []) {
			if (iface.family !== "IPv4") continue;
			candidates.push({
				name,
				address: iface.address,
				internal: iface.internal === true,
				...iface.netmask === void 0 ? {} : { netmask: iface.netmask }
			});
		}
	}
	return candidates.sort((a, b) => a.internal === b.internal ? a.address.localeCompare(b.address) : a.internal ? 1 : -1);
}

/**
 * Plain-object Remote the settings tab calls for live host facts: the
 * configured values, the effective bind/trust state, wiring verification,
 * and the LAN candidate list. The Typert Gateway discovers it by the
 * `typertRemote` binding + method markers below — no Service base needed.
 * The method must live on the PROTOTYPE (the gateway reads the method from
 * the prototype chain), so the object is created from a shared prototype.
 * @param ctx - the plugin context (for `ctx.get` lookups).
 * @param snapshot - the boot snapshot.
 * @param wiring - mutable wiring-verification record.
 * @returns the Remote value to provide.
 */
function createLanAccessRemote(ctx, snapshot, wiring) {
	const prototype = {
		/** One unary Remote method: everything the settings tab needs. */
		overview() {
			const webServer = ctx.get("webServer");
			const connection = ctx.get("connection");
			const bindHost = webServer?.host;
			const port = webServer?.port;
			const trustedHosts = Array.isArray(connection?.["trustedHosts"]) ? [...connection["trustedHosts"]] : [];
			const lanUrls = [];
			if (snapshot.enabled && port !== void 0) {
				for (const host of snapshot.accessHosts) {
					try {
						lanUrls.push({
							host,
							url: connection?.["authenticatedUrl"](`http://${host}:${String(port)}`)
						});
					} catch {
						/* v8 ignore next -- unreachable: hosts were canonicalized at snapshot time */
					}
				}
			}
			return {
				configured: {
					enabled: snapshot.enabled,
					accessHosts: [...snapshot.accessHosts],
					rescueSettings: snapshot.rescueSettings
				},
				live: { bindHost, port, trustedHosts },
				wired: { ...wiring },
				candidates: lanCandidates(),
				lanUrls
			};
		}
	};
	// The Remote() decorator writes this same prototype marker; handwritten
	// here so the plugin ships plain JavaScript with no decorator transform.
	Object.defineProperty(prototype, REMOTE_METHODS_KEY, {
		value: Object.freeze({
			version: 1,
			methods: Object.freeze([
				Object.freeze({ method: "overview", invocation: Object.freeze({ kind: "direct" }) })
			])
		})
	});
	const remote = Object.create(prototype);
	Object.defineProperty(remote, "typertRemote", {
		value: Object.freeze({
			service: remote,
			serviceKey: REMOTE_SERVICE_KEY,
			namespace: REMOTE_NAMESPACE
		})
	});
	return remote;
}

/**
 * Mount the plugin: register its settings namespace, provide the boot
 * snapshot for the patch rows, expose the Remote, verify the wiring, and
 * print the LAN URL.
 * @param ctx - plugin context carrying the settings provider.
 */
export function apply(ctx) {
	if (ctx.settings === void 0) {
		ctx.logger.warn("lan-access: settings provider unavailable — LAN access is disabled");
		return;
	}
	const scope = ctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema);
	const snapshot = settingsSnapshot(scope.get());
	const wiring = {
		webserver: false,
		connection: false,
		verified: false
	};
	ctx.provide("lanAccess", snapshot);
	ctx.provide(REMOTE_SERVICE_KEY, createLanAccessRemote(ctx, snapshot, wiring));

	// Lazy wiring check after the whole tree settles (same lifecycle the
	// shipped web runtime uses for its URL line): report whether the two
	// patch overrides really landed, and print the authenticated LAN URL.
	ctx.inject(["connection", "webServer"], (runtimeCtx) => {
		const settle = runtimeCtx.get("loader")?.await();
		const check = () => {
			if (runtimeCtx.get("connection") === void 0 || runtimeCtx.get("webServer") === void 0) return;
			const connection = runtimeCtx.connection;
			const webServer = runtimeCtx.webServer;
			const configured = Array.isArray(connection["trustedHosts"]) ? connection["trustedHosts"] : [];
			const snapshotNow = ctx.get("lanAccess") ?? snapshot;
			wiring.webserver = webServer.host === "0.0.0.0";
			wiring.connection = snapshotNow.trustedHosts.every((host) => configured.includes(host));
			wiring.verified = wiring.webserver && wiring.connection;
			if (!snapshotNow.enabled) {
				console.log(`dsh-lan-access: LAN access disabled (webserver binds ${String(webServer.host)})`);
				return;
			}
			if (wiring.verified) {
				console.log(`dsh-lan-access: LAN access enabled on all interfaces; fence trusts ${String(configured.length)} authority/authorities`);
				const primary = snapshotNow.accessHosts[0];
				if (primary !== void 0 && webServer.port !== void 0 && typeof connection["authenticatedUrl"] === "function") {
					console.log(`dsh-lan-access: LAN: ${String(connection["authenticatedUrl"](`http://${primary}:${String(webServer.port)}`))}`);
				}
			} else {
				console.warn(`dsh-lan-access: LAN wiring did NOT take effect (webserver host override: ${String(wiring.webserver)}, fence override: ${String(wiring.connection)}) — the installed dsh has changed row internals; check cordis.patch.yml against this dsh version`);
			}
		};
		if (settle === void 0) check();
		else settle.then(check, () => {});
	});
}

export { SettingsSchema };
