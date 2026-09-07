import type { Context } from "@deepseek-ai/cordis";

/** Resolved `lan-access` settings namespace value. */
export interface LanAccessSettings {
	enabled: boolean;
	accessHosts: string[];
	/** Repair the client settings layer on non-loopback visits; defaults to true. */
	rescueSettings: boolean;
	/** Remove dsh's browser session gate (launch token + cookie); defaults to false. */
	noAuth: boolean;
	/** Browser-session cookie lifetime in days (1..3650, default 30). */
	sessionDays: number;
}

/** A boot-time snapshot consumed by the patched `webserver`/`connection` rows. */
export interface LanAccessSnapshot {
	readonly enabled: boolean;
	readonly accessHosts: readonly string[];
	/** `0.0.0.0` while enabled; undefined delegates to CLI/row defaults. */
	readonly bindHost: string | undefined;
	/** Fence entries owned by the plugin. */
	readonly trustedHosts: readonly string[];
	/** Whether the browser half may repair the client settings layer. */
	readonly rescueSettings: boolean;
	/** Whether dsh's browser session gate (launch token + cookie) is removed. */
	readonly noAuth: boolean;
	/** Browser-session cookie lifetime in days handed to the `connection` row. */
	readonly sessionDays: number;
}

export interface LanCandidate {
	name: string;
	address: string;
	internal: boolean;
	netmask?: string;
}

export interface LanAccessOverview {
	configured: { enabled: boolean; accessHosts: string[]; rescueSettings: boolean; noAuth: boolean; sessionDays: number };
	live: { bindHost: string | undefined; port: number | undefined; trustedHosts: string[] };
	wired: { webserver: boolean; connection: boolean; verified: boolean };
	candidates: LanCandidate[];
	lanUrls: { host: string; url: string }[];
}

export const name: string;
export const inject: string[];
export function apply(ctx: Context): void;
/** The callable settings schema (normalizes the merged section) with its wire description. */
export interface LanAccessSettingsSchema {
	(input: unknown): LanAccessSettings;
	toJSON(): unknown;
}
export const SettingsSchema: LanAccessSettingsSchema;
export function settingsSnapshot(values: LanAccessSettings | undefined): LanAccessSnapshot;
export function isValidBareAuthority(entry: unknown): boolean;
export function canonicalAuthority(entry: unknown): string | undefined;
export function lanCandidates(): LanCandidate[];
/**
 * Remove dsh's browser session gate from a live `connection` service: the 401
 * (no session cookie) disappears, the 403 Host/Origin fence stays.
 * @returns a disposer restoring dsh's gate, or `undefined` when there was
 * nothing to patch (missing methods, or already patched).
 */
export function disableBrowserAuth(connection: unknown): (() => void) | undefined;
