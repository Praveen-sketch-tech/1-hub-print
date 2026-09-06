const token = localStorage.getItem('shopToken');
if (!token) {
  window.location.href = 'login.html';
}

document.getElementById('shopNameHeader').textContent = localStorage.getItem('shopName') || 'Dashboard';

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('shopToken');
  localStorage.removeItem('shopName');
  localStorage.removeItem('shopCode');
  window.location.href = 'login.html';
});

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

async function apiGet(path) {
  const res = await fetch(path, { headers: authHeaders() });
  if (res.status === 401) {
    localStorage.removeItem('shopToken');
    window.location.href = 'login.html';
    return null;
  }
  return res.json();
}

async function apiPost(path) {
  const res = await fetch(path, { method: 'POST', headers: authHeaders() });
  return res.json();
}

// ---- Tabs ----
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => (c.hidden = true));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;

    if (btn.dataset.tab === 'overview') loadStats();
    if (btn.dataset.tab === 'jobs') loadJobs();
    if (btn.dataset.tab === 'qr') loadQr();
  });
});

// ---- Overview ----
async function loadStats() {
  const data = await apiGet('/api/shop/stats');
  if (!data) return;
  document.getElementById('statPending').textContent = data.pending;
  document.getElementById('statPrinting').textContent = data.printing;
  document.getElementById('statCompleted').textContent = data.completed;
  document.getElementById('statFailed').textContent = data.failed;
}

// ---- Jobs ----
function statusClass(status) {
  return `status-badge ${status}`;
}

async function loadJobs() {
  const status = document.getElementById('statusFilter').value;
  const url = status ? `/api/shop/jobs?status=${status}` : '/api/shop/jobs';
  const jobs = await apiGet(url);
  if (!jobs) return;

  const container = document.getElementById('jobsList');
  if (jobs.length === 0) {
    container.innerHTML = '<p class="hint">No jobs found.</p>';
    return;
  }

  container.innerHTML = jobs
    .map((job) => {
      const date = new Date(job.created_at).toLocaleString();
      const retryBtn = job.status === 'FAILED'
        ? `<button class="small-btn" onclick="retryJob('${job.id}')">Retry</button>`
        : '';
      const cancelBtn = job.status === 'QUEUED'
        ? `<button class="small-btn danger" onclick="cancelJob('${job.id}')">Cancel</button>`
        : '';
      return `
        <div class="job-card">
          <div class="job-card-top">
            <strong>${job.original_name}</strong>
            <span class="${statusClass(job.status)}">${job.status}</span>
          </div>
          <div class="hint">${job.copies} copy(ies) • ${job.paper_size} • ${job.color_mode}${job.duplex ? ' • duplex' : ''}</div>
          <div class="hint">₹${job.price} • ${date}</div>
          <div class="job-card-actions">${retryBtn}${cancelBtn}</div>
        </div>
      `;
    })
    .join('');
}

async function retryJob(jobId) {
  const result = await apiPost(`/api/shop/jobs/${jobId}/retry`);
  if (result.error) {
    alert(result.error);
  }
  loadJobs();
}

async function cancelJob(jobId) {
  if (!confirm('Cancel this job?')) return;
  const result = await apiPost(`/api/shop/jobs/${jobId}/cancel`);
  if (result.error) {
    alert(result.error);
  }
  loadJobs();
}

document.getElementById('statusFilter').addEventListener('change', loadJobs);
document.getElementById('refreshJobsBtn').addEventListener('click', loadJobs);

// ---- QR ----
async function loadQr() {
  const data = await apiGet('/api/shop/qr');
  if (!data) return;

  document.getElementById('qrContainer').innerHTML = `
    <img src="${data.qrDataUrl}" alt="Shop QR code" class="qr-image" />
    <p class="hint">${data.customerUrl}</p>
    <a href="${data.qrDataUrl}" download="shop-qr-${data.shopCode}.png" class="secondary-btn">Download PNG</a>
    <button id="printQrBtn" class="secondary-btn">Print QR</button>
  `;

  document.getElementById('printQrBtn').addEventListener('click', () => {
    const win = window.open('', '_blank');
    win.document.write(`<img src="${data.qrDataUrl}" style="width:100%" onload="window.print()" />`);
  });
}

// ---- Init ----
loadStats();
