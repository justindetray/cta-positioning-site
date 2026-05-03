const state = {
  data: null,
  assetFilter: 'All',
  selectedProduct: null,
  theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
};

const fmt = {
  pct: (v, digits = 1) => (v === null || Number.isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`),
  pctNoSign: (v, digits = 0) => (v === null || Number.isNaN(v) ? '—' : `${v.toFixed(digits)}%`),
  num: (v, digits = 2) =>
    v === null || Number.isNaN(v)
      ? '—'
      : v >= 1000
        ? v.toLocaleString(undefined, { maximumFractionDigits: digits })
        : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  z: (v) => (v === null || Number.isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`),
};

const assetOrder = ['All', 'Equities', 'Rates', 'FX', 'Energy', 'Metals'];

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.querySelector('[data-theme-toggle]');
  btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  btn.innerHTML =
    theme === 'dark'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

function visibleLatest() {
  const rows = state.data.latest;
  return state.assetFilter === 'All' ? rows : rows.filter((row) => row.asset_class === state.assetFilter);
}

function colorForPosition(position) {
  if (position > 10) return cssVar('--color-positive');
  if (position < -10) return cssVar('--color-negative');
  return cssVar('--color-text-faint');
}

function regimeFor(row) {
  const position = row.cta_position_pct;
  const change = row.position_1m_change;
  const positionLabel = position < -10 ? 'Net short' : position > 10 ? 'Net long' : 'Near neutral';
  let flowLabel = 'Little 1M change';
  if (Math.abs(change) >= 10) {
    if (position < 0 && change < 0) flowLabel = 'Adding shorts';
    else if (position < 0 && change > 0) flowLabel = 'Covering shorts';
    else if (position > 0 && change > 0) flowLabel = 'Adding longs';
    else if (position > 0 && change < 0) flowLabel = 'Cutting longs';
    else flowLabel = change > 0 ? 'Buying / covering' : 'Selling / shorting';
  }
  return { positionLabel, flowLabel };
}

function renderRegimeChips(row) {
  const { positionLabel, flowLabel } = regimeFor(row);
  const chips = [
    {
      label: positionLabel,
      kind: row.cta_position_pct < -10 ? 'short' : row.cta_position_pct > 10 ? 'long' : 'neutral',
    },
    {
      label: flowLabel,
      kind:
        flowLabel === 'Adding shorts' || flowLabel === 'Cutting longs'
          ? 'short'
          : flowLabel === 'Covering shorts' || flowLabel === 'Adding longs'
            ? 'long'
            : 'neutral',
    },
  ];
  document.getElementById('regimeChips').innerHTML = chips
    .map((chip) => {
      const color =
        chip.kind === 'short'
          ? cssVar('--color-negative')
          : chip.kind === 'long'
            ? cssVar('--color-positive')
            : cssVar('--color-text-muted');
      const bg =
        chip.kind === 'short'
          ? 'color-mix(in oklab, var(--color-negative) 14%, var(--color-surface-2))'
          : chip.kind === 'long'
            ? 'color-mix(in oklab, var(--color-positive) 14%, var(--color-surface-2))'
            : 'var(--color-surface-offset)';
      return `<span class="regime-chip" style="--chip-color:${color};--chip-border:${color};--chip-bg:${bg}">${chip.label}</span>`;
    })
    .join('');
}

function renderMeta() {
  const { meta } = state.data;
  document.getElementById('feedMeta').textContent = `${meta.dataset} · ${meta.schema}`;
  document.getElementById('rollMeta').textContent = meta.roll_rule;
  document.getElementById('latestMeta').textContent = meta.latest_signal_date;
}

