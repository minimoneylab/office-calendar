// =====================================================================
// Data layer — one API, two backends:
//   * live : Supabase (when js/supabase-client.js has real values)
//   * demo : browser localStorage with sample data
// Every function is async and throws on error.
// =====================================================================
const DB = (() => {
    const demo = typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || SUPABASE_URL.includes('YOUR_');

    // ------------------------------------------------------------ live
    function live() {
        const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const chk = ({ data, error }) => { if (error) throw error; return data; };
        const nowIso = () => new Date().toISOString();
        const mustChange = (rows, what) => {
            // Supabase returns [] (not an error) when RLS blocks an update.
            if (!rows || rows.length === 0) throw new Error(`${what} was not saved — check RLS policies in Supabase`);
            return rows;
        };
        return {
            members: async () => chk(await sb.from('roster_members').select('*').order('sort_order').order('id')),
            addMember: async (m) => chk(await sb.from('roster_members').insert(m).select().single()),
            updateMember: async (id, patch) => mustChange(chk(await sb.from('roster_members').update(patch).eq('id', id).select()), 'Member change'),
            deleteMember: async (id) => chk(await sb.from('roster_members').delete().eq('id', id)),

            entries: async (from, to) => chk(await sb.from('roster_entries').select('*').gte('date', from).lte('date', to)),
            upsertEntries: async (rows) => chk(await sb.from('roster_entries').upsert(rows, { onConflict: 'member_id,date' }).select()),
            deleteEntry: async (id) => chk(await sb.from('roster_entries').delete().eq('id', id)),
            deleteEntries: async (ids) => chk(await sb.from('roster_entries').delete().in('id', ids)),

            holidays: async (from, to) => chk(await sb.from('roster_holidays').select('*').gte('date', from).lte('date', to).order('date').order('country')),
            upsertHolidays: async (rows) => chk(await sb.from('roster_holidays')
                .upsert(rows.map(r => ({ ...r, updated_at: nowIso() })), { onConflict: 'date,country' }).select()),
            updateHoliday: async (id, patch) => mustChange(chk(await sb.from('roster_holidays')
                .update({ ...patch, updated_at: nowIso() }).eq('id', id).select()), 'Holiday change'),
            deleteHoliday: async (id) => chk(await sb.from('roster_holidays').delete().eq('id', id)),
            deleteHolidaysRange: async (country, from, to) => chk(await sb.from('roster_holidays')
                .delete().eq('country', country).gte('date', from).lte('date', to)),

            getSetting: async (key, fallback) => {
                const row = chk(await sb.from('roster_settings').select('value').eq('key', key).maybeSingle());
                return row ? row.value : fallback;
            },
            setSetting: async (key, value) => chk(await sb.from('roster_settings')
                .upsert({ key, value, updated_at: nowIso() }, { onConflict: 'key' })),

            // ---- economic calendar
            econEvents: async (fromIso, toIso) => fetchAll(() => sb.from('econ_events').select('*')
                .gte('date', fromIso).lt('date', toIso).order('date').order('region').order('id')),
            econCatalog: async () => fetchAll(() => sb.from('econ_catalog').select('*').order('region').order('std_name')),
            setWatch: async (region, names, watch) => mustChange(chk(await sb.from('econ_catalog')
                .update({ watch }).eq('region', region).in('std_name', names).select()), 'Watchlist change'),
        };

        // Supabase returns at most 1000 rows per request — page through bigger results
        async function fetchAll(makeQuery) {
            const out = [];
            for (let from = 0; ; from += 1000) {
                const rows = chk(await makeQuery().range(from, from + 999));
                out.push(...rows);
                if (rows.length < 1000) return out;
            }
        }
    }

    // ------------------------------------------------------------ demo
    function demoBackend() {
        const KEY = 'deskcal_demo_v2';
        let st = null;

        function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* in-memory only */ } }
        function load() {
            if (st) return st;
            try { const s = localStorage.getItem(KEY); if (s) { st = JSON.parse(s); return st; } } catch (e) { /* ignore */ }
            st = seed(); save(); return st;
        }
        function nid() { st.seq += 1; return st.seq; }
        function clone(x) { return JSON.parse(JSON.stringify(x)); }

        function seed() {
            const s = { seq: 100, members: [], entries: [], holidays: [], settings: { visible_countries: COUNTRY_CODES.slice() } };
            const names = [['Jim Wong', 'Jim'], ['Angus Lee', 'Angus'], ['Larry Chan', 'Larry'], ['Kelly Ho', 'Kelly'],
                           ['Mandy Lau', 'Mandy'], ['Tom Cheung', 'Tom'], ['Sandy Ng', 'Sandy'], ['Christopher Yip', 'Chris']];
            names.forEach(([full, short], i) => s.members.push({
                id: ++s.seq, full_name: full, short_name: short, active: true, sort_order: i, color: PALETTE[i % PALETTE.length][0],
            }));
            const mid = n => s.members.find(m => m.short_name === n).id;

            const now = new Date();
            const wd = [];
            for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d.getMonth() === now.getMonth(); d = addDays(d, 1)) {
                if (!isWeekend(d)) wd.push(ymd(d));
            }
            const add = (i, who, code) => { if (wd[i]) s.entries.push({ id: ++s.seq, member_id: mid(who), date: wd[i], code }); };
            add(1, 'Jim', 'L'); add(2, 'Jim', 'L'); add(2, 'Kelly', 'AM');
            add(4, 'Tom', 'Biz'); add(5, 'Tom', 'Biz');
            add(8, 'Angus', 'PM');
            add(9, 'Jim', 'L'); add(9, 'Angus', 'L'); add(9, 'Larry', 'Biz'); add(9, 'Kelly', 'AM'); add(9, 'Chris', 'L');
            add(13, 'Sandy', 'AM'); add(15, 'Larry', 'Biz'); add(16, 'Larry', 'Biz'); add(16, 'Mandy', 'L');
            add(18, 'Angus', 'L'); add(19, 'Angus', 'L');

            // Sample bank holidays (demo only): a few in this month + New Year / Christmas
            const hol = (date, c) => { if (date) s.holidays.push({ id: ++s.seq, date, country: c, name: '' }); };
            hol(wd[0], 'BR'); hol(wd[5], 'IN'); hol(wd[9], 'US'); hol(wd[9], 'ID');
            hol(wd[14], 'BR'); hol(wd[14], 'VN'); hol(wd[17], 'IN'); hol(wd[19], 'US');
            const y = now.getFullYear();
            [y, y + 1, y + 2].forEach(yr => {
                ['HK', 'TW', 'KR', 'JP', 'PH', 'ID', 'VN', 'MY', 'US', 'UK', 'BR'].forEach(c => hol(`${yr}-01-01`, c));
                ['HK', 'PH', 'ID', 'US', 'UK', 'BR'].forEach(c => hol(`${yr}-12-25`, c));
            });
            ['HK', 'UK'].forEach(c => hol(`${y}-12-26`, c));
            return s;
        }

        const inRange = (d, from, to) => d >= from && d <= to;
        return {
            members: async () => clone(load().members.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)),
            addMember: async (m) => { load(); const row = { id: nid(), active: true, sort_order: 0, ...m }; st.members.push(row); save(); return clone(row); },
            updateMember: async (id, patch) => { load(); const m = st.members.find(x => x.id === id); Object.assign(m, patch); save(); return [clone(m)]; },
            deleteMember: async (id) => { load(); st.members = st.members.filter(x => x.id !== id); st.entries = st.entries.filter(e => e.member_id !== id); save(); },

            entries: async (from, to) => clone(load().entries.filter(e => inRange(e.date, from, to))),
            upsertEntries: async (rows) => {
                load();
                rows.forEach(r => {
                    const ex = st.entries.find(e => e.member_id === r.member_id && e.date === r.date);
                    if (ex) ex.code = r.code; else st.entries.push({ id: nid(), ...r });
                });
                save(); return clone(rows);
            },
            deleteEntry: async (id) => { load(); st.entries = st.entries.filter(e => e.id !== id); save(); },
            deleteEntries: async (ids) => { load(); st.entries = st.entries.filter(e => !ids.includes(e.id)); save(); },

            holidays: async (from, to) => clone(load().holidays.filter(h => inRange(h.date, from, to))
                .sort((a, b) => a.date.localeCompare(b.date) || COUNTRY_CODES.indexOf(a.country) - COUNTRY_CODES.indexOf(b.country))),
            upsertHolidays: async (rows) => {
                load();
                rows.forEach(r => {
                    const ex = st.holidays.find(h => h.date === r.date && h.country === r.country);
                    if (ex) { if (r.name !== undefined) ex.name = r.name; }
                    else st.holidays.push({ id: nid(), name: '', ...r });
                });
                save(); return clone(rows);
            },
            updateHoliday: async (id, patch) => { load(); const h = st.holidays.find(x => x.id === id); Object.assign(h, patch); save(); return [clone(h)]; },
            deleteHoliday: async (id) => { load(); st.holidays = st.holidays.filter(h => h.id !== id); save(); },
            deleteHolidaysRange: async (country, from, to) => {
                load(); st.holidays = st.holidays.filter(h => !(h.country === country && h.date >= from && h.date <= to)); save();
            },

            getSetting: async (key, fallback) => { const v = load().settings[key]; return v === undefined ? fallback : clone(v); },
            setSetting: async (key, value) => { load(); st.settings[key] = clone(value); save(); },

            // ---- economic calendar (demo uses real TradingView sample data in js/demo-econ.js)
            econEvents: async (fromIso, toIso) => {
                const d = await demoEcon();
                return clone(d.events.filter(e => e.date >= fromIso && e.date < toIso));
            },
            econCatalog: async () => {
                const d = await demoEcon();
                const w = load().econWatch || {};
                return d.catalog.map(c => ({ ...c, watch: (`${c.region}|${c.std_name}` in w) ? w[`${c.region}|${c.std_name}`] : c.watch }));
            },
            setWatch: async (region, names, watch) => {
                load(); st.econWatch = st.econWatch || {};
                names.forEach(n => { st.econWatch[`${region}|${n}`] = watch; });
                save(); return names;
            },
        };
    }

    // Loads js/demo-econ.js only when needed (demo mode)
    let demoEconPromise = null;
    function demoEcon() {
        if (window.DEMO_ECON) return Promise.resolve(window.DEMO_ECON);
        if (!demoEconPromise) {
            demoEconPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'js/demo-econ.js?v=4';
                s.onload = () => resolve(expandDemo(window.DEMO_ECON_RAW));
                s.onerror = () => reject(new Error('Could not load demo economic data'));
                document.head.appendChild(s);
            });
        }
        return demoEconPromise;
    }
    function expandDemo(raw) {
        const events = raw.events.map(([id, date, region, title, period, actual, forecast, previous, unit]) =>
            ({ id, date, region, title, std_name: title, period, actual, forecast, previous, unit, scale: null, updated_at: raw.updated }));
        const catalog = raw.catalog.map(([region, std_name, watch, has_actual]) => ({ region, std_name, watch: !!watch, has_actual: !!has_actual }));
        window.DEMO_ECON = { events, catalog };
        return window.DEMO_ECON;
    }

    const api = demo ? demoBackend() : live();
    api.demo = demo;
    return api;
})();
