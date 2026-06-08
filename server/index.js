import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(process.cwd(), "server", "uploads");
const MAP_FILE = path.join(process.cwd(), "server", "recordings.json");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(MAP_FILE))
  fs.writeFileSync(MAP_FILE, JSON.stringify({}), "utf8");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

function readMap() {
  try {
    return JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeMap(m) {
  fs.writeFileSync(MAP_FILE, JSON.stringify(m, null, 2), "utf8");
}

app.post("/api/recordings", upload.single("recording"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const key = uuidv4();
  const url = `/api/recordings/${key}`;
  const m = readMap();
  m[key] = {
    file: req.file.filename,
    originalName: req.file.originalname,
    created: Date.now(),
  };
  writeMap(m);
  res.json({ key, url });
});

app.get("/api/recordings/:key", (req, res) => {
  const key = req.params.key;
  const m = readMap();
  if (!m[key]) return res.status(404).send("Not found");
  const filepath = path.join(UPLOAD_DIR, m[key].file);
  if (!fs.existsSync(filepath)) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "video/webm");
  res.sendFile(filepath);
});

app.use("/uploads", express.static(UPLOAD_DIR));

app.listen(PORT, () =>
  console.log(`Recording server running on http://localhost:${PORT}`),
);
