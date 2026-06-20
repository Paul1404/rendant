import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

type RevealProps = {
	children: React.ReactNode;
	delay?: number;
	className?: string;
};

export function Reveal({ children, delay, className }: RevealProps) {
	const style =
		delay !== undefined
			? ({ "--reveal-delay": `${delay}ms` } as CSSProperties)
			: undefined;

	return (
		<div className={cn("reveal", className)} style={style}>
			{children}
		</div>
	);
}
