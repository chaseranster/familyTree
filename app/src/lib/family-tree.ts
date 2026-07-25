export interface TreePerson {
  id: string;
  firstName: string;
  lastName: string | null;
  isLiving: boolean;
  birthDate: Date | null;
  deathDate: Date | null;
  sensitiveDetailsVisible: boolean;
}

export interface FamilyTreeNode {
  person: TreePerson;
  spouses: TreePerson[];
  children: FamilyTreeNode[];
}

/**
 * Builds a renderable forest from flat Person/ParentChild/Union rows.
 * A child is rendered once, under whichever parent is reached first --
 * unrelated to display order, this just avoids duplicating a child under
 * two parents when both are in the tree.
 */
export function buildFamilyForest(
  people: TreePerson[],
  parentChildren: { parentId: string; childId: string }[],
  unions: { person1Id: string; person2Id: string }[],
): FamilyTreeNode[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const pc of parentChildren) {
    if (!byId.has(pc.parentId) || !byId.has(pc.childId)) continue;
    (childrenOf.get(pc.parentId) ?? childrenOf.set(pc.parentId, []).get(pc.parentId)!).push(
      pc.childId,
    );
    (parentsOf.get(pc.childId) ?? parentsOf.set(pc.childId, []).get(pc.childId)!).push(
      pc.parentId,
    );
  }
  const spouseOf = new Map<string, string[]>();
  for (const u of unions) {
    if (!byId.has(u.person1Id) || !byId.has(u.person2Id)) continue;
    (spouseOf.get(u.person1Id) ?? spouseOf.set(u.person1Id, []).get(u.person1Id)!).push(
      u.person2Id,
    );
    (spouseOf.get(u.person2Id) ?? spouseOf.set(u.person2Id, []).get(u.person2Id)!).push(
      u.person1Id,
    );
  }

  const rendered = new Set<string>();

  function buildNode(personId: string): FamilyTreeNode | null {
    if (rendered.has(personId)) return null;
    const person = byId.get(personId);
    if (!person) return null;
    rendered.add(personId);

    const spouseIds = (spouseOf.get(personId) ?? []).filter(
      (id) => byId.has(id) && !rendered.has(id),
    );
    for (const sid of spouseIds) rendered.add(sid);

    const childIds = new Set<string>();
    for (const cid of childrenOf.get(personId) ?? []) childIds.add(cid);
    for (const sid of spouseIds) {
      for (const cid of childrenOf.get(sid) ?? []) childIds.add(cid);
    }

    const children = [...childIds]
      .map((cid) => buildNode(cid))
      .filter((n): n is FamilyTreeNode => n !== null);

    return {
      person,
      spouses: spouseIds.map((id) => byId.get(id)!).filter(Boolean),
      children,
    };
  }

  const roots: FamilyTreeNode[] = [];
  for (const p of people) {
    if (rendered.has(p.id) || parentsOf.has(p.id)) continue;
    const node = buildNode(p.id);
    if (node) roots.push(node);
  }
  // Anyone left over (e.g. only reachable via a parent edge that points back
  // to someone already rendered as a child elsewhere) still needs a home.
  for (const p of people) {
    if (rendered.has(p.id)) continue;
    const node = buildNode(p.id);
    if (node) roots.push(node);
  }

  return roots;
}

/** Respects consent-gating (docs/adr/0003): last name is only shown once
 * sensitiveDetailsVisible is true. */
export function personName(p: TreePerson): string {
  const parts = [p.firstName];
  if (p.sensitiveDetailsVisible && p.lastName) parts.push(p.lastName);
  return parts.join(" ");
}

/** Name plus a birth/death-year suffix -- used where there's no separate
 * line for it (e.g. select dropdowns). */
export function personLabel(p: TreePerson): string {
  let label = personName(p);

  if (!p.isLiving && p.deathDate) {
    label += ` (d. ${p.deathDate.getFullYear()})`;
  } else if (p.sensitiveDetailsVisible && p.birthDate) {
    label += ` (b. ${p.birthDate.getFullYear()})`;
  } else if (!p.isLiving) {
    label += " (deceased)";
  }

  return label;
}

/**
 * Fixed-order categorical palette (validated for CVD/contrast -- see
 * dataviz skill, references/palette.md). Never cycle or reassign per
 * instance; index by generation depth so the order stays stable.
 */
export const GENERATION_PALETTE: readonly string[] = [
  "#2a78d6", // blue
  "#008300", // green
  "#e87ba4", // magenta
  "#eda100", // yellow
  "#1baf7a", // aqua
  "#eb6834", // orange
  "#4a3aa7", // violet
  "#e34948", // red
];

const MUTED_INK = "#898781"; // deceased avatar fill -- status conveyed by text too, never color alone

export interface OrgChartBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  subLabel: string;
  initial: string;
  accentColor: string;
  avatarColor: string;
  isLiving: boolean;
}

export interface OrgChartEdge {
  id: string;
  kind: "parent-child" | "spouse";
  path: string;
}

export interface OrgChartLayout {
  boxes: OrgChartBox[];
  edges: OrgChartEdge[];
  width: number;
  height: number;
}

const BOX_HEIGHT = 92;
const ROW_HEIGHT = 160;
const SLOT_WIDTH = 152;
const CARD_GAP = 14;
const PADDING = 24;

function personsInUnit(node: FamilyTreeNode): TreePerson[] {
  return [node.person, ...node.spouses];
}

function subLabelFor(p: TreePerson): string {
  if (!p.isLiving) {
    return p.deathDate ? `d. ${p.deathDate.getFullYear()}` : "deceased";
  }
  if (p.sensitiveDetailsVisible && p.birthDate) {
    return `b. ${p.birthDate.getFullYear()}`;
  }
  return "living";
}

