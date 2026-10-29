// =====================================================================
// Bank holidays page — one panel per region, this year + next 2 years.
// Dates only (no names). Add / remove inline, paste a list per region.
// =====================================================================
renderSidebar('holidays');

const Y0 = new Date().getFullYear();
const YEARS = [Y0, Y0 + 1, Y0 + 2];
const FROM = `${Y0}-01-01`, TO = `${Y0 + 2}-12-31`;

const hs = {
    list: [],                        // all holidays in the 3-year window
    visible: COUNTRY_CODES.slice(),
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');

// ---------- Paste parsing: picks every date out of any text ----------
// Accepts 2027-01-01, 2027/1/1, 2027.01.01, 1 Jan 2027, 1st January 2027, Jan 1, 2027
function extractDates(text) {
    const found = new Set(), bad = [];
    const re = /(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})|(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})|([A-Za-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{4})/g;
    for (const m of text.matchAll(re)) {
        let y, mo, d;
        if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else if (m[4]) { d = +m[4]; mo = MONTHS[m[5].slice(0, 3).toLowerCase()]; y = +m[6]; }
        else { mo = MONTHS[m[7].slice(0, 3).toLowerCase()]; d = +m[8]; y = +m[9]; }
        if (!mo) continue;                                  // the word wasn't a month
        const s = `${y}-${pad(mo)}-${pad(d)}`;
        if (ymd(parseYmd(s)) !== s) { bad.push(m[0]); continue; }
        found.add(s);
    }
    return { dates: [...found].sort(), bad };
}

// ---------- Load ----------
async function load() {
    try {
        const [list, visible] = await Promise.all([
            DB.holidays(FROM, TO),
            DB.getSetting('visible_countries', COUNTRY_CODES),
        ]);
        hs.list = list;
        hs.visible = visible;
    } catch (e) { fail(e); }
    renderChips();
    COUNTRY_CODES.forEach(renderPanelBody);
}

const forCountry = c => hs.list.filter(h => h.country === c);
const forCountryYear = (c, y) => forCountry(c).filter(h => h.date.startsWith(`${y}-`)).sort((a, b) => a.date.localeCompare(b.date));

// ---------- Top chips (show on calendar / TRMNL) ----------
function renderChips() {
    document.getElementById('country-chips').innerHTML = COUNTRIES.map(([c, name]) => `
        <button class="cchip ${hs.visible.includes(c) ? 'on' : ''}" data-c="${c}" title="${esc(name)}">
            <span class="hol">${c}</span>${esc(name)}
        </button>`).join('');
    COUNTRY_CODES.forEach(c => {
        const badge = document.querySelector(`#r-${c} .vis-badge`);
        if (badge) {
            const on = hs.visible.includes(c);
            badge.textContent = on ? 'On calendar' : 'Hidden';
            badge.classList.toggle('off', !on);
        }
    });
}
document.getElementById('country-chips').addEventListener('click', async e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const c = b.dataset.c;
    const next = hs.visible.includes(c) ? hs.visible.filter(x => x !== c) : [...hs.visible, c];
    hs.visible = COUNTRY_CODES.filter(x => next.includes(x));   // keep canonical order
    renderChips();
    try { await DB.setSetting('visible_countries', hs.visible); }
    catch (err) { fail(err); await load(); }
});

