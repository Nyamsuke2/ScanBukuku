'use strict';

const OL = {
  BASE: 'https://openlibrary.org',
  search: (q) => `${OL.BASE}/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,cover_i,subject,isbn,publisher,first_publish_year`,
  work: (key) => `${OL.BASE}${key}.json`,
  cover: (id) => id ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : 'https://via.placeholder.com/150x220?text=No+Cover'
};

const App = {
  history: JSON.parse(localStorage.getItem('bookHistory') || '[]'),
  isProcessing: false,
  file: null
};

const $ = (id) => document.getElementById(id);
const toggle = (id, show) => $(id)?.classList.toggle('hidden', !show);

document.addEventListener('DOMContentLoaded', () => {
  $('uploadZone')?.addEventListener('click', () => !App.isProcessing && $('fileInput').click());
  $('fileInput')?.addEventListener('change', e => Handler(e.target.files[0]));
  $('manualQuery')?.addEventListener('keydown', e => e.key === 'Enter' && CariManual());
  WarnaRiwayat();
});

window.resetAll = function() {
  App.file = null;
  App.isProcessing = false;
  if ($('fileInput')) $('fileInput').value = '';
  if ($('manualQuery')) $('manualQuery').value = '';
  
  toggle('previewArea', false);
  toggle('ocrResult', false);
  toggle('bookResult', false);
  toggle('recommendations', false); 
  
  console.log("System Reset Success");
};

function Handler(file) {
  if (!file?.type.startsWith('image/')) return alert('Gunakan gambar!');
  App.file = file;
  const reader = new FileReader();
  reader.onload = e => {
    toggle('previewArea', true);
    $('previewImg').src = e.target.result;
    $('previewFileName').textContent = file.name;
    const sizeKB = (file.size / 1024).toFixed(1);
    $('previewFileSize').textContent = `${sizeKB} KB`;
  };
  reader.readAsDataURL(file);
}

function analisisTeksOCR(rawText) {
  if (!rawText) return [];

  const noiseWords = [/bestseller/i, /masterpiece/i, /supreme/i, /novel/i, /edisi/i, /classics/i, /english/i, /classic/i, /^gt$/i];
  
  const lines = rawText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 1);

  const daftarPenulis = [/stephen\s*king/i, /lewis\s*carroll/i, /tere\s*liye/i, /j\s*\.\s*k\s*\.\s*rowling/i, /dee\s*lestari/i, /james\s*clear/i, /frank\s*herbert/i];
  
  let detectedAuthor = '';
  let sisaBarisJudul = [];

  lines.forEach(line => {
    let isAuthor = false;
    daftarPenulis.forEach(regex => {
      if (regex.test(line)) {
        detectedAuthor = line;
        isAuthor = true;
      }
    });
    
    if (!isAuthor && !noiseWords.some(regex => regex.test(line))) {
      sisaBarisJudul.push(line);
    }
  });

  let kandidatPencarian = [];

  if (sisaBarisJudul.length > 0) {
    const fullTitleCandidate = sisaBarisJudul.join(' ');
    kandidatPencarian.push({ q: fullTitleCandidate, author: detectedAuthor });
    
    if (sisaBarisJudul[0] && sisaBarisJudul[1]) {
      kandidatPencarian.push({ q: `${sisaBarisJudul[0]} ${sisaBarisJudul[1]}`, author: detectedAuthor });
    }
    
    if (sisaBarisJudul[0]) kandidatPencarian.push({ q: sisaBarisJudul[0], author: detectedAuthor });
    if (sisaBarisJudul[1]) kandidatPencarian.push({ q: sisaBarisJudul[1], author: detectedAuthor });
  }

  const textCleaned = lines.filter(l => !noiseWords.some(r => r.test(l))).join(' ');
  kandidatPencarian.push({ q: textCleaned, author: '' });

  const unikKandidat = [];
  const map = new Map();
  for (const item of kandidatPencarian) {
    const key = `${item.q}|${item.author}`;
    if (!map.has(key) && item.q.trim().length > 2) {
      map.set(key, true);
      unikKandidat.push(item);
    }
  }

  return unikKandidat;
}