/**
 * Lays out a family forest as an org-chart: one horizontal row per
 * generation, one card per person (spouses sit side by side, joined by a
 * short connector), elbow connectors from each couple's midpoint down to
 * their children. Simple midpoint tree layout (not full Reingold-Tilford)
 * -- fine for the branching factors a family tree actually has.
 */
export function layoutOrgChart(roots: FamilyTreeNode[]): OrgChartLayout {
  let cursor = 0;
  let maxDepth = 0;
  const centers = new Map<string, { unitX: number; depth: number; node: FamilyTreeNode }>();

  function visit(node: FamilyTreeNode, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    let unitX: number;
    if (node.children.length === 0) {
      const w = personsInUnit(node).length;
      unitX = cursor + w / 2;
      cursor += w;
    } else {
      const childXs = node.children.map((c) => visit(c, depth + 1));
      unitX = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    }
    centers.set(node.person.id, { unitX, depth, node });
    return unitX;
  }

  for (const root of roots) visit(root, 0);

  const boxes: OrgChartBox[] = [];
  const edges: OrgChartEdge[] = [];

  for (const { unitX, depth, node } of centers.values()) {
    const persons = personsInUnit(node);
    const unitLeftSlot = unitX - persons.length / 2;
    const unitPxLeft = PADDING + unitLeftSlot * SLOT_WIDTH;
    const y = PADDING + depth * ROW_HEIGHT;
    const accentColor = GENERATION_PALETTE[depth % GENERATION_PALETTE.length];

    persons.forEach((p, i) => {
      const slotLeft = unitPxLeft + i * SLOT_WIDTH;
      boxes.push({
        id: p.id,
        x: slotLeft + CARD_GAP / 2,
        y,
        width: SLOT_WIDTH - CARD_GAP,
        height: BOX_HEIGHT,
        name: personName(p),
        subLabel: subLabelFor(p),
        initial: p.firstName.charAt(0).toUpperCase() || "?",
        accentColor,
        avatarColor: p.isLiving ? accentColor : MUTED_INK,
        isLiving: p.isLiving,
      });
    });

    for (let i = 0; i < persons.length - 1; i++) {
      const x1 = unitPxLeft + (i + 1) * SLOT_WIDTH - CARD_GAP / 2;
      const x2 = unitPxLeft + (i + 1) * SLOT_WIDTH + CARD_GAP / 2;
      const midY = y + BOX_HEIGHT / 2;
      edges.push({
        id: `${node.person.id}-spouse-${i}`,
        kind: "spouse",
        path: `M ${x1} ${midY} H ${x2}`,
      });
    }

    const unionCenterX = PADDING + unitX * SLOT_WIDTH;
    const unionBottomY = y + BOX_HEIGHT;

    for (const child of node.children) {
      const childInfo = centers.get(child.person.id);
      if (!childInfo) continue;
      const childCenterX = PADDING + childInfo.unitX * SLOT_WIDTH;
      const childTopY = PADDING + childInfo.depth * ROW_HEIGHT;
      const midY = (unionBottomY + childTopY) / 2;
      edges.push({
        id: `${node.person.id}-${child.person.id}`,
        kind: "parent-child",
        path: `M ${unionCenterX} ${unionBottomY} V ${midY} H ${childCenterX} V ${childTopY}`,
      });
    }
  }

  const width = PADDING * 2 + Math.max(cursor, 1) * SLOT_WIDTH;
  const height = PADDING * 2 + maxDepth * ROW_HEIGHT + BOX_HEIGHT;

  return { boxes, edges, width, height };
}

export interface FocusView {
  focus: TreePerson;
  spouses: TreePerson[];
  parents: TreePerson[];
  siblings: TreePerson[];
  children: TreePerson[];
}

/**
 * A single-person "ego view": the focus person plus their immediate
 * relatives, with no positional layout at all -- meant for a vertical,
 * full-width, tap-to-recenter mobile UI rather than a wide chart.
 */
export function buildFocusView(
  focusId: string,
  people: TreePerson[],
  parentChildren: { parentId: string; childId: string }[],
  unions: { person1Id: string; person2Id: string }[],
): FocusView | null {
  const byId = new Map(people.map((p) => [p.id, p]));
  const focus = byId.get(focusId);
  if (!focus) return null;

  const parentIds = parentChildren
    .filter((pc) => pc.childId === focusId)
    .map((pc) => pc.parentId);
  const parents = parentIds
    .map((id) => byId.get(id))
    .filter((p): p is TreePerson => !!p);

  const spouseIds = unions
    .filter((u) => u.person1Id === focusId || u.person2Id === focusId)
    .map((u) => (u.person1Id === focusId ? u.person2Id : u.person1Id));
  const spouses = spouseIds
    .map((id) => byId.get(id))
    .filter((p): p is TreePerson => !!p);

  const siblingIds = new Set<string>();
  for (const parentId of parentIds) {
    for (const pc of parentChildren) {
      if (pc.parentId === parentId && pc.childId !== focusId) siblingIds.add(pc.childId);
    }
  }
  const siblings = [...siblingIds]
    .map((id) => byId.get(id))
    .filter((p): p is TreePerson => !!p);

  const childIds = new Set<string>();
  for (const pc of parentChildren) {
    if (pc.parentId === focusId || spouseIds.includes(pc.parentId)) childIds.add(pc.childId);
  }
  const children = [...childIds]
    .map((id) => byId.get(id))
    .filter((p): p is TreePerson => !!p);

  return { focus, spouses, parents, siblings, children };
}