// ---------- Panels (built once; only the body re-renders) ----------
function buildPanels() {
    document.getElementById('jump-row').innerHTML = `<span class="jump-label">Jump to</span>` +
        COUNTRIES.map(([c, n]) => `<a href="#r-${c}" class="hol" title="${esc(n)}">${c}</a>`).join('');

    document.getElementById('regions').innerHTML = COUNTRIES.map(([c, name]) => `
        <section class="region card" id="r-${c}" data-c="${c}">
            <div class="region-head">
                <span class="hol hol-lg">${c}</span>
                <h3>${esc(name)}</h3>
                <span class="vis-badge"></span>
                <span class="region-spacer"></span>
                <button class="btn-ghost" data-act="toggle-paste"><i class="ti ti-clipboard-text"></i>Paste dates</button>
                <button class="btn-ghost" data-act="copy"><i class="ti ti-copy"></i>Copy</button>
            </div>
            <div class="paste-box" hidden>
                <textarea class="input" rows="4" placeholder="Paste ${esc(name)} dates in any common format, e.g.
2027-01-01, 2027-02-17
1 Jan 2027
Feb 17, 2027"></textarea>
                <label class="check"><input type="checkbox" data-f="replace"> Replace everything already entered for ${esc(name)} in the year(s) pasted</label>
                <div class="parse-result" data-f="result">Dates are picked out automatically, so you can paste straight from a website, email or Excel.</div>
                <div class="paste-actions">
                    <button class="btn-secondary" data-act="paste-cancel">Cancel</button>
                    <button class="btn-primary" data-act="paste-import" disabled><i class="ti ti-upload"></i>Add dates</button>
                </div>
            </div>
            <div class="years" data-f="years"></div>
        </section>`).join('');
}

function renderPanelBody(c) {
    const panel = document.getElementById(`r-${c}`);
    const today = todayYmd();
    panel.querySelector('[data-f="years"]').innerHTML = YEARS.map(y => {
        const rows = forCountryYear(c, y);
        return `
            <div class="year-col" data-year="${y}">
                <div class="year-head"><span>${y}</span><span class="n">${rows.length || ''}</span></div>
                <div class="dates">
                    ${rows.length ? rows.map(h => {
                        const d = parseYmd(h.date);
                        const wk = isWeekend(d);
                        return `<span class="dchip ${h.date < today ? 'past' : ''} ${wk ? 'wkend' : ''}" title="${prettyDateLong(h.date)}${wk ? ' — weekend' : ''}">
                            <span class="dow">${DOW[d.getDay()]}</span>${d.getDate()} ${MON[d.getMonth()]}
                            <button class="x" data-del="${h.id}" aria-label="Remove ${prettyDateLong(h.date)}">×</button>
                        </span>`;
                    }).join('') : `<span class="empty-year">None yet</span>`}
                </div>
                <div class="add-date">
                    <input type="date" class="input" min="${y}-01-01" max="${y}-12-31" aria-label="Add a ${y} date">
                    <button class="btn-secondary" data-act="add" aria-label="Add date"><i class="ti ti-plus"></i>Add</button>
                </div>
            </div>`;
    }).join('');
}

// ---------- Panel actions ----------
const regionsEl = document.getElementById('regions');

regionsEl.addEventListener('click', async e => {
    const panel = e.target.closest('.region');
    if (!panel) return;
    const c = panel.dataset.c;

    // remove one date
    const del = e.target.closest('[data-del]');
    if (del) {
        const id = Number(del.dataset.del);
        const h = hs.list.find(x => x.id === id);
        try {
            await DB.deleteHoliday(id);
            hs.list = hs.list.filter(x => x.id !== id);
            renderPanelBody(c);
            toast(`Removed ${c} · ${prettyDateLong(h.date)}`);
        } catch (err) { fail(err); }
        return;
    }

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;

    if (act === 'add') {
        const col = e.target.closest('.year-col');
        await addOne(c, col.querySelector('input[type=date]'));
    } else if (act === 'toggle-paste') {
        const box = panel.querySelector('.paste-box');
        box.hidden = !box.hidden;
        if (!box.hidden) box.querySelector('textarea').focus();
    } else if (act === 'paste-cancel') {
        resetPaste(panel);
    } else if (act === 'paste-import') {
        await importPaste(panel, c);
    } else if (act === 'copy') {
        const text = forCountry(c).map(h => h.date).sort().join('\n');
        if (!text) { toast('Nothing to copy yet'); return; }
        try { await navigator.clipboard.writeText(text); toast(`Copied ${forCountry(c).length} ${c} dates`); }
        catch (err) { toast('Clipboard blocked by the browser', true); }
    }
});

regionsEl.addEventListener('keydown', async e => {
    if (e.key === 'Enter' && e.target.matches('.add-date input')) {
        const panel = e.target.closest('.region');
        await addOne(panel.dataset.c, e.target);
    }
});

