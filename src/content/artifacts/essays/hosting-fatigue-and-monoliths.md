---
slug: hosting-fatigue-and-monoliths
title: Hosting Fatigue, Serverless Exhaustion, and Why I Keep Coming Back to Monoliths
type: essay
status: published
summary: A case for choosing understandable monoliths over infrastructure theater in independent software.
publishedAt: "2026-07-12"
spheres: [independent-systems]
tags: [software, monoliths, infrastructure]
layout: standard
related: [why-gleam-feels-refreshing, field-notes-on-maintenance]
---

# Hosting Fatigue, Serverless Exhaustion, and Why I Keep Coming Back to Monoliths

At some point modern web development stopped feeling like building software and started feeling like managing cloud infrastructure.

Even small personal projects now get pushed toward architectures that look like they were designed for companies with entire platform engineering teams.

Serverless functions.

Edge runtimes.

Managed queues.

Distributed databases.

Event buses.

Twenty different hosted services stitched together through dashboards and environment variables.

And somehow this is considered the “simple” path now.

Honestly, I’m tired of it.

The longer I build software as a solo developer, the more I appreciate boring monoliths.

Not because monoliths are trendy again.

Because they’re practical.

A lot of modern architecture discussion feels disconnected from the reality of how most projects actually operate.

Most apps are not operating at Netflix scale.

Most projects do not need globally distributed microservices.

Most solo developers do not benefit from splitting a small application into six deployable systems connected through APIs.

But modern developer culture constantly pushes complexity as if it’s professionalism.

That mindset creates what I can only describe as infrastructure theater.

People end up maintaining architectures optimized for hypothetical scale instead of current usefulness.

Meanwhile a well-structured monolith quietly handles the workload without drama.

One codebase.

One deployment.

One database.

One place to debug.

That simplicity compounds over time.

Especially when you work alone.

Microservices sound attractive in theory because they promise separation and scalability. In reality, they often move complexity from code into operations.

Now instead of debugging a function call, you’re debugging:
- network communication
- auth between services
- deployment order
- observability pipelines
- retries
- timeouts
- service discovery
- distributed tracing

You trade local complexity for distributed complexity.

And distributed complexity is almost always worse.

Large companies accept that tradeoff because they have organizational scaling problems.

Independent developers usually don’t.

A solo developer splitting projects into tiny services often ends up recreating the operational burden of a much larger company without receiving most of the benefits.

The same thing happened with serverless.

Serverless started as an interesting deployment model.

Then it slowly became an entire ideology.

Now every project is expected to become a constellation of functions spread across providers and regions.

Sure, serverless can be useful.

But after a while, the hidden costs become exhausting:
- provider lock-in
- fragmented debugging
- cold starts
- weird runtime limitations
- pricing unpredictability
- local development friction
- deployment complexity disguised as simplicity

A basic VPS and a monolithic app often end up feeling dramatically calmer.

There’s something deeply satisfying about deploying software onto a server you actually understand.

You know where the logs are.

You know where the files live.

You know how requests flow through the system.

The architecture exists in your head.

That clarity matters.

Especially over long periods of maintenance.

I think modern developer culture sometimes underestimates cognitive overhead.

Every additional hosted service introduces another dashboard, another pricing model, another deployment flow, another potential outage source.

Individually these things seem manageable.

Together they create fatigue.

A monolith reduces the surface area of your entire system.

That doesn’t mean writing giant unmaintainable applications.

Good monoliths still have modular boundaries.

They still separate concerns internally.

They just avoid turning every boundary into a network boundary.

That distinction is important.

A lot of architecture conversations online also ignore the reality that hardware became extremely capable.

A single modern server can comfortably run workloads that previously required distributed systems.

But many developers still architect tiny projects like they’re preparing for millions of concurrent users on day one.

Most applications will never encounter those scaling problems.

And if they do, that’s usually a good problem to have.

The irony is that simpler systems are often more reliable.

Fewer moving parts.

Fewer deployment targets.

Fewer synchronization issues.

Fewer things breaking at 2 AM.

As I get older, I increasingly value software that remains understandable.

Not architecturally impressive.

Understandable.

That’s why I keep coming back to monoliths.

Not out of nostalgia.

Out of practicality.

Sometimes the best architecture decision is refusing to import the operational complexity of a billion-dollar tech company into a project maintained by one person.
