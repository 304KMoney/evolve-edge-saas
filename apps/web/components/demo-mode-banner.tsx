import type { Route } from "next";
import Link from "next/link";

export function DemoModeBanner(props: {
  label: string;
  resetCommand: string;
}) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[#7c4a03]">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="font-semibold">{props.label}.</span>{" "}
          This workspace uses seeded, non-sensitive sample data and suppresses
          live external side effects by default.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={"/dashboard/demo" as Route} className="font-semibold text-[#7c4a03] underline">
            Open demo guide
          </Link>
          <span className="rounded-full border border-amber-300 bg-white px-3 py-1 font-mono text-xs text-[#7c4a03]">
            {props.resetCommand}
          </span>
        </div>
      </div>
    </div>
  );
}
