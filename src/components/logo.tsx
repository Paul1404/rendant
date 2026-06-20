import { cn } from "@/lib/utils";

type LogoProps = {
	src?: string;
	size?: number;
	className?: string;
	priority?: boolean;
};

export function Logo({
	src = "/logo.svg",
	size = 40,
	className,
	priority = false,
}: LogoProps) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-1 ring-1 ring-foreground/10 shadow-sm",
				className,
			)}
			style={{ width: size, height: size }}
			aria-hidden="true"
		>
			{/* Plain img so an arbitrary external LOGO_URL works without next/image
          remote-host config. The logo is small and decorative. */}
			<img
				src={src}
				alt=""
				width={size * 2}
				height={size * 2}
				loading={priority ? "eager" : "lazy"}
				className="h-full w-auto object-contain"
			/>
		</span>
	);
}
