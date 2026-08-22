(() => {
  let addressesByOrder = new Map();
  let lastToken = '';

  function apiUrl(path) {
    return new URL(`../api${path}`, window.location.href).toString();
  }

  function addAddressToOrderModal() {
    document.querySelectorAll('.admin-order-modal').forEach((modal) => {
      if (modal.querySelector('[data-admin-delivery-address]')) return;
      const title = modal.querySelector('h2');
      const orderNumber = String(title?.textContent || '').replace(/^Order Details:\s*/, '').trim();
      const address = addressesByOrder.get(orderNumber);
      const grid = modal.querySelector('.admin-detail-grid');
      if (!address || !grid) return;

      const block = document.createElement('div');
      block.dataset.adminDeliveryAddress = '';
      block.style.gridColumn = '1 / -1';
      const label = document.createElement('p');
      label.textContent = 'Delivery Address';
      label.style.cssText = 'color:#666;font-size:.8rem;margin-bottom:2px';
      const value = document.createElement('p');
      value.textContent = address;
      value.style.cssText = 'font-weight:600;white-space:pre-wrap';
      block.append(label, value);
      grid.append(block);
    });
  }

  function addAddressToLms() {
    document.querySelectorAll('.admin-history-order').forEach((orderRow) => {
      if (orderRow.querySelector('[data-admin-order-address]')) return;
      const orderNumber = String(orderRow.querySelector('button')?.textContent || '').trim();
      const address = addressesByOrder.get(orderNumber);
      if (!address) return;

      const value = document.createElement('span');
      value.dataset.adminOrderAddress = '';
      value.textContent = `Delivery address for ${orderNumber}: ${address}`;
      value.style.cssText = 'grid-column:1 / -1;color:#444;font-size:.85rem;line-height:1.35;white-space:pre-wrap';
      orderRow.append(value);
    });
  }

  function refreshDisplay() {
    addAddressToOrderModal();
    addAddressToLms();
  }

  async function loadAddresses() {
    const token = localStorage.getItem('adminToken') || '';
    if (!token || token === lastToken) return;
    lastToken = token;
    try {
      const response = await fetch(apiUrl('/admin/orders'), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!response.ok) return;
      const orders = await response.json();
      addressesByOrder = new Map();
      orders.forEach((order) => {
        const address = String(order.address || '').trim();
        // Older Home Delivery orders were mistakenly saved as Dine In. An
        // entered address remains useful and must be visible to staff.
        if (!address) return;
        addressesByOrder.set(order.orderNumber, address);
      });
      refreshDisplay();
    } catch {
      // The existing admin dashboard remains usable and retries after login.
    }
  }

  new MutationObserver(refreshDisplay).observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(loadAddresses, 3000);
  document.addEventListener('DOMContentLoaded', () => { loadAddresses(); refreshDisplay(); });
})();
