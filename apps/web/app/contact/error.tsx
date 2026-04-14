"use client";

export default function ContactError({ error, reset }: { error: Error; reset: () => void }) {
  console.error("CONTACT PAGE ERROR:", error);

  return (
    <div style={{ padding: "40px" }}>
      <h2>Contact Page Error</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
