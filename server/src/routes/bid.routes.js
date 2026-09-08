const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = require('express').Router();
const ctrl = require('../controllers/bid.controller');
const asyncHandler = require('../utils/asyncHandler');

// 投标文件物理存储目录（与 app.js 的 /uploads 静态托管配套）
const bidFileDir = path.join(__dirname, '..', '..', 'uploads', 'bid-files');
if (!fs.existsSync(bidFileDir)) fs.mkdirSync(bidFileDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, bidFileDir),
  filename: (req, file, cb) => {
    // 磁盘文件名只保留 ASCII 安全字符，原始文件名（含中文）另行登记到 archive_files
    const safe = String(file.originalname || 'file').replace(/[^\w.-]+/g, '_').slice(-80);
    cb(null, Date.now() + '_' + safe);
  },
});
// multer 给出的 originalname 按 latin1 解码，中文会乱码，此处还原为 UTF-8
const decodeName = (req, res, next) => {
  if (req.file && req.file.originalname) {
    req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  }
  next();
};
// 20MB 上限；非 multipart 请求（纯 JSON 登记）时 multer 直接放行
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ===== 枚举 / 统计（须在 /:id 之前） =====
router.get('/options', asyncHandler(ctrl.options));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/people', asyncHandler(ctrl.people));

// ===== 标书文档 bid_docs =====
router.get('/docs', asyncHandler(ctrl.listDocs));
router.post('/docs', asyncHandler(ctrl.createDoc));
router.put('/docs/:id', asyncHandler(ctrl.updateDoc));
router.delete('/docs/:id', asyncHandler(ctrl.removeDoc));

// ===== 标书章节 bid_sections =====
router.get('/sections', asyncHandler(ctrl.listSections));
router.post('/sections', asyncHandler(ctrl.createSection));
router.put('/sections/:id', asyncHandler(ctrl.updateSection));
router.post('/sections/:id/apply-kb', asyncHandler(ctrl.applyKnowledge));
router.delete('/sections/:id', asyncHandler(ctrl.removeSection));

// ===== 投标文件 bid_files =====
router.get('/files', asyncHandler(ctrl.listFiles));
router.post('/files', upload.single('file'), decodeName, asyncHandler(ctrl.createFile));
router.put('/files/:id', upload.single('file'), decodeName, asyncHandler(ctrl.updateFile));
router.delete('/files/:id', asyncHandler(ctrl.removeFile));

// ===== 标书知识库 bid_knowledge =====
router.get('/knowledge', asyncHandler(ctrl.listKnowledge));
router.post('/knowledge', asyncHandler(ctrl.createKnowledge));
router.post('/knowledge/seed', asyncHandler(ctrl.seedKnowledge));
router.put('/knowledge/:id', asyncHandler(ctrl.updateKnowledge));
router.delete('/knowledge/:id', asyncHandler(ctrl.removeKnowledge));

// ===== 评审 / 授权（跨项目列表） =====
router.get('/reviews', asyncHandler(ctrl.listReviews));
router.delete('/reviews/:id', asyncHandler(ctrl.removeReview));
router.get('/grants', asyncHandler(ctrl.listGrants));
router.put('/grants/:id', asyncHandler(ctrl.updateGrant));
router.delete('/grants/:id', asyncHandler(ctrl.removeGrant));

// ===== 投标项目 bids =====
router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.detail));
router.put('/:id', asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));
router.get('/:id/export', asyncHandler(ctrl.exportText));
router.put('/:id/stage', asyncHandler(ctrl.updateStage));
router.put('/:id/result', asyncHandler(ctrl.updateResult));
router.get('/:id/sections', asyncHandler(ctrl.listSections));
router.post('/:id/framework', asyncHandler(ctrl.generateFramework));
router.get('/:id/reviews', asyncHandler(ctrl.listReviews));
router.post('/:id/review', asyncHandler(ctrl.addReview));
router.get('/:id/grants', asyncHandler(ctrl.listGrants));
router.post('/:id/grants', asyncHandler(ctrl.addGrant));

module.exports = router;
