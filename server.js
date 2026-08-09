require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');

const app    = express();
const upload = multer();

app.use(cors());
app.use(express.json());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

app.post('/ocr', upload.single('image'), async (req, response) => {
  try {
    if (!req.file)       return response.status(400).json({ error: 'No file uploaded' });
    if (!GOOGLE_API_KEY) return response.status(500).json({ error: 'GOOGLE_API_KEY belum di-set' });

    const base64    = req.file.buffer.toString('base64');
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image:        { content: base64 },
            features:     [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['en', 'id'] },
          }],
        }),
      }
    );

    const data = await visionRes.json();

    if (!visionRes.ok) {
      console.error('Vision error detail:', JSON.stringify(data, null, 2));
      return response.status(visionRes.status).json({
        error: 'Google Vision error',
        details: data,
      });
    }

    const raw  = data.responses?.[0] || {};
    const text = raw.fullTextAnnotation?.text || raw.textAnnotations?.[0]?.description || '';

    return response.json({
      text,
      confidence: raw.fullTextAnnotation?.pages?.[0]?.confidence || 0,
    });
  } catch (err) {
    return response.status(500).json({ error: 'OCR gagal', details: err.message || String(err) });
  }
});

app.post('/api/search', async (req, response) => {
  try {
    const { q, author, subject, limit } = req.body || {};

    if (!q && !author && !subject) {
      return response.status(400).json({ error: 'Parameter q, author, atau subject wajib diisi' });
    }

    const params = new URLSearchParams();
    if (q)       params.set('q', q);
    if (author)  params.set('author', author);
    if (subject) params.set('subject', subject);
    params.set('limit', limit || 10);
    params.set('fields', 'key,title,author_name,cover_i,subject,isbn,publisher,first_publish_year');

    const olRes = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
    const data  = await olRes.json();

    if (!olRes.ok) {
      return response.status(olRes.status).json({ error: 'Open Library error', details: data });
    }

    return response.json(data);
  } catch (err) {
    return response.status(500).json({ error: 'Pencarian gagal', details: err.message || String(err) });
  }
});

app.post('/api/search/author', async (req, response) => {
  try {
    const { author, limit } = req.body || {};
    if (!author) return response.status(400).json({ error: 'Parameter author wajib diisi' });

    const params = new URLSearchParams();
    params.set('author', author);
    params.set('limit', limit || 8);
    params.set('fields', 'key,title,author_name,cover_i');

    const olRes = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
    const data  = await olRes.json();

    if (!olRes.ok) {
      return response.status(olRes.status).json({ error: 'Open Library error', details: data });
    }

    return response.json(data);
  } catch (err) {
    return response.status(500).json({ error: 'Pencarian gagal', details: err.message || String(err) });
  }
});

app.post('/api/search/subject', async (req, response) => {
  try {
    const { subject, limit } = req.body || {};
    if (!subject) return response.status(400).json({ error: 'Parameter subject wajib diisi' });

    const params = new URLSearchParams();
    params.set('subject', subject);
    params.set('limit', limit || 8);
    params.set('fields', 'key,title,author_name,cover_i');

    const olRes = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
    const data  = await olRes.json();

    if (!olRes.ok) {
      return response.status(olRes.status).json({ error: 'Open Library error', details: data });
    }

    return response.json(data);
  } catch (err) {
    return response.status(500).json({ error: 'Pencarian gagal', details: err.message || String(err) });
  }
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});