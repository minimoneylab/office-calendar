// =====================================================================
// Central banks page — reads trmnl_cb(), edits cb_banks (show) and
// cb_schedule (each bank's meeting dates)
// =====================================================================
renderSidebar('cb');

const body = document.getElementById('cbw-body');
const sb = DB.demo ? null : supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const openSched = new Set();      // codes whose schedule editor is expanded
let data = null;

const SRC_LABEL = { tv: 'TradingView', schedule: 'schedule', manual: 'manual' };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Pick every date out of pasted text: 2027-01-27, 2027/1/27, 27 Jan 2027, Jan 27, 2027
function extractDates(text) {
    const out = new Set();
    const re = /(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})|(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})|([A-Za-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{4})/g;
    for (const m of text.matchAll(re)) {
        let y, mo, d;
        if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else if (m[4]) { d = +m[4]; mo = MONTHS[m[5].slice(0, 3).toLowerCase()]; y = +m[6]; }
        else { mo = MONTHS[m[7].slice(0, 3).toLowerCase()]; d = +m[8]; y = +m[9]; }
        if (!mo) continue;
        const s = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (ymd(parseYmd(s)) === s) out.add(s);
    }
    return [...out].sort();
}

async function load() {
    if (DB.demo) {
        body.innerHTML = `<div class="cbw-msg">This page needs the live database — fill in js/supabase-client.js first.</div>`;
        return;
    }
    const { data: d, error } = await sb.rpc('trmnl_cb', { include_hidden: true });
    if (error) {
        body.innerHTML = `<div class="cbw-msg">${/function|schema cache/i.test(error.message)
            ? 'Central bank data not found — run roster_migration_5.sql and 6 in Supabase first.' : esc(error.message)}</div>`;
        return;
    }
    data = d;
    render();
}

function card(b) {
    const next = b.days === 0 ? '<b>Today</b>'
        : `Next <b>${esc(b.next)}</b>${b.days != null ? ` · ${b.days}d` : ''}`;
    const sched = b.sched || [];
    const open = openSched.has(b.code);
    return `
    <div class="cbw-card ${b.show ? '' : 'off'} ${b.soon && b.show ? 'soon' : ''}" data-code="${esc(b.code)}">
        <div class="cbw-top">
            <span class="cbw-name">${esc(b.cb)}</span>
            <span class="cbw-rate">${esc(b.rate)}</span>
            <span class="cbw-rn">${esc(b.rate_name)}</span>
            <span class="cbw-right">
                <span class="cbw-next" title="${b.next_src ? 'From ' + SRC_LABEL[b.next_src] : ''}${b.tentative ? ' (not officially confirmed)' : ''}">${next}</span>
                ${b.exp ? `<span class="cbw-exp" title="Consensus for the next meeting">${esc(b.exp)}</span>` : ''}
                <label class="switch" title="Show on TRMNL"><input type="checkbox" data-act="show" ${b.show ? 'checked' : ''}><span class="track"></span></label>
            </span>
        </div>
        <div class="cbw-hist">
            ${b.hist.length ? b.hist.map(h => `<span>${esc(h.d)} <b>${esc(h.c)}</b> → ${esc(h.rate)}</span>`).join('')
                            : '<span>No decisions loaded yet</span>'}
        </div>
        <div class="cbw-edit">
            <button class="btn-ghost cbw-toggle" data-act="toggle"><i class="ti ti-calendar-event"></i>
                Schedule · ${sched.length ? `${sched.length} upcoming` : '<span class="cbw-warn">none entered</span>'}
                <i class="ti ti-chevron-${open ? 'up' : 'down'}"></i></button>
            ${b.manual ? `<span class="cbw-manual">MANUAL NEXT</span><button class="btn-ghost" data-act="clear">Clear manual date</button>` : ''}
        </div>
        ${open ? `
        <div class="cbw-sched">
            <div class="cbw-chips">
                ${sched.length ? sched.map(s => `
                    <span class="cbw-chip ${s.tentative ? 'tent' : ''}" title="${s.tentative ? 'Not officially confirmed — click ✓ to confirm' : 'Confirmed'}">
                        ${esc(prettyDate(s.date))} ${parseYmd(s.date).getFullYear()}
                        ${s.tentative ? `<button data-act="confirm" data-date="${s.date}" aria-label="Mark confirmed">✓</button>` : ''}
                        <button data-act="del" data-date="${s.date}" aria-label="Remove">×</button>
                    </span>`).join('') : '<span class="cbw-none">No upcoming dates. Add or paste the official calendar below.</span>'}
            </div>
            <div class="cbw-add">
                <input type="date" class="input" data-f="one" aria-label="Add a meeting date">
                <button class="btn-secondary" data-act="add"><i class="ti ti-plus"></i>Add</button>
                <span class="cbw-or">or paste many:</span>
                <textarea class="input" data-f="paste" rows="1" placeholder="27 Jan 2027, 17 Mar 2027 …"></textarea>
                <button class="btn-secondary" data-act="paste">Add pasted</button>
            </div>
            <div class="cbw-note">Dotted = not officially confirmed. TradingView's date wins when it has one (about 5 weeks ahead).</div>
        </div>` : ''}
    </div>`;
}

