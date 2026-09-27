/** Re-mounted on every navigation, so each page of the app settles in (see .animate-page-in). */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
