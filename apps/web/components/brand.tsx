"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

type BrandProps = {
  href?: Route;
  priority?: boolean;
  className?: string;
  lockupClassName?: string;
  imageClassName?: string;
  labelClassName?: string;
  subtitle?: string;
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Brand({
  href = "/",
  priority = false,
  className,
  lockupClassName,
  imageClassName,
  labelClassName,
  subtitle
}: BrandProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-[22px] border border-white/[0.15] bg-white/95 px-2 py-1.5 shadow-[0_18px_44px_rgba(4,14,30,0.22)] backdrop-blur",
          lockupClassName
        )}
      >
        <Image
          src="/brand/evolve-edge-logo.png"
          alt="Evolve Edge"
          width={240}
          height={112}
          priority={priority}
          className={cn("h-auto w-[150px] object-contain sm:w-[172px]", imageClassName)}
        />
      </span>
      {subtitle ? (
        <span
          className={cn(
            "hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-white/[0.72] md:inline",
            labelClassName
          )}
        >
          {subtitle}
        </span>
      ) : null}
    </span>
  );

  return (
    <Link href={href} aria-label="Evolve Edge home">
      {content}
    </Link>
  );
}
