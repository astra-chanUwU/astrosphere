---
slug: choosing-where-web-state-lives
title: "Choosing Where Web State Lives"
type: essay
status: published
summary: "Astro, HTMX, and Solid with TanStack Start make more sense to me when I start with the interaction rather than a favorite stack."
publishedAt: "2026-09-08"
spheres: [independent-systems]
tags: ["web-development", "astro", "solidjs", "tanstack"]
featured: false
layout: standard
media: []
related: ["go-and-htmx-a-small-server-stack", "elm-when-state-correctness-matters"]
---

# Choosing Where Web State Lives

I keep getting excited about web tools that seem to disagree with each other. I like Astro's emphasis on documents. I like HTMX's confidence in HTML. I like Solid's reactivity, and the application structure TanStack Start puts around it.

That started to feel inconsistent until I stopped asking which one should win.

The question I find more useful is: **where does this particular interaction need its state to live?**

These are notes from thinking through that question, rather than lessons from running a giant engineering organization. I'm interested in building things I can understand and maintain, and there is a lot here I want to try.

## Start with the thing someone is doing

An article, an inventory screen, and a music sequencer can all arrive through a browser. That does not make them the same kind of application.

For the article, the document is the experience. For the inventory screen, someone might filter records, edit a quantity, and wait for the server to accept it. In the sequencer, dragging a note should immediately change what the user sees and hears. A round trip for every tiny movement would get in the way.

Here is my working map. These are starting points for investigation, not boundaries the tools enforce.

| What dominates the experience? | What I would investigate first | Why |
| --- | --- | --- |
| Reading and navigating content | Astro | HTML pages, content tooling, selective interactivity |
| Submitting actions and receiving updated views | HTMX with a server | The server can render the next useful piece of HTML |
| Coordinated, immediate interactions | Solid; TanStack Start when its full-stack features help | Browser state can drive several parts of the interface |
| Complex state transitions with costly mistakes | Elm, after checking integration needs | Explicit modeling and a constrained update architecture |

There is an important qualification to “client-owned state.” A trading interface can own the current form, selected account, and pending display state. The server still decides whether an order exists and what the user is authorized to do. Ownership of an interaction is different from authority over the underlying business fact.

## Astro: let the document be the main event

Astro's island model makes sense to me for an archive like this one. The page can primarily be HTML, with a separately hydrated component where interaction earns its place. Astro components have no client runtime by default; framework components can opt into browser execution with a `client:*` directive. Islands can also communicate when needed. [Astro's islands guide](https://docs.astro.build/en/concepts/islands/)

```text
Markdown + layouts
        |
        v
     HTML page
        |
        +-- article and navigation: ordinary HTML
        |
        +-- interactive widget: hydrate where needed
```

That leaves room for a Solid widget inside a content site. It also leaves room for an HTMX form talking to an endpoint. Neither combination needs to become a rule for every page.

Astro is not limited to static output. It supports request-time rendering with a suitable adapter, and server islands can defer dynamic regions. But a statically hosted page does not acquire a live backend just because I add an HTMX attribute. Comments, account changes, and other persistent actions still need a running service somewhere. [Astro's rendering guide](https://docs.astro.build/en/guides/on-demand-rendering/)

For a blog with no dynamic requirements, I would happily stop at Astro.

## Solid: the interaction has a life in the browser

Solid gets interesting when the interface has several connected pieces of local state. Think of an editor with a selection, an inspector, an undo history, and an unsaved document. Those things need to stay coordinated even before a save reaches the server.

Solid uses fine-grained reactivity to track dependencies and update the affected parts of the interface, without a virtual DOM. That is the basic property drawing me toward it; I do not need a bundle-size contest to explain the appeal. [Solid's project documentation](https://github.com/solidjs/solid#readme)

```text
User edits a selection
        |
        v
Browser state -----> inspector
        |----------> preview
        |----------> undo history
        |
        +-- save request --> server validates and persists
```

This diagram describes a possible application design, not something Solid automatically builds. I still have to decide how state is structured, how errors appear, and how an old network response is prevented from overwriting newer work.

## TanStack Start belongs around the UI

“Solid versus TanStack” was an unhelpful comparison in our conversation. Solid is the UI layer. TanStack Start has a Solid integration and supplies a full-stack framework around TanStack Router: document SSR, streaming, server functions, server routes, and client/server builds. Router provides typed routing, search parameters, and data loading. [TanStack Start's Solid overview](https://tanstack.com/start/latest/docs/framework/solid/overview)

That is an appealing combination when an application actually needs those pieces. It also means choosing Solid does not require choosing Start. A widget does not need a full application framework, and a browser application that does not need Start's server features can investigate Router on its own.

Release status deserves a separate sentence. **As checked on September 8, 2026**, Solid's release list includes **2.0.0-rc.6**, published September 2 and marked prerelease. TanStack Start's documentation also labels Start a **Release Candidate**, describing its API as stable while explicitly acknowledging remaining issues. I would not turn either statement into “every integration is proven,” or assume Solid 2 compatibility from the existence of a Solid adapter. [Solid release record](https://github.com/solidjs/solid/releases/tag/solid-js%402.0.0-rc.6), [Start overview source](https://github.com/TanStack/router/blob/main/docs/start/framework/react/overview.md), [Solid overview mapping](https://github.com/TanStack/router/blob/main/docs/start/framework/solid/overview.md)

## A toolbox I can change my mind about

I would start an archive with Astro, investigate Go and HTMX for a conventional server application, and look closely at Solid with TanStack Start for a rich browser application. The difficult interactions matter more than the label: a “dashboard” might be a few tables or a demanding live analysis tool.

None of this needs to become a statement about being a better kind of developer. Small dependencies can be useful. So can substantial libraries and AI assistance. I care about whether I can explain a change, check its behavior, and maintain the boundaries it touches.

Working competently in a large codebase does not mean reading every line before contributing. Following the relevant paths, reading tests and design notes, and consulting Git history can give a change the context it needs. That feels like a much more useful standard than making tool selection a test of personal virtue.

Next: [Go and HTMX: a small server stack](/articles/go-and-htmx-a-small-server-stack).
