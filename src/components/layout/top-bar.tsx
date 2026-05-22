/**
 * Top bar for user-facing screens — shows the page title and the
 * current user's avatar (initial circle in copper). Used inside
 * mobile flows; the AdminSidebar replaces this on desktop.
 */
import { useHousehold } from "../../lib/household-context";

type TopBarProps = {
  title: string;
};

export function TopBar({ title }: TopBarProps) {
  const { members, currentUserId } = useHousehold();
  const me = members.find((m) => m.userId === currentUserId);
  // First grapheme of the name, fall back to email local-part if name
  // is blank (CF Access users start out with email-derived names).
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-brass/20 border-b bg-paper px-4 py-3">
      <h1 className="font-serif text-ink text-lg">{title}</h1>
      <div
        aria-label={me?.name ?? me?.email ?? "Profile"}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-copper font-medium text-bone text-sm"
      >
        {initial}
      </div>
    </header>
  );
}
