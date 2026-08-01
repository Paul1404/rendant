import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Mode = "system" | "light" | "dark";

const MODES: { value: Mode; label: string; icon: typeof Monitor }[] = [
	{ value: "system", label: "System", icon: Monitor },
	{ value: "light", label: "Hell", icon: Sun },
	{ value: "dark", label: "Dunkel", icon: Moon },
];

export function ThemeToggle({
	variant = "default",
}: {
	variant?: "default" | "nav";
}) {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// `theme` is only known after mount. Until then we render a neutral
	// placeholder so the server and first client render match exactly.
	const active: Mode | null = mounted ? (theme as Mode) : null;

	return (
		<fieldset
			className={cn(
				"inline-flex items-center rounded-lg border p-0.5 shadow-sm",
				variant === "nav"
					? "border-nav-accent/25 bg-white/5"
					: "border-border/70 bg-background/60",
			)}
			aria-label="Farbschema"
		>
			<legend className="sr-only">Farbschema</legend>
			{MODES.map(({ value, label, icon: Icon }) => {
				const isActive = active === value;
				return (
					<button
						key={value}
						type="button"
						aria-pressed={mounted ? isActive : undefined}
						aria-label={label}
						title={label}
						onClick={() => setTheme(value)}
						className={cn(
							"inline-flex h-11 w-11 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-3 focus-visible:ring-nav-accent/80 2xl:h-8 2xl:w-8",
							variant === "nav"
								? isActive
									? "bg-nav-accent/15 text-nav-accent"
									: "text-nav-foreground/65 hover:text-nav-foreground"
								: isActive
									? "bg-primary/10 text-primary"
									: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon className="h-4 w-4" />
					</button>
				);
			})}
		</fieldset>
	);
}
