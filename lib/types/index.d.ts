import type { Context } from "@deepseek-ai/cordis";

/** Resolved `lan-access` settings namespace value. */
export interface LanAccessSettings {
	enabled: boolean;
	accessHosts: string[];
	/** Repair the client settings layer on non-loopback visits; defaults to true. */
	rescueSettings: boolean;
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
}

export interface LanCandidate {
	name: string;
	address: string;
	internal: boolean;
	netmask?: string;
}

export interface LanAccessOverview {
	configured: { enabled: boolean; accessHosts: string[]; rescueSettings: boolean };
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
