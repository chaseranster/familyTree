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

/** Respects consent-gating (docs/adr/0003): last name and birth year are
 * only shown once sensitiveDetailsVisible is true. */
export function personLabel(p: TreePerson): string {
  const parts = [p.firstName];
  if (p.sensitiveDetailsVisible && p.lastName) parts.push(p.lastName);
  let label = parts.join(" ");

  if (!p.isLiving && p.deathDate) {
    label += ` (d. ${p.deathDate.getFullYear()})`;
  } else if (p.sensitiveDetailsVisible && p.birthDate) {
    label += ` (b. ${p.birthDate.getFullYear()})`;
  } else if (!p.isLiving) {
    label += " (deceased)";
  }

  return label;
}

export interface OrgChartBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface OrgChartEdge {
  id: string;
  path: string;
}

export interface OrgChartLayout {
  boxes: OrgChartBox[];
  edges: OrgChartEdge[];
  width: number;
  height: number;
}

const BOX_HEIGHT = 56;
const ROW_HEIGHT = 130;
const SLOT_WIDTH = 190;
const PADDING = 24;
const COUPLE_WIDTH = SLOT_WIDTH * 1.35;
const SINGLE_WIDTH = SLOT_WIDTH * 0.85;

/**
 * Lays out a family forest as an org-chart: one horizontal row per
 * generation, couples sharing a box, parent-to-child elbow connectors.
 * Simple midpoint tree layout (not full Reingold-Tilford) -- fine for the
 * branching factors a family tree actually has.
 */
export function layoutOrgChart(roots: FamilyTreeNode[]): OrgChartLayout {
  let cursor = 0;
  let maxDepth = 0;
  const centers = new Map<string, { x: number; depth: number; node: FamilyTreeNode }>();

  function unitWidth(node: FamilyTreeNode) {
    return node.spouses.length > 0 ? 1.5 : 1;
  }

  function visit(node: FamilyTreeNode, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    let x: number;
    if (node.children.length === 0) {
      const w = unitWidth(node);
      x = cursor + w / 2;
      cursor += w;
    } else {
      const childXs = node.children.map((c) => visit(c, depth + 1));
      x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    }
    centers.set(node.person.id, { x, depth, node });
    return x;
  }

  for (const root of roots) visit(root, 0);

  const boxes: OrgChartBox[] = [];
  const edges: OrgChartEdge[] = [];

  for (const { x, depth, node } of centers.values()) {
    const width = node.spouses.length > 0 ? COUPLE_WIDTH : SINGLE_WIDTH;
    const boxX = PADDING + x * SLOT_WIDTH - width / 2;
    const boxY = PADDING + depth * ROW_HEIGHT;
    const label = [personLabel(node.person), ...node.spouses.map(personLabel)].join(
      " ⚭ ",
    );
    boxes.push({ id: node.person.id, x: boxX, y: boxY, width, height: BOX_HEIGHT, label });

    const parentCenterX = PADDING + x * SLOT_WIDTH;
    const parentBottomY = boxY + BOX_HEIGHT;

    for (const child of node.children) {
      const childInfo = centers.get(child.person.id);
      if (!childInfo) continue;
      const childCenterX = PADDING + childInfo.x * SLOT_WIDTH;
      const childTopY = PADDING + childInfo.depth * ROW_HEIGHT;
      const midY = (parentBottomY + childTopY) / 2;
      edges.push({
        id: `${node.person.id}-${child.person.id}`,
        path: `M ${parentCenterX} ${parentBottomY} V ${midY} H ${childCenterX} V ${childTopY}`,
      });
    }
  }

  const width = PADDING * 2 + Math.max(cursor, 1) * SLOT_WIDTH;
  const height = PADDING * 2 + maxDepth * ROW_HEIGHT + BOX_HEIGHT;

  return { boxes, edges, width, height };
}
