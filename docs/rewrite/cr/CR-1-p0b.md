# CR-1-p0b — `ParamsOf` / `QueryOf` / `BodyOf` collapse to `undefined` under `exactOptionalPropertyTypes`

- **Stream:** P0-b (admin shell & kit)
- **Status:** worked around locally; needs an orchestrator fix in the frozen conventions
- **Affects:** `next/packages/contracts/src/_conventions/route.ts` (orchestrator-owned, frozen)

## What is wrong

`tsconfig.base.json` sets `exactOptionalPropertyTypes: true`, so for

```ts
export interface RouteDef<TParams extends z.ZodType, …> {
  params?: TParams;
  query?: TQuery;
  body?: TBody;
  response: TResponse;
}
```

the indexed access `R['params']` has type `TParams | undefined`, not `TParams`.

The exported helpers test that type directly:

```ts
export type ParamsOf<R extends AnyRouteDef> = R['params'] extends z.ZodType
  ? z.output<R['params']>
  : undefined;
```

`TParams | undefined extends z.ZodType` is **always false**, so `ParamsOf<R>`,
`QueryOf<R>` and `BodyOf<R>` evaluate to `undefined` for *every* route, whether
or not the route declares that part. Any code that writes
`const body: BodyOf<typeof someRoute> = { … }` gets
`Type '{ … }' is not assignable to type 'undefined'`.

`ResponseOf` is unaffected — `response` is a required property.

## Why it matters

These three helpers are the contract package's public story for "the generated
client is just types". Every stream that types a form value, a mutation input or
a handler's `ctx.input` off them will hit this on their first page. It is silent
in the sense that nothing fails at runtime — it fails at the first `tsc`.

## Suggested fix

One-line change per helper, no behavioural difference:

```ts
export type ParamsOf<R extends AnyRouteDef> =
  NonNullable<R['params']> extends z.ZodType ? z.output<NonNullable<R['params']>> : undefined;
export type QueryOf<R extends AnyRouteDef> =
  NonNullable<R['query']> extends z.ZodType ? z.output<NonNullable<R['query']>> : undefined;
export type BodyOf<R extends AnyRouteDef> =
  NonNullable<R['body']> extends z.ZodType ? z.output<NonNullable<R['body']>> : undefined;
```

Note the remaining wart, which is not worth changing: when a route omits
`params`/`query`/`body`, the corresponding generic has no inference site and
falls back to its constraint `z.ZodType`, so the helper yields `unknown` rather
than `undefined`. Callers therefore cannot use these types to decide whether a
route *has* a body. P0-b's client treats all three request parts as optional for
that reason (documented in `apps/web/src/admin/api/call-route.ts`).

If you would rather make the distinction expressible, add explicit `undefined`
defaults to `defineRoute`'s generics, e.g.
`TParams extends z.ZodType | undefined = undefined`, and infer from
`params?: TParams`. That is a larger change to a frozen file.

## Local workaround in place

`apps/web/src/admin/api/call-route.ts` derives its own
`ParamsInputOf` / `QueryInputOf` / `BodyInputOf` with `NonNullable`, using
`z.input` (the request side wants the pre-parse shape, so schema defaults and
coercions are optional at the call site). Nothing in `apps/web` imports
`ParamsOf` / `QueryOf` / `BodyOf`, so applying the fix above cannot break P0-b.