function renderFilters() {
  const container = document.getElementById('assetFilters');
  const counts = state.data.latest.reduce((acc, row) => {
    acc[row.asset_class] = (acc[row.asset_class] || 0) + 1;
    return acc;
  }, {});
  counts.All = state.data.latest.length;

  container.innerHTML = assetOrder
    .filter((asset) => asset === 'All' || counts[asset])
    .map(
      (asset) => `
        <button class="filter-button" type="button" aria-pressed="${state.assetFilter === asset}" data-asset="${asset}">
          <span>${asset}</span>
          <span class="pill-count">${counts[asset]}</span>
        </button>
      `,
    )
    .join('');

  container.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.assetFilter = button.dataset.asset;
      const visible = visibleLatest();
      if (!visible.some((row) => row.product === state.selectedProduct)) {
        state.selectedProduct = visible[0]?.product || state.data.latest[0].product;
      }
      render();
    });
  });
}

function renderInstrumentSelect() {
  const select = document.getElementById('instrumentSelect');
  const rows = visibleLatest();
  select.innerHTML = rows.map((row) => `<option value="${row.product}">${row.product} · ${row.name}</option>`).join('');
  select.value = state.selectedProduct;
  select.onchange = () => {
    state.selectedProduct = select.value;
    render();
  };
}

function renderKpis() {
  const rows = visibleLatest();
  const net = rows.reduce((sum, row) => sum + row.cta_position_pct, 0) / Math.max(rows.length, 1);
  const sortedLong = [...rows].sort((a, b) => b.cta_position_pct - a.cta_position_pct);
  const sortedShort = [...rows].sort((a, b) => a.cta_position_pct - b.cta_position_pct);
  const sortedShift = [...rows].sort((a, b) => Math.abs(b.position_1m_change || 0) - Math.abs(a.position_1m_change || 0));

  document.getElementById('netPosition').textContent = fmt.pct(net);
  document.getElementById('netPositionSub').textContent = `${rows.length} instruments visible`;
  document.getElementById('largestLong').textContent = sortedLong[0]?.product || '—';
  document.getElementById('largestLongSub').textContent = sortedLong[0] ? fmt.pct(sortedLong[0].cta_position_pct) : '—';
  document.getElementById('largestShort').textContent = sortedShort[0]?.product || '—';
  document.getElementById('largestShortSub').textContent = sortedShort[0] ? fmt.pct(sortedShort[0].cta_position_pct) : '—';
  document.getElementById('largestShift').textContent = sortedShift[0]?.product || '—';
  document.getElementById('largestShiftSub').textContent = sortedShift[0] ? fmt.pct(sortedShift[0].position_1m_change) : '—';
}

function renderPositionMap() {
  const container = document.getElementById('positionMap');
  const rows = visibleLatest();
  container.innerHTML = rows
    .map((row) => {
      const abs = Math.min(100, Math.abs(row.cta_position_pct));
      const color = colorForPosition(row.cta_position_pct);
      const intensity = Math.max(8, Math.min(44, abs * 0.42));
      return `
        <button class="position-tile ${row.product === state.selectedProduct ? 'is-selected' : ''}" type="button"
          data-product="${row.product}" style="--tile-color:${color};--tile-intensity:${intensity}%">
          <div class="product">${row.product}</div>
          <div class="asset">${row.asset_class}</div>
          <div class="position">${fmt.pct(row.cta_position_pct)}</div>
          <div class="delta">1M Δ ${fmt.pct(row.position_1m_change)}</div>
        </button>
      `;
    })
    .join('');

  container.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedProduct = button.dataset.product;
      render();
    });
  });
}

