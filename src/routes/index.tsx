import { createFileRoute, redirect } from "@tanstack/react-router";
import { fetchOperatorSession } from "@/lib/server-fns";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const entry = await fetchOperatorSession();
		throw redirect({ to: entry.operatorHost ? "/admin" : "/protokolle" });
	},
});
