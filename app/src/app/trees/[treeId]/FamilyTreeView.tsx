import { type FamilyTreeNode, personLabel } from "@/lib/family-tree";

function NodeView({ node }: { node: FamilyTreeNode }) {
  const label = [personLabel(node.person), ...node.spouses.map(personLabel)].join(
    " ⚭ ",
  );

  return (
    <li>
      <div className="inline-block rounded-md border border-gray-200 px-3 py-1.5 text-sm">
        {label}
      </div>
      {node.children.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 border-l border-gray-200 pl-4">
          {node.children.map((child) => (
            <NodeView key={child.person.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FamilyTreeView({ roots }: { roots: FamilyTreeNode[] }) {
  if (roots.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No one&apos;s been added yet — add the first person below.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {roots.map((root) => (
        <NodeView key={root.person.id} node={root} />
      ))}
    </ul>
  );
}
