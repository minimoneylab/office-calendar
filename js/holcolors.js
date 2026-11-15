// =====================================================================
// Holiday colours — paints every bank-holiday tag (<span class="hol">HK</span>)
// in its region's colour, and tints whole calendar days for regions that
// have "shade whole day" switched on (HK by default).
// Saved in roster_settings: holiday_colors {HK:"#B3261E",…}, holiday_shade ["HK"].
// Load after data.js.
// =====================================================================
const HOL_DEFAULT = '#4A4234';
const HOL_PALETTE = ['#4A4234', '#B3261E', '#B4541A', '#8A6A0A', '#2E6B3A', '#1F6F78',
                     '#24497A', '#5B3E8C', '#A3305F', '#3E4550', '#111111'];

const HolColors = (() => {
    const st = { colors: {}, shade: ['HK'], ready: false };
    let queued = false;

    const colorOf = c => st.colors[c] || HOL_DEFAULT;
    const tint = (hex, a) => {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    };

    function paint() {
        queued = false;
        document.querySelectorAll('.hol').forEach(el => {
            if (el.closest('#w-jump')) return;
            const c = el.textContent.trim();
            if (!COUNTRY_CODES.includes(c)) return;
            const col = colorOf(c);
            if (el.dataset.hc === col) return;
            el.dataset.hc = col;
            el.style.background = col;
            el.style.borderColor = col;
            el.style.color = '#FFFFFF';
        });
        document.querySelectorAll('#cal-body .cell').forEach(cell => {
            let bg = '', bar = '';
            if (!cell.classList.contains('out')) {
                const code = [...cell.querySelectorAll('.cell-top .hol')]
                    .map(h => h.textContent.trim()).find(c => st.shade.includes(c));
                if (code) { bg = tint(colorOf(code), 0.15); bar = `inset 0 3px 0 ${colorOf(code)}`; }
            }
            if (cell.dataset.shade !== bg) {
                cell.dataset.shade = bg;
                cell.style.background = bg;
                cell.style.boxShadow = bar;
            }
        });
    }
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

    async function load() {
        try {
            const [colors, shade] = await Promise.all([
                DB.getSetting('holiday_colors', {}),
                DB.getSetting('holiday_shade', ['HK']),
            ]);
            st.colors = colors && typeof colors === 'object' ? colors : {};
            st.shade = Array.isArray(shade) ? shade : ['HK'];
        } catch (e) { /* keep defaults — colours are cosmetic */ }
        st.ready = true;
        document.querySelectorAll('.hol[data-hc]').forEach(el => delete el.dataset.hc);
        schedule();
    }
    const loaded = load();

    return {
        loaded,
        colorOf,
        shaded: c => st.shade.includes(c),
        async setColor(c, hex) {
            await loaded;
            st.colors = { ...st.colors, [c]: hex };
            schedule();
            await DB.setSetting('holiday_colors', st.colors);
        },
        async setShade(c, on) {
            await loaded;
            st.shade = on ? [...new Set([...st.shade, c])] : st.shade.filter(x => x !== c);
            schedule();
            await DB.setSetting('holiday_shade', st.shade);
        },
    };
})();
