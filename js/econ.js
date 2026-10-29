// =====================================================================
// Economic calendar — list grouped by Hong Kong date
// =====================================================================
renderSidebar('econ');

const REGION_KEY = 'deskcal_econ_regions';
const es = {
    range: 'week',
    watchOnly: true,
    regions: loadRegions(),
    events: [],
    catalog: [],
    holidays: [],
    visibleHol: COUNTRY_CODES.slice(),
};

function loadRegions() {
    try { const v = JSON.parse(localStorage.getItem(REGION_KEY)); if (Array.isArray(v) && v.length) return v; } catch (e) { /* ignore */ }
    return ECON_CODES.slice();
}
function saveRegions() { try { localStorage.setItem(REGION_KEY, JSON.stringify(es.regions)); } catch (e) { /* ignore */ } }

// ---------- Date range (HKT) ----------
function addDaysYmd(s, n) { return ymd(addDays(parseYmd(s), n)); }
function rangeDays() {
    const today = hktTodayYmd();
    const mon = ymd(mondayOf(parseYmd(today)));
    if (es.range === 'today') return [today, addDaysYmd(today, 1)];
    if (es.range === 'last') return [addDaysYmd(mon, -7), mon];
    if (es.range === 'next') return [addDaysYmd(mon, 7), addDaysYmd(mon, 14)];
    return [mon, addDaysYmd(mon, 7)];
}

// ---------- Watchlist matching (by family, so Adv / Prel / Final all count) ----------
let watchSet = new Set();
function rebuildWatch() {
    watchSet = new Set(es.catalog.filter(c => c.watch).map(c => `${c.region}|${econFamily(c.std_name)}`));
}
const isWatched = e => watchSet.has(`${e.region}|${econFamily(e.std_name)}`);

// ---------- Load ----------
async function load() {
    const [fromYmd, toYmd] = rangeDays();
    try {
        const [events, catalog, holidays, visibleHol] = await Promise.all([
            DB.econEvents(hktMidnightUtcIso(fromYmd), hktMidnightUtcIso(toYmd)),
            es.catalog.length ? es.catalog : DB.econCatalog(),
            DB.holidays(fromYmd, addDaysYmd(toYmd, -1)),
            DB.getSetting('visible_countries', COUNTRY_CODES),
        ]);
        es.events = events;
        es.catalog = catalog;
        es.holidays = holidays;
        es.visibleHol = visibleHol;
        rebuildWatch();
    } catch (e) { fail(e); }
    render();
}

// ---------- Formatting ----------
function fmt(v, e) {
    if (v === null || v === undefined) return '';
    let s = Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 })
                                : String(Math.round(v * 1000) / 1000);
    s += e.scale || '';
    if (e.unit === '%') s += '%';
    return s;
}
function surprise(e) {
    if (e.actual == null || e.forecast == null || e.actual === e.forecast) return '';
    return e.actual > e.forecast ? 'up' : 'down';
}

// ---------- Render ----------
function renderRegionFilter() {
    const allOn = es.regions.length === ECON_CODES.length;
    document.getElementById('region-filter').innerHTML =
        `<button type="button" class="rchip all ${allOn ? 'on' : ''}" data-r="__all">All</button>` +
        ECON_REGIONS.map(([c, n]) => `<button type="button" class="rchip ${es.regions.includes(c) && !allOn ? 'on' : ''}" data-r="${c}" title="${esc(n)}">${c}</button>`).join('');
}

