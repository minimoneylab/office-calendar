// =====================================================================
// Calendar page — month view (Mon–Fri), add / remove / change leave
// A "period" = consecutive weekdays for the same person with the same
// type (e.g. Jim L from 7 Oct to 17 Oct). It can be removed or re-dated
// in one go.
// =====================================================================
renderSidebar('calendar');

const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),   // 0-based
    members: [],
    entries: [],                    // entries in the visible grid
    wide: [],                       // entries ±6 months around the open day (for periods)
    holidays: [],
    visible: COUNTRY_CODES.slice(),
    dayOpen: null,                  // 'YYYY-MM-DD' of the open modal
    addCode: 'L',
    editing: null,                  // entry id whose period is being edited
};

const memberById = id => state.members.find(m => m.id === id);
const codeLabel = c => (CODES.find(x => x.code === c) || {}).label || c;

// ---------- Grid range: Monday of the first weekday → Friday of the last weekday ----------
function gridRange(year, month) {
    let first = new Date(year, month, 1);
    while (isWeekend(first)) first = addDays(first, 1);
    let last = new Date(year, month + 1, 0);
    while (isWeekend(last)) last = addDays(last, -1);
    return { start: mondayOf(first), end: addDays(mondayOf(last), 4) };
}

async function load() {
    const { start, end } = gridRange(state.year, state.month);
    try {
        const [members, entries, holidays, visible] = await Promise.all([
            DB.members(),
            DB.entries(ymd(start), ymd(end)),
            DB.holidays(ymd(start), ymd(end)),
            DB.getSetting('visible_countries', COUNTRY_CODES),
        ]);
        state.members = members;
        state.entries = entries;
        state.holidays = holidays;
        state.visible = visible;
        if (state.dayOpen) await loadWide();
    } catch (e) { fail(e); }
    render();
    if (state.dayOpen) renderDayModal();
}

async function loadWide() {
    const d = parseYmd(state.dayOpen);
    state.wide = await DB.entries(ymd(addDays(d, -183)), ymd(addDays(d, 183)));
}

function sortByMember(list) {
    return list.filter(e => memberById(e.member_id)).sort((a, b) => {
        const ma = memberById(a.member_id), mb = memberById(b.member_id);
        return (ma.sort_order - mb.sort_order) || (ma.id - mb.id);
    });
}
const entriesOn = date => sortByMember(state.entries.filter(e => e.date === date));
function holidaysOn(date) {
    return state.holidays
        .filter(h => h.date === date && state.visible.includes(h.country))
        .sort((a, b) => COUNTRY_CODES.indexOf(a.country) - COUNTRY_CODES.indexOf(b.country));
}

// ---------- Period detection ----------
function periodOf(e) {
    const same = ds => state.wide.find(x => x.member_id === e.member_id && x.date === ds && x.code === e.code);
    const ids = [e.id];
    let start = e.date, end = e.date;
    for (let d = prevWeekday(parseYmd(e.date)); ; d = prevWeekday(d)) {
        const x = same(ymd(d)); if (!x) break; ids.push(x.id); start = x.date;
    }
    for (let d = nextWeekday(parseYmd(e.date)); ; d = nextWeekday(d)) {
        const x = same(ymd(d)); if (!x) break; ids.push(x.id); end = x.date;
    }
    return { start, end, ids };
}

