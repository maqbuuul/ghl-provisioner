# Pre-launch checklist

Run this before a single ad goes live. Every item has failed on a real account.

## Account

- [ ] Timezone set on the sub-account, not just on the calendar
- [ ] Business hours match what the front desk actually works
- [ ] A2P 10DLC registration approved (US) — SMS silently fails without it
- [ ] Dedicated number provisioned, not the trial number
- [ ] Opt-out keywords active and tested with a real handset

## Calendar

- [ ] Slot duration matches the real appointment length
- [ ] Buffer time set — back-to-back booking is how double-bookings happen
- [ ] Minimum scheduling notice ≥ 2 hours, or people book slots nobody can staff
- [ ] Maximum booking window set (usually 30 days)
- [ ] Availability excludes lunch and admin blocks
- [ ] Confirmation and reschedule links tested on a phone, not a desktop

## Fields and pipeline

- [ ] `provision-showrate.mjs` run and its verification step passed
- [ ] Pipeline stages match `Attended` exactly — reporting joins on the name
- [ ] Custom values populated (clinic name, address, map link, practitioner)
- [ ] Intake form link live and mobile-tested

## Workflows

- [ ] W1–W4 built from the spec sheet
- [ ] Quiet-hours guard tested by triggering at 2am in the account timezone
- [ ] Reply detection tested — text back mid-sequence and confirm it stops
- [ ] No workflow can enrol the same contact twice
- [ ] Internal test contact walked through the full path: lead → booked →
      confirmed → reminded → attended

## Measurement

- [ ] Attribution fields populate on a real form submission
- [ ] Appointment status webhook reaching n8n
- [ ] `Attended` status actually gets set by the front desk — if nobody marks
      attendance, none of this reports anything

That last one is the real risk. The system is only as good as the person who
marks the appointment attended, so train that before launch and check it in
week one.

## Week-one review

| Metric | Healthy | Look at |
|---|---|---|
| Speed to first contact | under 5 min median | W1 quiet-hours logic |
| Confirmation rate | 60–75% | C1 wording, timing |
| Show rate, confirmed | 80%+ | reminder ladder |
| Show rate, unconfirmed | 45–60% | is confirmation being asked at all |
| No-show recovery | 20–30% rebooked | N1 timing |
| SMS opt-out rate | under 2% | message volume, tone |
