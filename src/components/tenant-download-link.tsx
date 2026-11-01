import { useRouteContext } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { tenantApiUrl } from "@/lib/tenant-client";

/** Ordinary downloads cannot carry a header, so bind their URL to this tab's club. */
export function TenantDownloadLink({
	href,
	...props
}: Omit<ComponentProps<"a">, "href"> & { href: string }) {
	const { user } = useRouteContext({ from: "/protokolle" });
	return <a {...props} href={tenantApiUrl(href, user.tenant.id)} />;
}