async function addOne(c, input) {
    const date = input.value;
    if (!date) { toast('Pick a date first', true); input.focus(); return; }
    if (hs.list.some(h => h.country === c && h.date === date)) { toast(`${c} · ${dayMon(date)} is already there`); return; }
    try {
        await DB.upsertHolidays([{ date, country: c }]);
        await reloadList();
        renderPanelBody(c);
        toast(`Added ${c} · ${prettyDateLong(date)}`);
        const again = document.querySelector(`#r-${c} .year-col[data-year="${date.slice(0, 4)}"] input[type=date]`);
        if (again) again.focus();
    } catch (err) { fail(err); }
}

async function reloadList() { hs.list = await DB.holidays(FROM, TO); }

// paste preview
regionsEl.addEventListener('input', e => {
    if (!e.target.matches('.paste-box textarea')) return;
    const panel = e.target.closest('.region');
    const { dates, bad } = extractDates(e.target.value);
    const c = panel.dataset.c;
    const existing = new Set(forCountry(c).map(h => h.date));
    const fresh = dates.filter(d => !existing.has(d));
    const outside = dates.filter(d => d < FROM || d > TO);
    const years = [...new Set(dates.map(d => d.slice(0, 4)))];
    const res = panel.querySelector('[data-f="result"]');
    const btn = panel.querySelector('[data-act="paste-import"]');
    if (!e.target.value.trim()) {
        res.innerHTML = 'Dates are picked out automatically, so you can paste straight from a website, email or Excel.';
        btn.disabled = true; return;
    }
    res.innerHTML = dates.length
        ? `Found <b>${dates.length}</b> date${dates.length > 1 ? 's' : ''} in ${years.join(', ')} · <b>${fresh.length}</b> new, ${dates.length - fresh.length} already there` +
          (outside.length ? `<br><span class="bad">${outside.length} outside ${Y0}–${Y0 + 2} will be saved but not shown here.</span>` : '') +
          (bad.length ? `<br><span class="bad">Skipped (not real dates): ${bad.slice(0, 4).map(esc).join(', ')}${bad.length > 4 ? '…' : ''}</span>` : '')
        : `<span class="bad">No dates found. Try a format like 2027-01-01 or 1 Jan 2027.</span>`;
    btn.disabled = dates.length === 0;
    btn.innerHTML = `<i class="ti ti-upload"></i>Add ${dates.length || ''} date${dates.length === 1 ? '' : 's'}`;
});

async function importPaste(panel, c) {
    const ta = panel.querySelector('textarea');
    const { dates } = extractDates(ta.value);
    if (!dates.length) return;
    const replace = panel.querySelector('[data-f="replace"]').checked;
    const years = [...new Set(dates.map(d => d.slice(0, 4)))].sort();
    if (replace) {
        const toGo = forCountry(c).filter(h => years.includes(h.date.slice(0, 4)) && !dates.includes(h.date)).length;
        if (!confirm(`Replace ${COUNTRY_NAME[c]} ${years.join(', ')}?\n\n${dates.length} pasted date(s) will be kept or added${toGo ? ` and ${toGo} other existing date(s) in ${years.join(', ')} will be removed` : ''}.`)) return;
    }
    const btn = panel.querySelector('[data-act="paste-import"]');
    btn.disabled = true;
    try {
        if (replace) for (const y of years) await DB.deleteHolidaysRange(c, `${y}-01-01`, `${y}-12-31`);
        await DB.upsertHolidays(dates.map(date => ({ date, country: c })));
        await reloadList();
        renderPanelBody(c);
        resetPaste(panel);
        toast(`${replace ? 'Replaced' : 'Added'} ${c} · ${dates.length} date${dates.length > 1 ? 's' : ''}`);
    } catch (err) { fail(err); btn.disabled = false; }
}

function resetPaste(panel) {
    const box = panel.querySelector('.paste-box');
    box.querySelector('textarea').value = '';
    box.querySelector('[data-f="replace"]').checked = false;
    box.querySelector('textarea').dispatchEvent(new Event('input', { bubbles: true }));
    box.hidden = true;
}

buildPanels();
load();
