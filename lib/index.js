// @ts-check
// dsh-lan-access — open the DeepSeek Harness Web GUI's LAN access fences.
//
// The browser surface keeps four access fences:
//   1. The webserver binds loopback by default (`127.0.0.1`).
//   2. The CLI refuses `--host 0.0.0.0` (a deliberate safety guardrail).
//      The composition config path — a patch layer, not the CLI — is not
//      covered by that guardrail, so this bundle binds all interfaces
//      through config when enabled.
//   3. Every `/api` request passes a Host/Origin browser-trust fence
//      (`client-connection` `trustedHosts`): non-loopback authorities are
//      refused unless declared.
//   4. Every browser needs the process launch token once and then carries a
//      signed session cookie (`client-connection` browser authentication).
//      `noAuth` drops that gate and hands every remaining door to the
//      operator's own network controls — see `disableBrowserAuth`.
//
// The plugin configures the LAN host the user wants to reach the GUI with
// (a settings tab writes the `lan-access` namespace) and then:
//   - binds `0.0.0.0` so every interface serves (the host-webserver schema
//     accepts only `127.0.0.1` / `0.0.0.0`; a specific IP is expressed as
//     bind-all + trust-that-IP),
//   - extends the browser-trust fence with the configured host(s),
//   - optionally removes the browser session gate (`noAuth`),
//   - prints the (authenticated, unless `noAuth`) LAN URL at boot and serves
//     the facts to the settings tab through one small Remote
//     (`lanAccess/overview`).
//
// ROW OWNERSHIP AT RUNTIME (since 0.5.0): the webserver/connection rows are
// NOT patched — they stay exactly as dsh-web-app declared them (loopback
// bind + the deployment-fence expression). Any rewriting happens through
// the loader at RUNTIME by this entry, which is also the disable target of
// dshmarket's toggle:
//   - on activation (or a hot re-enable) it `entry.update`s the two rows
//     with the enabled configuration (0.0.0.0 + configured authorities +
//     optional cookie lifetime);
//   - on deactivation (a dshmarket disable, a scan turning the plugin off,
//     or a plain fiber dispose) the registered effect restores the rows to
//     dsh-web-app's own default config (the `__jsExpr` nodes re-evaluate
//     against the live services, so --host/--trusted-host still apply)
//     while the process keeps running.
//
// A dshmarket disable of this package writes `disabled: true` onto the rows
// the package INSERTS — only `lan-access` below — never onto the official
// webserver/connection rows, and no official row waits for any service this
// plugin provides, so the disabled tree always activates (loopback + the
// deployment's own fence: the plain dsh behavior).
//
// The restore and the override are full-row updates (loader row config
// replacement is whole-object), so the two sets of defaults here MUST mirror
// dsh-web-app's own layer key for key; see cordis.patch.yml for the YAML
// twin.
//
// Upgrade resilience (see also cordis.patch.yml): everything that touches
// shipped dsh rows is a patch by id; a missing id warns and skips instead
// of failing the boot, and this plugin verifies at startup whether its two
// overrides actually took effect and logs the result. New upstream
// guardrails (for example the webserver schema rejecting `0.0.0.0`) are
// expected to win; the plugin then reports the drift instead of silently
// pretending.
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
export const inject = ["settings", "loader"];
/** Settings namespace owned by this plugin. */
const SETTINGS_NAMESPACE = "lan-access";
/** Wire namespace of the Remote this plugin exposes to the browser. */
const REMOTE_NAMESPACE = "lanAccess";
/** Cable service key under which the Remote is provided. */
const REMOTE_SERVICE_KEY = "lanAccessRemote";
/** Prototype marker key the Typert gateway reads for Remote methods (same string the decorator writes). */
const REMOTE_METHODS_KEY = "@deepseek-ai/dsh-typert-protocol/remote-methods";
/** Loader row ids this plugin owns at runtime. */
const WEBSERVER_ROW_ID = "webserver";
const CONNECTION_ROW_ID = "connection";
/** Post-settle beat (ms) before the boot-time rewrite: far past the boot
 * assertion, so the resulting fiber restart is a runtime one. */
