#!/usr/bin/env node
/**
 * provision-showrate.mjs
 *
 * Builds the Show Rate OS scaffolding inside a GoHighLevel sub-account:
 * custom fields, custom values, the New Patient pipeline, and the tag
 * vocabulary the workflows depend on.
 *
 * An honest note about what this can and cannot do. GoHighLevel's public API
 * does not expose workflow creation. Custom fields, custom values, pipelines,
 * tags, calendars and opportunities are all API-manageable; the workflow
 * builder is not. So this script provisions everything the workflows read from
 * and write to, and the workflows themselves are specified in
 * docs/workflow-specs.md as a build sheet.
 *
 * That split matters. It means the parts a machine can verify are verified,
 * and the parts a human has to click are written down precisely enough that
 * two different people build the same thing.
 *
 *   node provision-showrate.mjs --location <locationId> [--dry-run]
 */

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const args = process.argv.slice(2);
const locationId = args[args.indexOf('--location') + 1];
const dryRun = args.includes('--dry-run');
const token = process.env.GHL_API_TOKEN;

if (!locationId || locationId.startsWith('--')) {
  console.error('Usage: node provision-showrate.mjs --location <locationId> [--dry-run]');
  process.exit(1);
}
// A dry run makes no API calls, so it must not require a token. Demanding one
// here meant the plan could not be reviewed before an account existed — which
// is exactly when reviewing it is most useful.
if (!token && !dryRun) {
  console.error('GHL_API_TOKEN is not set. Use --dry-run to print the plan without it.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The configuration. Everything below is data, so a change is a diff in git
// rather than someone remembering what they clicked last time.
// ---------------------------------------------------------------------------

const CUSTOM_FIELDS = [
  // attribution — must match the n8n workflows and the capture script
  ['utm_source', 'TEXT'], ['utm_medium', 'TEXT'], ['utm_campaign', 'TEXT'],
  ['utm_content', 'TEXT'], ['utm_term', 'TEXT'],
  ['gclid', 'TEXT'], ['gbraid', 'TEXT'], ['wbraid', 'TEXT'],
  ['fbclid', 'TEXT'], ['ttclid', 'TEXT'], ['msclkid', 'TEXT'],
  ['platform_campaign_id', 'TEXT'], ['platform_adset_id', 'TEXT'],
  ['platform_ad_id', 'TEXT'], ['landing_page', 'TEXT'],
  ['first_touch_channel', 'TEXT'],

  // show-rate mechanics
  ['confirmation_status', 'TEXT'],      // pending | confirmed | reschedule | cancelled
  ['confirmed_at', 'DATE'],
  ['reminder_count', 'NUMERICAL'],
  ['no_show_count', 'NUMERICAL'],
  ['reschedule_count', 'NUMERICAL'],
  ['last_appointment_at', 'DATE'],
  ['insurance_provider', 'TEXT'],
  ['intake_form_complete', 'TEXT'],
  ['preferred_contact', 'TEXT'],        // sms | call | email
  ['quiet_hours_optout', 'TEXT'],
];

const CUSTOM_VALUES = [
  ['clinic_name', ''],
  ['clinic_address', ''],
  ['clinic_phone', ''],
  ['clinic_maps_link', ''],
  ['clinic_parking_note', ''],
  ['intake_form_link', ''],
  ['reschedule_link', ''],
  ['practitioner_name', ''],
  ['value_per_attended', '150'],
];

const PIPELINE = {
  name: 'New Patient',
  stages: [
    'New Lead',     // arrived, nobody has spoken to them
    'Contacted',    // outbound attempted
    'Booked',       // slot held
    'Confirmed',    // human said yes to the confirmation ask
    'Attended',     // the only stage that means money
    'No Show',
    'Recycle',      // no-show or cancel, back into nurture
    'Closed Lost',
  ],
};

const TAGS = [
  'source-meta', 'source-google', 'source-organic', 'source-referral',
  'confirmed', 'unconfirmed', 'reminded-24h', 'reminded-2h',
  'no-show-1', 'no-show-2', 'no-show-repeat',
  'recycle-noshow', 'recycle-cancelled', 'recycle-cold',
  'do-not-sms', 'do-not-call', 'vip',
];

// ---------------------------------------------------------------------------

async function call(path, method = 'GET', body) {
  if (dryRun) {
    console.log(`  [dry-run] ${method} ${path}`);
    return { id: 'dry-run', dryRun: true };
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    // 400 with "already exists" is the expected outcome on a re-run, not a
    // failure. Provisioning has to be safe to run twice.
    const msg = JSON.stringify(json).toLowerCase();
    if (res.status === 400 && (msg.includes('already') || msg.includes('duplicate'))) {
      return { ...json, skipped: true };
    }
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\nProvisioning Show Rate OS on location ${locationId}${dryRun ? ' (dry run)' : ''}\n`);
  const result = { fields: [], values: [], pipeline: null, tags: [], errors: [] };

  console.log('Custom fields');
  for (const [name, dataType] of CUSTOM_FIELDS) {
    try {
      const r = await call(`/locations/${locationId}/customFields`, 'POST', {
        name, dataType, fieldKey: `contact.${name}`, model: 'contact',
      });
      result.fields.push(name);
      console.log(`  ${r.skipped ? 'exists' : 'created'}  ${name}`);
    } catch (e) {
      result.errors.push(`field ${name}: ${e.message}`);
      console.log(`  FAILED  ${name}`);
    }
    await sleep(120);                       // stay well under the rate limit
  }

  console.log('\nCustom values');
  for (const [name, value] of CUSTOM_VALUES) {
    try {
      const r = await call(`/locations/${locationId}/customValues`, 'POST', { name, value });
      result.values.push(name);
      console.log(`  ${r.skipped ? 'exists' : 'created'}  ${name}`);
    } catch (e) {
      result.errors.push(`value ${name}: ${e.message}`);
      console.log(`  FAILED  ${name}`);
    }
    await sleep(120);
  }

  console.log('\nPipeline');
  try {
    const r = await call('/opportunities/pipelines', 'POST', {
      locationId,
      name: PIPELINE.name,
      stages: PIPELINE.stages.map((name, position) => ({ name, position })),
    });
    result.pipeline = r.id ?? r.pipeline?.id ?? 'existing';
    console.log(`  ${r.skipped ? 'exists' : 'created'}  ${PIPELINE.name} (${PIPELINE.stages.length} stages)`);
  } catch (e) {
    result.errors.push(`pipeline: ${e.message}`);
    console.log('  FAILED  pipeline');
  }

  console.log('\nTags');
  for (const name of TAGS) {
    try {
      await call(`/locations/${locationId}/tags`, 'POST', { name });
      result.tags.push(name);
    } catch (e) {
      result.errors.push(`tag ${name}: ${e.message}`);
    }
    await sleep(80);
  }
  console.log(`  ${result.tags.length}/${TAGS.length} tags in place`);

  // -------------------------------------------------------------------------
  // Verification. Re-read what we think we created rather than trusting the
  // POST responses. Half-provisioned accounts are the expensive failure mode.
  // -------------------------------------------------------------------------
  if (!dryRun) {
    console.log('\nVerifying');
    const live = await call(`/locations/${locationId}/customFields`);
    const present = new Set((live.customFields ?? []).map(f => String(f.fieldKey ?? '').split('.').pop()));
    const missing = CUSTOM_FIELDS.map(([n]) => n).filter(n => !present.has(n));

    if (missing.length) {
      console.log(`  ${missing.length} field(s) missing: ${missing.join(', ')}`);
      result.errors.push(`verification: missing ${missing.join(', ')}`);
    } else {
      console.log(`  all ${CUSTOM_FIELDS.length} fields confirmed present`);
    }
  }

  console.log('\n' + '-'.repeat(60));
  if (result.errors.length) {
    console.log(`Completed with ${result.errors.length} problem(s):`);
    result.errors.forEach(e => console.log(`  - ${e}`));
    console.log('\nDo not launch ads on this account until these are resolved.');
    process.exitCode = 1;
  } else {
    console.log('Provisioned cleanly.');
    console.log('Next: build the four workflows from docs/workflow-specs.md,');
    console.log('then run the pre-launch checklist in docs/build-checklist.md.');
  }
}

main().catch((e) => { console.error('\nFatal:', e.message); process.exit(1); });
