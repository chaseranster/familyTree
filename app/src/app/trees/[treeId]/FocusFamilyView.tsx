import Link from "next/link";
import { type FocusView, type TreePerson, personName } from "@/lib/family-tree";

const GENERATION_PALETTE: readonly string[] = [
  "#2a78d6",
  "#008300",
  "#e87ba4",
  "#eda100",
  "#1baf7a",
  "#eb6834",
  "#4a3aa7",
  "#e34948",
];
const MUTED = "#898781";

function subLabel(p: TreePerson): string {
  if (!p.isLiving) return p.deathDate ? `d. ${p.deathDate.getFullYear()}` : "deceased";
  if (p.sensitiveDetailsVisible && p.birthDate) return `b. ${p.birthDate.getFullYear()}`;
  return "living";
}

function PersonRow({
  person,
  treeId,
  colorSlot,
  navigable = true,
}: {
  person: TreePerson;
  treeId: string;
  colorSlot: number;
  navigable?: boolean;
}) {
  const color = GENERATION_PALETTE[colorSlot % GENERATION_PALETTE.length];
  const avatarColor = person.isLiving ? color : MUTED;

  const content = (
    <div className="flex min-h-14 items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 active:bg-gray-50">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: avatarColor }}
      >
        {person.firstName.charAt(0).toUpperCase() || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-gray-900">{personName(person)}</div>
        <div className="text-xs text-gray-500">{subLabel(person)}</div>
      </div>
      {navigable && <span className="shrink-0 text-gray-300">›</span>}
    </div>
  );

  if (!navigable) return content;

  return (
    <Link href={`/trees/${treeId}?focus=${person.id}`} className="block">
      {content}
    </Link>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function FocusFamilyView({ view, treeId }: { view: FocusView; treeId: string }) {
  const { focus, spouses, parents, siblings, children } = view;

  return (
    <div className="flex flex-col gap-5">
      {parents.length > 0 && (
        <Section label="Parents">
          {parents.map((p) => (
            <PersonRow key={p.id} person={p} treeId={treeId} colorSlot={0} />
          ))}
        </Section>
      )}

      <Section label="This person">
        <PersonRow person={focus} treeId={treeId} colorSlot={1} navigable={false} />
        {spouses.map((s) => (
          <PersonRow key={s.id} person={s} treeId={treeId} colorSlot={1} />
        ))}
      </Section>

      {siblings.length > 0 && (
        <Section label="Siblings">
          {siblings.map((s) => (
            <PersonRow key={s.id} person={s} treeId={treeId} colorSlot={1} />
          ))}
        </Section>
      )}

      {children.length > 0 && (
        <Section label="Children">
          {children.map((c) => (
            <PersonRow key={c.id} person={c} treeId={treeId} colorSlot={2} />
          ))}
        </Section>
      )}

      {parents.length === 0 && siblings.length === 0 && children.length === 0 && (
        <p className="text-sm text-gray-500">
          No recorded relatives yet — add a relationship below to connect{" "}
          {personName(focus)} to the rest of the tree.
        </p>
      )}
    </div>
  );
}
