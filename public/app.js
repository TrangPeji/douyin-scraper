const API_URL = '/api/scrape';

// --- DOM Refs ---
const urlInput = document.getElementById('urlInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsSection = document.getElementById('resultsSection');
const tableBody = document.getElementById('tableBody');
const progressText = document.getElementById('progressText');

let abortController = null;
let isAnalyzing = false;

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncateUrl(url) {
  if (!url) return '';
  const u = String(url);
  return u.length > 50 ? u.substring(0, 47) + '...' : u;
}

// Start processing the list of URLs
async function startBulkAnalysis() {
  if (isAnalyzing) {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    setAnalyzingState(false);
    return;
  }

  const text = urlInput.value.trim();
  if (!text) {
    urlInput.focus();
    return;
  }

  // Extract all links
  const defaultTokens = text.split(/\s+/);
  const links = defaultTokens.filter(t => t.includes('http'));
  
  if (links.length === 0) {
    alert("Không tìm thấy link nào hợp lệ.");
    return;
  }

  // Setup UI for new analysis
  tableBody.innerHTML = '';
  resultsSection.classList.remove('hidden');
  setAnalyzingState(true, links.length);

  abortController = new AbortController();

  let completed = 0;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    
    // Add pending row
    const rowId = `row-${i}`;
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><a href="${escapeHtml(link)}" target="_blank" style="color:var(--primary);text-decoration:none">${escapeHtml(truncateUrl(link))}</a></td>
      <td id="voice-${rowId}">—</td>
      <td id="cap-${rowId}">—</td>
      <td id="encap-${rowId}">—</td>
      <td id="status-${rowId}"><span class="status-badge status-loading">Đang chờ...</span></td>
    `;
    tableBody.appendChild(tr);
  }

  // Process sequentially to be safe with Douyin
  for (let i = 0; i < links.length; i++) {
    if (!isAnalyzing) break; // aborted

    const link = links[i];
    const rowId = `row-${i}`;
    
    document.getElementById(`status-${rowId}`).innerHTML = '<span class="status-badge status-loading">Đang tải...</span>';
    progressText.textContent = `Đang xử lý ${i + 1}/${links.length}...`;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link }),
        signal: abortController.signal
      });
      
      const data = await res.json();
      
      if (data.success) {
        document.getElementById(`voice-${rowId}`).innerHTML = data.hasVoice ? '<span style="color:var(--success)">Có</span>' : '<span style="color:var(--text-3)">Không</span>';
        document.getElementById(`cap-${rowId}`).textContent = data.caption || '';
        document.getElementById(`encap-${rowId}`).textContent = data.captionEnglish || '';
        document.getElementById(`status-${rowId}`).innerHTML = '<span class="status-badge status-success">Thành công</span>';
      } else {
        document.getElementById(`status-${rowId}`).innerHTML = `<span class="status-badge status-error">Lỗi</span>`;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        document.getElementById(`status-${rowId}`).innerHTML = `<span class="status-badge status-error">Đã hủy</span>`;
      } else {
        document.getElementById(`status-${rowId}`).innerHTML = `<span class="status-badge status-error">Lỗi mạng</span>`;
      }
    }
    
    completed++;
  }

  setAnalyzingState(false);
  progressText.textContent = `Hoàn thành! Đã xử lý ${completed}/${links.length} link.`;
}

function setAnalyzingState(state, total = 0) {
  isAnalyzing = state;
  const btnText = analyzeBtn.querySelector('.btn-text');
  if (state) {
    btnText.textContent = 'Dừng phân tích';
    analyzeBtn.style.background = 'rgba(255, 45, 85, 0.2)';
    analyzeBtn.style.color = '#ff6b8a';
    progressText.textContent = `Chuẩn bị phân tích ${total} link...`;
  } else {
    btnText.textContent = 'Bắt đầu Phân tích';
    analyzeBtn.style.background = '';
    analyzeBtn.style.color = '';
  }
}

function copyResultTable() {
  const rows = tableBody.querySelectorAll('tr');
  let tsv = 'STT\tLink\tCó Voice?\tCaption gốc\tCaption (English)\tTrạng thái\n';
  
  rows.forEach(r => {
    const cols = r.querySelectorAll('td');
    if (cols.length === 6) {
      const linkMatch = cols[1].innerHTML.match(/href="([^"]+)"/);
      const link = linkMatch ? linkMatch[1] : cols[1].textContent;
      tsv += `${cols[0].textContent}\t${link}\t${cols[2].textContent}\t"${cols[3].textContent.replace(/"/g, '""')}"\t"${cols[4].textContent.replace(/"/g, '""')}"\t${cols[5].textContent}\n`;
    }
  });

  navigator.clipboard.writeText(tsv).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Đã copy!`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy Bảng`;
    }, 2000);
  }).catch(() => {
    alert('Không thể copy. Hãy thử copy thủ công bảng bên dưới.');
  });
}