function render() {
    document.getElementById('cbw-updated').textContent = `Updated ${data.updated} HKT`;
    body.innerHTML = [['G10', data.g10], ['Asia / EM', data.asia]].map(([label, list]) =>
        `<div class="cbw-panel"><h3>${label}</h3>${list.map(card).join('')}</div>`).join('');
}

const nameOf = code => [...data.g10, ...data.asia].find(b => b.code === code)?.cb || code;

async function updateBank(code, patch, msg) {
    const { data: rows, error } = await sb.from('cb_banks')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('code', code).select();
    if (error || !rows || !rows.length) { fail(error || new Error('Not saved — check cb_banks policies')); return; }
    toast(msg);
    await load();
}
async function addDates(code, dates) {
    if (!dates.length) { toast('No dates found', true); return; }
    const { error } = await sb.from('cb_schedule')
        .upsert(dates.map(date => ({ code, date, tentative: false })), { onConflict: 'code,date', ignoreDuplicates: true });
    if (error) { fail(error); return; }
    toast(`${nameOf(code)}: added ${dates.length} date${dates.length > 1 ? 's' : ''}`);
    await load();
}

body.addEventListener('change', e => {
    if (e.target.dataset.act !== 'show') return;
    const code = e.target.closest('.cbw-card').dataset.code;
    updateBank(code, { show: e.target.checked }, `${nameOf(code)} ${e.target.checked ? 'shown' : 'hidden'} on TRMNL`);
});

body.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'INPUT') return;
    const cardEl = btn.closest('.cbw-card');
    const code = cardEl.dataset.code;
    const act = btn.dataset.act;

    if (act === 'toggle') {
        openSched.has(code) ? openSched.delete(code) : openSched.add(code);
        render();
    } else if (act === 'clear') {
        updateBank(code, { next_override: null }, `${nameOf(code)}: manual date cleared`);
    } else if (act === 'del') {
        const { error } = await sb.from('cb_schedule').delete().eq('code', code).eq('date', btn.dataset.date);
        if (error) { fail(error); return; }
        toast(`${nameOf(code)}: removed ${prettyDate(btn.dataset.date)}`);
        await load();
    } else if (act === 'confirm') {
        const { data: rows, error } = await sb.from('cb_schedule').update({ tentative: false })
            .eq('code', code).eq('date', btn.dataset.date).select();
        if (error || !rows || !rows.length) { fail(error || new Error('Not saved')); return; }
        toast(`${nameOf(code)}: ${prettyDate(btn.dataset.date)} confirmed`);
        await load();
    } else if (act === 'add') {
        const v = cardEl.querySelector('[data-f="one"]').value;
        if (!v) { toast('Pick a date first', true); return; }
        addDates(code, [v]);
    } else if (act === 'paste') {
        addDates(code, extractDates(cardEl.querySelector('[data-f="paste"]').value));
    }
});

load();
