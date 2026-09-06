const params = new URLSearchParams(window.location.search);
const shopCode = params.get('shop');
const existingJobId = params.get('job');
const existingToken = params.get('token');

const el = (id) => document.getElementById(id);
const show = (id) => { el(id).hidden = false; };
const hide = (id) => { el(id).hidden = true; };

let pricingTable = [];
let uploadedFile = null; // { id, pageCount, originalName, mimeType }

// ---- Page range parser (mirrors backend logic for live preview) ----
function parsePageRangeClient(str, totalPages) {
  if (!str || str.trim() === '') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set();
  const parts = str.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [s, e] = part.split('-').map((x) => parseInt(x.trim(), 10));
      if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e < s || e > totalPages) {
        throw new Error(`Invalid range "${part}"`);
      }
      for (let p = s; p <= e; p++) pages.add(p);
    } else {
      const p = parseInt(part, 10);
      if (!Number.isInteger(p) || p < 1 || p > totalPages) {
        throw new Error(`Invalid page "${part}"`);
      }
      pages.add(p);
    }
  }
  if (pages.size === 0) throw new Error('No pages selected');
  return Array.from(pages);
}

function findPrice(paperSize, colorMode, duplex) {
  const match = pricingTable.find(
    (p) => p.paperSize === paperSize && p.colorMode === colorMode && p.duplex === duplex
  );
  return match ? match.pricePerPage : null;
}

function recalculatePrice() {
  if (!uploadedFile) return;
  const copies = parseInt(el('copiesInput').value, 10) || 1;
  const paperSize = document.querySelector('input[name="paperSize"]:checked').value;
  const colorMode = document.querySelector('input[name="colorMode"]:checked').value;
  const duplex = el('duplexInput').checked;
  const pageRange = el('pageRangeInput').value;

  hide('optionsError');
  try {
    const pages = parsePageRangeClient(pageRange, uploadedFile.pageCount);
    const pricePerPage = findPrice(paperSize, colorMode, duplex);
    if (pricePerPage === null) {
      el('priceDisplay').textContent = 'N/A';
      el('submitBtn').disabled = true;
      el('optionsError').textContent = 'Pricing not available for this combination.';
      show('optionsError');
      return;
    }
    const total = (pages.length * copies * pricePerPage).toFixed(2);
    el('priceDisplay').textContent = `₹${total}`;
    el('submitBtn').disabled = false;
  } catch (err) {
    el('priceDisplay').textContent = '—';
    el('submitBtn').disabled = true;
    el('optionsError').textContent = err.message;
    show('optionsError');
  }
}

async function loadShop() {
  try {
    const res = await fetch(`/api/shops/${shopCode}`);
    if (!res.ok) throw new Error('not found');
    const shop = await res.json();
    el('shopName').textContent = shop.name;

    const pricingRes = await fetch(`/api/shops/${shopCode}/pricing`);
    pricingTable = pricingRes.ok ? await pricingRes.json() : [];

    show('screen-upload');
  } catch (err) {
    el('shopName').textContent = 'Shop not found';
    show('screen-error');
  }
}

el('fileInput').addEventListener('change', () => {
  const file = el('fileInput').files[0];
  hide('uploadError');
  if (!file) {
    el('uploadBtn').disabled = true;
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    el('uploadError').textContent = 'File exceeds 20 MB limit.';
    show('uploadError');
    el('uploadBtn').disabled = true;
    return;
  }
  el('uploadBtn').disabled = false;
});

el('uploadBtn').addEventListener('click', async () => {
  const file = el('fileInput').files[0];
  if (!file) return;

  el('uploadBtn').disabled = true;
  el('uploadBtn').textContent = 'Uploading...';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('shopCode', shopCode);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    uploadedFile = { id: data.id, pageCount: data.pageCount, originalName: data.originalName, mimeType: data.mimeType };
    el('fileInfo').textContent = `${data.originalName} — ${data.pageCount} page(s)`;

    hide('screen-upload');
    show('screen-options');
    recalculatePrice();
  } catch (err) {
    el('uploadError').textContent = err.message;
    show('uploadError');
    el('uploadBtn').disabled = false;
    el('uploadBtn').textContent = 'Continue';
  }
});

['copiesInput', 'pageRangeInput'].forEach((id) => el(id).addEventListener('input', recalculatePrice));
['duplexInput'].forEach((id) => el(id).addEventListener('change', recalculatePrice));
document.querySelectorAll('input[name="paperSize"], input[name="colorMode"]').forEach((input) =>
  input.addEventListener('change', recalculatePrice)
);

el('submitBtn').addEventListener('click', async () => {
  const body = {
    fileId: uploadedFile.id,
    shopCode,
    copies: parseInt(el('copiesInput').value, 10) || 1,
    colorMode: document.querySelector('input[name="colorMode"]:checked').value,
    paperSize: document.querySelector('input[name="paperSize"]:checked').value,
    duplex: el('duplexInput').checked,
    pageRange: el('pageRangeInput').value || undefined,
  };

  hide('screen-options');
  show('screen-submitting');

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create job');

    const url = new URL(window.location.href);
    url.searchParams.set('job', data.jobId);
    url.searchParams.set('token', data.customerToken);
    window.history.replaceState({}, '', url);

    startTracking(data.jobId, data.customerToken);
  } catch (err) {
    hide('screen-submitting');
    show('screen-options');
    el('optionsError').textContent = err.message;
    show('optionsError');
  }
});

function startTracking(jobId, token) {
  hide('screen-submitting');
  hide('screen-options');
  hide('screen-upload');
  show('screen-tracking');

  async function poll() {
    try {
      const res = await fetch(`/api/jobs/${jobId}/${token}`);
      if (!res.ok) {
        el('trackingInfo').textContent = 'Job not found.';
        return;
      }
      const job = await res.json();
      const badge = el('statusBadge');
      badge.textContent = job.status;
      badge.className = `status-badge ${job.status}`;
      el('trackingInfo').textContent = `${job.original_name} — ${job.copies} copy(ies), ${job.paper_size}, ${job.color_mode}`;
      el('trackingPrice').textContent = `Price: ₹${job.price}`;

      if (job.status === 'COMPLETED' || job.status === 'FAILED_PERMANENT') {
        clearInterval(intervalId);
        el('trackingHint').textContent =
          job.status === 'COMPLETED' ? 'Your print is ready for pickup!' : 'This job failed permanently. Please contact the shop.';
      }
    } catch (err) {
      // network hiccup, keep polling
    }
  }

  poll();
  const intervalId = setInterval(poll, 3000);
}

// ---- Entry point ----
if (existingJobId && existingToken) {
  startTracking(existingJobId, existingToken);
} else if (shopCode) {
  loadShop();
} else {
  el('shopName').textContent = 'Invalid link';
  show('screen-error');
}
