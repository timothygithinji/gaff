/**
 * Top bar for user-facing screens — shows the page title and the
 * current user's avatar (initial circle in copper). Used inside
 * mobile flows; the AdminSidebar replaces this on desktop.
 */
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { useHousehold } from "../../lib/household-context";

type TopBarProps = {
  title: string;
};

export function TopBar({ title }: TopBarProps) {
  const { members, currentUserId } = useHousehold();
  const me = members.find((m) => m.userId === currentUserId);
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-border border-b bg-card px-4 py-3">
      <h1 className="font-serif text-foreground text-lg">{title}</h1>
      <Avatar aria-label={me?.name ?? me?.email ?? "Profile"}>
        <AvatarFallback className="bg-primary font-medium text-primary-foreground text-sm">
          {initial}
        </AvatarFallback>
      </Avatar>
    </header>
  );
}
