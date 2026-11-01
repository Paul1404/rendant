import { createRailwayContext, project } from "railway/iac";
import { describe, expect, it } from "vitest";
import configure, { partial } from "../.railway/railway";

describe("Railway application configuration boundary", () => {
	it("keeps data resources and credentials outside the application partial", async () => {
		const definition = await configure(
			createRailwayContext({ environment: "production" }),
			project,
		);
		expect(partial).toBe("rendant-app");
		expect(definition).toMatchObject({
			name: "rendant",
			variables: { managed: false },
		});
		const resources = definition.resources?.flat() ?? [];
		expect(resources).toHaveLength(1);
		expect(resources[0]).toMatchObject({
			address: "service.rendant-app",
			type: "service",
			source: {
				repo: "Paul1404/rendant",
				branch: "main",
				checkSuites: true,
			},
		});
		expect(resources[0]).not.toHaveProperty("variables");
		expect(resources[0]).not.toHaveProperty("volumeMounts");
	});

	it("preserves the production migration and readiness contract when the SDK normalizes intent", async () => {
		const definition = await configure(
			createRailwayContext({ environment: "production" }),
			project,
		);
		const app = definition.resources?.flat()[0];
		expect(app).toMatchObject({
			build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
			deploy: {
				preDeployCommand: ["bun src/server/db/migrate.ts"],
				startCommand: "bun --smol .output/server/index.mjs",
				healthcheckPath: "/api/health",
				healthcheckTimeout: 60,
				restartPolicyMaxRetries: 3,
			},
		});
		// ON_FAILURE is the effective platform default. An explicit field
		// differs from Railway's canonical omission forever.
		expect(app).not.toHaveProperty("deploy.restartPolicyType");
	});
});
