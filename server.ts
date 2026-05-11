import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

const PORT = 3000;
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// In-memory store for file metadata (lost on restart, but fits "temporary" requirement)
const fileStore: Record<string, {
  id: string;
  pin: string;
  originalName: string;
  mimeType: string;
  size: number;
  expiresAt: number;
}> = {};

// Clean up expired files every minute
setInterval(() => {
  const now = Date.now();
  Object.keys(fileStore).forEach(id => {
    if (fileStore[id].expiresAt < now) {
      const filePath = path.join(UPLOAD_DIR, id);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      delete fileStore[id];
    }
  });
}, 60000);

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      cb(null, uuidv4());
    }
  });

  const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
  });

  // Upload endpoint
  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const id = req.file.filename;

    fileStore[id] = {
      id,
      pin,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    };

    res.json({ id, pin, expiresAt: fileStore[id].expiresAt });
  });

  // Download check endpoint (via PIN)
  app.get('/api/file/:pin', (req, res) => {
    const { pin } = req.params;
    const file = Object.values(fileStore).find(f => f.pin === pin);

    if (!file) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    res.json({
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      expiresAt: file.expiresAt
    });
  });

  // Actual download endpoint
  app.get('/api/download/:pin', (req, res) => {
    const { pin } = req.params;
    const file = Object.values(fileStore).find(f => f.pin === pin);

    if (!file) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const filePath = path.join(UPLOAD_DIR, file.id);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Physical file not found' });
    }

    res.download(filePath, file.originalName);
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
