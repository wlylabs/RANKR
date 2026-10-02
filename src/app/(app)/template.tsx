/**
 * Re-mounted on every navigation. Switching pages doesn't animate, like any other app's tabs: the page is just
 * there (its own header and backdrop still arrive, see Backdrops.tsx).
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
