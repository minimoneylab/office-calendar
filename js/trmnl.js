// =====================================================================
// TRMNL preview — renders trmnl/*.liquid with the live Supabase feeds
// =====================================================================
renderSidebar('trmnl');

const VIEWS = {
    roster0: { fn: 'trmnl_roster', args: {},                  query: '',                 tpl: 'trmnl/roster.liquid' },
    roster1: { fn: 'trmnl_roster', args: { month_offset: 1 }, query: '?month_offset=1',  tpl: 'trmnl/roster.liquid' },
    econ:    { fn: 'trmnl_econ',   args: {},                  query: '',                 tpl: 'trmnl/econ.liquid' },
};
const engine = new liquidjs.Liquid();
const tplCache = {};
let current = 'roster0';
let markupText = '';

async function getTemplate(path) {
    if (!tplCache[path]) {
        const r = await fetch(`${path}?v=5`);
        if (!r.ok) throw new Error(`Couldn't load ${path}`);
        tplCache[path] = await r.text();
    }
    return tplCache[path];
}

async function getData(v) {
    if (DB.demo) throw new Error('Preview needs the live database — fill in js/supabase-client.js first.');
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await sb.rpc(v.fn, v.args);
    if (error) throw new Error(/function|schema cache/i.test(error.message)
        ? 'TRMNL feeds not found — run roster_migration_4.sql in Supabase first.' : error.message);
    return data;
}

async function show() {
    const v = VIEWS[current];
    document.querySelectorAll('#t-tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === current));
    document.getElementById('t-url').textContent = `${DB.demo ? 'https://<project>.supabase.co' : SUPABASE_URL}/rest/v1/rpc/${v.fn}${v.query}`;
    document.getElementById('t-head').textContent = `apikey=${DB.demo ? '<publishable key>' : SUPABASE_KEY}`;
    document.getElementById('t-file').textContent = v.tpl;
    const err = document.getElementById('t-err');
    err.textContent = '';
    try {
        markupText = await getTemplate(v.tpl);
        const data = await getData(v);
        document.getElementById('t-view').innerHTML = await engine.parseAndRender(markupText, data);
    } catch (e) {
        document.getElementById('t-view').innerHTML = '';
        err.textContent = e.message || String(e);
    }
}

document.getElementById('t-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    current = b.dataset.v;
    show();
});
document.getElementById('onebit').addEventListener('change', e => {
    document.getElementById('t-screen').classList.toggle('onebit', e.target.checked);
});

async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`); }
    catch (e) { toast('Clipboard blocked by the browser — select and copy by hand', true); }
}
document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () =>
    copy(document.getElementById(b.dataset.copy).textContent, b.dataset.copy === 't-url' ? 'Polling URL' : 'Header')));
document.getElementById('t-copy-markup').addEventListener('click', () => copy(markupText, 'Markup'));

show();
