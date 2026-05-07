import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

export function Logo({ size = 40, className, priority = false }: LogoProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-1 ring-1 ring-foreground/10 shadow-sm",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src="/logo-svu.png"
        alt=""
        width={size * 2}
        height={size * 2}
        priority={priority}
        className="h-full w-auto object-contain"
      />
    </span>
  );
}
