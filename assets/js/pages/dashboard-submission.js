(function () {
  "use strict";
  if (!window.Router) return;

  var state = { ac: null };

  function render(container) {
    container.innerHTML = '<div class="dash">' + window.DashCommon.renderAside('submission') + mainMarkup() + '</div>';
  }

  function onEnter(container) {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = new AbortController();
    var signal = state.ac.signal;
    window.DashCommon.initTheme(container, signal);
    window.DashCommon.initLogout(container, signal);
  }

  function onLeave() {
    if (state.ac) try { state.ac.abort(); } catch (e) {}
    state.ac = null;
  }

  function mainMarkup() {
    return '' +
'    <main class="dash-main">' +
'      <h1 class="dash-page-title">Project Submission</h1>' +
'      <p class="dash-page-sub">Kelola pengumpulan karya tim Anda dan pantau progresnya.</p>' +
'' +
'      <section class="dash-metrics" aria-label="Ringkasan pengumpulan">' +
'        <article class="metric is-amber">' +
'          <img class="metric-watermark" src="/assets/svg/dashboard/watermark-calendar.svg" width="72" height="72" alt="" />' +
'          <span class="metric-icon"><img src="/assets/svg/dashboard/icon-calendar-lg.svg" width="23" height="23" alt="" /></span>' +
'          <div>' +
'            <p class="metric-label">SUBMISSION DEADLINE</p>' +
'            <p class="metric-value">2026-09-20</p>' +
'          </div>' +
'        </article>' +
'' +
'        <article class="metric is-violet">' +
'          <img class="metric-watermark" src="/assets/svg/dashboard/watermark-clock.svg" width="72" height="72" alt="" />' +
'          <span class="metric-icon"><img src="/assets/svg/dashboard/icon-clock-lg.svg" width="23" height="23" alt="" /></span>' +
'          <div>' +
'            <p class="metric-label">DAYS REMAINING</p>' +
'            <p class="metric-value">Overdue</p>' +
'          </div>' +
'        </article>' +
'' +
'        <article class="metric is-green">' +
'          <img class="metric-watermark" src="/assets/svg/dashboard/watermark-check-circle.svg" width="72" height="72" alt="" />' +
'          <span class="metric-icon"><img src="/assets/svg/dashboard/icon-check-circle-lg.svg" width="23" height="23" alt="" /></span>' +
'          <div>' +
'            <p class="metric-label">FILES UPLOADED</p>' +
'            <p class="metric-value">0 / 3</p>' +
'          </div>' +
'        </article>' +
'      </section>' +
'' +
'      <div class="dash-grid dash-grid--even">' +
'        <div class="dash-col">' +
'          <section class="card card--flush">' +
'            <span class="card-top-bar" aria-hidden="true"></span>' +
'            <h2 class="card-title">SUBMISSION GUIDE</h2>' +
'            <p class="card-lead">Pastikan karya Anda memenuhi seluruh persyaratan sebelum pengumpulan akhir.</p>' +
'            <div class="guide-steps">' +
'              <article class="guide-step">' +
'                <h3>1. FINAL: FILE PKA</h3>' +
'                <p>Siapkan file konfigurasi Cisco Packet Tracer (.pka) yang berfungsi untuk verifikasi topologi jaringan.</p>' +
'              </article>' +
'              <article class="guide-step">' +
'                <h3>2. FINAL: FILE POC</h3>' +
'                <p>Unggah PDF yang memuat proses desain, proof of concept (PoC), serta langkah konfigurasi teknis Anda.</p>' +
'              </article>' +
'              <article class="guide-step">' +
'                <h3>3. FINAL: FILE CISCO</h3>' +
'                <p>Siapkan file konfigurasi Cisco Packet Tracer (.pka) yang berfungsi untuk verifikasi topologi jaringan.</p>' +
'              </article>' +
'            </div>' +
'          </section>' +
'' +
'          <section class="card card--flush">' +
'            <span class="card-top-bar" aria-hidden="true"></span>' +
'            <h2 class="card-title">COMPETITION DESCRIPTION</h2>' +
'            <p class="card-lead">Informasi lengkap mengenai kategori kompetisi ini.</p>' +
'            <ul class="desc-list">' +
'              <li><span><b>Categories:</b> Mahasiswa (Nasional).</span></li>' +
'              <li><span><b>Participants per Team:</b> Individu (1 orang per tim).</span></li>' +
'              <li><span><b>Mechanism:</b> Peserta ditantang mengonfigurasi dan menelusuri masalah infrastruktur jaringan menggunakan Cisco Packet Tracer (PKA) serta mengirimkan dokumen Proof of Concept (PoC). Pada babak final, peserta melakukan konfigurasi server secara langsung dan troubleshooting jaringan melalui remote desktop.</span></li>' +
'              <li>' +
'                <span>' +
'                  <b>Key Dates:</b>' +
'                  <ul class="desc-sub">' +
'                    <li>Preliminary Round: Sabtu, 29 Agustus 2026 (Online).</li>' +
'                    <li>Final Round: 19 – 20 September 2026 (Online).</li>' +
'                  </ul>' +
'                </span>' +
'              </li>' +
'            </ul>' +
'          </section>' +
'        </div>' +
'' +
'        <div class="dash-col">' +
'          <section class="card card--flush">' +
'            <span class="card-top-bar is-rainbow" aria-hidden="true"></span>' +
'            <div class="card-title-row">' +
'              <span class="title-icon"><img src="/assets/svg/dashboard/icon-doc-purple.svg" width="18" height="18" alt="" /></span>' +
'              <h2 class="card-title">KRIPTOGRAFI PROBLEM FILES<span class="tag">FINAL</span></h2>' +
'            </div>' +
'            <p class="card-lead">Unduh dokumen soal untuk kompetisi.</p>' +
'            <p class="card-sub">Window: 20 Sep 2026, 09:00 – 14:00 WIB</p>' +
'' +
'            <div class="lock-banner">' +
'              <img src="/assets/svg/dashboard/icon-lock.svg" width="18" height="18" alt="" />' +
'              <span>Problem window has ended (14:00 WIB)</span>' +
'            </div>' +
'' +
'            <div class="file-list">' +
'              <article class="file-row">' +
'                <span class="file-info">' +
'                  <img src="/assets/svg/dashboard/icon-doc-gray.svg" width="22" height="22" alt="" />' +
'                  <span>' +
'                    <strong>Final Kriptografi – Perkutut Cup 2026.pdf</strong>' +
'                    <small>Closed at 14:00 WIB – contact committee</small>' +
'                  </span>' +
'                </span>' +
'                <a class="file-download" href="#problem-files" aria-label="Unduh Final Kriptografi – Perkutut Cup 2026.pdf">' +
'                  <img src="/assets/svg/dashboard/icon-download.svg" width="18" height="18" alt="" />' +
'                </a>' +
'              </article>' +
'' +
'              <article class="file-row">' +
'                <span class="file-info">' +
'                  <img src="/assets/svg/dashboard/icon-doc-gray.svg" width="22" height="22" alt="" />' +
'                  <span>' +
'                    <strong>Kriptografi – Perkutut Cup 2026 FINAL.pka</strong>' +
'                    <small>Closed at 14:00 WIB – contact committee</small>' +
'                  </span>' +
'                </span>' +
'                <a class="file-download" href="#problem-files" aria-label="Unduh Kriptografi – Perkutut Cup 2026 FINAL.pka">' +
'                  <img src="/assets/svg/dashboard/icon-download.svg" width="18" height="18" alt="" />' +
'                </a>' +
'              </article>' +
'            </div>' +
'          </section>' +
'' +
'          <section class="card card--flush">' +
'            <span class="card-top-bar is-rainbow" aria-hidden="true"></span>' +
'            <h2 class="card-title">PROJECT SUBMISSION</h2>' +
'            <p class="card-lead">Unggah aset karya final Anda untuk ditinjau oleh dewan juri.</p>' +
'' +
'            <div class="track-box">' +
'              <span class="track-id">' +
'                <img src="/assets/svg/dashboard/icon-bolt.svg" width="23" height="23" alt="" />' +
'                <span>' +
'                  <small>CURRENT TRACK</small>' +
'                  <strong>KRIPTOGRAFI (UNIVERSITY)</strong>' +
'                </span>' +
'              </span>' +
'              <a href="/#competition">Read Guidebook</a>' +
'            </div>' +
'' +
'            <div class="tabs-block">' +
'              <p class="tabs-label">PILIH ITEM PENGUMPULAN</p>' +
'              <div class="tabs" role="tablist" aria-label="Item pengumpulan">' +
'                <button class="tab is-active" type="button" role="tab" aria-selected="true" aria-controls="tab-panel" id="tab-pka">FINAL: FILE PKA <span>PENDING</span></button>' +
'                <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="tab-panel" id="tab-poc">FINAL: FILE POC <span>PENDING</span></button>' +
'                <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="tab-panel" id="tab-cisco">FINAL: FILE CISCO <span>PENDING</span></button>' +
'              </div>' +
'            </div>' +
'' +
'            <div class="closed-box" id="tab-panel" role="tabpanel" aria-labelledby="tab-pka">' +
'              <img src="/assets/svg/dashboard/icon-lock.svg" width="18" height="18" alt="" />' +
'              <div>' +
'                <strong>Submission Closed</strong>' +
'                <p>Tenggat untuk tugas ini adalah 20 September 2026 pukul 14:00 WIB.</p>' +
'              </div>' +
'            </div>' +
'          </section>' +
'        </div>' +
'      </div>' +
'    </main>';
  }

  Router.register('/dashboard/submission/', {
    title: 'Project Submission · Perkutut Cup 2026',
    render: render,
    onEnter: onEnter,
    onLeave: onLeave
  });
})();