function renderAssetSummary() {
  const container = document.getElementById('assetSummary');
  const groups = {};
  state.data.latest.forEach((row) => {
    groups[row.asset_class] ||= [];
    groups[row.asset_class].push(row);
  });
  const rows = Object.entries(groups)
    .map(([asset, items]) => ({
      asset,
      avg: items.reduce((sum, row) => sum + row.cta_position_pct, 0) / items.length,
      count: items.length,
    }))
    .sort((a, b) => assetOrder.indexOf(a.asset) - assetOrder.indexOf(b.asset));

  container.innerHTML = rows
    .map((row) => {
      const color = colorForPosition(row.avg);
      return `
        <div class="asset-row">
          <header>
            <div>${row.asset} <span class="neutral-text">(${row.count})</span></div>
            <strong class="${row.avg >= 0 ? 'positive' : 'negative'}">${fmt.pct(row.avg)}</strong>
          </header>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill" style="--bar-value:${Math.min(100, Math.abs(row.avg))};--bar-color:${color}"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderTable() {
  const rows = visibleLatest().sort((a, b) => Math.abs(b.cta_position_pct) - Math.abs(a.cta_position_pct));
  document.getElementById('trackerTable').innerHTML = rows
    .map((row) => {
      const posClass = row.cta_position_pct > 0 ? 'positive' : row.cta_position_pct < 0 ? 'negative' : 'neutral-text';
      return `
        <tr>
          <td><span class="product-cell"><i class="status-dot" style="--status-color:${colorForPosition(row.cta_position_pct)}"></i>${row.product}</span></td>
          <td>${row.asset_class}</td>
          <td class="num">${fmt.num(row.close, 4)}</td>
          <td class="num ${posClass}">${fmt.pct(row.cta_position_pct)}</td>
          <td class="num ${row.position_1m_change >= 0 ? 'positive' : 'negative'}">${fmt.pct(row.position_1m_change)}</td>
          <td class="num">${fmt.pctNoSign(row.percentile_1y * 100, 0)}</td>
          <td class="num">${fmt.z(row.zscore_3m)}</td>
          <td class="num">${fmt.num(row.buy_trigger_level, 4)}</td>
          <td class="num">${fmt.num(row.sell_trigger_level, 4)}</td>
        </tr>
      `;
    })
    .join('');
}

function drawHistoryChart() {
  const canvas = document.getElementById('historyChart');
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(720, rect.width * ratio);
  canvas.height = rect.height * ratio;
  ctx.scale(ratio, ratio);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 20, right: 56, bottom: 34, left: 58 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const priceH = plotH * 0.58;
  const signalTop = pad.top + priceH + 46;
  const signalH = plotH - priceH - 46;
  const rows = state.data.history.filter((row) => row.product === state.selectedProduct);
  const latest = state.data.latest.find((row) => row.product === state.selectedProduct);

  ctx.clearRect(0, 0, w, h);
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';

  if (!rows.length) return;

  const prices = rows.map((row) => row.close).filter((v) => v !== null);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const pPad = (maxP - minP) * 0.08 || 1;
  const minPrice = minP - pPad;
  const maxPrice = maxP + pPad;
  const minPos = -100;
  const maxPos = 100;

  const x = (i) => pad.left + (i / Math.max(rows.length - 1, 1)) * plotW;
  const yPrice = (v) => pad.top + (1 - (v - minPrice) / (maxPrice - minPrice)) * priceH;
  const yPos = (v) => signalTop + (1 - (v - minPos) / (maxPos - minPos)) * signalH;

  function gridLine(y, label, axis = 'price') {
    ctx.strokeStyle = cssVar('--color-grid');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    ctx.fillStyle = cssVar('--color-text-muted');
    ctx.textAlign = axis === 'price' ? 'right' : 'left';
    ctx.fillText(label, axis === 'price' ? pad.left - 10 : pad.left + plotW + 10, y);
  }

  [0, 0.5, 1].forEach((t) => gridLine(pad.top + t * priceH, fmt.num(maxPrice - t * (maxPrice - minPrice), 0), 'price'));
  [-100, 0, 100].forEach((v) => gridLine(yPos(v), `${v}%`, 'signal'));

  ctx.strokeStyle = cssVar('--color-text');
  ctx.lineWidth = 2;
  ctx.beginPath();
  rows.forEach((row, i) => {
    const px = x(i);
    const py = yPrice(row.close);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  ['buy_trigger_level', 'sell_trigger_level'].forEach((key) => {
    const val = latest?.[key];
    if (val === null || Number.isNaN(val) || val < minPrice || val > maxPrice) return;
    ctx.strokeStyle = key === 'buy_trigger_level' ? cssVar('--color-positive') : cssVar('--color-negative');
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(pad.left, yPrice(val));
    ctx.lineTo(pad.left + plotW, yPrice(val));
    ctx.stroke();
    ctx.setLineDash([]);
  });

  const zeroY = yPos(0);
  ctx.strokeStyle = cssVar('--color-text-faint');
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(pad.left + plotW, zeroY);
  ctx.stroke();
  ctx.fillStyle = cssVar('--color-text-muted');
  ctx.textAlign = 'left';
  ctx.fillText('zero / neutral', pad.left + 8, zeroY - 12);

  function fillExposureArea(predicate, fillStyle) {
    ctx.fillStyle = fillStyle;
    let segment = [];
    const flush = () => {
      if (segment.length < 2) {
        segment = [];
        return;
      }
      ctx.beginPath();
      ctx.moveTo(x(segment[0].i), zeroY);
      segment.forEach((point) => ctx.lineTo(x(point.i), yPos(point.v)));
      ctx.lineTo(x(segment[segment.length - 1].i), zeroY);
      ctx.closePath();
      ctx.fill();
      segment = [];
    };
    rows.forEach((row, i) => {
      const v = row.cta_position_pct;
      if (v !== null && predicate(v)) segment.push({ i, v });
      else flush();
    });
    flush();
  }

  fillExposureArea((v) => v > 0, state.theme === 'dark' ? 'rgba(111,186,163,0.24)' : 'rgba(31,118,100,0.18)');
  fillExposureArea((v) => v < 0, state.theme === 'dark' ? 'rgba(224,132,104,0.24)' : 'rgba(168,75,47,0.18)');

  ctx.beginPath();
  rows.forEach((row, i) => {
    const px = x(i);
    const py = yPos(row.cta_position_pct);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = cssVar('--color-primary');
  ctx.lineWidth = 2.25;
  ctx.stroke();

  ctx.fillStyle = cssVar('--color-text-muted');
  ctx.textAlign = 'left';
  ctx.fillText(rows[0].date, pad.left, h - 14);
  ctx.textAlign = 'right';
  ctx.fillText(rows[rows.length - 1].date, pad.left + plotW, h - 14);

  document.getElementById('selectedAssetClass').textContent = `${latest.asset_class} · ${latest.name}`;
  document.getElementById('selectedPosition').textContent = `${latest.product} ${fmt.pct(latest.cta_position_pct)} · 1M Δ ${fmt.pct(latest.position_1m_change)}`;
  renderRegimeChips(latest);
}

function exportCsv() {
  const rows = visibleLatest();
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')]
    .concat(
      rows.map((row) =>
        headers
          .map((header) => {
            const value = row[header] ?? '';
            return `"${String(value).replaceAll('"', '""')}"`;
          })
          .join(','),
      ),
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cta-latest-${state.assetFilter.toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function render() {
  renderFilters();
  renderInstrumentSelect();
  renderKpis();
  renderPositionMap();
  renderAssetSummary();
  renderTable();
  drawHistoryChart();
}

async function init() {
  setTheme(state.theme);
  document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
    drawHistoryChart();
  });
  document.getElementById('exportCsv').addEventListener('click', exportCsv);
  const response = await fetch('assets/dashboard-data.json');
  state.data = await response.json();
  state.selectedProduct = state.data.latest.find((row) => row.product === 'ES')?.product || state.data.latest[0].product;
  renderMeta();
  render();
  window.addEventListener('resize', () => requestAnimationFrame(drawHistoryChart));
}

init().catch((error) => {
  document.getElementById('main').innerHTML = `<section class="panel"><h2>Dashboard failed to load</h2><p>${error.message}</p></section>`;
});
