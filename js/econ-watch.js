// =====================================================================
// Econ watchlist — one panel per region, tick what the desk follows
// =====================================================================
renderSidebar('watch');

const ws = { catalog: [], q: '', only: false };

async function load() {
    try { ws.catalog = await DB.econCatalog(); } catch (e) { fail(e); }
    buildPanels();
    render();
}

function buildPanels() {
    document.getElementById('w-jump').innerHTML = `<span class="jump-label">Jump to</span>` +
        ECON_REGIONS.map(([c, n]) => `<a href="#w-${c}" class="hol" title="${esc(n)}">${c}</a>`).join('');
    document.getElementById('w-regions').innerHTML = ECON_REGIONS.map(([c, n]) => `
        <section class="region card" id="w-${c}" data-c="${c}">
            <div class="region-head">
                <span class="rtag rtag-lg">${c}</span>
                <h3>${esc(n)}</h3>
                <span class="vis-badge" data-f="count"></span>
                <span class="region-spacer"></span>
            </div>
            <div class="watch-list" data-f="list"></div>
        </section>`).join('');
}

// TradingView calls CPI "Inflation Rate" and policy rates "Interest Rate Decision"
const SYNONYMS = { cpi: ['inflation', 'cpi'], inflation: ['inflation', 'cpi'], rate: ['rate'], policy: ['interest rate', 'rate decision'],
                   jobs: ['payroll', 'employment', 'unemployment', 'jobless'], trade: ['trade', 'exports', 'imports'] };
function matches(name, q) {
    const n = name.toLowerCase();
    return (SYNONYMS[q] || [q]).some(s => n.includes(s));
}

function render() {
    const q = ws.q.trim().toLowerCase();
    let total = 0;
    ECON_CODES.forEach(c => {
        const panel = document.getElementById(`w-${c}`);
        const all = ws.catalog.filter(x => x.region === c);
        const ticked = all.filter(x => x.watch).length;
        total += ticked;
        panel.querySelector('[data-f="count"]').textContent = `${ticked} of ${all.length} ticked`;
        const shown = all
            .filter(x => (!ws.only || x.watch) && (!q || matches(x.std_name, q)))
            .sort((a, b) => (b.watch - a.watch) || a.std_name.localeCompare(b.std_name));
        panel.style.display = shown.length || (!q && !ws.only) ? '' : 'none';
        panel.querySelector('[data-f="list"]').innerHTML = shown.length
            ? shown.map(x => `
                <label class="witem ${x.watch ? 'on' : ''}">
                    <input type="checkbox" data-name="${esc(x.std_name)}" ${x.watch ? 'checked' : ''}>
                    <span>${esc(x.std_name)}</span>
                    ${x.has_actual === false ? '<span class="noact" title="TradingView shows the date only">date only</span>' : ''}
                </label>`).join('')
            : `<span class="empty-year">Nothing here yet.</span>`;
    });
    document.getElementById('w-total').textContent = `${total} indicators ticked`;
}

document.getElementById('w-regions').addEventListener('change', async e => {
    if (!e.target.matches('input[type=checkbox][data-name]')) return;
    const region = e.target.closest('.region').dataset.c;
    const name = e.target.dataset.name;
    const on = e.target.checked;
    try {
        await DB.setWatch(region, [name], on);
        const row = ws.catalog.find(x => x.region === region && x.std_name === name);
        if (row) row.watch = on;
        e.target.closest('.witem').classList.toggle('on', on);
        render();
        toast(`${on ? 'Added' : 'Removed'} ${region} · ${name}`);
    } catch (err) { e.target.checked = !on; fail(err); }
});
document.getElementById('w-search').addEventListener('input', e => { ws.q = e.target.value; render(); });
document.getElementById('w-only').addEventListener('change', e => { ws.only = e.target.checked; render(); });

load();
