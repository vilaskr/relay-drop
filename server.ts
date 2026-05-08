import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import cors from "cors";

// Polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// HSTS Header Middleware
app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  next();
});

// In-memory store for file metadata
interface RelayFile {
  id: string;
  pin: string;
  originalName: string;
  mimeType: string;
  size: number;
  filePath: string;
  expiry: number;
  status: "active" | "downloaded";
}

const relayStore = new Map<string, RelayFile>(); // PIN -> RelayFile

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Helper to generate 6-digit PIN
function generatePin(): string {
  let pin: string;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (relayStore.has(pin));
  return pin;
}

// Cleanup expired files every minute
setInterval(() => {
  const now = Date.now();
  for (const [pin, file] of relayStore.entries()) {
    if (now > file.expiry) {
      console.log(`Deleting expired file: ${file.originalName} (${pin})`);
      if (fs.existsSync(file.filePath)) {
        fs.unlinkSync(file.filePath);
      }
      relayStore.delete(pin);
    }
  }
}, 60 * 1000);

// API Routes
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const pin = generatePin();
  const fileData: RelayFile = {
    id: uuidv4(),
    pin,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    filePath: req.file.path,
    expiry: Date.now() + 10 * 60 * 1000, // 10 minutes from now
    status: "active",
  };

  relayStore.set(pin, fileData);

  res.json({
    pin: fileData.pin,
    fileName: fileData.originalName,
    size: fileData.size,
    expiry: fileData.expiry,
  });
});

app.get("/api/status/:pin", (req, res) => {
  const { pin } = req.params;
  const file = relayStore.get(pin);
  if (!file) return res.json({ status: "not_found" });
  res.json({ status: file.status });
});

app.get("/api/info/:pin", (req, res) => {
  const { pin } = req.params;
  const file = relayStore.get(pin);

  if (!file || file.status === "downloaded") {
    return res.status(404).json({ error: "File not found or already downloaded" });
  }

  if (Date.now() > file.expiry) {
    relayStore.delete(pin);
    if (fs.existsSync(file.filePath)) {
        fs.unlinkSync(file.filePath);
    }
    return res.status(404).json({ error: "File expired" });
  }

  res.json({
    fileName: file.originalName,
    size: file.size,
    expiry: file.expiry,
    mimeType: file.mimeType,
  });
});

app.get("/api/download/:pin", (req, res) => {
  const { pin } = req.params;
  const file = relayStore.get(pin);

  if (!file || file.status === "downloaded") {
    return res.status(404).json({ error: "File not found or expired" });
  }

  // Set headers for download
  res.download(file.filePath, file.originalName, (err) => {
    if (err) {
      console.error("Download error:", err);
      return;
    }

    // Mark as downloaded
    file.status = "downloaded";
    console.log(`File marked as downloaded: ${file.originalName} (${pin})`);
    
    // Delete after 10 seconds grace period
    setTimeout(() => {
      if (relayStore.has(pin)) {
        const f = relayStore.get(pin)!;
        if (fs.existsSync(f.filePath)) {
          fs.unlinkSync(f.filePath);
        }
        relayStore.delete(pin);
        console.log(`File physically deleted after grace period: ${f.originalName} (${pin})`);
      }
    }, 10000);
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
