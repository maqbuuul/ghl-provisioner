# Workflow build sheet

GoHighLevel's API cannot create workflows, so these are specified precisely
enough that two people building from this sheet produce the same thing. Build
them in this order; each depends on the fields the previous one writes.

Everything here assumes `scripts/provision-showrate.mjs` has run and the custom
fields, custom values and tags exist.

---

## W1 · Speed to Lead

**Trigger:** Contact Created, filter `Source contains "form"` OR Inbound Webhook

| # | Action | Detail |
|---|---|---|
| 1 | If/Else | `{{contact.quiet_hours_optout}}` is `true` → exit |
| 2 | Wait | Until between 08:00 and 20:00 in the account timezone |
| 3 | Send SMS | Message S1 below |
| 4 | Update field | `confirmation_status` = `pending` |
| 5 | Add tag | `source-{{contact.first_touch_channel}}` |
| 6 | Wait | 10 minutes, or until contact replies |
| 7 | If/Else | Replied → exit. Not replied → continue |
| 8 | Send SMS | Message S2 |
| 9 | Wait | 30 minutes |
| 10 | If/Else | Still no reply → create task "Call {{contact.first_name}}", assign to front desk |

**Why the 10-minute wait and not 5:** a second text 5 minutes after the first
reads as automated. Ten minutes reads as a person who got pulled away.

---

## W2 · Booking Confirmation

**Trigger:** Appointment Status is `Booked`

| # | Action | Detail |
|---|---|---|
| 1 | Send SMS | Message C1 — asks for a one-word reply |
| 2 | Send Email | Message C2 — address, map link, parking, what to bring |
| 3 | Update field | `confirmation_status` = `pending` |
| 4 | Add tag | `unconfirmed` |
| 5 | Wait | 4 hours |
| 6 | If/Else | Replied `Y`/`yes`/`confirm` → branch A. Otherwise → branch B |
| 7A | Update field | `confirmation_status` = `confirmed`, `confirmed_at` = now |
| 8A | Add tag | `confirmed` · Remove tag `unconfirmed` |
| 9A | Move opportunity | Stage → `Confirmed` |
| 7B | Send SMS | Message C3 — softer re-ask |
| 8B | Wait | 20 hours, then hand to W3 |

**The single highest-leverage detail in this whole repo:** ask for an explicit
confirmation reply, and move the opportunity only when you get one. An
unconfirmed booking and a confirmed booking have very different show rates, and
a pipeline that treats them the same cannot tell you which of your leads are
real.

---

## W3 · Reminder Ladder

**Trigger:** Appointment is `24 hours away`, filter appointment status = `Booked` or `Confirmed`

| # | Action | Detail |
|---|---|---|
| 1 | Send SMS | Message R1 (24h) |
| 2 | Increment | `reminder_count` + 1 |
| 3 | Add tag | `reminded-24h` |
| 4 | Wait | Until 2 hours before the appointment |
| 5 | If/Else | `confirmation_status` = `confirmed` → R2 (short). Else → R3 (asks again) |
| 6 | Send SMS | R2 or R3 |
| 7 | Add tag | `reminded-2h` |
| 8 | If/Else | `intake_form_complete` is not `true` → send intake link |

Three touches maximum. A fourth reminder does not raise show rate and does
measurably raise opt-outs.

---

## W4 · No-Show Recovery

**Trigger:** Appointment Status is `No Show`

| # | Action | Detail |
|---|---|---|
| 1 | Increment | `no_show_count` + 1 |
| 2 | Move opportunity | Stage → `No Show` |
| 3 | If/Else | `no_show_count` >= 3 → tag `no-show-repeat`, exit, notify front desk |
| 4 | Wait | 2 hours |
| 5 | Send SMS | Message N1 — no guilt, one-tap rebook |
| 6 | Wait | 1 day |
| 7 | If/Else | Rebooked → exit |
| 8 | Send SMS | Message N2 |
| 9 | Wait | 3 days |
| 10 | Add tag | `recycle-noshow` · Move to `Recycle` |

**Step 3 exists on purpose.** After three no-shows the person is not a lead,
and continuing to text them costs goodwill and deliverability. Stop, and let a
human decide.

---

## Message library

Custom values in `{{ }}` are populated by the provisioning script.

**S1 — first touch**
> Hi {{contact.first_name}}, it's {{custom_values.clinic_name}}. Thanks for
> reaching out. I've got a couple of openings this week — would mornings or
> afternoons suit you better?

**S2 — nudge**
> Just making sure this reached you, {{contact.first_name}}. Reply with a day
> that works and I'll hold a slot.

**C1 — confirmation ask**
> You're booked for {{appointment.start_time}} with
> {{custom_values.practitioner_name}}. Reply Y to confirm, or R if you need to
> move it.

**C2 — logistics email (subject: Your visit on {{appointment.date}})**
> Address, map link, parking note, what to bring, how long it takes, and one
> line on what happens in the first visit. No selling.

**C3 — soft re-ask**
> Hi {{contact.first_name}}, I still have {{appointment.start_time}} held for
> you. A quick Y and it's locked in.

**R1 — 24 hours**
> Tomorrow at {{appointment.start_time}}, {{contact.first_name}}. We're at
> {{custom_values.clinic_address}} — {{custom_values.clinic_maps_link}}.
> {{custom_values.clinic_parking_note}}

**R2 — 2 hours, already confirmed**
> See you at {{appointment.start_time}} today.

**R3 — 2 hours, still unconfirmed**
> {{contact.first_name}}, we've got you at {{appointment.start_time}} today.
> Still good? Y or R.

**N1 — missed, same day**
> We missed you today, {{contact.first_name}} — no problem at all. Here's the
> link if you'd like to pick a new time: {{custom_values.reschedule_link}}

**N2 — missed, next day**
> Still happy to fit you in whenever suits. Same link:
> {{custom_values.reschedule_link}}

### Copy rules

- Sentence case, no emoji, no exclamation marks. It should read like the front
  desk typed it.
- One ask per message. A text with two questions gets zero answers.
- Every SMS carries an opt-out path per the account's compliance settings.
- Never say "reminder" in a reminder. Say the time.
