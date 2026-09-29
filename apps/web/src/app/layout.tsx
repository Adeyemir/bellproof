import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bellproof | Policy-controlled tokenized stock execution",
  description:
    "Keep a BSC stock-token basket within policy and inspect why Bellproof proposes, waits, or blocks a rebalance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
