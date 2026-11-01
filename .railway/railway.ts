import { defineRailway, github, project, service } from "railway/iac";

// This partial owns only the application. Database, bucket, volume and
// credentials remain outside this repository's configuration ownership.
export const partial = "rendant-app";

export default defineRailway(() => {
	const app = service("rendant-app", {
		source: github("Paul1404/rendant", {
			branch: "main",
			checkSuites: true,
		}),
		build: {
			buildEnvironment: "V3",
			builder: "DOCKERFILE",
			dockerfilePath: "Dockerfile",
		},
		preDeploy: "bun src/server/db/migrate.ts",
		start: "bun --smol .output/server/index.mjs",
		healthcheck: "/api/health",
		healthcheckTimeout: 60,
		replicas: { "europe-west4-drams3a": 1 },
		deploy: {
			restartPolicyType: "ON_FAILURE",
			restartPolicyMaxRetries: 3,
			drainingSeconds: 0,
			overlapSeconds: 0,
		},
		domains: [
			{ domain: "admin.rendant.app", port: 8080 },
			{ domain: "rendant.sv-untereuerheim.de", port: 8080 },
			{ domain: "ssv-gaedheim.rendant.app", port: 8080 },
			{ domain: "ssv-gaedheim.rendant.pdcd.net", port: 8080 },
			{ domain: "sv-untereuerheim.rendant.app", port: 8080 },
			{ domain: "svufo.sv-untereuerheim.de", port: 8080 },
		],
		networking: { privateNetworkEndpoint: "svufo" },
		cdn: { enabled: true },
	});

	// The CLI supports variable ownership, while SDK 3.16 types omit that
	// project option. A named definition keeps the checked resource types.
	const definition = {
		variables: { managed: false },
		resources: [app],
	};
	return project("rendant", definition);
});