const ROW_REWRITE_BOOT_DELAY_MS = 4000;
/** Browser-session lifetime dsh uses when the plugin names none (`client-connection` default). */
const DEFAULT_SESSION_DAYS = 30;
/** Upper clamp: far past any useful value, and still inside the safe-timestamp range `client-connection` checks. */
const MAX_SESSION_DAYS = 3650;
/**
* Clamp a configured browser-session lifetime to a value the `connection` row accepts.
* @param value - raw configured days.
* @returns a safe-integer day count between 1 and {@link MAX_SESSION_DAYS}.
*/
function normalizeSessionDays(value) {
	if (!Number.isSafeInteger(value)) return DEFAULT_SESSION_DAYS;
	return Math.min(Math.max(value, 1), MAX_SESSION_DAYS);
}
/** Query parameter dsh's browser authentication exchanges for a session cookie. */
const TOKEN_QUERY = "token";
/** Marker on a Connection prototype whose browser gate this plugin already removed. */
const NO_AUTH_MARKER = Symbol.for("dsh-lan-access.no-auth");
/** Status code dsh's browser authentication returns when no session cookie is present. */
const UNAUTHORIZED_STATUS = 401;

// ── loader row defaults (the YAML twins live in cordis.patch.yml) ────────────

/**
 * The `webserver` row exactly as dsh-web-app's own layer declares it.
 * A loader row update replaces the WHOLE config, so every key is restated.
 * `!!js` expressions stay as `{ __jsExpr }` nodes — the loader evaluates
 * them against the row's own context, so `webStartup` resolves.
 */
function webserverDefaultConfig() {
	return {
		host: { __jsExpr: "ctx.webStartup.host ?? '127.0.0.1'" },
		port: { __jsExpr: "ctx.webStartup.port ?? 3080" },
		compression: "gzip",
		compressionLevel: 1,
		compressionThresholdBytes: 1024
	};
}
/**
 * The `connection` row exactly as dsh-web-app's own layer declares it.
 */
function connectionDefaultConfig() {
	return {
		trustedHosts: { __jsExpr: "ctx.webRuntime.trustedHosts" }
	};
}
/**
 * The enabled-state row configs: bind all interfaces, fence the configured
 * authorities, and (only when non-default) the cookie lifetime.
 * @param snapshot - the boot snapshot.
 * @returns a { rowId: config } map for the rows the plugin overrides.
 */
function rowOverrides(snapshot) {
	const overrides = {};
	const enabled = snapshot.enabled === true;
	if (enabled) {
		overrides[WEBSERVER_ROW_ID] = Object.assign(webserverDefaultConfig(), { host: "0.0.0.0" });
		// An enabled-but-empty configuration falls back to the deployment's
		// own LAN trust instead of locking every LAN visitor out with 403 —
		// the row stays on its default expression, so nothing is written here.
		if (snapshot.trustedHosts.length > 0) {
			const connection = Object.assign(connectionDefaultConfig(), {
				trustedHosts: [...snapshot.trustedHosts]
			});
			if (snapshot.sessionDays !== DEFAULT_SESSION_DAYS) connection["cookieMaxAgeDays"] = snapshot.sessionDays;
			overrides[CONNECTION_ROW_ID] = connection;
		}
	}
	return overrides;
}
/**
 * Rewrite one loader row's config (`entry.update` merges options but
 * replaces the row's whole config; the update re-resolves `!!js` nodes and
 * restarts the row's fiber when it is already live).
 * @param loaderOrCtx - the loader service, or a context that exposes it.
 * @param rowId - the loader row id to update.
 * @param config - the full new config object.
 * @returns a promise resolving to true when the row was found and updated.
 */
function applyRowConfig(loaderOrCtx, rowId, config) {
	const loader = typeof loaderOrCtx?.get === "function" ? loaderOrCtx.get("loader") : loaderOrCtx;
	if (loader === void 0) return Promise.resolve(false);
	const entries = typeof loader.entries === "function" ? loader.entries() : [];
	const entry = entries.find((candidate) => candidate.options?.id === rowId);
	if (entry === void 0) return Promise.resolve(false);
	return entry.update({ config }, false, false).then(() => true, (error) => {
		console.warn(`dsh-lan-access: ${rowId} row update failed — ${error instanceof Error ? error.message : String(error)}`);
		return false;
	});
}
/**
 * Run the rewrite once the profile is safely in its runtime: the tree must
 * be settled AND the boot assertion (`assertEntriesActivated`) must have
 * passed, otherwise rewriting a live row restarts it mid-boot and the
 * assertion sees a half-disposed fiber ("fiber state 5") and aborts.
 * `settle.then` alone still races the assertion (microtasks resume before
 * the boot's awaited check), so a generous fixed beat is applied after it.
 * @param ctx - the plugin context.
 * @param snapshot - the snapshot driving the override.
 * @param cancelled - callable returning true when the schedule was cancelled
 * (the fiber deactivated while the beat was pending — a dshmarket disable
 * replay can land that late), in which case nothing is rewritten.
 * @returns a promise resolving to true when the rewrite ran.
 */