// ---------- Render month ----------
function render() {
    document.getElementById('month-label').textContent = `${MONTH_FULL[state.month]} ${state.year}`;
    const { start, end } = gridRange(state.year, state.month);
    const today = todayYmd();
    let html = '';
    for (let wk = start; wk <= end; wk = addDays(wk, 7)) {
        html += '<div class="cal-week">';
        for (let i = 0; i < 5; i++) {
            const d = addDays(wk, i);
            const ds = ymd(d);
            const out = d.getMonth() !== state.month;
            html += `
                <div class="cell ${out ? 'out' : ''} ${ds === today ? 'today' : ''}" data-date="${ds}" tabindex="0">
                    <div class="cell-top">
                        <span class="dnum">${d.getDate()}</span>
                        ${holidaysOn(ds).map(h => `<span class="hol" title="${esc(COUNTRY_NAME[h.country] || h.country)}${h.name ? ' — ' + esc(h.name) : ''}">${esc(h.country)}</span>`).join('')}
                        <i class="ti ti-plus cell-add" aria-hidden="true"></i>
                    </div>
                    <div class="pills">
                        ${entriesOn(ds).map(e => pillHtml(memberById(e.member_id), e.code)).join('')}
                    </div>
                </div>`;
        }
        html += '</div>';
    }
    document.getElementById('cal-body').innerHTML = html;
    renderHolidayList();
}

function renderHolidayList() {
    const mStart = ymd(new Date(state.year, state.month, 1));
    const mEnd = ymd(new Date(state.year, state.month + 1, 0));
    const inMonth = state.holidays.filter(h => h.date >= mStart && h.date <= mEnd && state.visible.includes(h.country));
    document.getElementById('hol-list-title').textContent = `Bank holidays · ${MONTH_FULL[state.month]} ${state.year}`;
    const box = document.getElementById('hol-list');
    if (!inMonth.length) {
        box.innerHTML = `<div class="empty-note">No bank holidays entered for this month. Add them on the <a href="holidays.html">Bank holidays</a> page.</div>`;
        return;
    }
    const byDate = {};
    inMonth.forEach(h => (byDate[h.date] = byDate[h.date] || []).push(h));
    box.innerHTML = Object.keys(byDate).sort().map(d => `
        <div class="hol-row">
            <span class="d">${prettyDate(d)}</span>
            <span class="items">${byDate[d]
                .sort((a, b) => COUNTRY_CODES.indexOf(a.country) - COUNTRY_CODES.indexOf(b.country))
                .map(h => `<span><span class="hol">${esc(h.country)}</span>${esc(COUNTRY_NAME[h.country])}</span>`).join('')}
            </span>
        </div>`).join('');
}

// ---------- Day modal ----------
async function openDay(date) {
    state.dayOpen = date;
    state.addCode = 'L';
    state.editing = null;
    document.getElementById('add-until').value = date;
    document.getElementById('add-until').min = date;
    document.getElementById('add-err').textContent = '';
    try { await loadWide(); } catch (e) { fail(e); state.wide = state.entries.slice(); }
    renderDayModal();
    document.getElementById('day-overlay').classList.add('open');
}
function closeDay() {
    state.dayOpen = null;
    state.editing = null;
    document.getElementById('day-overlay').classList.remove('open');
}

function renderDayModal() {
    const date = state.dayOpen;
    document.getElementById('day-title').textContent = prettyDateLong(date);

    const ents = sortByMember(state.wide.filter(e => e.date === date));
    const activeCount = state.members.filter(m => m.active).length;
    document.getElementById('day-sub').textContent = `${ents.length} of ${activeCount} out`;

    const hols = holidaysOn(date);
    document.getElementById('day-hols-section').style.display = hols.length ? '' : 'none';
    document.getElementById('day-hols').innerHTML = `<div class="pills">${hols.map(h =>
        `<span style="display:inline-flex;gap:6px;align-items:center;margin-right:10px;"><span class="hol">${esc(h.country)}</span>${esc(COUNTRY_NAME[h.country])}</span>`).join('')}</div>`;

    document.getElementById('day-entries').innerHTML = ents.length
        ? ents.map(entryBlock).join('')
        : `<div class="empty-note">Nobody out — everyone's in.</div>`;

    // member dropdown (active only)
    const sel = document.getElementById('add-member');
    const prev = sel.value;
    const actives = state.members.filter(m => m.active);
    sel.innerHTML = actives.length
        ? actives.map(m => `<option value="${m.id}">${esc(m.short_name)} — ${esc(m.full_name)}</option>`).join('')
        : `<option value="">Add people on the Team page first</option>`;
    if (prev && actives.some(m => String(m.id) === prev)) sel.value = prev;

    // type segmented control
    document.getElementById('add-code').innerHTML = CODES.map(c =>
        `<button type="button" data-code="${c.code}" class="${c.code === state.addCode ? 'on' : ''}" title="${c.label}"><b>${c.code}</b> <span style="font-weight:400;opacity:.75;font-size:.78rem;">${c.code === 'Biz' ? 'trip' : c.code === 'L' ? 'leave' : 'half'}</span></button>`).join('');

    const fullDay = state.addCode === 'L' || state.addCode === 'Biz';
    document.getElementById('until-field').style.visibility = fullDay ? 'visible' : 'hidden';
    updateDaysHint();
}

