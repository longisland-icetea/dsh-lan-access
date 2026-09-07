// dsh-lan-access browser half: the LAN Access settings section.
// Ships prebuilt (no toolchain needed): the factory registers lazily with
// the client module loader and builds its UI with React.createElement.
window.__ModuleLoader__.load({
	id: "dsh-lan-access",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var React = require("react");
		var { useState, useEffect, useRef, useSyncExternalStore } = React;

		// ------------------------------------------------------------------ //
		// Dictionary namespace owned by this plugin (section copy).
		// ------------------------------------------------------------------ //
		const NS = "lan-access";
		const REMOTE_NS = "lanAccess";
		const SLOT = "settings.section";
		const SLOT_ID = "lan-access";
		const SLOT_ORDER = 14;

		const zh = {
			"nav": "局域网访问",
			"status.enabled": "已启用",
			"status.disabled": "已禁用",
			"status.wired": "当前生效",
			"status.pending": "已配置，重启 dsh web 后生效",
			"status.not-configured": "未检测到配置",
			"status.connecting": "正在读取状态…",
			"status.error": "读取失败：{message}",
			"bind": "监听",
			"bind.host": "绑定地址",
			"bind.port": "端口",
			"trust": "已信任的 Host/Origin",
			"trust.extra": "另有 {count} 个（{hosts}）来自 dsh 的自动信任，不在你的配置里（bind 0.0.0.0 时 dsh 会信任所有局域网 IPv4）。",
			"trust.fallback": "未配置访问地址：当前信任列表来自 dsh 的自动信任（配置非空时以配置为准）。",
			"enable": "打开局域网访问",
			"enable.hint": "绑定所有网卡（0.0.0.0），并允许局域网内的用户访问 Web 界面。",
			"rescue.label": "远程访问时修复设置层",
			"rescue.hint": "dsh 对非回环页面把设置层切成内存模式，导致“提供方目录”“插件配置页”等报 settings are unavailable。开启后插件会把它拉回宿主机持久化；关闭则保持 dsh 原样。此项改动需重启 dsh web。",
			"session.label": "浏览器会话有效期（天）",
			"session.hint": "用带 token 的地址访问一次后，这台设备在这么多天内免登录（cookie 按访问地址分别保存，dsh 重启不会失效）。默认 30；调大意味着拿到这台设备的人在更久时间内都能操作你的 Harness。改动需重启 dsh web。",
			"session.hint.noauth": "免鉴权开启时此项无效（已经没有任何会话需要保活）。",
			"noauth.label": "免鉴权（去掉启动 token 与 cookie 登录）",
			"noauth.hint": "开启后 dsh 不再索取启动 token、也不再校验浏览器 cookie：任何能连到该地址的人都能直接操作此 Harness，能借你的浏览器跨站调用 /api 的站点同样可以。Host/Origin 围栏仍然生效——不在「访问地址」里的 Host 依旧返回 403。其余安全完全交给你的网络（虚拟局域网 / VPN / 防火墙 / 网段）。改动需重启 dsh web。",
			"hosts.label": "访问地址（局域网的 IP）",
			"hosts.hint": "用户将访问 http://<此地址>:<端口>/。可填写多个，用逗号分隔。",
			"hosts.placeholder": "例如 192.168.1.23 或 100.64.2.3",
			"hosts.remove": "移除",
			"hosts.empty": "（还没有添加任何地址）",
			"readonly.title": "只读：读不到本插件的设置",
			"readonly.text": "读不到 lan-access 命名空间，为避免覆盖已保存的值，本页已禁止修改。下面显示的是服务端当前生效值。请改用 http://127.0.0.1:3080 打开本页（WSL 内浏览器，或用 ssh -L 3080:127.0.0.1:3080 转发），或直接编辑 ~/.dsh/settings.yaml 后重启 dsh web。",
			"readonly.lan": "（检测到当前页面 Host 不是回环地址：dsh 对远程浏览器把设置层切成内存模式。）",
			"source.host": "（当前值来自服务端，非本页可写）",
			"candidates.title": "本机检测到的 IPv4 地址",
			"candidates.use": "使用",
			"candidates.empty": "没有检测到非回环 IPv4 地址",
			"save": "保存",
			"save.saved": "已保存，重启 dsh web 后生效",
			"save.saving": "保存中…",
			"save.error": "保存失败：{message}",
			"url.label": "局域网访问地址",
			"url.hint": "首次访问请使用完整的带 token 地址（重新启动 dsh web 时会打印；点击应用后此地址即包含 token）。",
			"url.hint.noauth": "免鉴权已开启：直接用干净地址访问即可，不需要 token。",
			"url.none": "启用并保存后显示",
			"security.title": "安全提示",
			"security.text": "局域网访问意味着任何能访问该地址的人都能操作此 Harness（相当于远程代码执行）。请只在可信网络启用，并避免把带 token 的 URL 转发给不信任的人。",
			"downgrade": "未应用（安装后的插件未生效，请查看启动日志中的 dsh-lan-access 提示）"
		};
		const en = {
			"nav": "LAN Access",
			"status.enabled": "Enabled",
			"status.disabled": "Disabled",
			"status.wired": "Active now",
			"status.pending": "Configured — restart dsh web to apply",
			"status.not-configured": "No configuration found",
			"status.connecting": "Reading state…",
			"status.error": "Read failed: {message}",
			"bind": "Listener",
			"bind.host": "Bind host",
			"bind.port": "Port",
			"trust": "Trusted Host/Origin authorities",
			"trust.extra": "{count} more ({hosts}) come from dsh's automatic trust, not from your configuration (binding 0.0.0.0 makes dsh trust every LAN IPv4).",
			"trust.fallback": "No access address configured: the trusted list comes from dsh's automatic trust (a non-empty configuration wins)",
			"enable": "Enable LAN access",
			"enable.hint": "Binds all interfaces (0.0.0.0) and lets LAN users reach the Web UI.",
			"rescue.label": "Repair the settings layer on remote visits",
			"rescue.hint": "dsh switches the settings layer to memory mode for non-loopback pages, which makes the provider directory, the plugin configuration page and others report \"settings are unavailable\". Enabled, this plugin puts it back on host persistence; disabled leaves dsh as it is. Changes need a dsh web restart.",
			"session.label": "Browser session lifetime (days)",
			"session.hint": "After one visit with the token URL this device stays authenticated for that many days (cookies are stored per access address and survive a dsh restart). Defaults to 30; raising it means anyone with the device can operate your Harness for longer. Changes need a dsh web restart.",
			"session.hint.noauth": "Has no effect while authentication is off (there is no session left to keep alive).",
			"noauth.label": "No authentication (drop the launch token and cookie login)",
			"noauth.hint": "With this on, dsh stops asking for the launch token and stops checking the browser cookie: anyone who can reach that address can operate this Harness directly, and so can any site able to make your browser call /api cross-site. The Host/Origin fence still applies — hosts outside the access address list are still 403. Every other door becomes your network's job (virtual LAN / VPN / firewall / subnet). Changes need a dsh web restart.",
			"hosts.label": "Access address (LAN IP)",
			"hosts.hint": "Users will open http://<this address>:<port>/. Comma-separate multiple addresses.",
			"hosts.placeholder": "e.g. 192.168.1.23 or 100.64.2.3",
			"hosts.remove": "Remove",
			"hosts.empty": "(no address added yet)",
			"readonly.title": "Read-only: this plugin's settings could not be read",
			"readonly.text": "The lan-access namespace could not be read, so editing is disabled here to avoid overwriting the stored value. The values below are the host's live ones. Open http://127.0.0.1:3080 instead (a WSL-side browser, or ssh -L 3080:127.0.0.1:3080), or edit ~/.dsh/settings.yaml and restart dsh web.",
			"readonly.lan": "(This page's Host is not a loopback address: dsh switches its settings layer to memory mode for remote browsers.)",
			"source.host": "(shown from the host; not writable from this page)",
			"candidates.title": "IPv4 addresses detected on this machine",
			"candidates.use": "Use",
			"candidates.empty": "No non-loopback IPv4 address detected",
			"save": "Save",
			"save.saved": "Saved — restart dsh web to apply",
			"save.saving": "Saving…",
			"save.error": "Save failed: {message}",
			"url.label": "LAN access URL",
			"url.hint": "For the first visit use the full token URL (printed when dsh web starts).",
			"url.hint.noauth": "Authentication is off: open the clean address directly — no token needed.",
			"url.none": "Shown after enabling and saving",
			"security.title": "Security note",
			"security.text": "LAN access means anyone who can reach that address can operate this Harness (remote code execution). Only enable on trusted networks, and never forward the token URL to people you do not trust.",
			"downgrade": "Not applied (the installed plugin layer did not take effect; check the dsh-lan-access line in the startup log)"
		};

		// ------------------------------------------------------------------ //
		// Minimal observable store.
		// ------------------------------------------------------------------ //
		function createObservable() {
			let snapshot;
			const listeners = new Set();
			return {
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				getSnapshot() {
					return snapshot;
				},
				set(next) {
					snapshot = next;
					for (const listener of [...listeners]) listener();
				}
			};
		}

		function messageOf(error) {
			return error && typeof error === "object" && typeof error.message === "string" ? error.message : String(error);
		}

		// ------------------------------------------------------------------ //
		// Settings-page store: reads the lan-access settings namespace
		// through remote.settings and host facts through the plugin Remote.
		// ------------------------------------------------------------------ //
		class LanAccessController {
			constructor(context, connection, hooks = {}) {
				this.context = context;
				this.connection = connection;
				this.hooks = hooks;
				this.observable = createObservable();
				this.abort = new AbortController();
				this.refreshing = void 0;
				this.observable.set({ phase: "idle" });
			}
			subscribe(listener) {
				return this.observable.subscribe(listener);
			}
			getSnapshot() {
				return this.observable.getSnapshot();
			}
			dispose() {
				this.abort.abort();
			}
			settingsService() {
				return this.context.get("remote.settings");
			}
			async describeSettings() {
				const service = this.settingsService();
				if (service === void 0 || typeof service.describe !== "function") return null;
				const result = await service.describe();
				const namespaces = Array.isArray(result?.namespaces) ? result.namespaces : [];
				return namespaces.find((entry) => entry?.ns === NS) ?? null;
			}
			async callRemote(method, args) {
				const call = this.connection?.rpc?.call;
				if (typeof call !== "function") throw new Error("connection unavailable");
				const result = await call(`/api`, `${REMOTE_NS}/${method}`, { args: args ?? {} }, this.abort.signal);
				if (result === null || typeof result !== "object") throw new Error("invalid remote response");
				if (result.ok !== true) {
					const error = result.error ?? {};
					throw new Error(typeof error.message === "string" ? error.message : "remote call failed");
				}
				return result.value;
			}
			async refresh() {
				if (this.refreshing !== void 0) return this.refreshing;
				this.refreshing = this.doRefresh();
				try {
					await this.refreshing;
				} finally {
					this.refreshing = void 0;
				}
			}
			async doRefresh() {
				this.observable.set({ ...this.observable.getSnapshot() ?? {}, phase: "loading" });
				let settings = null;
				let overview = null;
				let failure = void 0;
				try {
					settings = await this.describeSettings();
				} catch (error) {
					failure = messageOf(error);
				}
				try {
					overview = await this.callRemote("overview", {});
				} catch (error) {
					if (failure === void 0) failure = messageOf(error);
				}
				// The rescue runs off the host's own answer: on a remote visit the
				// client settings mirror is exactly what cannot be trusted here.
				this.hooks.onOverview?.(overview);
			// `remote.$host.isLoopback` decides whether the settings layer is
			// durable at all: a non-loopback page runs it in memory mode, where
			// writes are silently dropped and reads never answer.
			const loopback = this.context.get("remote")?.$host?.isLoopback === true;
			this.observable.set({
					phase: "ready",
					settings,
					overview,
					loopback,
					error: failure
				});
			}
			async save(enabled, accessHosts, rescueSettings, noAuth, sessionDays) {
				const service = this.settingsService();
				if (service === void 0 || typeof service.update !== "function") throw new Error("settings service unavailable");
				const current = await this.describeSettings();
				await service.update(NS, { enabled, accessHosts, rescueSettings, noAuth, sessionDays }, current?.revision ?? void 0);
				await this.refresh();
			}
		}

		// ------------------------------------------------------------------ //
		// Section UI.
		// ------------------------------------------------------------------ //
		function span(text, style, key) {
			return React.createElement("span", { style, ...key !== void 0 ? { key } : {} }, text);
		}
		function label(text, style, key) {
			return React.createElement("div", { style, ...key !== void 0 ? { key } : {} }, text);
		}
		function button(text, onClick, disabled, style) {
			return React.createElement("button", { onClick, disabled, style }, text);
		}

		function SectionView(props) {
			const controller = props.controller;
			const t = props.t;
			const state = useSyncExternalStore(
				(listener) => controller.subscribe(listener),
				() => controller.getSnapshot()
			);
			const [enabled, setEnabled] = useState(false);
			const [hostsText, setHostsText] = useState("");
			const [rescue, setRescue] = useState(true);
			const [noAuth, setNoAuth] = useState(false);
			const [sessionDays, setSessionDays] = useState(30);
			const [saving, setSaving] = useState(false);
			const [saveError, setSaveError] = useState(void 0);
			const [saved, setSaved] = useState(false);
			const dirty = useRef(false);

			const settings = state?.settings;
			const overview = state?.overview;
			const loopback = state?.loopback === true;
			// On a non-loopback page the settings mirror never answers, so fall
			// back to the host snapshot the plugin Remote always reports. That
			// keeps the form truthful (read-only) instead of showing an empty box.
			const mirrored = settings?.value;
			const effective = mirrored ?? overview?.configured ?? null;
			const configuredEnabled = effective?.enabled === true;
			const configuredHosts = Array.isArray(effective?.accessHosts) ? effective.accessHosts : [];
			const liveEnabled = overview?.configured?.enabled === true;
			const wired = overview?.wired?.verified === true;
			// Never let a failed read turn into a write: without the stored
			// section the form cannot know what it would overwrite (an empty
			// form saved from a stale page used to clear `enabled`).
			const blocked = state?.phase === "ready" && mirrored === null;
			const readOnly = state?.phase !== "ready" || mirrored === null;

			useEffect(() => {
				if (state?.phase !== "ready") return;
				if (dirty.current) return;
				setEnabled(configuredEnabled);
				setHostsText(configuredHosts.join(", "));
				setRescue(effective?.rescueSettings !== false);
				setNoAuth(effective?.noAuth === true);
				setSessionDays(Number.isSafeInteger(effective?.sessionDays) ? effective.sessionDays : 30);
			}, [state?.phase, configuredEnabled, configuredHosts.join("|")]);

			const onToggle = (event) => {
				dirty.current = true;
				setSaved(false);
				setSaveError(void 0);
				setEnabled(event.target.checked);
			};
			const onRescueToggle = (event) => {
				dirty.current = true;
				setSaved(false);
				setSaveError(void 0);
				setRescue(event.target.checked);
			};
			const onNoAuthToggle = (event) => {
				dirty.current = true;
				setSaved(false);
				setSaveError(void 0);
				setNoAuth(event.target.checked);
			};
			const onSessionDaysChange = (event) => {
				dirty.current = true;
				setSaved(false);
				setSaveError(void 0);
				setSessionDays(event.target.value);
			};
			const onHostsChange = (event) => {
				dirty.current = true;
				setSaved(false);
				setSaveError(void 0);
				setHostsText(event.target.value);
			};
			const parsedHosts = hostsText.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
			const removeHost = (host) => {
				dirty.current = true;
				setSaved(false);
				setSaveError(void 0);
				setHostsText(parsedHosts.filter((item) => item !== host).join(", "));
			};
			const useCandidate = (address) => {
				dirty.current = true;
				setSaved(false);
				setSaveError(void 0);
				const existing = hostsText.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
				const next = [...new Set([...existing, address])];
				setHostsText(next.join(", "));
			};
			const onSave = async () => {
				setSaving(true);
				setSaved(false);
				setSaveError(void 0);
				try {
					const accessHosts = parsedHosts;
					const days = Math.min(Math.max(Math.round(Number(sessionDays) || 30), 1), 3650);
					await controller.save(enabled, accessHosts, rescue, noAuth, days);
					dirty.current = false;
					setSaved(true);
				} catch (error) {
					setSaveError(t("save.error", { message: messageOf(error) }));
				} finally {
					setSaving(false);
				}
			};

			const candidates = Array.isArray(overview?.candidates) ? overview.candidates : [];
			const lanUrls = Array.isArray(overview?.lanUrls) ? overview.lanUrls : [];

			const common = { fontFamily: "inherit", color: "var(--dsw-alias-label-primary, #222)", fontSize: 13, lineHeight: 1.5 };
			const muted = { ...common, color: "var(--dsw-alias-label-tertiary, #888)" };
			const card = { display: "flex", flexDirection: "column", gap: 10, padding: "12px 0" };
			const row = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
			const input = { ...common, border: ".5px solid var(--dsw-alias-border-l4, #ccc)", background: "var(--dsw-alias-bg-layer-3, #fff)", height: 32, borderRadius: 8, padding: "0 12px", width: "100%", boxSizing: "border-box" };
			const btn = { ...common, border: ".5px solid var(--dsw-alias-border-l4, #ccc)", background: "var(--dsw-alias-bg-layer-3, #fff)", borderRadius: 8, padding: "4px 12px", cursor: "pointer", color: "var(--dsw-alias-label-primary, #222)" };
			const okBadge = { borderRadius: 999, padding: "1px 8px", fontSize: 11, background: "var(--dsw-alias-bg-brand-primary, #2e7d32)", color: "#fff" };
			const warnBadge = { borderRadius: 999, padding: "1px 8px", fontSize: 11, background: "#b26a00", color: "#fff" };
			const idleBadge = { borderRadius: 999, padding: "1px 8px", fontSize: 11, background: "var(--dsw-alias-bg-module-platform, #eee)", color: "var(--dsw-alias-label-secondary, #555)" };
			const chip = { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "2px 4px 2px 10px", fontSize: 12, background: "var(--dsw-alias-bg-module-platform, #eee)", color: "var(--dsw-alias-label-primary, #222)" };
			const chipBtn = { ...common, border: "none", background: "transparent", cursor: "pointer", borderRadius: 999, width: 20, height: 20, lineHeight: 1, padding: 0, fontSize: 14, color: "var(--dsw-alias-label-secondary, #555)" };

			const readOnlyBanner = blocked
				? React.createElement("div", { style: { ...muted, color: "#b26a00", marginTop: 4 }, key: "readonly" }, [
					React.createElement("div", { style: { fontWeight: 500 }, key: "title" }, t("readonly.title")),
					React.createElement("div", { key: "text" }, t("readonly.text")),
					loopback === false ? React.createElement("div", { key: "lan" }, t("readonly.lan")) : null,
					state?.error === void 0 ? null : React.createElement("div", { key: "err" }, t("status.error", { message: state.error }))
				])
				: null;

			let status;
			if (state?.phase === "loading" || state?.phase === "idle") {
				status = span(t("status.connecting"), idleBadge);
			} else if (settings === null && overview === null) {
				status = span(t("status.error", { message: state?.error ?? "?" }), warnBadge);
			} else if (!configuredEnabled) {
				status = span(t("status.disabled"), idleBadge);
			} else if (wired) {
				status = span(t("status.wired"), okBadge);
			} else if (liveEnabled) {
				status = span(t("status.pending"), warnBadge);
			} else {
				status = span(t("downgrade"), warnBadge);
			}

			const bindHost = overview?.live?.bindHost;
			const port = overview?.live?.port;
			const trustedHosts = Array.isArray(overview?.live?.trustedHosts) ? overview.live.trustedHosts : [];
			const extraTrusted = trustedHosts.filter((host) => !configuredHosts.includes(host));

			return React.createElement("div", { style: card }, [
				React.createElement("div", { style: row, key: "status" }, status),
				readOnlyBanner,
				React.createElement("div", { style: row, key: "bind-host" }, [
					label(t("bind.host"), muted, "bind-host-label"),
					span(bindHost ?? "?", common, "bind-host-value")
				]),
				React.createElement("div", { style: row, key: "bind-port" }, [
					label(t("bind.port"), muted, "bind-port-label"),
					span(port ?? "?", common, "bind-port-value")
				]),
				React.createElement("div", { style: row, key: "trust" }, [
					label(`${t("trust")} (${String(trustedHosts.length)})`, muted, "trust-label"),
					span(trustedHosts.join(", ") || "—", muted, "trust-value")
				]),
				extraTrusted.length > 0
					? React.createElement("div", { style: muted, key: "trust-extra" }, configuredHosts.length === 0 ? t("trust.fallback") : t("trust.extra", { count: String(extraTrusted.length), hosts: extraTrusted.join(", ") }))
					: null,
				React.createElement("div", { style: { borderTop: ".5px solid var(--dsw-alias-border-l2, #ddd)", margin: "4px 0" }, key: "divider" }),
				React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 8 }, key: "enable" }, [
					React.createElement("input", {
						type: "checkbox",
						checked: enabled,
						onChange: onToggle,
						disabled: state?.phase !== "ready" || saving || readOnly
					}),
					span(t("enable"), common, "enable-label")
				]),
				React.createElement("div", { style: muted, key: "enable-hint" }, t("enable.hint")),
				React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 }, key: "rescue" }, [
					React.createElement("input", {
						type: "checkbox",
						checked: rescue,
						onChange: onRescueToggle,
						disabled: state?.phase !== "ready" || saving || readOnly
					}),
					span(t("rescue.label"), common, "rescue-label")
				]),
				React.createElement("div", { style: muted, key: "rescue-hint" }, t("rescue.hint")),
				React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 }, key: "noauth" }, [
					React.createElement("input", {
						type: "checkbox",
						checked: noAuth,
						onChange: onNoAuthToggle,
						disabled: state?.phase !== "ready" || saving || readOnly
					}),
					span(t("noauth.label"), { ...common, color: noAuth ? "#b26a00" : void 0 }, "noauth-label")
				]),
				React.createElement("div", { style: muted, key: "noauth-hint" }, t("noauth.hint")),
				React.createElement("div", { style: { ...muted, marginTop: 4 }, key: "session-label" }, t("session.label")),
				React.createElement("input", {
					type: "number",
					min: 1,
					max: 3650,
					step: 1,
					style: { ...input, width: 140 },
					value: String(sessionDays),
					onChange: onSessionDaysChange,
					disabled: state?.phase !== "ready" || saving || readOnly || noAuth,
					key: "session-input"
				}),
				React.createElement("div", { style: muted, key: "session-hint" }, t(noAuth ? "session.hint.noauth" : "session.hint")),
				React.createElement("div", { style: { ...muted, marginTop: 4 }, key: "hosts-label" }, `${t("hosts.label")}${mirrored === null ? ` ${t("source.host")}` : ""}`),
				React.createElement("div", { style: { ...row, marginTop: 4 }, key: "hosts-chips" },
					parsedHosts.length === 0
						? span(t("hosts.empty"), muted, "empty")
						: parsedHosts.map((host) => React.createElement("span", { key: host, style: chip, title: t("hosts.remove") }, [
							span(host, common, "text"),
							React.createElement("button", { onClick: () => removeHost(host), disabled: readOnly || saving, style: chipBtn, "aria-label": `${t("hosts.remove")} ${host}`, key: "x" }, "\u00d7")
						]))
				),
				React.createElement("input", {
					style: input,
					value: hostsText,
					onChange: onHostsChange,
					placeholder: t("hosts.placeholder"),
					disabled: state?.phase !== "ready" || saving || readOnly,
					key: "hosts-input"
				}),
				React.createElement("div", { style: muted, key: "hosts-hint" }, t("hosts.hint")),
				React.createElement("div", { style: { ...common, marginTop: 4 }, key: "candidates-title" }, t("candidates.title")),
				candidates.length === 0
					? React.createElement("div", { style: muted, key: "candidates-empty" }, t("candidates.empty"))
					: React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, key: "candidates" },
						candidates.map((candidate) => React.createElement("div", { style: row, key: candidate.address ?? String(candidate.name) }, [
							span(candidate.address ?? "?", common, "address"),
							candidate.internal
								? span("(loopback)", muted, "kind")
								: span(String(candidate.name ?? ""), muted, "kind"),
							button(t("candidates.use"), () => useCandidate(candidate.address), readOnly || saving, { ...btn, marginLeft: "auto", key: "use" })
						]))
					),
				React.createElement("div", { style: row, key: "actions" }, [
					button(t("save"), onSave, saving || state?.phase !== "ready" || readOnly, { ...btn, fontWeight: 500 }),
					saving ? span(t("save.saving"), muted, "saving") : null,
					saved ? span(t("save.saved"), okBadge, "saved") : null,
					saveError ? span(saveError, warnBadge, "save-error") : null
				]),
				React.createElement("div", { style: { ...common, marginTop: 4 }, key: "url-label" }, t("url.label")),
				lanUrls.length > 0
					? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, key: "urls" },
						lanUrls.map((entry) => React.createElement("input", {
							key: entry.host,
							style: input,
							readOnly: true,
							value: entry.url ?? "",
							onFocus: (event) => event.target.select()
						}))
					)
					: React.createElement("div", { style: muted, key: "url-none" }, t("url.none")),
				React.createElement("div", { style: muted, key: "url-hint" }, t(noAuth ? "url.hint.noauth" : "url.hint")),
				React.createElement("div", { style: { ...muted, marginTop: 4 }, key: "security-title" }, t("security.title")),
				React.createElement("div", { style: muted, key: "security-text" }, t("security.text"))
			]);
		}

		/**
		* Stand-in for the shipped `welcome-notice` onboarding step.
		*
		* A non-loopback page runs the settings layer in memory mode, so the
		* shipped notice can never persist its acknowledgement
		* (`ui-onboarding.welcomeNoticeVersion`) and re-appears on every reload.
		* SlotCore resolves a list slot by id and lets a LOWER `priority` shadow a
		* higher one ("lowest renders"; `entriesOfSlot` keeps the first entry per
		* id), so registering this stub at priority -1 keeps the shipped notice
		* from ever mounting. It renders nothing and reports the step complete at
		* once, so any remaining onboarding step still runs.
		*/
		function WelcomeNoticeShadow(props) {
			const done = useRef(false);
			useEffect(() => {
				if (done.current) return;
				done.current = true;
				props.complete?.();
			}, [props.complete]);
			return null;
		}

		/**
		* Upgrade the scopes the binder already handed out.
		*
		* `SettingsScopeBinder.bind` captures `persistence` per scope at bind time,
		* and a memory-mode scope never subscribes to the mirror — but its
		* `derive()` reads the shared mirror and is independent of `persistence`,
		* so re-subscribing and deriving once is all it needs. The binder keeps no
		* registry of the controllers it returns, so one probe bind yields the
		* prototype and the upgrade runs lazily on each scope's first read.
		* @param binder - the `settingsScope` service.
		* @param mirror - the shared describe mirror, already flipped to the host.
		* @returns nothing.
		*/
		function upgradeBoundScopes(binder, mirror) {
			const probe = binder.bind({ namespace: `${NS}/rescue-probe` });
			const proto = Object.getPrototypeOf(probe);
			void probe.dispose?.();
			if (proto === null || proto === void 0 || proto.__lanAccessRescued === true) return;
			const upgrade = (scope) => {
				try {
					if (scope.persistence !== "memory" || scope.mirror?.persistence !== "host") return;
					scope.persistence = "host";
					if (scope.unsubscribe === void 0 && typeof scope.mirror.subscribe === "function") scope.unsubscribe = scope.mirror.subscribe(() => scope.derive());
					scope.derive();
				} catch {
					/* v8 ignore next -- a future shape change must never break the page */
				}
			};
			for (const method of ["getSnapshot", "subscribe"]) {
				const original = proto[method];
				if (typeof original !== "function") continue;
				Object.defineProperty(proto, method, {
					value: function patchedScopeMethod(...args) {
						upgrade(this);
						return original.apply(this, args);
					},
					configurable: true,
					writable: true
				});
			}
			Object.defineProperty(proto, "__lanAccessRescued", { value: true, configurable: true });
		}

		// ------------------------------------------------------------------ //
		// Client plugin entry.
		// ------------------------------------------------------------------ //
		const name = "dsh-lan-access";
		// `remote` / `remote.settings` are declared like every shipped settings
		// section declares them: reading them out of `inject` is racy and leaves
		// `context.get("remote.settings")` undefined on the first pass.
		const inject = ["slots", "locale", "connection", "remote", "remote.settings"];

		function apply(context) {
			if (context.get("slots") === void 0) return;
			const locale = context.get("locale");
			const connection = context.get("connection");
			const t = locale.bind(NS);
			// A non-loopback page starts the shared settings mirror in memory mode:
			// `describe()` never runs, so every consumer that reads the mirror
			// reports "settings are unavailable in this browser" — the provider
			// directory, the configurable-plugins tab, and so on. Flip the mirror
			// back to the host and prime it. Opt out with `rescueSettings: false`.
			let rescued = false;
			let rescueAllowed = true;
			const rescueSettingsPersistence = () => {
				try {
					if (rescued || !rescueAllowed) return;
					if (context.get("remote")?.$host?.isLoopback !== false) return;
					const binder = context.get("settingsScope");
					const mirror = binder?.describe?.();
					if (binder === void 0 || mirror === void 0 || mirror.persistence !== "memory") return;
					rescued = true;
					mirror.persistence = "host";
					if (binder.persistence === "memory") binder.persistence = "host";
					mirror.store.set({ status: "idle", view: void 0, error: null });
					mirror.ensure();
					upgradeBoundScopes(binder, mirror);
				} catch {
					/* v8 ignore next -- a future shape change must never break the page */
				}
			};
			// The rescue runs off the host's own answer (see `onOverview`): on a
			// remote visit the client mirror is exactly what cannot be trusted.
			const controller = new LanAccessController(context, connection, {
				onOverview: (overview) => {
					rescueAllowed = overview?.configured?.rescueSettings !== false;
					rescueSettingsPersistence();
				}
			});
			context.effect(() => {
				const disposeDictionaries = locale.register(NS, { en, zh });
				const disposer = context.on("internal/service", (serviceName) => {
					if (serviceName === "remote.settings" || serviceName === "remote" || serviceName === "connection") controller.refresh();
				});
				return () => {
					disposer();
					disposeDictionaries();
				};
			}, "dsh-lan-access: dictionaries and service watches");
			const slots = context.get("slots");
			slots.inject(SLOT, () => slots.register({
				name: SLOT,
				id: SLOT_ID,
				order: SLOT_ORDER,
				locale: NS,
				label: () => t("nav"),
				inject: () => ({
					controller,
					t
				})
			}, SectionView));
			// Only a remote visit needs the shadow: from loopback the shipped
			// notice reads its stored acknowledgement and stays away on its own.
			if (context.get("remote")?.$host?.isLoopback === false) {
				slots.inject("settings.onboarding", () => slots.register({
					name: "settings.onboarding",
					id: "welcome-notice",
					priority: -1,
					order: -100,
					locale: NS
				}, WelcomeNoticeShadow));
			}
			controller.refresh();
			context.effect(() => () => controller.dispose(), "dsh-lan-access: controller");
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
