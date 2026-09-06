document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('loginError');
  errorEl.hidden = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    localStorage.setItem('shopToken', data.token);
    localStorage.setItem('shopName', data.shop.name);
    localStorage.setItem('shopCode', data.shop.shop_code);
    window.location.href = 'dashboard.html';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});