function scheduleRowRewrite(ctx, snapshot, cancelled) {
	const loader = ctx.get("loader");
	const settle = loader?.await?.() ?? Promise.resolve();
	return settle.then(() => new Promise((resolve) => setTimeout(resolve, ROW_REWRITE_BOOT_DELAY_MS))).then(() => {
		if (cancelled !== null && cancelled !== void 0 && cancelled()) return false;
		return applyRowOverrides(ctx, snapshot);
	});
}
/**
 * Apply the enabled-state overrides to every row the plugin owns.
 * @param ctx - the plugin context.
 * @param snapshot - the boot snapshot.
 * @returns true when every owned row was found and updated.
 */
async function applyRowOverrides(ctx, snapshot) {
	const overrides = rowOverrides(snapshot);
	const results = await Promise.all(Object.entries(overrides).map(([rowId, config]) => applyRowConfig(ctx, rowId, config)));
	return results.length > 0 && results.every((result) => result === true);
}
/**
 * Restore every row the plugin owns to the bundle-patch defaults (the state
 * a profile without this plugin would boot into). Runs from the fiber's
 * cleanup effect, so the loader handle is captured at apply time instead of
 * reaching through a context that may already be disposed.
 * @param loader - the loader service captured at activation.
 */
async function restoreRowDefaults(loader) {
	await Promise.all([
		applyRowConfig(loader, WEBSERVER_ROW_ID, webserverDefaultConfig()),
		applyRowConfig(loader, CONNECTION_ROW_ID, connectionDefaultConfig())
	]);
}

/**
 * Whether an incoming request still carries dsh's one-time launch token.
 * @param request - HTTP request whose URL may hold `?token=`.
 * @returns true when a token parameter is present.
 */
function hasLaunchToken(request) {
	try {
		return new URL(request.url ?? "/", "http://dsh.invalid").searchParams.has(TOKEN_QUERY);
	} catch {
		return false;
	}
}
/**
 * Remove dsh's browser-session gate from the live `connection` service.
 *
 * `client-connection` asks two questions before it serves anything, and both
 * are methods on the service's prototype:
 *   - `requestRejection(request)` — `403` for a Host/Origin the fence does not
 *     trust, `401` when no valid session cookie came along. Only the `401`
 *     goes away; the fence stays, because without it any page in any browser
 *     could drive `/api` through a rebinding trick.
 *   - `authorizeIndex(request, response)` — the token-to-cookie exchange plus
 *     the cookie check that guards `index.html`. It becomes unconditional,
 *     and a stale `?token=` bookmark is redirected to the clean root instead
 *     of being left in the address bar.
 *
 * `ctx.connection` hands out tracing proxies around one instance, so the
 * patch is written to the class prototype behind it: the one object every
 * caller and every reloaded instance shares. That does mean it reaches
 * dsh's internals, which is why the caller keeps the returned disposer and
 * the whole thing degrades to a warning when the methods are not there.
 * @param connection - the `connection` service value (proxy or instance).
 * @returns a disposer restoring dsh's gate, or `undefined` when there was
 * nothing to patch (missing methods, or already patched).
 */
