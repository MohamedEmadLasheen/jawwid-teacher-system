import { SupervisorColorDot } from '@/components/ui/SupervisorColorDot';
import { selectableAdmins } from './responsibleAdmins';
import type { SearchableSelectOption } from '@/components/ui/searchable-select';
import type { Supervisor } from '@/lib/types';

/**
 * THE Admin option list, for every control that picks a responsible Admin.
 *
 * One builder instead of a copy per screen, so the dot, the ordering and the
 * "which supervisors are selectable" rule are defined once. The colour comes
 * from `supervisors.color_hex` — the option list holds no colour of its own.
 *
 *   value  → supervisors.id, the stable handle that gets persisted. No name
 *            string is ever written to a student row, and no raw id is ever
 *            shown to a user.
 *   label  → the Admin's name: what is displayed when the popover is closed
 *            and the only thing a search query is matched against, so the
 *            swatch stays decoration rather than part of the haystack.
 *   node   → swatch + name, which is what the row actually draws.
 *
 * Which Admins are selectable, and why `keepId` exists, is decided by
 * `selectableAdmins` in utils/responsibleAdmins.ts — a pure rule with its own
 * tests. This builder only dresses the result.
 */
export function buildSupervisorOptions(
  supervisors: Supervisor[],
  keepId?: string | null
): SearchableSelectOption[] {
  return selectableAdmins(supervisors, keepId)
    .map((s) => ({
      value: s.id,
      label: s.name,
      node: (
        <span className="inline-flex items-center gap-2">
          <SupervisorColorDot colorHex={s.colorHex} />
          {s.name}
        </span>
      ),
    }));
}