async function startProcessing() {
  if (!App.file || App.isProcessing) return;
  App.isProcessing = true;
  
  try {
    const formData = new FormData();
    formData.append('image', App.file);
    const res = await fetch('https://inibukuku.up.railway.app/ocr', { 
      method: 'POST', 
      body: formData 
    });

    if (!res.ok) {
      const error = await res.json();
      console.log(error);
      throw new Error(error.error || "OCR gagal");
    }

    const ocrData = await res.json();
    TampilkanOCR(ocrData.text, ocrData.confidence);
    
    console.log("OCR TEXT RAW:\n", ocrData.text);

    const daftarKandidat = analisisTeksOCR(ocrData.text);
    console.log("KANDIDAT QUERY BERSTRUKTUR:", daftarKandidat);
    
    if (daftarKandidat.length === 0) {
      alert('Teks tidak terdeteksi jelas, silakan gunakan pencarian manual.');
      App.isProcessing = false;
      return;
    }

    let berhasil = false;
    for (let i = 0; i < daftarKandidat.length; i++) {
      console.log(`Mencoba kombinasi ke-${i + 1}: Judul=[${daftarKandidat[i].q}], Penulis=[${daftarKandidat[i].author}]`);
      try {
        await execSearch(daftarKandidat[i].q, daftarKandidat[i].author, false);
        berhasil = true;
        console.log(`🎉 Sukses! Buku ditemukan.`);
        break; 
      } catch (err) {
        console.log(`Kombinasi ke-${i + 1} gagal. Mencoba alternatif berikutnya...`);
      }
    }

    if (!berhasil) {
      alert("Buku gagal diidentifikasi secara tepat dari cover. Silakan gunakan Pencarian Manual di bawah.");
    }

  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    App.isProcessing = false;
  }
}

async function CariManual() {
  const q = $('manualQuery').value.trim();
  if (!q || App.isProcessing) return;
  App.isProcessing = true;
  toggle('ocrResult', false);
  try {
    await execSearch(q, '', false);
  } catch (err) {
    alert(err.message);
  } finally {
    App.isProcessing = false;
  }
}

async function execSearch(query, author = '', isHistory = false) {
  toggle('recommendations', false);

  const res = await fetch('https://inibukuku.up.railway.app/api/search', {
      method: 'POST',
      mode: 'cors', 
      headers: { 
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, author: author })
  });
  
  if (!res.ok) throw new Error('Gagal menghubungi database Open Library via Server');
  const data = await res.json();
  if (!data.docs?.length) throw new Error('Buku tidak ditemukan di database.');
  
  let book = data.docs[0];

  try {
    const workRes = await fetch(OL.work(book.key));
    if (workRes.ok) {
      const workData = await workRes.json();
      book.description = workData.description 
        ? (typeof workData.description === 'string' ? workData.description : workData.description.value)
        : "Deskripsi belum tersedia.";
    }
  } catch (e) {
    book.description = "Deskripsi gagal dimuat.";
  }

  TampilkanBuku(book);
  if (!isHistory) TambahRiwayat(book);
  
  FetchRekomendasi(book);
}

async function FetchRekomendasi(book) {
  try {
    toggle('recommendations', true);
    $('recoGrid').innerHTML = '<p class="font-mono col-span-full text-center py-4">Mencari buku serupa...</p>';

    let queryUrl = '';
    if (book.author_name && book.author_name.length > 0) {
        queryUrl = `https://openlibrary.org/search.json?author=${encodeURIComponent(book.author_name[0])}&limit=8&fields=key,title,author_name,cover_i`;
    } 
    else if (book.subject && book.subject.length > 0) {
        queryUrl = `https://openlibrary.org/search.json?subject=${encodeURIComponent(book.subject[0])}&limit=8&fields=key,title,author_name,cover_i`;
    } else {
        toggle('recommendations', false);
        return;
    }

    const res = await fetch(queryUrl);
    if (!res.ok) throw new Error('Gagal memuat rekomendasi');
    const data = await res.json();
    
    const recs = data.docs.filter(b => b.key !== book.key).slice(0, 4);
    
    if (recs.length > 0) {
      TampilkanRekomendasi(recs);
    } else {
      toggle('recommendations', false);
    }
  } catch (err) {
    console.error("Rekomendasi Error:", err);
    toggle('recommendations', false);
  }
}