function render() {
    renderRegionFilter();
    document.querySelectorAll('#range-seg button').forEach(b => b.classList.toggle('on', b.dataset.range === es.range));

    const rows = es.events.filter(e => es.regions.includes(e.region) && (!es.watchOnly || isWatched(e)));
    const body = document.getElementById('econ-body');

    // last updated
    const upd = es.events.reduce((m, e) => (e.updated_at && e.updated_at > m ? e.updated_at : m), '');
    document.getElementById('econ-updated').textContent = upd ? `Data updated ${hkt(upd).ymd === hktTodayYmd() ? '' : prettyDate(hkt(upd).ymd) + ' '}${hkt(upd).hm} HKT` : '';

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="7" class="econ-empty">${es.events.length
            ? 'Nothing on the watchlist for this period. Turn off "Watchlist only" to see everything.'
            : 'No events yet for this period. If the site is newly set up, run the GitHub Action once.'}</td></tr>`;
        return;
    }

    // group by HKT day
    const byDay = {};
    rows.forEach(e => { const k = hkt(e.date).ymd; (byDay[k] = byDay[k] || []).push(e); });
    const today = hktTodayYmd();
    const nowIso = new Date().toISOString();

    let html = '';
    Object.keys(byDay).sort().forEach(day => {
        const hols = es.holidays.filter(h => h.date === day && es.visibleHol.includes(h.country));
        html += `<tr class="day-row ${day === today ? 'is-today' : ''}"><td colspan="7">
            <span class="day-label">${prettyDateLong(day)}</span>
            ${day === today ? '<span class="today-badge">Today</span>' : ''}
            ${hols.map(h => `<span class="hol" title="${esc(COUNTRY_NAME[h.country] || h.country)} bank holiday">${esc(h.country)}</span>`).join(' ')}
        </td></tr>`;
        let nowShown = day !== today;
        byDay[day].forEach(e => {
            if (!nowShown && e.date > nowIso) {
                html += `<tr class="now-row"><td colspan="7"><span>Now ${hkt(nowIso).hm}</span></td></tr>`;
                nowShown = true;
            }
            const past = e.date <= nowIso;
            const s = surprise(e);
            const watched = isWatched(e);
            html += `
                <tr class="ev ${past ? 'past' : ''}" data-id="${esc(e.id)}">
                    <td class="c-time">${hkt(e.date).hm}</td>
                    <td class="c-reg"><span class="rtag" title="${esc(ECON_NAME[e.region] || e.region)}">${esc(e.region)}</span></td>
                    <td class="c-ev">${esc(e.title)}${e.period ? ` <span class="period">${esc(e.period)}</span>` : ''}</td>
                    <td class="c-num actual ${s}">${fmt(e.actual, e)}</td>
                    <td class="c-num">${fmt(e.forecast, e)}</td>
                    <td class="c-num prev">${fmt(e.previous, e)}</td>
                    <td class="c-star"><button class="star ${watched ? 'on' : ''}" data-star aria-label="${watched ? 'Remove from' : 'Add to'} watchlist" title="${watched ? 'Remove from' : 'Add to'} watchlist">${watched ? '★' : '☆'}</button></td>
                </tr>`;
        });
        if (!nowShown) html += `<tr class="now-row"><td colspan="7"><span>Now ${hkt(nowIso).hm}</span></td></tr>`;
    });
    body.innerHTML = html;
}

// ---------- Events ----------
document.getElementById('range-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    es.range = b.dataset.range;
    load();
});
document.getElementById('watch-only').addEventListener('change', e => { es.watchOnly = e.target.checked; render(); });

document.getElementById('region-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const r = b.dataset.r;
    const allOn = es.regions.length === ECON_CODES.length;
    if (r === '__all') es.regions = ECON_CODES.slice();
    else if (allOn) es.regions = [r];                       // from "All", clicking one region shows just that one
    else {
        es.regions = es.regions.includes(r) ? es.regions.filter(x => x !== r) : [...es.regions, r];
        if (!es.regions.length) es.regions = ECON_CODES.slice();
    }
    saveRegions();
    render();
});

document.getElementById('econ-body').addEventListener('click', async e => {
    const btn = e.target.closest('[data-star]');
    if (!btn) return;
    const ev = es.events.find(x => x.id === btn.closest('tr').dataset.id);
    if (!ev) return;
    const fam = econFamily(ev.std_name);
    const watched = isWatched(ev);
    // un-watch: every name in the family; watch: this exact name
    const names = watched
        ? es.catalog.filter(c => c.region === ev.region && econFamily(c.std_name) === fam && c.watch).map(c => c.std_name)
        : [ev.std_name];
    try {
        await DB.setWatch(ev.region, names, !watched);
        es.catalog.forEach(c => { if (c.region === ev.region && names.includes(c.std_name)) c.watch = !watched; });
        if (!watched && !es.catalog.some(c => c.region === ev.region && c.std_name === ev.std_name)) {
            es.catalog.push({ region: ev.region, std_name: ev.std_name, watch: true });
        }
        rebuildWatch();
        render();
        toast(`${watched ? 'Removed' : 'Added'} ${ev.region} · ${fam}`);
    } catch (err) { fail(err); }
});

// refresh every 5 minutes while the page is open
setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);

load();
