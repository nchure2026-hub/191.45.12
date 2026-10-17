import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForgeOps | Industrial Attendance",
  description: "Industrial workforce attendance and shift operations dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
