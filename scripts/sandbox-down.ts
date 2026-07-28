#!/usr/bin/env bun
import { removeSandboxContainers } from "./sandbox";

try {
	removeSandboxContainers();
	console.log("[sandbox] alle temporären SVUFO-Container wurden entfernt");
} catch (error) {
	console.error(
		`[sandbox] ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exitCode = 1;
}
