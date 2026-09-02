import { Search } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Shared so every input-shaped control keeps the same box. Note the responsive
// `sm:px-2.5`: a caller's unprefixed `pl-*` sits in a different tailwind-merge
// conflict group, survives the merge, and then loses the cascade from 640px up.
// Anything that needs room for an icon has to set the `sm:` variant too.
const inputClassName =
	"h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 sm:h-8 sm:px-2.5 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(inputClassName, className)}
			{...props}
		/>
	);
}

// A search field owns its magnifier and the padding that magnifier needs, so no
// call site has to know about the padding rule above. The icon follows the input
// in the DOM and is placed absolutely, which keeps `peer-*` styling available to
// callers that want it to react to the input's state.
function SearchInput({
	className,
	wrapperClassName,
	iconClassName,
	...props
}: React.ComponentProps<"input"> & {
	wrapperClassName?: string;
	iconClassName?: string;
}) {
	return (
		<div className={cn("relative", wrapperClassName)}>
			<input
				data-slot="input"
				className={cn(inputClassName, "peer pl-9 sm:pl-9", className)}
				{...props}
			/>
			<Search
				aria-hidden
				className={cn(
					"pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground",
					iconClassName,
				)}
			/>
		</div>
	);
}

export { Input, SearchInput };
