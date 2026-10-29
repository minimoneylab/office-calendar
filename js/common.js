// =====================================================================
// Shared constants, date helpers, sidebar, toast
// =====================================================================
const COUNTRIES = [
    ['HK', 'Hong Kong'], ['TW', 'Taiwan'], ['KR', 'Korea'], ['JP', 'Japan'],
    ['PH', 'Philippines'], ['IN', 'India'], ['ID', 'Indonesia'], ['VN', 'Vietnam'],
    ['MY', 'Malaysia'], ['US', 'United States'], ['UK', 'United Kingdom'], ['BR', 'Brazil'],
];
const COUNTRY_CODES = COUNTRIES.map(c => c[0]);
const COUNTRY_NAME = Object.fromEntries(COUNTRIES);

// Economic calendar regions (G10 + Asia / EM)
const ECON_REGIONS = [
    ['US', 'United States'], ['EU', 'Euro Area'], ['JP', 'Japan'], ['UK', 'United Kingdom'],
    ['CN', 'China'], ['AU', 'Australia'], ['CA', 'Canada'], ['CH', 'Switzerland'], ['NZ', 'New Zealand'],
    ['HK', 'Hong Kong'], ['TW', 'Taiwan'], ['KR', 'Korea'], ['IN', 'India'], ['ID', 'Indonesia'],
    ['PH', 'Philippines'], ['MY', 'Malaysia'], ['VN', 'Vietnam'], ['BR', 'Brazil'],
];
const ECON_CODES = ECON_REGIONS.map(r => r[0]);
const ECON_NAME = Object.fromEntries(ECON_REGIONS);

// "GDP Growth Rate QoQ Adv" and "... Final" belong to the same family
function econFamily(name) {
    return String(name || '').replace(/\s+(Adv|Prel|Flash|Final|2nd Est|3rd Est)$/i, '').trim();
}

// Hong Kong time helpers (UTC+8, no daylight saving)
const HKT_MS = 8 * 3600 * 1000;
function hkt(dateIso) {                         // -> {ymd, hm}
    const d = new Date(new Date(dateIso).getTime() + HKT_MS);
    const p = n => String(n).padStart(2, '0');
    return {
        ymd: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
        hm: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
    };
}
function hktTodayYmd() { return hkt(new Date().toISOString()).ymd; }
function hktMidnightUtcIso(ymdStr) {            // HKT 00:00 of that day, as a UTC ISO string
    const [y, m, d] = ymdStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) - HKT_MS).toISOString();
}

const CODES = [
    { code: 'L',   label: 'Leave' },
    { code: 'Biz', label: 'Biz trip' },
    { code: 'AM',  label: 'Morning off' },
    { code: 'PM',  label: 'Afternoon off' },
];
const CODE_ORDER = { L: 0, Biz: 1, AM: 2, PM: 3 };

// Member colours: [key, background, text]
const PALETTE = [
    ['teal',     '#DCEBEF', '#1F5361'],
    ['sand',     '#F4E6D6', '#7E4A22'],
    ['sage',     '#E6EDDA', '#4A5E2C'],
    ['rose',     '#F6E0E0', '#8A3434'],
    ['lavender', '#E8E3F4', '#4B3C78'],
    ['sky',      '#DDE8F6', '#24497A'],
    ['butter',   '#F8EDC9', '#6E5410'],
    ['mint',     '#DAF0E5', '#1E6146'],
    ['peach',    '#FADFCF', '#8E4220'],
    ['slate',    '#E4E6EA', '#3E4550'],
    ['plum',     '#F1DDEB', '#7A2E62'],
    ['olive',    '#EBEAD3', '#575519'],
];
function memberColor(m) {
    const picked = m && m.color && PALETTE.find(p => p[0] === m.color);
    return picked || PALETTE[((m && m.id) || 0) % PALETTE.length];
}
function pillStyle(m) { const p = memberColor(m); return `background:${p[1]};color:${p[2]};`; }
function pillHtml(m, code) {
    return `<span class="pill" style="${pillStyle(m)}" title="${esc(m.full_name)}">${esc(m.short_name)} <b>${esc(code)}</b></span>`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// --- Local-date helpers (never use toISOString for dates: timezone bug) ---
function ymd(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
}
function parseYmd(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function isWeekend(d) { const w = d.getDay(); return w === 0 || w === 6; }
function mondayOf(d) { const w = d.getDay(); return addDays(d, w === 0 ? -6 : 1 - w); }
function todayYmd() { return ymd(new Date()); }
function prettyDate(s) { const d = parseYmd(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; }
function dayMon(s) { const d = parseYmd(s); return `${d.getDate()} ${MON[d.getMonth()]}`; }
function prevWeekday(d) { let x = addDays(d, -1); while (isWeekend(x)) x = addDays(x, -1); return x; }
function nextWeekday(d) { let x = addDays(d, 1); while (isWeekend(x)) x = addDays(x, 1); return x; }
function weekdaysBetween(from, until) {
    const out = [];
    for (let d = parseYmd(from); ymd(d) <= until; d = addDays(d, 1)) if (!isWeekend(d)) out.push(ymd(d));
    return out;
}
function prettyDateLong(s) { const d = parseYmd(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; }

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Toast ---
let toastTimer = null;
function toast(msg, isError = false) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 4000 : 2200);
}
function fail(e) {
    console.error(e);
    toast(e && e.message ? `Error: ${e.message}` : 'Something went wrong', true);
}

// --- Sidebar ---
function renderSidebar(active) {
    const links = [
        ['index.html', 'calendar', 'ti-calendar-month', 'Team calendar'],
        ['econ.html', 'econ', 'ti-chart-line', 'Economic calendar'],
        ['econ-watch.html', 'watch', 'ti-star', 'Watchlist'],
        ['team.html', 'team', 'ti-users', 'Team'],
        ['holidays.html', 'holidays', 'ti-world', 'Bank holidays'],
    ];
    document.getElementById('sidebar').innerHTML = `
        <div class="sidebar-header">
            <div class="brand">
                <img src="images/logo.png" class="brand-logo" alt="" onerror="this.remove()">
                <span class="wordmark">DeskCal</span>
            </div>
            <div class="sidebar-tagline">Who's out, and which markets are shut.</div>
        </div>
        <nav class="nav">
            ${links.map(([href, key, icon, label]) => `
                <a class="nav-button ${key === active ? 'active' : ''}" href="${href}">
                    <i class="ti ${icon}" aria-hidden="true"></i>${label}
                </a>`).join('')}
        </nav>
        <div class="sidebar-foot">CA Trading · minimoneylab</div>`;

    if (DB.demo) {
        const main = document.querySelector('.main-content');
        const b = document.createElement('div');
        b.className = 'demo-banner';
        b.innerHTML = `<i class="ti ti-flask" aria-hidden="true"></i>
            <span><b>Demo mode</b> — sample data saved only in this browser. Put your Supabase URL and key in
            <code>js/supabase-client.js</code> to go live.</span>`;
        main.prepend(b);
    }
}
