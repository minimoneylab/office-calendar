// =====================================================================
// Team page — add / remove people, short names, colours, order
// =====================================================================
renderSidebar('team');

let members = [];
let newColor = null;          // colour picked in the "Add a person" form
let openPicker = null;        // member id whose colour popover is open
const SHORT_MAX = 10;

function suggestShort(full) {
    const first = (full || '').trim().split(/\s+/)[0] || '';
    return first.slice(0, SHORT_MAX);
}
function initials(full) {
    return (full || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function shortClash(short, exceptId) {
    const s = short.trim().toLowerCase();
    return members.some(m => m.id !== exceptId && m.active && m.short_name.trim().toLowerCase() === s);
}
function firstUnusedColor() {
    const used = new Set(members.filter(m => m.active).map(m => memberColor(m)[0]));
    return (PALETTE.find(p => !used.has(p[0])) || PALETTE[members.length % PALETTE.length])[0];
}
function swatchRow(selected, attr) {
    return PALETTE.map(([k, bg, fg]) =>
        `<button type="button" class="swatch ${k === selected ? 'on' : ''}" ${attr}="${k}" title="${k}"
            style="background:${bg};border-color:${fg};"><span style="background:${fg};"></span></button>`).join('');
}

async function load() {
    try { members = await DB.members(); } catch (e) { fail(e); }
    if (!newColor) newColor = firstUnusedColor();
    render();
    renderNewForm();
}

function render() {
    const active = members.filter(m => m.active).length;
    document.getElementById('member-count').textContent = `Members · ${active} active${members.length > active ? `, ${members.length - active} off` : ''}`;
    const body = document.getElementById('member-body');
    if (!members.length) {
        body.innerHTML = `<tr><td colspan="7" class="empty-note">No one yet — add your first teammate above.</td></tr>`;
        return;
    }
    body.innerHTML = members.map((m, i) => {
        const [key, bg, fg] = memberColor(m);
        return `
        <tr class="${m.active ? '' : 'inactive'}" data-id="${m.id}">
            <td><span class="avatar" style="background:${bg};color:${fg};">${esc(initials(m.full_name))}</span></td>
            <td><input class="input" data-field="full_name" value="${esc(m.full_name)}" aria-label="Full name"></td>
            <td><input class="input short-input" data-field="short_name" value="${esc(m.short_name)}" maxlength="${SHORT_MAX}" aria-label="Short name"></td>
            <td class="color-cell">
                <button type="button" class="swatch on" data-open-picker title="Change colour" style="background:${bg};border-color:${fg};"><span style="background:${fg};"></span></button>
                ${openPicker === m.id ? `<div class="swatch-pop">${swatchRow(key, 'data-pick')}</div>` : ''}
            </td>
            <td>${pillHtml(m, 'L')}</td>
            <td><label class="switch"><input type="checkbox" data-field="active" ${m.active ? 'checked' : ''} aria-label="Active"><span class="track"></span></label></td>
            <td>
                <div class="row-actions">
                    <button class="icon-btn neutral" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up"><i class="ti ti-arrow-up"></i></button>
                    <button class="icon-btn neutral" data-move="1" ${i === members.length - 1 ? 'disabled' : ''} aria-label="Move down"><i class="ti ti-arrow-down"></i></button>
                    <button class="icon-btn" data-delete aria-label="Delete"><i class="ti ti-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ---------- Add ----------
const fullIn = document.getElementById('new-full');
const shortIn = document.getElementById('new-short');
let shortTouched = false;

function renderNewForm() {
    document.getElementById('new-swatches').innerHTML = swatchRow(newColor, 'data-new-color');
    updatePreview();
}
function updatePreview() {
    const s = shortIn.value.trim() || 'Chris';
    const el = document.getElementById('new-preview');
    el.innerHTML = `${esc(s)} <b>L</b>`;
    el.style.cssText = pillStyle({ color: newColor });
}
fullIn.addEventListener('input', () => {
    if (!shortTouched) shortIn.value = suggestShort(fullIn.value);
    updatePreview();
});
shortIn.addEventListener('input', () => { shortTouched = shortIn.value.trim() !== ''; updatePreview(); });
document.getElementById('new-swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-new-color]');
    if (!b) return;
    newColor = b.dataset.newColor;
    renderNewForm();
});

async function addMember() {
    const err = document.getElementById('add-err');
    err.textContent = '';
    const full = fullIn.value.trim();
    const short = shortIn.value.trim();
    if (!full) { err.textContent = 'Enter a full name.'; fullIn.focus(); return; }
    if (!short) { err.textContent = 'Enter a short name.'; shortIn.focus(); return; }
    if (shortClash(short)) { err.textContent = `"${short}" is already used — pick another short name so people can tell them apart.`; shortIn.focus(); return; }

    const btn = document.getElementById('add-member-btn');
    btn.disabled = true;
    try {
        const nextOrder = members.length ? Math.max(...members.map(m => m.sort_order)) + 1 : 0;
        await DB.addMember({ full_name: full, short_name: short, active: true, sort_order: nextOrder, color: newColor });
        toast(`Added ${short}`);
        fullIn.value = ''; shortIn.value = ''; shortTouched = false;
        newColor = null;
        await load();
        fullIn.focus();
    } catch (e) { fail(e); }
    btn.disabled = false;
}
document.getElementById('add-member-btn').addEventListener('click', addMember);
[fullIn, shortIn].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') addMember(); }));

// ---------- Edit inline (save on blur / Enter) ----------
const body = document.getElementById('member-body');

body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input.input')) e.target.blur();
});
body.addEventListener('focusout', async e => {
    const input = e.target;
    if (!input.matches('input.input')) return;
    const id = Number(input.closest('tr').dataset.id);
    const m = members.find(x => x.id === id);
    const field = input.dataset.field;
    const val = input.value.trim();
    if (val === m[field]) return;
    if (!val) { input.value = m[field]; toast('Name can’t be empty', true); return; }
    if (field === 'short_name' && shortClash(val, id)) { input.value = m[field]; toast(`"${val}" is already used`, true); return; }
    try {
        await DB.updateMember(id, { [field]: val });
        toast('Saved');
        await load();
    } catch (err) { input.value = m[field]; fail(err); }
});

body.addEventListener('change', async e => {
    if (e.target.dataset.field !== 'active') return;
    const id = Number(e.target.closest('tr').dataset.id);
    const m = members.find(x => x.id === id);
    const on = e.target.checked;
    if (on && shortClash(m.short_name, id)) { e.target.checked = false; toast(`Another active person is "${m.short_name}" — rename first`, true); return; }
    try {
        await DB.updateMember(id, { active: on });
        toast(on ? `${m.short_name} is active` : `${m.short_name} turned off`);
        await load();
    } catch (err) { fail(err); await load(); }
});

body.addEventListener('click', async e => {
    const row = e.target.closest('tr');
    if (!row) return;
    const id = Number(row.dataset.id);
    const idx = members.findIndex(x => x.id === id);

    // colour picker
    if (e.target.closest('[data-open-picker]')) {
        openPicker = openPicker === id ? null : id;
        render();
        return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
        const color = pick.dataset.pick;
        openPicker = null;
        try {
            await DB.updateMember(id, { color });
            toast('Colour saved');
            await load();
        } catch (err) {
            fail(/color/i.test(err.message || '') ? new Error('Run roster_migration_2.sql in Supabase first') : err);
            render();
        }
        return;
    }

    const mv = e.target.closest('[data-move]');
    if (mv && !mv.disabled) {
        const j = idx + Number(mv.dataset.move);
        if (j < 0 || j >= members.length) return;
        // rewrite sort_order 0..n-1 in the new order so swaps are always clean
        try {
            const ordered = members.slice();
            [ordered[idx], ordered[j]] = [ordered[j], ordered[idx]];
            await Promise.all(ordered.map((m, k) => m.sort_order === k ? null : DB.updateMember(m.id, { sort_order: k })));
            await load();
        } catch (err) { fail(err); }
        return;
    }

    if (e.target.closest('[data-delete]')) {
        const m = members[idx];
        if (!confirm(`Delete ${m.full_name}?\n\nThis also removes all of ${m.short_name}'s leave and biz-trip entries. To keep history, turn them off instead.`)) return;
        try {
            await DB.deleteMember(id);
            toast(`Deleted ${m.short_name}`);
            await load();
        } catch (err) { fail(err); }
    }
});

// close colour popover when clicking elsewhere
document.addEventListener('click', e => {
    if (openPicker !== null && !e.target.closest('.color-cell')) { openPicker = null; render(); }
});

load();
