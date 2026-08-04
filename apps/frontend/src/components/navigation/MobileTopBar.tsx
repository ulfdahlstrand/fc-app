/**
 * Ink app bar for phone screens (Kit `MobileTopBar`) — the 390px answer to the
 * desktop header. Club mark, club name, and the team pill pushed right.
 *
 * Section nav does **not** live here; it moves to `TabBar`. There is no
 * hamburger either: `MenuSheet` opens from the `Menu` tab at the bottom, where
 * the thumb already is, and a second button in the top-right corner would be
 * both unreachable one-handed and a second door to the same room. The team
 * pill is the one exception — it opens the same sheet, because "which team am
 * I looking at" is a question the header itself raises.
 *
 * Kit's reference draws a fake status row (a clock and `▮▮▮`) because it is a
 * prototype inside a device frame. A real phone draws its own, so this does
 * not.
 */
import { Link } from "@tanstack/react-router";

export function MobileTopBar({
  clubName,
  clubInitial,
  teamName,
  onTeam,
}: {
  clubName: string;
  clubInitial: string;
  teamName: string | null;
  onTeam: () => void;
}) {
  return (
    <header className="bg-ink flex flex-none items-center gap-[9px] px-[var(--gutter)] py-2.5 text-white">
      <Link to="/" className="flex min-w-0 items-center gap-[9px]">
        <span className="bg-brand flex size-7 flex-none items-center justify-center rounded-full font-display text-[15px] leading-none text-white">
          {clubInitial}
        </span>
        <span className="font-display truncate text-[17px] tracking-[0.3px]">
          {clubName}
        </span>
      </Link>
      {teamName && (
        <button
          type="button"
          onClick={onTeam}
          aria-haspopup="dialog"
          className="bg-ink-raised min-h-tap ml-auto flex flex-none items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-semibold whitespace-nowrap"
        >
          {teamName}
          <span aria-hidden>▾</span>
        </button>
      )}
    </header>
  );
}
