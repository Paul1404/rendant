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

export function ThemeToggle() {
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
			className="inline-flex items-center rounded-lg border border-border/70 bg-background/60 p-0.5 shadow-sm"
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
							"inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
							isActive
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
