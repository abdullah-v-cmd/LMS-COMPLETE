import { Router } from 'express';
import multer from 'multer';
import { StorageController } from './storage.controller';
import { requireAuth, optionalAuth } from '../../middleware/auth';
import { env } from '../../config/env';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
});

// Upload file (authenticated users)
router.post('/upload', requireAuth, upload.single('file'), StorageController.upload);

// Retrieve file (optionalAuth to permit public avatars while gating sensitive documents)
router.get('/file', optionalAuth, StorageController.getFile);
router.get('/:folder/:filename', optionalAuth, StorageController.getFile);

// Delete file (authenticated users)
router.delete('/file', requireAuth, StorageController.deleteFile);

export default router;