export function disableBrowserAuth(connection) {
	const prototype = connection !== null && typeof connection === "object" ? Object.getPrototypeOf(connection) : void 0;
	const originals = prototype === null || prototype === void 0 ? void 0 : {
		requestRejection: prototype["requestRejection"],
		authorizeIndex: prototype["authorizeIndex"],
		authenticatedUrl: prototype["authenticatedUrl"]
	};
	if (originals === void 0 || typeof originals.requestRejection !== "function" || typeof originals.authorizeIndex !== "function" || prototype[NO_AUTH_MARKER] === true) return void 0;
	prototype["requestRejection"] = function (request) {
		const rejection = originals.requestRejection.call(this, request);
		return rejection === UNAUTHORIZED_STATUS ? void 0 : rejection;
	};
	prototype["authorizeIndex"] = function (request, response) {
		if (hasLaunchToken(request)) {
			response.writeHead(303, {
				"cache-control": "no-store",
				location: "/",
				"referrer-policy": "no-referrer"
			});
			response.end();
			return false;
		}
		return true;
	};
	prototype["authenticatedUrl"] = function (baseUrl) {
		return baseUrl;
	};
	Object.defineProperty(prototype, NO_AUTH_MARKER, { value: true, configurable: true });
	return () => {
		prototype["requestRejection"] = originals.requestRejection;
		prototype["authorizeIndex"] = originals.authorizeIndex;
		prototype["authenticatedUrl"] = originals.authenticatedUrl;
		delete prototype[NO_AUTH_MARKER];
	};
}

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
		rescueSettings: record["rescueSettings"] !== false,
		/** Drop the browser session gate entirely; off unless explicitly on. */
		noAuth: record["noAuth"] === true,
		/** Browser-session cookie lifetime in days (1..3650). */
		sessionDays: normalizeSessionDays(record["sessionDays"])
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
				rescueSettings: { type: "boolean" },
				noAuth: { type: "boolean" },
				sessionDays: { type: "number", meta: { step: 1, min: 1, max: MAX_SESSION_DAYS, default: DEFAULT_SESSION_DAYS } }
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
	const noAuth = values !== null && typeof values === "object" && values["noAuth"] === true;
	const sessionDays = normalizeSessionDays(values === null || typeof values !== "object" ? void 0 : values["sessionDays"]);
	return Object.freeze({
		enabled,
		accessHosts: Object.freeze(accessHosts),
		/** Whether the browser half may repair the client settings layer on a remote visit. */
		rescueSettings,
		/** Whether dsh's browser session gate (launch token + cookie) is removed. */
		noAuth,
		/** Browser-session cookie lifetime in days handed to the `connection` row. */
		sessionDays,
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
					rescueSettings: snapshot.rescueSettings,
					noAuth: snapshot.noAuth,
					sessionDays: snapshot.sessionDays
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
 * Mount the plugin: register the settings namespace, rewrite the owned rows
 * when enabled (the webserver/connection rows stay the official rows — the
 * bundle patch inserts only THIS entry, so a dshmarket disable of the
 * package writes `disabled: true` onto nothing else and the rows are left
 * exactly as dsh-web-app declared them). Exposure of the Remote, wiring
 * verification and the LAN URL follow. On deactivation the fiber's cleanup
 * effects cancel the pending rewrite and restore the rows to the official
 * defaults.
 * @param ctx - plugin context carrying the settings and loader providers.
 */
export function apply(ctx) {
	if (ctx.settings === void 0) {
		ctx.logger.warn("lan-access: settings provider unavailable — LAN access is disabled");
		return;
	}
	const scope = ctx.settings.register("lan-access", SettingsSchema);
	if (scope === void 0) {
		ctx.logger.warn("lan-access: settings scope unavailable — LAN access is disabled");
		return;
	}
	const snapshot = settingsSnapshot(scope.get());
	const wiring = {
		webserver: false,
		connection: false,
		verified: false
	};
	ctx.provide(REMOTE_SERVICE_KEY, createLanAccessRemote(ctx, snapshot, wiring));

	// Runtime row ownership: write the overrides when enabled, and always
	// restore the defaults when this fiber goes away (a dshmarket hot
	// disable, a scan deciding to turn the plugin off, a plain reload) — the
	// process keeps serving on the loopback/derived-fence defaults.
	// Deliberately fire-and-forget: row updates must never fail this plugin's
	// activation, and the tree itself does not depend on us. The loader handle
	// is captured now; the cleanup effect runs after this fiber is disposed.
	const loader = ctx.get("loader");
	const overrides = snapshot.enabled ? rowOverrides(snapshot) : {};
	let rewriteCancelled = false;
	if (Object.keys(overrides).length > 0) {
		// A dshmarket disable lands AFTER this fiber is already up (the
		// market's boot replay runs late); if the pending beat then fired on a
		// dead fiber's behalf it would restart the rows and start a
		// revive/disable wave. The flag turns the schedule into a no-op when
		// the fiber goes away; `restoreRowDefaults` below still runs.
		try {
			ctx.effect(() => {
				// ctx.effect(fn): fn runs NOW and its RETURN VALUE is the
				// disposer — so the cancel flag must be touched by the
				// returned function, not by fn itself.
				return () => {
					rewriteCancelled = true;
				};
			}, "dsh-lan-access: pending row rewrite cancelled");
		} catch {
			/* v8 ignore next -- a fiber that cannot host effects leaves the schedule standing */
		}
		try {
			ctx.effect(() => () => void restoreRowDefaults(loader), "dsh-lan-access: row overrides restored");
		} catch {
			/* v8 ignore next -- a fiber that cannot host effects leaves the overrides standing */
		}
		void scheduleRowRewrite(ctx, snapshot, () => rewriteCancelled).then((applied) => {
			if (!applied) ctx.logger.warn("dsh-lan-access: none of the owned rows were found in this profile — check cordis.patch.yml against this dsh version");
		}, (error) => {
			ctx.logger.warn(`dsh-lan-access: row overrides failed — ${error instanceof Error ? error.message : String(error)}`);
		});
		// Booted disabled: nothing to do. dshmarket's disable is a LATE
		// replay — this entry still activates for a moment every boot with
		// the plugin switched off, and rewriting the official rows from here
		// (restoreRowDefaults) restarted the webserver fiber inside the boot
		// window and wedged its listener (process looked healthy, TCP
		// refused, zero logs — the "silent unavailability" bug again). The
		// tree is rebuilt per boot, so no override can survive into a
		// disabled boot anyway; the restore belongs ONLY to the
		// effect-disposer registered above, which runs when a live fiber
		// that actually applied overrides goes away.
	}

	// Hot settings flips: the watch fires on every namespace write; only
	// enabled-state changes rewrite the rows (hosts changes alone rebind
	// immediately — the override value is re-read, nothing to do here).
	try {
		scope.watch(() => {
			const now = settingsSnapshot(scope.get());
			if (now.enabled === snapshot.enabled) return;
			if (now.enabled) {
				void applyRowOverrides(ctx, now);
			} else {
				void restoreRowDefaults(loader);
			}
		});
	} catch {
		/* v8 ignore next -- a scope that cannot host watchers keeps boot-time behavior */
	}

	// Lazy wiring check after the whole tree settles (same lifecycle the
	// shipped web runtime uses for its URL line): report whether the two
	// overrides really landed, and print the authenticated LAN URL.
	ctx.inject(["connection", "webServer"], (runtimeCtx) => {
		if (snapshot.noAuth) {
			const restore = disableBrowserAuth(runtimeCtx.get("connection"));
			if (restore === void 0) ctx.logger.warn("lan-access: noAuth is set, but the connection service exposes no browser authentication to remove — dsh keeps asking for the launch token");
			else {
				try {
					// Give the disposer to this fiber so a plugin reload puts
					// dsh's gate back before the next incarnation patches it.
					runtimeCtx.effect(() => restore, "dsh-lan-access: browser authentication removed");
				} catch {
					/* v8 ignore next -- a fiber that cannot host effects leaves the patch standing */
				}
				console.log("dsh-lan-access: browser authentication removed (noAuth) — every client that can reach this server can operate the Harness; the Host/Origin fence still applies");
			}
		}
		const settle = runtimeCtx.get("loader")?.await();
		const check = () => {
			if (runtimeCtx.get("connection") === void 0 || runtimeCtx.get("webServer") === void 0) return;
			const connection = runtimeCtx.connection;
			const webServer = runtimeCtx.webServer;
			const configured = Array.isArray(connection["trustedHosts"]) ? connection["trustedHosts"] : [];
			const snapshotNow = snapshot;
			wiring.webserver = webServer.host === "0.0.0.0";
			wiring.connection = snapshotNow.trustedHosts.every((host) => configured.includes(host));
			wiring.verified = wiring.webserver && wiring.connection;
			if (!snapshotNow.enabled) {
				console.log(`dsh-lan-access: LAN access disabled (webserver binds ${String(webServer.host)})`);
				return;
			}
			// The rewrite lands a fixed beat after the boot assertion (see
			// scheduleRowRewrite) — settling alone still races the assertion, and
			// an assertion-time restart aborts the whole profile. Re-read the
			// live services after the beat instead of reporting a boot-state miss
			// as drift.
			if (!wiring.webserver || !wiring.connection) {
				void scheduleRowRewrite(ctx, snapshot, () => rewriteCancelled).then(() => {
					if (runtimeCtx.get("webServer") === void 0 || runtimeCtx.get("connection") === void 0) return;
					const fresh = runtimeCtx.webServer;
					const freshConfigured = Array.isArray(runtimeCtx.connection["trustedHosts"]) ? runtimeCtx.connection["trustedHosts"] : [];
					wiring.webserver = fresh.host === "0.0.0.0";
					wiring.connection = snapshotNow.trustedHosts.every((host) => freshConfigured.includes(host));
					wiring.verified = wiring.webserver && wiring.connection;
					if (wiring.verified) {
						console.log(`dsh-lan-access: LAN access enabled on all interfaces; fence trusts ${String(freshConfigured.length)} authority/authorities`);
						const primary = snapshotNow.accessHosts[0];
						if (primary !== void 0 && fresh.port !== void 0 && typeof runtimeCtx.connection["authenticatedUrl"] === "function") {
							console.log(`dsh-lan-access: LAN: ${String(runtimeCtx.connection["authenticatedUrl"](`http://${primary}:${String(fresh.port)}`))}`);
						}
					}
				});
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
