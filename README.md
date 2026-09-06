# GHL Provisioner

**Builds a chiropractic clinic's GoHighLevel account — then verifies it actually
got built — and the four workflows that get booked patients to turn up.**

```bash
export GHL_API_TOKEN=...
node scripts/provision-showrate.mjs --location <locationId> --dry-run
node scripts/provision-showrate.mjs --location <locationId>
```

---

## Why show rate is the whole point

For an agency paid **per patient who walks in**, a no-show isn't the clinic's
problem. It's the agency's lost revenue.

Unmanaged show rate in local healthcare sits somewhere in the 50s. The gap
between that and 80% is not a media buying problem — it's four workflows and one
design decision. On a pay-per-show contract, closing that gap is the single
highest-leverage thing in the business.

## Part 1 — the account

The script creates, via the API:

- **26 custom fields**, including the click-ID fields every downstream report
  needs
- **9 custom values** — clinic name, address, map link, practitioner
- **The 8-stage New Patient pipeline**

```
New Lead → Contacted → Booked → Confirmed → Attended → No Show → Recycle → Closed Lost
```

- **The tag vocabulary** the workflows key off

Two stages are load-bearing. **Confirmed** is separate from **Booked** because a
booking somebody replied to and a booking they ignored have very different show
rates. **Attended** is the only stage that means money — every report and every
invoice joins on that name, so it has to be spelled exactly that.

### It verifies rather than trusting

It ends by re-reading the account and confirming all 26 fields are present,
exiting non-zero if any is missing.

```
  all 26 fields confirmed present
```

A provisioning run that reports success because nothing errored will hand
somebody a half-built account. Checking a create call returned 200 is not the
same as checking the field exists — and the difference surfaces six weeks later,
in a report that's quietly empty.

Safe to re-run: "already exists" counts as success.

## Part 2 — the four workflows

Specified in [`docs/workflow-specs.md`](docs/workflow-specs.md) precisely enough
that two people build the same thing. Build in this order; each depends on
fields the previous one writes.

| | Workflow | What it does |
|---|---|---|
| **W1** | Speed to Lead | SMS on contact creation, quiet-hours guard, one nudge at ten minutes, then a task for the front desk |
| **W2** | Booking Confirmation | The confirmation ask — and the branch that moves the opportunity **only on a real reply** |
| **W3** | Reminder Ladder | 24h and 2h, with the 2h message differing by whether they confirmed |
| **W4** | No-Show Recovery | Rebook offer, then a hard stop at three no-shows |

### The design decision

**Ask for an explicit confirmation reply, and move the opportunity only when you
get one.**

Most GHL builds send a confirmation and treat the appointment as confirmed
because the message was *delivered*. That collapses two very different
populations — people who answered and people who ignored you — into one stage,
and the pipeline can no longer tell you which of your bookings are real.

Split them and everything downstream sharpens: reminders differ, the front desk
knows who to call, and the show-rate number finally means something.

### Judgement calls worth defending

**Ten minutes between the first and second text, not five.** Five reads as
automated. Ten reads as a person who got pulled away.

**Three reminders maximum.** A fourth doesn't raise show rate and measurably
raises opt-outs.

**Stop after three no-shows.** At that point the person isn't a lead, and
continuing to text them costs goodwill and deliverability.

**Never say "reminder" in a reminder.** Say the time.

## An honest limit

**GoHighLevel's public API cannot create workflows.** Custom fields, custom
values, pipelines, tags, calendars and contacts are all API-manageable. The
workflow builder is not.

So this splits along that line deliberately: everything a machine can create and
**verify**, the script creates and verifies; everything a human has to click is
specified as a build sheet.

That's not a workaround — it's the honest shape of the platform, and pretending
otherwise produces provisioning scripts that silently half-work.

## Before a single ad runs

[`docs/build-checklist.md`](docs/build-checklist.md). Every item on it has failed
on a real account.

Its last item is the one that decides whether any of this reports anything:
**somebody at the front desk has to mark appointments attended.** Train it before
launch, check it in week one. A system measuring a field nobody fills in is
measuring nothing — and under pay-per-show, it's also under-billing.

## Where this sits

It provisions the account [`frontdesk`](../frontdesk) books into, and produces
the attendance data [`pay-per-show`](../pay-per-show) invoices from.

---

Built by [Abdiwahid Ali](https://github.com/maqbuuul). Nairobi.
