// =====================================================================
// Central banks page — reads trmnl_cb(), edits cb_banks (show / next date)
// =====================================================================
renderSidebar('cb');

const body = document.getElementById('cbw-body');
const sb = DB.demo ? null : supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let data = null;

async function load() {
    if (DB.demo) {
        body.innerHTML = `<div class="cbw-msg">This page needs the live database — fill in js/supabase-client.js first.</div>`;
        return;
    }
    const { data: d, error } = await sb.rpc('trmnl_cb', { include_hidden: true });
    if (error) {
        body.innerHTML = `<div class="cbw-msg">${/function|schema cache/i.test(error.message)
            ? 'Central bank data not found — run roster_migration_5.sql in Supabase first.' : esc(error.message)}</div>`;
        return;
    }
    data = d;
    render();
}

function card(b) {
    const next = b.days === 0 ? '<b>Today</b>'
        : `Next <b>${esc(b.next)}</b>${b.days != null ? ` · ${b.days}d` : ''}`;
    return `
    <div class="cbw-card ${b.show ? '' : 'off'} ${b.soon && b.show ? 'soon' : ''}" data-code="${esc(b.code)}">
        <div class="cbw-top">
            <span class="cbw-name">${esc(b.cb)}</span>
            <span class="cbw-rate">${esc(b.rate)}</span>
            <span class="cbw-rn">${esc(b.rate_name)}</span>
            <span class="cbw-right">
                <span class="cbw-next">${next}</span>
                ${b.exp ? `<span class="cbw-exp" title="Consensus for the next meeting">${esc(b.exp)}</span>` : ''}
                <label class="switch" title="Show on TRMNL"><input type="checkbox" data-act="show" ${b.show ? 'checked' : ''}><span class="track"></span></label>
            </span>
        </div>
        <div class="cbw-hist">
            ${b.hist.length ? b.hist.map(h => `<span>${esc(h.d)} <b>${esc(h.c)}</b> → ${esc(h.rate)}</span>`).join('')
                            : '<span>No decisions loaded yet</span>'}
        </div>
        <div class="cbw-edit">
            Next meeting ${b.manual ? '<span class="cbw-manual">MANUAL</span>' : '(from TradingView)'}
            <input type="date" class="input" data-act="next" value="${b.next_iso || ''}" aria-label="Next meeting date">
            ${b.manual ? `<button class="btn-ghost" data-act="clear">Use TradingView date</button>` : ''}
        </div>
    </div>`;
}

function render() {
    document.getElementById('cbw-updated').textContent = `Updated ${data.updated} HKT`;
    body.innerHTML = [['G10', data.g10], ['Asia / EM', data.asia]].map(([label, list]) =>
        `<div class="cbw-panel"><h3>${label}</h3>${list.map(card).join('')}</div>`).join('');
}

async function update(code, patch, msg) {
    const { data: rows, error } = await sb.from('cb_banks')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('code', code).select();
    if (error || !rows || !rows.length) { fail(error || new Error('Not saved — check cb_banks policies')); return; }
    toast(msg);
    await load();
}

body.addEventListener('change', e => {
    const cardEl = e.target.closest('.cbw-card');
    if (!cardEl) return;
    const code = cardEl.dataset.code;
    const name = cardEl.querySelector('.cbw-name').textContent;
    if (e.target.dataset.act === 'show') {
        update(code, { show: e.target.checked }, `${name} ${e.target.checked ? 'shown' : 'hidden'} on TRMNL`);
    } else if (e.target.dataset.act === 'next') {
        const v = e.target.value;
        update(code, { next_override: v || null }, v ? `${name} next meeting set to ${prettyDate(v)}` : `${name} next meeting cleared`);
    }
});
body.addEventListener('click', e => {
    if (e.target.closest('[data-act="clear"]')) {
        const cardEl = e.target.closest('.cbw-card');
        update(cardEl.dataset.code, { next_override: null }, 'Using TradingView date');
    }
});

load();
