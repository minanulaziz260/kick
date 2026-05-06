const form = document.querySelector('#form');
const btn = document.querySelector('#btn');
const msg = document.querySelector('#message');

function toSec(value) {
  const parts = value.trim().split(':').map(Number);
  if (parts.some(n => Number.isNaN(n) || n < 0)) return NaN;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    url: document.querySelector('#url').value.trim(),
    start: document.querySelector('#start').value.trim(),
    end: document.querySelector('#end').value.trim()
  };

  const duration = toSec(payload.end) - toSec(payload.start);
  if (!Number.isFinite(duration) || duration <= 0) return msg.textContent = 'Waktu tidak valid.';
  if (duration > 30) return msg.textContent = 'Durasi maksimal 30 detik.';

  btn.disabled = true;
  msg.textContent = 'Memproses...';

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Gagal memproses.');
    }

    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kick-cut.mp4';
    document.body.appendChild(a);
    a.click();
    a.remove();
    msg.textContent = 'Selesai. File sedang diunduh.';
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