function entryBlock(e) {
    const m = memberById(e.member_id);
    const p = periodOf(e);
    const n = p.ids.length;
    const span = n > 1 ? ` · ${dayMon(p.start)} – ${dayMon(p.end)} (${n} days)` : '';
    const editing = state.editing === e.id;
    return `
        <div class="entry-block" data-id="${e.id}">
            <div class="entry-line">
                <span class="entry-who">${pillHtml(m, e.code)}
                    <span class="entry-meta">${esc(m.full_name)} · ${codeLabel(e.code)}${span}</span></span>
                <span class="entry-actions">
                    <button class="icon-btn neutral" data-act="edit" title="Change dates or type" aria-label="Change dates or type"><i class="ti ti-pencil"></i></button>
                    <button class="icon-btn" data-act="del-day" title="${n > 1 ? 'Remove this day only' : 'Remove'}" aria-label="Remove this day"><i class="ti ti-trash"></i></button>
                </span>
            </div>
            ${n > 1 && !editing ? `<button class="link-btn danger" data-act="del-period">Remove all ${n} days (${dayMon(p.start)} – ${dayMon(p.end)})</button>` : ''}
            ${editing ? `
                <div class="period-editor">
                    <div class="field"><label>From</label><input type="date" class="input" data-f="from" value="${p.start}"></div>
                    <div class="field"><label>Until</label><input type="date" class="input" data-f="until" value="${p.end}"></div>
                    <div class="field"><label>Type</label>
                        <select class="input" data-f="code">${CODES.map(c => `<option value="${c.code}" ${c.code === e.code ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
                    </div>
                    <div class="period-editor-actions">
                        <button class="btn-secondary" data-act="edit-cancel">Cancel</button>
                        <button class="btn-primary" data-act="edit-save">Save</button>
                    </div>
                    <div class="err" data-f="err"></div>
                </div>` : ''}
        </div>`;
}

function datesToAdd() {
    const from = state.dayOpen;
    const fullDay = state.addCode === 'L' || state.addCode === 'Biz';
    const until = fullDay ? (document.getElementById('add-until').value || from) : from;
    if (until < from) return { error: '"Until" must be on or after the start date.' };
    const dates = weekdaysBetween(from, until);
    if (dates.length > 66) return { error: 'That range is too long (max ~3 months at a time).' };
    return { dates };
}
function updateDaysHint() {
    const r = datesToAdd();
    const hint = document.getElementById('add-days-hint');
    hint.textContent = r.error ? '' : (r.dates.length === 1 ? '1 weekday' : `${r.dates.length} weekdays (weekends skipped)`);
}

// ---------- Actions ----------
async function addEntry() {
    const errEl = document.getElementById('add-err');
    errEl.textContent = '';
    const memberId = Number(document.getElementById('add-member').value);
    if (!memberId) { errEl.textContent = 'Pick who first.'; return; }
    const r = datesToAdd();
    if (r.error) { errEl.textContent = r.error; return; }
    if (!r.dates.length) { errEl.textContent = 'No weekdays in that range.'; return; }

    const btn = document.getElementById('add-btn');
    btn.disabled = true;
    try {
        await DB.upsertEntries(r.dates.map(date => ({ member_id: memberId, date, code: state.addCode })));
        const m = memberById(memberId);
        toast(`Added ${m.short_name} ${state.addCode}${r.dates.length > 1 ? ` · ${r.dates.length} days` : ''}`);
        await load();
    } catch (e) { fail(e); }
    btn.disabled = false;
}

async function removeIds(ids, msg) {
    try {
        await DB.deleteEntries(ids);
        toast(msg);
        await load();
    } catch (e) { fail(e); }
}

async function savePeriod(block, e) {
    const get = f => block.querySelector(`[data-f="${f}"]`);
    const from = get('from').value, until = get('until').value, code = get('code').value;
    const err = get('err');
    if (!from || !until) { err.textContent = 'Pick both dates.'; return; }
    if (until < from) { err.textContent = '"Until" must be on or after "From".'; return; }
    const dates = weekdaysBetween(from, until);
    if (!dates.length) { err.textContent = 'No weekdays in that range.'; return; }
    if (dates.length > 66) { err.textContent = 'That range is too long (max ~3 months).'; return; }

    const p = periodOf(e);
    const m = memberById(e.member_id);
    try {
        // remove the old period, then write the new one
        await DB.deleteEntries(p.ids);
        await DB.upsertEntries(dates.map(date => ({ member_id: e.member_id, date, code })));
        state.editing = null;
        toast(`${m.short_name} ${code}: ${dayMon(from)} – ${dayMon(until)} (${dates.length} day${dates.length > 1 ? 's' : ''})`);
        // keep the modal on a day that still exists in the new period
        if (!dates.includes(state.dayOpen)) state.dayOpen = dates[0];
        const d = parseYmd(state.dayOpen);
        if (d.getMonth() !== state.month || d.getFullYear() !== state.year) { state.year = d.getFullYear(); state.month = d.getMonth(); }
        await load();
    } catch (ex) { fail(ex); await load(); }
}

// ---------- Events ----------
document.getElementById('cal-body').addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (cell) openDay(cell.dataset.date);
});
document.getElementById('cal-body').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('cell')) { e.preventDefault(); openDay(e.target.dataset.date); }
});
document.getElementById('day-entries').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const block = btn.closest('.entry-block');
    const entry = state.wide.find(x => x.id === Number(block.dataset.id));
    if (!entry) return;
    const m = memberById(entry.member_id);
    const act = btn.dataset.act;
    if (act === 'del-day') removeIds([entry.id], `Removed ${m.short_name} · ${dayMon(entry.date)}`);
    else if (act === 'del-period') {
        const p = periodOf(entry);
        removeIds(p.ids, `Removed ${m.short_name} ${entry.code} · ${dayMon(p.start)} – ${dayMon(p.end)}`);
    }
    else if (act === 'edit') { state.editing = state.editing === entry.id ? null : entry.id; renderDayModal(); }
    else if (act === 'edit-cancel') { state.editing = null; renderDayModal(); }
    else if (act === 'edit-save') savePeriod(block, entry);
});
document.getElementById('add-code').addEventListener('click', e => {
    const b = e.target.closest('[data-code]');
    if (!b) return;
    state.addCode = b.dataset.code;
    renderDayModal();
});
document.getElementById('add-until').addEventListener('input', updateDaysHint);
document.getElementById('add-btn').addEventListener('click', addEntry);
document.getElementById('day-close').addEventListener('click', closeDay);
document.getElementById('day-cancel').addEventListener('click', closeDay);
document.getElementById('day-overlay').addEventListener('click', e => { if (e.target.id === 'day-overlay') closeDay(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.dayOpen) closeDay(); });

function shiftMonth(n) {
    const d = new Date(state.year, state.month + n, 1);
    state.year = d.getFullYear(); state.month = d.getMonth();
    load();
}
document.getElementById('prev-btn').addEventListener('click', () => shiftMonth(-1));
document.getElementById('next-btn').addEventListener('click', () => shiftMonth(1));
document.getElementById('today-btn').addEventListener('click', () => {
    const t = new Date(); state.year = t.getFullYear(); state.month = t.getMonth(); load();
});

load();
