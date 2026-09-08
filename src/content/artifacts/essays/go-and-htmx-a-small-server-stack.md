---
slug: go-and-htmx-a-small-server-stack
title: "Go and HTMX: A Small Server Stack"
type: essay
status: published
summary: "What HTMX 4 changes, why hypermedia pairs comfortably with Go, and where I would begin reaching for browser state instead."
publishedAt: "2026-09-08"
spheres: [independent-systems]
tags: ["web-development", "go", "htmx", "hypermedia"]
featured: false
layout: standard
media: []
related: ["choosing-where-web-state-lives", "elm-when-state-correctness-matters"]
---

# Go and HTMX: A Small Server Stack

There is something appealing about an application whose main loop I can describe in one breath: receive an action, check it, update the data, render some HTML.

That is what keeps drawing me toward Go and HTMX. I can imagine a useful inventory tool, a reading-list manager, or a small forum built around that loop. The appeal is practical: a compact deployment and a request path I can follow.

This is part two of a series about [choosing where web state lives](/articles/choosing-where-web-state-lives).

## HTML can describe the next action

A link gives the browser a destination. A form gives it a way to submit information. Those are hypermedia controls: the response includes both what to show and ways to continue.

HTMX extends that model. Attributes can make elements issue requests and place returned HTML in a selected part of the document. Its core is a dependency-free JavaScript file that can be included directly, without a build step. [HTMX 4 documentation](https://four.htmx.org/docs/)

A deliberately small example:

```html
<button hx-post="/reading-list/42/archive"
        hx-target="#entry-42"
        hx-swap="outerHTML">
  Archive
</button>
```

The endpoint might return a replacement row confirming that the item was archived. This is only the interaction sketch; the handler still needs the normal authorization and request-forgery protection for a state-changing request.

```text
Click Archive
      |
      | POST /reading-list/42/archive
      v
Go handler
      |-- authorize and validate
      |-- update stored record
      |-- render replacement HTML
      v
HTMX replaces #entry-42
```

The server supplies the next view. I do not necessarily need to define a JSON response, update a browser cache, and separately recreate that row in client components.

That does not make the browser stateless. It still has focus, scroll position, form values, and requests in flight. “Server-owned state” is shorthand for where the application primarily decides its next view, not a claim that nothing lives on the client.

## What actually changed in HTMX 4

**HTMX 4.0.0 was released on August 28, 2026.** At the September 8 check, the main homepage says version 4 is intentionally not yet npm's `latest`, to avoid accidentally moving 2.x users across a major version. A release being available and a package manager selecting it by default are different facts. [Release record](https://github.com/bigskysoftware/htmx/releases/tag/v4.0.0), [HTMX homepage](https://htmx.org/)

The migration changes deserve as much attention as the exciting additions. In version 4, attribute inheritance is explicit by default. Error responses in the 400 and 500 ranges are swapped by default, unlike version 2. History restoration requests a full page from the server by default, with local history caching available through an extension. The docs also describe an upgrade checker. These are observable behavior changes, so replacing the script file alone is not a complete migration. [HTMX 4 migration guidance](https://four.htmx.org/docs/#migrating-from-htmx-2x-to-4x)

Version 4 also documents morphing swaps, which try to preserve existing DOM nodes, and `<hx-partial>` response wrappers for directing updates to multiple targets. Those are useful ways to refine a server-rendered interaction, especially when replacing a whole region would disturb its contents. They still need testing with the actual forms and widgets on the page. [Swaps and partials](https://four.htmx.org/docs/)

For streaming and local behavior, distinguish the core from its extensions. The official version 4 catalog lists `hx-sse` for server-sent events, `hx-ws` for WebSockets, `hx-multipart` for multipart HTML streaming, and `hx-live` for reactive HTML bindings. They are optional capabilities, not a reason to assume every feature ships in the core script. [Extension catalog](https://four.htmx.org/extensions/)

I would also avoid copying a version 2 WebSocket snippet into a version 4 article. Extension names and APIs need the same version awareness as the core.

## Live updates do not settle the architecture question

A job-progress panel can receive server-rendered updates over SSE while the user submits actions over ordinary HTTP. A chat can receive HTML over a WebSocket. The transport does not force me to keep a complete client-side application model. [HTMX streaming documentation](https://four.htmx.org/docs/)

But “it streams” is not the same as “it handles all the hard parts.” Reconnection, missed updates, duplicate events, and what the user sees while disconnected remain design work.

For a chat with drafts across channels, optimistic sending, uploads, keyboard navigation, and a large virtualized history, I would start comparing the amount of browser coordination against a Solid implementation. A simple chat and a rich messaging workspace can deserve different answers.

## Why Go fits this shape

Go can handle requests and render templates, and its `embed` package can compile static assets and templates into the program. That includes a locally stored HTMX script and CSS. A separate JavaScript runtime is not required in production for that arrangement. [Go's embed documentation and examples](https://github.com/golang/go/blob/master/src/embed/embed.go)

A possible deployment could look like this:

```text
application executable
  + embedded templates
  + embedded CSS and HTMX

persistent data directory
  + SQLite database, if that suits the workload
  + uploads, if the application accepts them
```

I like that shape. It gives me fewer independently deployed application pieces to think about.

It does not make the entire service a single disposable file. Mutable data needs to survive replacement of the executable. Backups, migrations, configuration, TLS, and process supervision still exist. A database driver or another native dependency can also affect how portable the resulting binary is. “One binary” is a packaging possibility to verify for a particular build.

## Where I would start

For an inventory screen, I would prototype the workflow with the most uncertainty: perhaps a validation error followed by an edit while another user changes the same record. Can the server return a clear next view? Does focus stay useful? Does revisiting the URL produce a sensible page?

If that interaction feels natural, Go and HTMX become very attractive. If I keep accumulating a separate web of local state to make it work, that is useful evidence for trying a client framework.

What excites me is having a small server stack that can do real work, while leaving room to choose something else when the interaction asks for it.

Next: [Elm, when state correctness matters](/articles/elm-when-state-correctness-matters).
