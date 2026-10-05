# Server side: the `viewports` table

A program's Viewport is saved with `vp.save(name)` and loaded with
`vp.load(name)` (spec section 10.1). The client (`viewportStore` in
`src/ui/program-widgets.js`) talks to a `/viewports` resource on the same
Rails server as `apps`, in the same style:

| Request | Does |
|---|---|
| `GET /viewports` | every record, ordered by id; `?name=` picks the one with that name |
| `GET /viewports/:id` | one record |
| `POST /viewports` body `{ "viewport": { "name": "...", "content": { ... } } }` | create |
| `PATCH /viewports/:id` body `{ "viewport": { "content": { ... } } }` | update |
| `DELETE /viewports/:id` | delete (204) |

Names belong to a user's space (Settings > User): the client adds
`?owner=<user>` to its lists and lookups (`?owner=` with no name is the
shared space, the records with no owner) and `"owner"` to the records it
creates. A name is unique within a space. `vp.load` and `vp.loadComposite`
look in the page's space, then in the shared one; `vp.save` and
`saveComposite` write to the page's space. On a `?run=peter/abc` page the
space is the app owner's, `peter`, whoever is looking.

A record is `{ id, name, owner, content, created_at, updated_at }`. `content` is the
saved viewport as a JSON object (not a string), in the format below. Saving
under a name that exists updates that record; names are unique.

The server side lives in `rails/server`, next to `apps` and in the same
style:

- `db/migrate/20260930000001_create_viewport.rb` — the `viewport` table:
  `name` (string, not null, unique index), `content` (jsonb, not null),
  timestamps. Like the other migrations it uses `if_not_exists`.
- `app/models/viewport.rb` — `Viewport` (table `viewport`): the name must be
  present and unique; `content` must be a JSON object whose `format` is
  `"fastblip-viewport"`.
- `app/controllers/viewports_controller.rb` — index (with the `?name=`
  filter the client uses to find a record by name), show, create, update,
  destroy. `content` is free-form JSON, so it is taken as sent rather than
  through `permit`'s key list.
- `config/routes.rb` — `resources :viewports`.

Heroku's release phase (`Procfile`) runs `db:migrate`, so pushing the
server creates the table; locally, run `bin/rails db:migrate`, which also
brings `db/schema.rb` up to date.

## The saved format

```json
{
  "format": "fastblip-viewport",
  "version": 1,
  "kind": "screen",
  "id": "screen",
  "background": "#eef",
  "widgets": [ { "class": "VPanel", "id": "page", "fill": true, "children": [ ... ] } ],
  "windows": [ { "class": "Window", "title": "About", "bounds": [120, 120, 280, 140],
                 "open": false, "content": { ... }, "buttonBar": { ... } } ]
}
```

A **composite** (a widget and everything in it, made in the GUI designer
or with `saveComposite`) is kept in the same table, with `"kind":
"composite"` and one widget node as its `root`:

```json
{ "format": "fastblip-viewport", "version": 1, "kind": "composite",
  "root": { "class": "VPanel", "id": "login", "children": [ ... ] } }
```

A document with no `kind` is a screen. A screen and a composite cannot
share a name.

Every widget node has `class`, and when set: `id`, `box` (left, top,
width, height on the screen or in a Panel), `width` / `height` (the sizes
the program fixed), `flex`, `fill`, `visible`, `background`, `color` and
`events` (`[{ "method": "onClick", "handler": "Clicked" }]`). By class:

| Class | Fields |
|---|---|
| Label, Button, Menu | `text`; Button `enabled`; Menu `items` (`{ "label", "handler" }` or `{ "separator": true }`) |
| Panel, HPanel, VPanel, ButtonBar | `children`; HPanel and VPanel `padding`, `spacing` |
| HSplitPanel, VSplitPanel | `position`, `first`, `second` |
| TabPanel | `tabs` (`{ "label", "widget" }`), `selected` |
| Window | `title`, `bounds`, `maximized`, `content`, `buttonBar`, `open` |
| TextPanel, MonacoPanel | `text`, `readOnly`; MonacoPanel `language` |
| ListPanel | `items` (strings), `selected`, `emptyText` |

Handlers are saved by name: a Crumb `Sub`'s name, or a MiniPy module-level
function's name (a bound method or lambda has no name to save, so it is
left out). Loading looks each name up in the program doing the loading, and
a name it does not have is an error.