function TampilkanRekomendasi(recs) {
  const colors = ['#fde047', '#a7f3d0', '#f9a8d4', '#93c5fd'];
  
  $('recoGrid').innerHTML = recs.map((r, i) => {
    const coverUrl = OL.cover(r.cover_i);
    const author = r.author_name?.[0] || 'Unknown';
    const safeTitle = r.title.replace(/'/g, "\\'"); 
    const bgColor = colors[i % colors.length];
    
    return `
      <div onclick="execSearch('${safeTitle}', '', false)" class="neo-card p-4 flex flex-col items-center text-center cursor-pointer hover:-translate-y-2 transition-transform" style="background-color: ${bgColor};">
        <img src="${coverUrl}" class="w-24 h-36 border-3 border-black object-cover mb-4 bg-white shadow-[3px_3px_0_0_#000]" alt="cover">
        <h3 class="font-bold text-sm uppercase line-clamp-2 mb-2 w-full truncate">${r.title}</h3>
        <p class="text-[11px] font-mono font-bold bg-white border-2 border-black px-2 py-0.5 shadow-[2px_2px_0_0_#000] w-full truncate">${author}</p>
      </div>
    `;
  }).join('');
}

function TampilkanOCR(text, conf) {
  toggle('ocrResult', true);
  $('ocrText').textContent = text || '';
  const c = (typeof conf === 'number') ? (conf <= 1 ? conf * 100 : conf) : 0;
  $('confidenceFill').style.width = Math.min(100, c) + '%';
  $('confidenceVal').textContent = Math.round(c) + '%';
}

function TambahRiwayat(b) {
  const item = { key: b.key, title: b.title, author: b.author_name?.[0] || 'Unknown', cover: OL.cover(b.cover_i) };
  App.history = [item, ...App.history.filter(x => x.key !== item.key)].slice(0, 10);
  localStorage.setItem('bookHistory', JSON.stringify(App.history));
  WarnaRiwayat();
}

window.HapusRiwayat = function() {
  App.history = [];
  localStorage.removeItem('bookHistory');
  WarnaRiwayat();
};

function WarnaRiwayat() {
  const list = $('historyList');
  if (!list) return;
  toggle('historySection', App.history.length > 0);

  const colors = ['#fde047', '#a7f3d0', '#f9a8d4', '#93c5fd', '#fb923c'];

  list.innerHTML = App.history.map((h, i) => `
    <div onclick="execSearch('${h.title.replace(/'/g, "\\'")}', '', true)" 
         class="neo-card p-3 flex items-center gap-4 mb-3 cursor-pointer hover:translate-x-1 transition-transform"
         style="background-color: ${colors[i % colors.length]};">
      <img src="${h.cover}" class="w-10 h-14 border-2 border-black" alt="cover">
      <div class="flex-1 min-w-0">
        <p class="font-black truncate text-xs uppercase">${h.title}</p>
        <p class="text-[10px] font-mono text-gray-700">${h.author}</p>
      </div>
    </div>
  `).join('');
}

function TampilkanBuku(b) {
  toggle('bookResult', true);
  $('bookResult').innerHTML = `
    <div class="neo-card p-6 flex flex-col md:flex-row gap-6" style="background-color: #e0f2fe;">
      <img src="${OL.cover(b.cover_i)}" class="w-40 h-56 border-4 border-black object-cover bg-white shrink-0 shadow-[4px_4px_0_0_#000]" alt="cover">
      <div class="flex-1 min-w-0">
        <h2 class="text-3xl font-black mb-1 uppercase">${b.title}</h2>
        <p class="font-mono font-bold bg-[#fde047] border-2 border-black shadow-[2px_2px_0_0_#000] inline-block px-3 py-1 mb-4">${b.author_name?.join(', ') || 'Unknown'}</p>
        
        <div class="text-sm font-bold mb-4 italic border-l-4 border-black pl-3 p-3 bg-white border-2 border-black shadow-[inset_2px_2px_0_0_rgba(0,0,0,0.05)] overflow-y-auto" style="max-height: 150px;">
          "${b.description || 'Deskripsi tidak tersedia.'}"
        </div>

        <div class="grid grid-cols-2 gap-4 text-xs font-mono mb-6">
           <div class="p-2 border-2 border-black bg-white shadow-[2px_2px_0_0_#000]"><strong>Penerbit:</strong> <br>${b.publisher?.[0] || '-'}</div>
           <div class="p-2 border-2 border-black bg-white shadow-[2px_2px_0_0_#000]"><strong>Tahun Rilis:</strong> <br>${b.first_publish_year || '-'}</div>
        </div>
        
        <div class="flex gap-3">
           <a href="https://www.tokopedia.com/search?q=${encodeURIComponent(b.title)}" target="_blank" 
              class="neo-btn px-4 py-2 text-xs text-white font-bold tracking-wider" style="background-color: #42b549; border: 3px solid black; box-shadow: 4px 4px 0px black;">TOKOPEDIA</a>
           <a href="https://shopee.co.id/search?keyword=${encodeURIComponent(b.title)}" target="_blank" 
              class="neo-btn px-4 py-2 text-xs text-white font-bold tracking-wider" style="background-color: #ee4d2d; border: 3px solid black; box-shadow: 4px 4px 0px black;">SHOPEE</a>
        </div>
      </div>
    </div>
  `;
  $('bookResult').scrollIntoView({ behavior: 'smooth', block: 'center' });
}