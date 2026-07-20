export function secureDownloadHeaders(
	contentType: string,
	contentDisposition: string,
): Record<string, string> {
	return {
		"Content-Type": contentType,
		"Content-Disposition": contentDisposition,
		"Cache-Control": "private, no-store, max-age=0",
		Pragma: "no-cache",
		"X-Content-Type-Options": "nosniff",
	};
}
