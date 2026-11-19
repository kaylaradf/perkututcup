(function () {
  "use strict";
  if (!window.Router) return;

  var state = { ac: null };
  var usersCache = new Map(); // key: full query string, value: {t, data}; TTL 30s, stale-while-revalidate

  function pageCss() {
    return '' +
'    .admin-table-wrap{overflow-x:auto;overflow-y:auto;max-height:60vh;margin-top:1.2rem;border:1px solid var(--dash-border-mid);border-radius:12px;background:var(--dash-card)}' + "\n" +
'    .admin-table{width:100%;border-collapse:collapse;font-size:.8rem;text-align:left}' + "\n" +
'    .admin-table th,.admin-table td{padding:.85rem 1rem;border-bottom:1px solid var(--dash-border-subtle);vertical-align:top}' + "\n" +
'    .admin-table th{background:rgba(255,232,217,.04);color:var(--dash-text-muted);font-family:var(--font-mono);font-size:.65rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700}' + "\n" +
'    .admin-table tr:last-child td{border-bottom:none}' + "\n" +
'    .role-badge{display:inline-flex;padding:.2rem .55rem;border-radius:6px;font-size:.65rem;font-weight:700;font-family:var(--font-mono);text-transform:uppercase;border:1px solid var(--dash-border-mid)}' + "\n" +
'    .role-admin{color:#bf8fee;background:rgba(134,68,162,.16);border-color:rgba(134,68,162,.3)}' + "\n" +
'    .role-user{color:var(--dash-text-body);background:rgba(255,232,217,.06)}' + "\n" +
'    .role-jury{color:#f1c40f;background:rgba(241,196,15,.14);border-color:rgba(241,196,15,.3)}' + "\n" +
'    .btn-admin{display:inline-flex;align-items:center;gap:5px;padding:.35rem .75rem;border:1px solid var(--dash-border-mid);border-radius:8px;background:rgba(255,232,217,.06);color:var(--dash-text-body);font-family:var(--font-mono);font-size:.7rem;cursor:pointer}' + "\n" +
'    .btn-admin:hover{background:var(--dash-nav-hover);color:var(--dash-text-primary)}' + "\n" +
'    .admin-modal{position:fixed;inset:0;background:rgba(11,12,16,.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1.5rem;z-index:1000;opacity:0;pointer-events:none;transition:opacity 200ms ease}' + "\n" +
'    .admin-modal.is-open{opacity:1;pointer-events:auto}' + "\n" +
'    .admin-modal-card{width:100%;max-width:640px;max-height:90vh;overflow-y:auto;background:var(--dash-surface);border:1px solid var(--dash-border-mid);border-radius:18px;padding:1.8rem;box-shadow:0 20px 45px rgba(0,0,0,.5)}' + "\n" +
'    .admin-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;padding-bottom:.8rem;border-bottom:1px solid var(--dash-border-subtle)}' + "\n" +
'    .admin-modal-head h3{margin:0;font-size:1.1rem;color:var(--dash-text-primary)}' + "\n" +
'    .btn-close-modal{background:none;border:none;color:var(--dash-text-muted);font-size:1.4rem;cursor:pointer;line-height:1;padding:0 .3rem}' + "\n" +
'    .form-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:1rem}' + "\n" +
'    @media (max-width:640px){.form-grid-2{grid-template-columns:1fr}}' + "\n" +
'    .field select.input{appearance:none;-webkit-appearance:none;padding-right:36px;cursor:pointer}' + "\n" +
'    .unauthorized-card{padding:2.5rem;text-align:center;border:1px solid rgba(231,76,60,.3);border-radius:16px;background:rgba(231,76,60,.08);margin-top:2rem}' + "\n" +
'    .unauthorized-card h2{color:#e74c3c;margin-bottom:.8rem}' + "\n" +
'    .toolbar{display:flex;gap:.75rem;flex-wrap:wrap;align-items:end;margin-top:1rem}' + "\n" +
'    .toolbar .field{min-width:220px;flex:1}' + "\n" +
'    .admin-table thead th{position:sticky;top:0;z-index:2;background:var(--dash-card) linear-gradient(rgba(255,232,217,.04),rgba(255,232,217,.04));box-shadow:inset 0 -1px 0 var(--dash-border-subtle)}' + "\n" +
'    .admin-table tbody tr:nth-child(even){background:rgba(255,232,217,.02)}' + "\n" +
'    .th-sort{background:none;border:none;padding:0;color:inherit;font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:3px}' + "\n" +
'    .admin-table th svg{width:.7rem;height:.7rem}' + "\n" +
'    .btn-admin svg{width:.8rem;height:.8rem}' + "\n" +
'    .btn-admin:disabled{opacity:.4;cursor:default}' + "\n" +
'    .table-pager{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:.8rem;font-size:.75rem;color:var(--dash-text-muted);font-family:var(--font-mono)}' + "\n" +
'    .table-pager select.input{width:auto;padding:.3rem .6rem;font-size:.72rem}';
  }

  function mainMarkup() {
    return '' +
'    <main class="dash-main">' + "\n" +
'      <div id="admin-view" hidden>' + "\n" +
'        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">' + "\n" +
'          <div>' + "\n" +
'            <h1 class="dash-page-title" style="margin-bottom:0.25rem;">Admin · Kelola Pengguna</h1>' + "\n" +
'            <p class="dash-page-sub">Admin seed dapat menambah pengguna, mengubah role, mereset password, dan melihat info pengguna. Password/hash tidak ditampilkan.</p>' + "\n" +
'          </div>' + "\n" +
'          <button class="btn-save" id="btn-add-user" type="button" style="padding:0.6rem 1.1rem; font-size:0.75rem;">+ TAMBAH PENGGUNA</button>' + "\n" +
'        </div>' + "\n" +
'' + "\n" +
'        <section class="card">' + "\n" +
'          <div class="card-head"><h2>DAFTAR PENGGUNA</h2></div>' + "\n" +
'          <form class="toolbar" id="search-form">' + "\n" +
'            <label class="field"><span>CARI NAMA / EMAIL</span><input class="input" type="search" id="search-q" placeholder="contoh: ari atau ari@example.com" /></label>' + "\n" +
'            <button class="btn-upload" type="submit">CARI</button>' + "\n" +
'            <button class="btn-upload" type="button" id="search-reset">RESET</button>' + "\n" +
'            <button class="btn-admin" type="button" id="users-refresh" aria-label="Muat ulang" title="Muat ulang (abaikan cache)"><i data-lucide="refresh-cw"></i></button>' + "\n" +
'          </form>' + "\n" +
'          <div class="admin-table-wrap">' + "\n" +
'            <table class="admin-table">' + "\n" +
'              <thead><tr><th data-sort="id"><button type="button" class="th-sort">ID <span class="sort-ind" aria-hidden="true"></span></button></th><th data-sort="full_name"><button type="button" class="th-sort">Nama &amp; Email <span class="sort-ind" aria-hidden="true"></span></button></th><th data-sort="role"><button type="button" class="th-sort">Role <span class="sort-ind" aria-hidden="true"></span></button></th><th>Institusi</th><th data-sort="created_at"><button type="button" class="th-sort">Dibuat <span class="sort-ind" aria-hidden="true"></span></button></th><th>Aksi</th></tr></thead>' + "\n" +
'              <tbody id="users-tbody"><tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--dash-text-muted);">Memuat data pengguna…</td></tr></tbody>' + "\n" +
'            </table>' + "\n" +
'          </div>' + "\n" +
'          <div class="table-pager">' + "\n" +
'            <label style="display:inline-flex;align-items:center;gap:.4rem;">PER HALAMAN <select class="input" id="page-size"><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>' + "\n" +
'            <button class="btn-admin" type="button" id="page-prev" aria-label="Halaman sebelumnya"><i data-lucide="chevron-left"></i></button>' + "\n" +
'            <span id="page-info" role="status" aria-live="polite">Halaman 1 / 1</span>' + "\n" +
'            <button class="btn-admin" type="button" id="page-next" aria-label="Halaman berikutnya"><i data-lucide="chevron-right"></i></button>' + "\n" +
'          </div>' + "\n" +
'          <p class="dash-status" id="list-status" role="status" aria-live="polite"></p>' + "\n" +
'        </section>' + "\n" +
'      </div>' + "\n" +
'' + "\n" +
'      <div id="unauthorized-view" class="unauthorized-card" hidden>' + "\n" +
'        <h2>Akses Ditolak (403 Forbidden)</h2>' + "\n" +
'        <p>Halaman ini dikhususkan untuk Administrator Perkutut Cup 2026.</p>' + "\n" +
'        <a class="btn-save" href="/dashboard/profile/" style="display:inline-block; text-decoration:none; padding:0.6rem 1.2rem;">Kembali ke Dashboard Profil</a>' + "\n" +
'      </div>' + "\n" +
'    </main>';
  }

  function modalMarkup() {
    return '' +
'  <div class="admin-modal" id="user-modal" aria-hidden="true">' + "\n" +
'    <div class="admin-modal-card">' + "\n" +
'      <div class="admin-modal-head"><h3 id="user-modal-title">Pengguna</h3><button class="btn-close-modal" id="user-modal-close" type="button" aria-label="Tutup">&times;</button></div>' + "\n" +
'      <form id="user-form" class="dash-form" novalidate>' + "\n" +
'        <div class="form-grid-2">' + "\n" +
'          <label class="field" id="field-name-wrap"><span>NAMA LENGKAP</span><input class="input" type="text" id="field-name" maxlength="100" /></label>' + "\n" +
'          <label class="field" id="field-email-wrap"><span>EMAIL</span><input class="input" type="email" id="field-email" /></label>' + "\n" +
'        </div>' + "\n" +
'        <div class="form-grid-2">' + "\n" +
'          <label class="field"><span>ROLE</span>' + "\n" +
'            <select class="input" id="field-role">' + "\n" +
'              <option value="user">user</option>' + "\n" +
'              <option value="admin">admin</option>' + "\n" +
'              <option value="jury">jury</option>' + "\n" +
'            </select>' + "\n" +
'          </label>' + "\n" +
'          <label class="field"><span>PASSWORD</span><input class="input" type="password" id="field-password" autocomplete="new-password" placeholder="Kosongkan jika tidak diubah" /></label>' + "\n" +
'        </div>' + "\n" +
'        <p class="proof-hint" id="password-hint">Password mengikuti kebijakan aplikasi. Password/hash tidak pernah ditampilkan kembali.</p>' + "\n" +
'        <div id="jury-comp-wrap" class="field" hidden style="margin-top:0.8rem;">' + "\n" +
'          <span>CABANG KOMPETISI YANG DIAMPU (KHUSUS JURI)</span>' + "\n" +
'          <div id="jury-comp-checkboxes" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:0.4rem; padding:0.6rem; border:1px solid var(--dash-border-mid); border-radius:8px; background:var(--dash-upload-item-bg);"></div>' + "\n" +
'        </div>' + "\n" +
'        <div id="user-info" class="proof-hint" hidden></div>' + "\n" +
'        <div style="display:flex; justify-content:flex-end; gap:0.8rem; margin-top:1.5rem;">' + "\n" +
'          <button class="btn-upload" type="button" id="user-modal-cancel">BATAL</button>' + "\n" +
'          <button class="btn-save" type="submit" id="user-modal-submit">SIMPAN</button>' + "\n" +
'        </div>' + "\n" +
'        <p class="dash-status" id="user-modal-status" role="status" aria-live="polite" style="margin-top:0.8rem; text-align:right;"></p>' + "\n" +
'      </form>' + "\n" +
'    </div>' + "\n" +
'  </div>';
  }

  function render(container) {
    container.innerHTML = '<style>' + pageCss() + '</style>' + '<div class="dash">' + window.DashCommon.renderAside('users') + mainMarkup() + '</div>' + modalMarkup();
  }

  function onEnter(container) {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = new AbortController();
    var signal = state.ac.signal;
    window.DashCommon.initTheme(container, signal);
    window.DashCommon.initLogout(container, signal);

    var adminView = container.querySelector('#admin-view'), unauthView = container.querySelector('#unauthorized-view'), tbody = container.querySelector('#users-tbody'), listStatus = container.querySelector('#list-status'), userNameEl = container.querySelector('[data-user-name]');
    var modal = container.querySelector('#user-modal'), modalTitle = container.querySelector('#user-modal-title'), form = container.querySelector('#user-form'), modalStatus = container.querySelector('#user-modal-status'), userInfo = container.querySelector('#user-info');
    var fName = container.querySelector('#field-name'), fEmail = container.querySelector('#field-email'), fRole = container.querySelector('#field-role'), fPass = container.querySelector('#field-password');
    var juryCompWrap = container.querySelector('#jury-comp-wrap'), juryCompBox = container.querySelector('#jury-comp-checkboxes');
    var mode = 'create', editingId = null, users = [], allComps = [], juryAssignments = {};
    function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
    function closeModal(){ modal.classList.remove('is-open'); modal.setAttribute('aria-hidden','true'); }

    function updateJuryCompVisibility() {
      if (juryCompWrap) juryCompWrap.hidden = (fRole.value !== 'jury');
    }
    fRole.addEventListener('change', updateJuryCompVisibility, { signal: signal });

    function renderCompCheckboxes(selectedIds) {
      if (!juryCompBox) return;
      selectedIds = selectedIds || [];
      juryCompBox.innerHTML = allComps.map(function(c) {
        var checked = selectedIds.indexOf(c.id) !== -1 ? ' checked' : '';
        return '<label style="display:inline-flex; align-items:center; gap:5px; font-size:0.75rem; cursor:pointer; margin-right:8px;"><input type="checkbox" value="' + c.id + '"' + checked + ' /> ' + esc(c.name) + '</label>';
      }).join('');
    }

    function openModal(nextMode, user){
      mode = nextMode; editingId = user ? user.id : null; modalStatus.textContent=''; userInfo.hidden = true; fPass.value=''; form.reset(); fRole.value = user ? (user.role || 'user') : 'user';
      updateJuryCompVisibility();
      var assignedCids = (user && juryAssignments[user.id]) ? juryAssignments[user.id].map(function(c){ return c.id; }) : [];
      renderCompCheckboxes(assignedCids);

      if (mode === 'create') {
        modalTitle.textContent='Tambah Pengguna'; fName.disabled=false; fEmail.disabled=false; fName.required=true; fEmail.required=true; fPass.required=true;
        container.querySelector('#password-hint').textContent='Password wajib diisi untuk pengguna baru dan mengikuti kebijakan aplikasi.';
      } else {
        modalTitle.textContent = 'Ubah Pengguna #' + user.id; fName.value=user.full_name||''; fEmail.value=user.email||''; fName.disabled=true; fEmail.disabled=true; fName.required=false; fEmail.required=false; fPass.required=false;
        container.querySelector('#password-hint').textContent='Kosongkan password jika tidak ingin mereset. Password/hash tidak pernah ditampilkan.';
        userInfo.hidden=false; userInfo.textContent='ID: '+user.id+' · Email: '+(user.email||'-')+' · Dibuat: '+(user.created_at||'-')+(user.institution?' · Institusi: '+user.institution:'');
      }
      modal.classList.add('is-open'); modal.setAttribute('aria-hidden','false');
    }
    container.querySelector('#user-modal-close').addEventListener('click', closeModal, { signal: signal }); container.querySelector('#user-modal-cancel').addEventListener('click', closeModal, { signal: signal }); container.querySelector('#btn-add-user').addEventListener('click', function(){ openModal('create'); }, { signal: signal });

    (async function () {
      try {
        var sessionRes = await fetch('/api/auth/session', { credentials:'same-origin', signal: signal });
        var sessionData = await sessionRes.json();
        if (!sessionData.authenticated || !sessionData.user || !['admin','superadmin'].includes(sessionData.user.role)) { unauthView.hidden=false; return; }
        if (userNameEl) userNameEl.textContent = sessionData.user.full_name || 'Admin Portal';
        adminView.hidden = false;

        // Fetch competitions catalog for jury assignment
        fetch('/api/competitions', { credentials:'same-origin', signal: signal })
          .then(function(r){ return r.json(); })
          .then(function(d){ allComps = d.competitions || []; })
          .catch(function(){});
      } catch (e) { if (signal.aborted) return; unauthView.hidden=false; return; }

      var sort = 'id', dir = 'desc', page = 1, pageSize = 25, loadSeq = 0, searchTimer = null;
      var searchInput = container.querySelector('#search-q'), pageInfo = container.querySelector('#page-info'), prevBtn = container.querySelector('#page-prev'), nextBtn = container.querySelector('#page-next');

      function fmtDate(v){ if (!v) return '-'; var d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' }); }

      function renderUsers(data){
        users = data.users || [];
        var total = data.total == null ? users.length : data.total;
        var pages = Math.max(1, Math.ceil(total / pageSize));
        pageInfo.textContent = 'Halaman ' + page + ' / ' + pages + ' · total ' + total + ' pengguna';
        prevBtn.disabled = page <= 1;
        nextBtn.disabled = page >= pages;
        if (!users.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--dash-text-muted);">Tidak ada pengguna.</td></tr>'; return; }
        tbody.innerHTML = users.map(function(u){
          var role = u.role || 'user';
          return '<tr><td><code style="font-family:var(--font-mono);font-size:.72rem;">'+u.id+'</code></td><td><strong style="color:var(--dash-text-primary);">'+esc(u.full_name||'-')+'</strong><br/><span style="color:var(--dash-text-muted);font-size:.72rem;">'+esc(u.email||'-')+'</span></td><td><span class="role-badge role-'+esc(role)+'">'+esc(role)+'</span></td><td>'+esc(u.institution||'-')+'</td><td style="font-size:.72rem;color:var(--dash-text-muted);">'+esc(fmtDate(u.created_at))+'</td><td><button class="btn-admin" type="button" data-edit-user="'+u.id+'">Ubah / Reset</button></td></tr>';
        }).join('');
        tbody.querySelectorAll('[data-edit-user]').forEach(function(btn){ btn.addEventListener('click', function(){ var id = Number(btn.getAttribute('data-edit-user')); var user = users.find(function(u){ return u.id===id; }); if (user) openModal('edit', user); }, { signal: signal }); });
      }

      function updateSortIndicators(){
        container.querySelectorAll('th[data-sort]').forEach(function(th){
          var active = th.getAttribute('data-sort') === sort;
          if (active) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
          th.querySelector('.sort-ind').innerHTML = active ? '<i data-lucide="arrow-' + (dir === 'asc' ? 'up' : 'down') + '"></i>' : '';
        });
        window.DashCommon.refreshIcons();
      }

      async function loadUsers(force){
        if (signal.aborted) return;
        var q = searchInput.value.trim();
        var key = 'q=' + encodeURIComponent(q) + '&sort=' + sort + '&dir=' + dir + '&limit=' + pageSize + '&offset=' + ((page - 1) * pageSize);
        var hit = usersCache.get(key);
        if (hit) { renderUsers(hit.data); listStatus.textContent = ''; }
        if (hit && !force && Date.now() - hit.t < 30000) return; // fresh cache: no revalidate
        var seq = ++loadSeq;
        listStatus.textContent = hit ? 'Memperbarui…' : 'Memuat…';
        try {
          var res = await fetch('/api/admin/users?' + key, { credentials:'same-origin', signal: signal });
          var data = await res.json().catch(function(){ return {}; });
          if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
          usersCache.set(key, { t: Date.now(), data: data });
          if (signal.aborted || seq !== loadSeq) return;
          if (!hit || force || JSON.stringify(data) !== JSON.stringify(hit.data)) renderUsers(data);
          listStatus.textContent = '';

          // Load juries assignments
          fetch('/api/admin/juries', { credentials:'same-origin', signal: signal })
            .then(function(r){ return r.json(); })
            .then(function(d){ (d.juries || []).forEach(function(j){ juryAssignments[j.id] = j.competitions || []; }); })
            .catch(function(){});
        } catch (err) {
          if (signal.aborted || seq !== loadSeq) return;
          if (!hit) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#e74c3c;">Gagal memuat pengguna: '+esc(err.message)+'</td></tr>';
          listStatus.textContent = 'Gagal memuat pengguna: ' + err.message;
        }
      }

      container.querySelector('#search-form').addEventListener('submit', function(e){ e.preventDefault(); clearTimeout(searchTimer); page = 1; loadUsers(); }, { signal: signal });
      container.querySelector('#search-reset').addEventListener('click', function(){ clearTimeout(searchTimer); searchInput.value = ''; page = 1; loadUsers(); }, { signal: signal });
      searchInput.addEventListener('input', function(){ clearTimeout(searchTimer); searchTimer = setTimeout(function(){ page = 1; loadUsers(); }, 400); }, { signal: signal });
      container.querySelector('#users-refresh').addEventListener('click', function(){ loadUsers(true); }, { signal: signal });
      container.querySelector('#page-size').addEventListener('change', function(){ pageSize = Number(this.value) || 25; page = 1; loadUsers(); }, { signal: signal });
      prevBtn.addEventListener('click', function(){ if (page > 1) { page--; loadUsers(); } }, { signal: signal });
      nextBtn.addEventListener('click', function(){ if (!nextBtn.disabled) { page++; loadUsers(); } }, { signal: signal });
      container.querySelector('.admin-table thead').addEventListener('click', function(e){
        var th = e.target.closest('th[data-sort]');
        if (!th) return;
        var key = th.getAttribute('data-sort');
        if (key === sort) dir = dir === 'asc' ? 'desc' : 'asc'; else { sort = key; dir = 'asc'; }
        page = 1; updateSortIndicators(); loadUsers();
      }, { signal: signal });
      updateSortIndicators();

      form.addEventListener('submit', async function(e){
        e.preventDefault(); modalStatus.style.color='var(--dash-text-muted)'; modalStatus.textContent='Menyimpan…';
        try {
          var res, data, targetUserId = editingId;
          if (mode === 'create') {
            if (!fName.value.trim() || !fEmail.value.trim() || !fPass.value) { modalStatus.style.color='#e74c3c'; modalStatus.textContent='Nama, email, dan password wajib diisi.'; return; }
            res = await fetch('/api/admin/users', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ full_name:fName.value.trim(), email:fEmail.value.trim(), password:fPass.value, role:fRole.value }), signal: signal });
            data = await res.json().catch(function(){ return {}; });
            if (res.ok && data.user) targetUserId = data.user.id;
          } else {
            var body = { role:fRole.value };
            if (fPass.value) body.password = fPass.value;
            res = await fetch('/api/admin/users/' + editingId, { method:'PATCH', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body), signal: signal });
            data = await res.json().catch(function(){ return {}; });
          }
          if (!res.ok) { modalStatus.style.color='#e74c3c'; modalStatus.textContent = data.detail || ('Gagal ('+res.status+').'); return; }

          // If role is jury, save assigned competitions
          if (fRole.value === 'jury' && targetUserId && juryCompBox) {
            var selectedCids = Array.from(juryCompBox.querySelectorAll('input[type="checkbox"]:checked')).map(function(cb){ return Number(cb.value); });
            await fetch('/api/admin/juries/' + targetUserId + '/competitions', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competition_ids: selectedCids }),
              signal: signal
            }).catch(function(){});
          }

          modalStatus.style.color='#2ecc71'; modalStatus.textContent = data.message || (mode==='create' ? 'Pengguna berhasil dibuat.' : (data.password_reset ? 'Role diperbarui dan password direset.' : 'Role berhasil diperbarui.'));
          setTimeout(function(){ if (signal.aborted) return; closeModal(); usersCache.clear(); loadUsers(); }, 500);
        } catch (err) { if (signal.aborted) return; modalStatus.style.color='#e74c3c'; modalStatus.textContent='Tidak dapat menghubungi server.'; }
      }, { signal: signal });

      loadUsers();
    })();
  }

  function onLeave() {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = null;
  }

  Router.register('/dashboard/users/', {
    title: 'Admin · Kelola Pengguna · Perkutut Cup 2026',
    render: render,
    onEnter: onEnter,
    onLeave: onLeave
  });
})();
