import { describe, expect, it } from "vitest";
import { toolsForMode } from "@/server/mcp/tools";

const names = (mode: Parameters<typeof toolsForMode>[0]) =>
	new Set(toolsForMode(mode).map((tool) => tool.name));

const IDENTITY_TOOLS = [
	"create_invite",
	"revoke_invite",
	"set_user_role",
	"set_user_blocked",
];

describe("toolsForMode", () => {
	it("exposes only reads in readonly mode", () => {
		for (const tool of toolsForMode("readonly")) {
			expect(tool.minMode).toBe("readonly");
		}
	});

	// A static bearer token must not be able to mint an admin account, whether it
	// leaked or the model was steered by injected spreadsheet content.
	it("withholds account administration from admin mode", () => {
		const admin = names("admin");
		for (const tool of IDENTITY_TOOLS) {
			expect(admin.has(tool)).toBe(false);
		}
		expect(admin.has("create_protocol")).toBe(true);
	});

	it("exposes them only in the opt-in identity mode", () => {
		const identity = names("identity");
		for (const tool of IDENTITY_TOOLS) {
			expect(identity.has(tool)).toBe(true);
		}
	});

	// The helper-hour corrections rewrite stored hours and merge people, so they
	// must never sit behind a plain readonly token.
	it("keeps helper-hour corrections behind admin mode", () => {
		const readonly = names("readonly");
		const admin = names("admin");
		for (const tool of [
			"merge_helper_name",
			"delete_helper_name_alias",
			"correct_helper_hour_entry",
			"create_helper_hour_category",
			"update_helper_hour_category",
		]) {
			expect(readonly.has(tool)).toBe(false);
			expect(admin.has(tool)).toBe(true);
		}
		for (const tool of [
			"helper_hours_overview",
			"list_helper_hours",
			"list_helper_hour_categories",
			"list_helper_name_variants",
			"list_helper_name_aliases",
		]) {
			expect(readonly.has(tool)).toBe(true);
		}
	});

	it("never exposes a mutating tool to readonly", () => {
		for (const tool of toolsForMode("readonly")) {
			expect(tool.annotations?.readOnlyHint).not.toBe(false);
		}
	});
});
