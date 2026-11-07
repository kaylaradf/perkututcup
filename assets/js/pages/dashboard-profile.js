(function () {
  "use strict";
  if (!window.Router) return;

  var state = { user: null, team: null, mounted: false, ac: null };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render(container) {
    var appState = window.__APP_STATE__ || {};
    var name = (appState.user && appState.user.full_name) || "User";
    var initial = name.trim().charAt(0).toUpperCase() || "U";
    var isAdmin = (appState.user && appState.user.role) === "admin";
    container.innerHTML =
      '<div class="dash">' +
      '  <aside class="dash-aside" aria-label="Navigasi akun">' +
      '    <div>' +
      '      <a class="dash-brand" href="/#home" aria-label="Perkutut Cup 2026 home">' +
      '        <span class="dash-brand-mark"><img src="/assets/svg/dashboard/brand-mark.svg" width="22" height="22" alt="" /></span>' +
      '        <strong>User Portal</strong>' +
      '      </a>' +
      '      <div class="dash-team">' +
      '        <span class="dash-avatar">' + escapeHtml(initial) + '</span>' +
      '        <span><small>' + (isAdmin ? 'ADMINISTRATOR' : 'ACTIVE TEAM') + '</small><strong data-aside-name>' + escapeHtml(name) + '</strong></span>' +
      '      </div>' +
      '      <nav class="dash-nav" aria-label="Menu dashboard">' +
      '        <a class="is-active" aria-current="page" href="/dashboard/profile/"><img src="/assets/svg/dashboard/nav-profile.svg" width="18" height="18" alt="" /><span>PROFILE &amp; TEAM</span></a>' +
      '        <a href="/dashboard/submission/"><img src="/assets/svg/dashboard/nav-submission.svg" width="18" height="18" alt="" /><span>PROJECT SUBMISSION</span></a>' +
      '        <a href="/dashboard/competitions/" data-admin-nav' + (isAdmin ? '' : ' hidden') + '><img src="/assets/svg/dashboard/icon-trophy.svg" width="18" height="18" alt="" /><span>KELOLA KOMPETISI</span></a>' +
      '        <a href="/dashboard/users/" data-admin-nav' + (isAdmin ? '' : ' hidden') + '><img src="/assets/svg/dashboard/icon-members.svg" width="18" height="18" alt="" /><span>KELOLA PENGGUNA</span></a>' +
      '      </nav>' +
      '    </div>' +
      '    <div class="dash-aside-foot">' +
      '      <a href="/#home"><img src="/assets/svg/dashboard/nav-home.svg" width="18" height="18" alt="" /><span>HOME PAGE</span></a>' +
      '      <a href="/sign-in/" data-logout><img src="/assets/svg/dashboard/nav-logout.svg" width="18" height="18" alt="" /><span>LOGOUT</span></a>' +
      '      <button class="dash-theme-toggle" id="dash-theme-toggle" type="button" aria-label="Toggle light/dark theme" aria-pressed="false"><span class="toggle-icon" aria-hidden="true">🌙</span><span class="toggle-label">DARK MODE</span></button>' +
      '    </div>' +
      '  </aside>' +
      mainMarkup() +
      '</div>';
  }

  function mainMarkup() {
    return '' +
'    <main class="dash-main">' +
'      <h1 class="dash-page-title">Profile &amp; Team</h1>' +
'      <p class="dash-page-sub">Kelola data diri, dokumen, dan tim Anda.</p>' +
'' +
'      <section class="dash-metrics" aria-label="Ringkasan akun">' +
'        <article class="metric is-violet">' +
'          <img class="metric-watermark" src="/assets/svg/dashboard/watermark-members.svg" width="72" height="72" alt="" />' +
'          <span class="metric-icon"><img src="/assets/svg/dashboard/icon-members.svg" width="23" height="23" alt="" /></span>' +
'          <div>' +
'            <p class="metric-label">TEAM MEMBER COUNT</p>' +
'            <p class="metric-value" data-team-member-count>1 / 1</p>' +
'          </div>' +
'        </article>' +
'        <article class="metric is-green">' +
'          <img class="metric-watermark" src="/assets/svg/dashboard/watermark-check.svg" width="72" height="72" alt="" />' +
'          <span class="metric-icon"><img src="/assets/svg/dashboard/icon-shield-check.svg" width="23" height="23" alt="" /></span>' +
'          <div>' +
'            <p class="metric-label">REGISTRATION STATUS</p>' +
'            <p class="metric-value" data-registration-status>Verified</p>' +
'            <a class="metric-link" href="#whatsapp">Join the WhatsApp Group</a>' +
'          </div>' +
'        </article>' +
'        <article class="metric is-amber">' +
'          <img class="metric-watermark" src="/assets/svg/dashboard/watermark-trophy.svg" width="72" height="72" alt="" />' +
'          <span class="metric-icon"><img src="/assets/svg/dashboard/icon-trophy.svg" width="23" height="23" alt="" /></span>' +
'          <div>' +
'            <p class="metric-label">COMPETITION TRACK</p>' +
'            <p class="metric-value" data-team-track>KRIPTOGRAFI</p>' +
'          </div>' +
'          <a class="metric-note" href="/#competition">Read Guidebook</a>' +
'        </article>' +
'      </section>' +
'' +
'      <a class="dash-inline-link" id="whatsapp" href="#whatsapp">Join the WhatsApp Group</a>' +
'' +
'      <div class="dash-grid">' +
'        <section class="card">' +
'          <div class="card-head">' +
'            <h2>PERSONAL INFORMATION</h2>' +
'            <a class="edit-link" href="#profile-form"><img src="/assets/svg/dashboard/icon-pencil.svg" width="16" height="16" alt="" /> Edit Profile</a>' +
'          </div>' +
'          <form class="dash-form" id="profile-form" data-dash-form="profile" novalidate>' +
'            <label class="field"><span>FULL NAME</span><input class="input" name="fullName" type="text" value="" autocomplete="name" maxlength="100" required /></label>' +
'            <label class="field"><span>INSTITUTION</span><input class="input" name="institution" type="text" value="" maxlength="120" required /></label>' +
'            <div class="field-row">' +
'              <label class="field"><span>EMAIL ADDRESS</span><input class="input" name="email" type="email" value="" autocomplete="email" maxlength="254" required /></label>' +
'              <label class="field"><span>PHONE NUMBER</span><span class="phone-row"><span class="phone-code"><span class="phone-flag" aria-hidden="true"></span><span class="sr-only">Kode negara</span>+62 <img src="/assets/svg/dashboard/icon-chevron-down.svg" width="9" height="9" alt="" /></span><input class="input" name="phone" type="tel" value="" autocomplete="tel-national" maxlength="20" /></span></label>' +
'            </div>' +
'            <label class="field"><span>DATE OF BIRTH</span><span class="input-wrap"><input class="input" name="birthDate" type="text" value="" maxlength="10" /><img class="input-icon" src="/assets/svg/dashboard/icon-calendar.svg" width="18" height="18" alt="" /></span></label>' +
'            <label class="field"><span>INSTAGRAM USERNAME</span><p class="field-hint">*Ensure your Instagram account is set to public during verification and competition phase</p><input class="input" name="instagram" type="text" value="" maxlength="30" /></label>' +
'            <a class="field-link" href="https://instagram.com/" target="_blank" rel="noopener noreferrer">Follow @perkututcup</a>' +
'            <span class="form-divider"></span>' +
'            <div class="upload-head">' +
'              <h3>DOCUMENT UPLOADS</h3>' +
'              <div class="upload-list">' +
'                <article class="upload-item"><span class="upload-info"><img class="upload-thumb" src="/assets/images/dashboard/student-id.jpg" width="45" height="45" alt="Kartu mahasiswa" /><span class="upload-copy"><h4>STUDENT ID / ENROLLMENT VERIFICATION</h4><p>Uploaded successfully <a href="#profile-form" data-view-upload>Click to view</a></p></span></span><button class="btn-upload" type="button" data-upload="studentId">UPLOAD</button></article>' +
'                <article class="upload-item"><span class="upload-info"><img class="upload-thumb" src="/assets/images/dashboard/formal-photo.jpg" width="45" height="45" alt="Foto formal" /><span class="upload-copy"><h4>FORMAL PHOTO</h4><p>Uploaded successfully <a href="#profile-form" data-view-upload>Click to view</a></p></span></span><button class="btn-upload" type="button" data-upload="formalPhoto">UPLOAD</button></article>' +
'                <article class="upload-item"><span class="upload-info"><img class="upload-thumb" src="/assets/images/dashboard/twibbon.jpg" width="45" height="45" alt="Twibbon" /><span class="upload-copy"><h4>TWIBBON FEEDS SCREENSHOT</h4><p>Uploaded successfully <a href="#profile-form" data-view-upload>Click to view</a></p><a class="upload-twibbon-link" href="/#home">Download the Twibbon here</a><p class="upload-hint">*Upload a screenshot of your posted twibbon on your public Instagram feeds<br />*Please keep your twibbon post until the competition ends</p></span></span><button class="btn-upload" type="button" data-upload="twibbon">UPLOAD</button></article>' +
'                <article class="upload-item"><span class="upload-info"><img class="upload-thumb" src="/assets/images/dashboard/instagram.jpg" width="45" height="45" alt="Screenshot follow Instagram" /><span class="upload-copy"><h4>FOLLOW INSTAGRAM @PERKUTUTCUP</h4><p>Uploaded successfully <a href="#profile-form" data-view-upload>Click to view</a></p></span></span><button class="btn-upload" type="button" data-upload="followInstagram">UPLOAD</button></article>' +
'              </div>' +
'            </div>' +
'            <button class="btn-save" type="submit">SAVE CHANGES</button>' +
'            <p class="dash-status" data-dash-status role="status" aria-live="polite"></p>' +
'          </form>' +
'        </section>' +
'        <section class="card card--accent">' +
'          <div class="card-head card-head--plain">' +
'            <h2>MY TEAM (<span data-team-leader-name>Ari Dwi Saputra</span>)</h2>' +
'            <div style="display:flex; align-items:center; gap:6px;"><span class="team-code" data-team-code># —</span><button class="btn-copy-code" type="button" data-copy-code title="Salin kode tim">Salin</button></div>' +
'          </div>' +
'          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-top:0.4rem;"><span class="comp-badge comp-badge--type" data-comp-type-badge style="font-size:0.68rem; padding:0.25rem 0.6rem; border-radius:6px;">TIM</span><span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--dash-text-muted);" data-comp-quota-info></span></div>' +
'          <a class="dash-inline-link" href="#whatsapp">Join the WhatsApp Group</a>' +
'          <div data-team-members></div>' +
'          <template data-team-member-template><article class="team-member" style="display:flex; align-items:center; justify-content:space-between;"><div style="display:flex; align-items:center; gap:0.8rem;"><img src="/assets/images/dashboard/member-leader.jpg" width="41" height="41" alt="Anggota tim" /><span><strong>ARI DWI SAPUTRA<span class="team-badge">YOU</span></strong><small>Team Leader • Politeknik Negeri Cilacap</small></span></div><button class="btn-member-action btn-remove-member" type="button" data-remove-member hidden title="Keluarkan anggota">Hapus</button></article></template>' +
'          <div class="team-manage-box" data-individual-notice hidden style="margin-top:1rem; padding:0.8rem; border-radius:10px; background:rgba(134,68,162,0.1); border:1px solid rgba(134,68,162,0.25);"><p class="proof-hint" style="margin:0;">Kompetisi ini bersifat <strong>Individu</strong>. Partisipasi terdaftar sebagai perorangan tanpa anggota tim tambahan.</p></div>' +
'          <div class="team-manage-box" data-add-member-section hidden style="margin-top:1.2rem; padding:1rem; border-radius:12px; border:1px solid var(--dash-border-mid); background:rgba(255,232,217,0.03);"><h4 style="margin:0 0 0.4rem; font-size:0.75rem; font-family:var(--font-mono); color:var(--soft-violet);">TAMBAH ANGGOTA TIM</h4><p class="proof-hint" style="margin-bottom:0.8rem;">Undang anggota menggunakan email akun Perkutut Cup mereka:</p><form data-add-member-form style="display:flex; gap:0.6rem; flex-wrap:wrap;"><input class="input" type="email" name="memberEmail" placeholder="email.anggota@example.com" required style="flex:1; min-width:200px;" /><button class="btn-save" type="submit" style="padding:0.5rem 1rem; font-size:0.72rem;">TAMBAH</button></form><p class="dash-status" data-add-member-status role="status" aria-live="polite" style="margin-top:0.5rem;"></p></div>' +
'          <div class="team-manage-box" data-join-team-section style="margin-top:1.2rem; padding:1rem; border-radius:12px; border:1px solid var(--dash-border-mid); background:rgba(255,232,217,0.03);"><h4 style="margin:0 0 0.4rem; font-size:0.75rem; font-family:var(--font-mono); color:var(--soft-violet);">GABUNG TIM DENGAN KODE</h4><p class="proof-hint" style="margin-bottom:0.8rem;">Punya kode tim dari teman? Masukkan kode untuk bergabung ke tim teman:</p><form data-join-team-form style="display:flex; gap:0.6rem; flex-wrap:wrap;"><input class="input" type="text" name="teamCode" placeholder="PC26-XXXX" required style="flex:1; min-width:180px; text-transform:uppercase;" /><button class="btn-save" type="submit" style="padding:0.5rem 1rem; font-size:0.72rem;">GABUNG</button></form><p class="dash-status" data-join-team-status role="status" aria-live="polite" style="margin-top:0.5rem;"></p></div>' +
'          <div class="team-manage-box" data-leave-team-section hidden style="margin-top:1.2rem; text-align:right;"><button class="btn-upload" type="button" data-leave-team-btn style="color:#e74c3c; border-color:rgba(231,76,60,0.3);">KELUAR DARI TIM</button><p class="dash-status" data-leave-team-status role="status" aria-live="polite" style="margin-top:0.4rem;"></p></div>' +
'          <div class="proof-block"><h3>TEAM PAYMENT PROOF</h3><article class="proof"><span class="proof-icon"><img src="/assets/svg/dashboard/icon-file-lock.svg" width="23" height="23" alt="" /></span><div><h4>PAYMENT RECEIPT</h4><p>Uploaded successfully <a href="#profile-form" data-view-upload>(Click to view)</a></p><p class="proof-hint">Bilang hi! ke kontak ini supaya di-acc : +62 8123 4567 893</p></div></article></div>' +
'        </section>' +
'      </div>' +
'    </main>';
  }

  function onEnter(container) {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = new AbortController();
    var signal = state.ac.signal;
    initTheme(container, signal);
    initLogout(container, signal);
    initProfile(container, signal);
  }

  function onLeave() {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = null;
  }

  function initTheme(container, signal) {
    var html = document.documentElement;
    var btn = container.querySelector('#dash-theme-toggle') || document.getElementById('dash-theme-toggle');
    var label = btn ? btn.querySelector('.toggle-label') : null;
    var icon = btn ? btn.querySelector('.toggle-icon') : null;
    var metaTheme = document.getElementById('meta-theme-color');
    function getTheme() { return html.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
    function applyTheme(theme) {
      if (theme === 'light') html.setAttribute('data-theme', 'light'); else html.removeAttribute('data-theme');
      if (btn) btn.setAttribute('aria-pressed', String(theme === 'light'));
      if (label) label.textContent = theme === 'light' ? 'LIGHT MODE' : 'DARK MODE';
      if (icon) icon.textContent = theme === 'light' ? '☀️' : '🌙';
      if (metaTheme) metaTheme.setAttribute('content', theme === 'light' ? '#f4f1ff' : '#0b0c10');
      try { localStorage.setItem('dash-theme', theme); } catch (e) {}
    }
    applyTheme(getTheme());
    if (btn) btn.addEventListener('click', function () { applyTheme(getTheme() === 'dark' ? 'light' : 'dark'); }, { signal: signal });
  }

  function initLogout(container, signal) {
    var link = container.querySelector('[data-logout]');
    if (!link) return;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
        .finally(function () { window.location.href = '/sign-in/'; });
    }, { signal: signal });
  }

  function initProfile(container, signal) {
    var form = container.querySelector("[data-dash-form='profile']");
    if (!form) return;
    var inputs = {
      fullName: form.querySelector("input[name='fullName']"),
      institution: form.querySelector("input[name='institution']"),
      email: form.querySelector("input[name='email']"),
      phone: form.querySelector("input[name='phone']"),
      birthDate: form.querySelector("input[name='birthDate']"),
      instagram: form.querySelector("input[name='instagram']"),
    };
    var status = form.querySelector('[data-dash-status]');
    var avatar = container.querySelector('.dash-avatar');
    var DASH_EMPTY = function (label) { return label + ' belum diisi'; };
    var setPlaceholder = function (el, text) { if (el) el.textContent = text; };
    var displayDate = function (iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
    var parseDate = function (text) { var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((text || '').trim()); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; };

    var fillForm = function (user) {
      inputs.fullName.value = user.full_name || '';
      inputs.institution.value = user.institution || '';
      inputs.email.value = user.email || '';
      inputs.phone.value = user.phone || '';
      inputs.birthDate.value = user.birth_date ? displayDate(user.birth_date) : '';
      inputs.instagram.value = user.instagram_handle || '';
      inputs.fullName.placeholder = user.full_name ? '' : DASH_EMPTY('Nama lengkap');
      inputs.institution.placeholder = user.institution ? '' : DASH_EMPTY('Institusi');
      inputs.phone.placeholder = user.phone ? '' : DASH_EMPTY('Nomor telepon');
      inputs.birthDate.placeholder = user.birth_date ? '' : 'dd/mm/yyyy';
      inputs.instagram.placeholder = user.instagram_handle ? '' : DASH_EMPTY('Instagram');
      if (avatar && user.full_name) avatar.textContent = user.full_name.trim().charAt(0).toUpperCase();
      var asideName = container.querySelector('[data-aside-name]');
      if (asideName && user.full_name) asideName.textContent = user.full_name;
    };

    var currentProfileUser = null;

    var renderTeam = function (team, currentUser) {
      var countEl = container.querySelector('[data-team-member-count]');
      var trackEl = container.querySelector('[data-team-track]');
      var codeEl = container.querySelector('[data-team-code]');
      var leaderEl = container.querySelector('[data-team-leader-name]');
      var membersEl = container.querySelector('[data-team-members]');
      var tpl = container.querySelector('[data-team-member-template]');
      var copyBtn = container.querySelector('[data-copy-code]');
      var typeBadge = container.querySelector('[data-comp-type-badge]');
      var quotaInfo = container.querySelector('[data-comp-quota-info]');
      var individualNotice = container.querySelector('[data-individual-notice]');
      var addMemberSection = container.querySelector('[data-add-member-section]');
      var joinTeamSection = container.querySelector('[data-join-team-section]');
      var leaveTeamSection = container.querySelector('[data-leave-team-section]');
      var leaveTeamBtn = container.querySelector('[data-leave-team-btn]');

      if (copyBtn && team && team.code) {
        copyBtn.onclick = function () {
          var doPrompt = function () { try { window.prompt('Salin kode tim:', team.code); } catch (e) {} };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(team.code).then(function () {
              copyBtn.textContent = 'Tersalin!'; setTimeout(function () { copyBtn.textContent = 'Salin'; }, 2000);
            }, doPrompt);
          } else doPrompt();
        };
      }

      if (!team) {
        setPlaceholder(countEl, '0 / 1'); setPlaceholder(trackEl, '—'); setPlaceholder(codeEl, '# belum ada tim');
        if (typeBadge) typeBadge.textContent = 'BELUM ADA TIM';
        if (quotaInfo) quotaInfo.textContent = '';
        if (individualNotice) individualNotice.hidden = true;
        if (addMemberSection) addMemberSection.hidden = true;
        if (leaveTeamSection) leaveTeamSection.hidden = true;
        if (joinTeamSection) joinTeamSection.hidden = false;
        if (membersEl) membersEl.innerHTML = '<p class="proof-hint" style="padding:.4rem 0">Belum tergabung dalam tim. Masukkan kode tim di bawah atau pilih kompetisi baru.</p>';
        return;
      }

      var n = team.members ? team.members.length : 0;
      var maxM = team.max_team_members || Math.max(n, 1);
      var minM = team.min_team_members || 1;
      var isIndiv = team.participation_type === 'INDIVIDUAL' || maxM <= 1;
      setPlaceholder(countEl, n + ' / ' + maxM);
      setPlaceholder(trackEl, team.track || '—');
      setPlaceholder(codeEl, '# ' + team.code);
      if (leaderEl) {
        var leader = (team.members || []).filter(function (m) { return m.role === 'leader'; })[0] || (team.members || [])[0];
        if (leader) leaderEl.textContent = leader.full_name;
      }
      if (typeBadge) typeBadge.textContent = isIndiv ? 'INDIVIDU (1 Peserta)' : 'TIM (' + minM + '–' + maxM + ' Orang)';
      if (quotaInfo) quotaInfo.textContent = isIndiv ? 'Kuota: 1 / 1 peserta' : 'Kuota: ' + n + ' / ' + maxM + ' anggota terisi';

      if (isIndiv) {
        if (individualNotice) individualNotice.hidden = false;
        if (addMemberSection) addMemberSection.hidden = true;
        if (joinTeamSection) joinTeamSection.hidden = true;
        if (leaveTeamSection) leaveTeamSection.hidden = true;
      } else {
        if (individualNotice) individualNotice.hidden = true;
        if (team.role === 'leader') {
          if (joinTeamSection) joinTeamSection.hidden = true;
          if (addMemberSection) {
            addMemberSection.hidden = false;
            var emailInput = addMemberSection.querySelector("input[name='memberEmail']");
            var submitBtn = addMemberSection.querySelector("button[type='submit']");
            var isFull = n >= maxM;
            if (emailInput) emailInput.disabled = isFull;
            if (submitBtn) submitBtn.disabled = isFull;
            var hint = addMemberSection.querySelector('.proof-hint');
            if (hint) hint.textContent = isFull ? 'Kuota tim sudah penuh (maksimal ' + maxM + ' anggota). Keluarkan anggota terlebih dahulu bila ingin mengganti.' : 'Undang anggota menggunakan email akun Perkutut Cup mereka (sisa kuota: ' + (maxM - n) + ' orang):';
          }
          if (leaveTeamSection) { leaveTeamSection.hidden = false; if (leaveTeamBtn) leaveTeamBtn.textContent = n === 1 ? 'BUBARKAN TIM' : 'KELUAR DARI TIM'; }
        } else {
          if (addMemberSection) addMemberSection.hidden = true;
          if (joinTeamSection) joinTeamSection.hidden = true;
          if (leaveTeamSection) { leaveTeamSection.hidden = false; if (leaveTeamBtn) leaveTeamBtn.textContent = 'KELUAR DARI TIM'; }
        }
      }

      if (membersEl && tpl) {
        membersEl.innerHTML = '';
        (team.members || []).forEach(function (m) {
          var node = tpl.content.cloneNode(true);
          var strong = node.querySelector('strong');
          var small = node.querySelector('small');
          var isCaller = currentUser && (m.user_id === currentUser.id || m.email === currentUser.email);
          strong.textContent = m.full_name;
          if (isCaller) { var badge = document.createElement('span'); badge.className = 'team-badge'; badge.textContent = 'YOU'; strong.appendChild(badge); }
          small.textContent = (m.role === 'leader' ? 'Team Leader' : 'Member') + (m.institution ? ' • ' + m.institution : '');
          var removeBtn = node.querySelector('[data-remove-member]');
          if (removeBtn) {
            if (team.role === 'leader' && m.role !== 'leader' && !isCaller) {
              removeBtn.hidden = false;
              removeBtn.addEventListener('click', function () {
                if (!window.confirm('Keluarkan ' + m.full_name + ' dari tim?')) return;
                fetch('/api/team/members/' + m.user_id, { method: 'DELETE', credentials: 'same-origin' })
                  .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { ok: res.ok, data: d }; }); })
                  .then(function (r) { if (r.ok) reloadTeam(); else window.alert(r.data.detail || 'Gagal mengeluarkan anggota tim.'); })
                  .catch(function () { window.alert('Tidak dapat menghubungi server.'); });
              }, { signal: signal });
            } else removeBtn.hidden = true;
          }
          membersEl.appendChild(node);
        });
      }
    };

    var reloadTeam = function () {
      return fetch('/api/team', { credentials: 'same-origin' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) { if (data) renderTeam(data.team, currentProfileUser); })
        .catch(function () {});
    };

    // initial load
    Promise.all([
      fetch('/api/me', { credentials: 'same-origin' }),
      fetch('/api/team', { credentials: 'same-origin' })
    ]).then(function (rs) {
      if (signal.aborted) return;
      var meRes = rs[0], teamRes = rs[1];
      if (meRes.status === 401) { window.location.replace('/404.html'); return; }
      return Promise.all([meRes.json(), teamRes.json()]).then(function (ds) {
        if (signal.aborted) return;
        currentProfileUser = ds[0].user || {};
        fillForm(currentProfileUser);
        if (currentProfileUser.role === 'admin') {
          container.querySelectorAll('[data-admin-nav]').forEach(function (el) { el.hidden = false; });
          var asideSmall = container.querySelector('.dash-team small');
          if (asideSmall) asideSmall.textContent = 'ADMINISTRATOR';
        }
        setPlaceholder(container.querySelector('[data-registration-status]'), currentProfileUser.email ? 'Verified' : 'Belum lengkap');
        renderTeam(ds[1].team, currentProfileUser);
      });
    }).catch(function () { if (!signal.aborted) setPlaceholder(status, 'Gagal memuat data profil.'); });

    // add member
    var addMemberForm = container.querySelector('[data-add-member-form]');
    var addMemberStatus = container.querySelector('[data-add-member-status]');
    if (addMemberForm) {
      addMemberForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = addMemberForm.querySelector("input[name='memberEmail']");
        var emailVal = input && input.value ? input.value.trim() : '';
        if (!emailVal) return;
        if (addMemberStatus) { addMemberStatus.textContent = 'Menambahkan anggota…'; addMemberStatus.style.color = 'var(--dash-text-muted)'; }
        fetch('/api/team/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email: emailVal }) })
          .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { ok: res.ok, data: d }; }); })
          .then(function (r) {
            if (r.ok) { if (addMemberStatus) { addMemberStatus.textContent = r.data.message || 'Anggota berhasil ditambahkan.'; addMemberStatus.style.color = '#2ecc71'; } if (input) input.value = ''; reloadTeam(); }
            else if (addMemberStatus) { addMemberStatus.textContent = r.data.detail || 'Gagal menambahkan anggota.'; addMemberStatus.style.color = '#e74c3c'; }
          }).catch(function () { if (addMemberStatus) { addMemberStatus.textContent = 'Tidak dapat menghubungi server.'; addMemberStatus.style.color = '#e74c3c'; } });
      }, { signal: signal });
    }

    // join team
    var joinTeamForm = container.querySelector('[data-join-team-form]');
    var joinTeamStatus = container.querySelector('[data-join-team-status]');
    if (joinTeamForm) {
      joinTeamForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = joinTeamForm.querySelector("input[name='teamCode']");
        var codeVal = input && input.value ? input.value.trim().toUpperCase() : '';
        if (!codeVal) return;
        if (joinTeamStatus) { joinTeamStatus.textContent = 'Memverifikasi dan bergabung ke tim…'; joinTeamStatus.style.color = 'var(--dash-text-muted)'; }
        fetch('/api/team/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ code: codeVal }) })
          .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { ok: res.ok, data: d }; }); })
          .then(function (r) {
            if (r.ok) { if (joinTeamStatus) { joinTeamStatus.textContent = r.data.message || 'Berhasil bergabung ke tim.'; joinTeamStatus.style.color = '#2ecc71'; } if (input) input.value = ''; reloadTeam(); }
            else if (joinTeamStatus) { joinTeamStatus.textContent = r.data.detail || 'Gagal bergabung ke tim.'; joinTeamStatus.style.color = '#e74c3c'; }
          }).catch(function () { if (joinTeamStatus) { joinTeamStatus.textContent = 'Tidak dapat menghubungi server.'; joinTeamStatus.style.color = '#e74c3c'; } });
      }, { signal: signal });
    }

    // leave team
    var leaveTeamBtn = container.querySelector('[data-leave-team-btn]');
    var leaveTeamStatus = container.querySelector('[data-leave-team-status]');
    if (leaveTeamBtn) {
      leaveTeamBtn.addEventListener('click', function () {
        var isDisband = (leaveTeamBtn.textContent || '').indexOf('BUBARKAN') !== -1;
        var confirmMsg = isDisband ? 'Apakah Anda yakin ingin membubarkan tim ini?' : 'Apakah Anda yakin ingin keluar dari tim ini?';
        if (!window.confirm(confirmMsg)) return;
        if (leaveTeamStatus) { leaveTeamStatus.textContent = 'Memproses…'; leaveTeamStatus.style.color = 'var(--dash-text-muted)'; }
        fetch('/api/team/leave', { method: 'POST', credentials: 'same-origin' })
          .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { ok: res.ok, data: d }; }); })
          .then(function (r) {
            if (r.ok) { if (leaveTeamStatus) { leaveTeamStatus.textContent = r.data.message || 'Berhasil memproses permintaan tim.'; leaveTeamStatus.style.color = '#2ecc71'; } reloadTeam(); }
            else if (leaveTeamStatus) { leaveTeamStatus.textContent = r.data.detail || 'Gagal memproses permintaan tim.'; leaveTeamStatus.style.color = '#e74c3c'; }
          }).catch(function () { if (leaveTeamStatus) { leaveTeamStatus.textContent = 'Tidak dapat menghubungi server.'; leaveTeamStatus.style.color = '#e74c3c'; } });
      }, { signal: signal });
    }

    // save profile
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var birthISO = parseDate(inputs.birthDate.value);
      if (inputs.birthDate.value && !birthISO) { setPlaceholder(status, 'Format tanggal lahir harus dd/mm/yyyy.'); return; }
      var saveButton = form.querySelector('.btn-save');
      if (saveButton) saveButton.disabled = true;
      setPlaceholder(status, 'Menyimpan perubahan...');
      fetch('/api/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({
          full_name: inputs.fullName.value.trim(), institution: inputs.institution.value.trim(),
          email: inputs.email.value.trim(), phone: inputs.phone.value.trim(),
          birth_date: birthISO, instagram_handle: inputs.instagram.value.trim(),
        })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) { return { ok: response.ok, status: response.status, data: data }; });
      }).then(function (r) {
        if (r.ok) {
          fillForm(r.data.user || {}); if (avatar && r.data.user && r.data.user.full_name) avatar.textContent = r.data.user.full_name.trim().charAt(0).toUpperCase();
          setPlaceholder(status, 'Perubahan tersimpan.');
        } else if (r.status === 409) setPlaceholder(status, 'Email sudah dipakai akun lain.');
        else if (r.status === 401) window.location.replace('/404.html');
        else setPlaceholder(status, r.data.detail || 'Gagal menyimpan. Coba lagi.');
      }).catch(function () { setPlaceholder(status, 'Tidak dapat menghubungi server.'); })
        .finally(function () { if (saveButton) saveButton.disabled = false; });
    }, { signal: signal });
  }

  Router.register('/dashboard/profile/', {
    title: 'Profil & Tim · Perkutut Cup 2026',
    render: render,
    onEnter: onEnter,
    onLeave: onLeave,
  });
})();
