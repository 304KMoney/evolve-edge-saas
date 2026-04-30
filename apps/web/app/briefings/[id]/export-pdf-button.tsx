"use client";

export function ExportPdfButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-[linear-gradient(135deg,#102a43,#315f72)] px-4 py-2 text-sm font-semibold text-white"
    >
      Export PDF
    </button>
  );
}
