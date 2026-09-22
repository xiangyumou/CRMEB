# CR-2-g2 — 超级组件's inner designer is a surface nobody owns

**Stream** G2 (DIY config panels) · **Against** the rewrite plan, not a frozen file
· **Status** **decided (option 3) and applied by G3**

> **Applied.** `customComponent` is out of `CREATABLE_COMPONENT_KEYS`
> (`packages/contracts/src/diy/schema/registry.ts`); it stays in
> `RENDERABLE_COMPONENT_KEYS`, keeps `customComponent.panel.tsx` and
> round-trips `customComponents` untouched. Pinned by
> `round-trip.test.ts::the registry > keeps customComponent renderable but out
of the palette (CR-2-g2)` and recorded as DIY-009 in `invariants.md`.

## What it is

`customComponent` (超级组件) is the one component whose config panel does not
fully configure it. Its 组件设计 row is not a field: `c_custom_btn` is a button
that opens `template/admin/src/components/CustomDesign/`, a second
drag-and-drop editor — its own canvas, palette, layer list and property
inspector — for the component's _inner_ layout. What it saves goes into one key,
`customComponents`, as a tree of the designer's own node objects
(`c_custom_component.vue:handleSave`).

That is roughly the size of the outer DIY editor itself. It is not a panel, and
the G2 brief scopes G2 to panels. No other stream's brief mentions it either:
`reference-map.md` section G lists `CustomDesign/` under 超级组件 with no owner,
and G1's editor shell has no host for a second canvas.

## What G2 did

`customComponent.panel.tsx` ships every other row of the legacy panel — 信息设置,
the four 数据设置 branches, 数据样式 and 通用样式 — and renders the 组件设计
section as one line of secondary text saying the designer is not in this build.

`customComponents` is never read and never written by the panel, so a page
designed in the old admin keeps its layout byte for byte through an open and
save in the new one. This is covered by the same fixture test as everything
else; a node carrying a `customComponents` tree round-trips unchanged.

## What is being asked

A decision, not a code change:

1. **Assign the designer to a stream** (it is a page-sized piece of work, closer
   to G1's editor shell than to G2's panels), or
2. **Declare it out of scope for the rewrite**, in which case 超级组件 stays
   creatable but its inner layout is editable only in the old admin, or
3. **Drop `customComponent` from `CREATABLE_COMPONENT_KEYS`** and leave it
   render-only like `newVip` / `presale`, so the new admin can display and
   restyle existing 超级组件 blocks but not create empty ones nobody can fill.

G2 recommends (3) if the designer is not scheduled: an empty 超级组件 with no way
to design it is a component that renders nothing, and the palette should not
offer it. That is a one-line change in G1's `schema/registry.ts`, so it is G1's
to make.
